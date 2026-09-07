# Resource Budgets

Every explicit cap on how much memory, parsing, serialization, or downstream
provider work a single request (or a single provider response) may cause lives in
one place: [`src/config/resource-budgets.ts`](../src/config/resource-budgets.ts).
Enforcement helpers live in
[`src/utils/resource-budget.ts`](../src/utils/resource-budget.ts).

The guiding rule is **enforce before or during expensive work, never after it**.
A check that runs once an unbounded result has already been fetched, mapped, and
flattened is not a budget — the allocation has already happened.

## The budgets

Every value is read from the environment variable of the same name and falls back
to a safe default. Unusable values (missing, non-numeric, zero, negative) fall
back rather than disabling a budget.

| Budget | Default | What it bounds |
|---|---|---|
| `MAX_REQUEST_BODY_BYTES` | 262144 (256 KiB) | Inbound HTTP request body |
| `MAX_PROVIDER_RESPONSE_BYTES` | 1572864 (1.5 MiB) | One outbound provider response |
| `MAX_UTXOS_PER_ADDRESS` | 1000 | UTXO rows retained for one address |
| `UTXO_RESPONSE_MAX_ROWS` | 1000 | UTXO rows retained for one `/utxo` request |
| `MAX_ADDRESS_INFO_TXIDS` | 100 | `txids` per address in `/addresses-info` |
| `PROVIDER_TIMEOUT_MS` | 15000 | Outbound provider request deadline |
| `PROVIDER_MAX_RETRIES` | 1 | Extra attempts after the first (0 disables retries) |
| `PROVIDER_RETRY_BASE_DELAY_MS` | 100 | Base backoff between provider retries |
| `ADDRESS_LIST_MAX_ITEMS` | 120 | Addresses accepted in one request |
| `PROVIDER_CONCURRENCY` | 5 | Provider requests in flight per API request |
| `BLOCKBOOK_MAX_IN_FLIGHT` | 50 | Blockbook operations in flight process-wide |
| `BLOCKBOOK_QUEUE_MAX_DEPTH` | 100 | Callers queued for a Blockbook permit |
| `BLOCKBOOK_QUEUE_MAX_WAIT_MS` | 5000 | Longest wait for a permit before a 503 |
| `MAX_ERROR_RESPONSE_BYTES` | 8192 (8 KiB) | One serialized error response body |
| `MAX_VALIDATION_ERROR_DETAILS` | 3 | Validation details returned to the client |
| `MAX_CONNECTION_BUFFERED_BYTES` | 1048576 (1 MiB) | Response bytes buffered per connection |
| `MAX_REQUEST_DURATION_MS` | 30000 (30 s) | Wall-clock handling of one inbound request |
| `REQUEST_DEADLINE_GRACE_MS` | 250 | Grace for cooperative unwinding after the deadline |
| `RATE_LIMIT_WINDOW_MS` | 30000 (30 s) | Rate-limit window length |
| `RATE_LIMIT_MAX_REQUESTS` | 90 | Requests per window per client, ordinary routes |
| `RATE_LIMIT_MAX_FANOUT_REQUESTS` | 15 | Requests per window per client, fan-out POSTs |
| `RATE_LIMIT_MAX_TRACKED_CLIENTS` | 4096 | Clients the limiter tracks at once |
| `MONGO_MAX_DOCUMENTS` | 250 | Documents returned by one database read |
| `HEALTH_CACHE_TTL_MS` | 2000 (2 s) | How long a `/health` result may be reused |
| `MAX_BRIDGE_CALLDATA_BYTES` | 32768 (32 KiB) | Calldata handed to the Bridge ABI decoder |
| `MAX_TX_PROVIDER_RESPONSE_BYTES` | 8388608 (8 MiB) | One transaction-lookup provider response |
| `TX_PROVIDER_MAX_IN_FLIGHT` | 4 | Transaction lookups in flight process-wide |

`ADDRESS_INFO_MAX_TXIDS` is still honoured as a legacy alias for
`MAX_ADDRESS_INFO_TXIDS`. `src/config/limits.ts` re-exports the historical names
and is deprecated.

## Where each budget is enforced

### Request body

[`requestBodyBudgetMiddleware`](../src/middleware/request-body-budget.middleware.ts)
rejects on the declared `Content-Length` before a byte is buffered, and emits the
structured violation signal. `application.ts` also configures the LoopBack body
parsers with the same limit as the backstop for requests that omit or understate
`Content-Length`.

### `/utxo`

Blockbook's `/api/v1/utxo/{address}` accepts no server-side row limit, so the
budget is enforced on this side, in three layers that all run before the rows are
retained:

1. The bounded HTTP client rejects on the declared `Content-Length` and aborts the
   socket as soon as the streamed byte tally passes `MAX_PROVIDER_RESPONSE_BYTES`
   — an oversized page is never fully materialized.
2. `fetchAddressUtxos` checks the parsed row count against
   `MAX_UTXOS_PER_ADDRESS` before handing the rows back to be mapped into models.
3. `UtxoController` folds each settled batch into the response immediately via
   `reduceWithConcurrency`, so passing `UTXO_RESPONSE_MAX_ROWS` rejects *before*
   the next batch of provider requests is issued.

Peak retained rows are therefore bounded by
`UTXO_RESPONSE_MAX_ROWS + (PROVIDER_CONCURRENCY x MAX_UTXOS_PER_ADDRESS)`,
regardless of how much the provider offers. The old post-allocation
`flat.length` check is gone.

### `/addresses-info`

Blockbook's `/api/v2/address/{address}` *does* accept a server-side limit, so the
preferred protection applies: `fetchAddressInfo` pins `pageSize` to
`MAX_ADDRESS_INFO_TXIDS` and asks for `details=txids`, keeping full transaction
bodies out of the response entirely. The provider never sends more `txids` than
the budget allows. The controller's truncation remains as the backstop for a
provider that ignores `pageSize`, and it records a violation when it fires.

**Worst case at the shipped budgets.** `ADDRESS_LIST_MAX_ITEMS` is 120 — what the
frontend derives from one extended public key — so a single request can retain
`120 x MAX_ADDRESS_INFO_TXIDS` = **12,000 txids**, and walks the list
`120 / PROVIDER_CONCURRENCY` = **24 sequential batches** deep. Both products are
asserted by the budget invariant tests rather than left to be re-derived by hand.

The batch count is the interesting one, because it interacts with the request
deadline: 24 batches fit comfortably in `MAX_REQUEST_DURATION_MS` at ordinary
per-batch latency, but a uniformly slow provider cannot fit, and such a request
now ends in a bounded `503` rather than a slow success. That is a deliberate
trade — a request that cannot finish inside its own deadline was never going to
be useful — and it is asserted, not assumed.

`/utxo` is unaffected by the list length: its row budget still dominates, at
`UTXO_RESPONSE_MAX_ROWS + PROVIDER_CONCURRENCY x MAX_UTXOS_PER_ADDRESS`.

### Outbound provider calls

**One transport.** Every outbound provider call goes through the bounded HTTP
client in
[`src/utils/bounded-http-client.ts`](../src/utils/bounded-http-client.ts). It
enforces an overall deadline, rejects on the declared `Content-Length` before a
body byte is buffered, aborts the socket mid-stream once the running byte tally
passes the budget, insists the response is declared as JSON, does not follow
redirects, takes a permit from a concurrency pool, observes the request's abort
signal, and retries only transient failures (timeouts, network errors, 5xx) a
bounded number of times. Size-budget breaches, malformed responses and 4xx
answers are never retried — retrying them multiplies the work an attacker gets
for free.

| Call | Budget | Pool |
|---|---|---|
| `/api/v1/utxo/{address}` | `MAX_PROVIDER_RESPONSE_BYTES` | `blockbook` |
| `/api/v2/address/{address}` | `MAX_PROVIDER_RESPONSE_BYTES` | `blockbook` |
| `/api/blocks` | `MAX_PROVIDER_RESPONSE_BYTES` | `blockbook` |
| `/api/v1/estimatefee/{n}` | `MAX_PROVIDER_RESPONSE_BYTES` | `blockbook` |
| `/api/v2/sendtx/{hex}` | `MAX_PROVIDER_RESPONSE_BYTES` | `blockbook` |
| `/api/v1/tx/{txid}` | `MAX_TX_PROVIDER_RESPONSE_BYTES` | `blockbook-tx` |
| `/api/v2/tx/{txid}` | `MAX_TX_PROVIDER_RESPONSE_BYTES` | `blockbook-tx` |

#### What this section used to say

Until 2026-09 five of those seven went through `loopback-connector-rest`, and
this section said the connector "**cannot** bound response size — it buffers the
whole body before the application sees it". The first half was the operative
claim and it was **false**. The connector merges datasource `options` into
`request.defaults`, and `postman-request` honours `maxResponseSize` there,
aborting mid-flight exactly as the bounded client does
(`request.js:564-565`, `1515-1534`). A one-line hotfix was available the entire
time the finding was open.

What was true is that the connector offers no seam for the *other* three
controls — no permit, no abort signal, no bounded error mapping — and that
running two budget systems means two places to look when an outbound call
misbehaves. That is why these migrated rather than being patched.

The concrete failure: an oversized response on `GET /tx` raised
`Cannot create a string longer than 0x1fffffe8 characters` from
`postman-request`. That error is not in the allowlist in `src/index.ts`, so it
reached `shutdown()` and stopped the process — from one unauthenticated request.

#### Why the transaction lookups have their own budget and pool

`GET /tx` returns the raw Bitcoin transaction in `hex`. That is the public
contract — it is in `tx.model.ts` and in the `Tx` interface — so these two
responses are measured in megabytes where the other five are measured in
kilobytes. `MAX_PROVIDER_RESPONSE_BYTES` (1.5 MiB) would refuse legitimate
lookups, and that failure is quiet: a 502 on large transactions and no other
symptom until a user complains.

The budget is calibrated in both directions. Across 376 transactions sampled from
recent blocks on the testnet Blockbook this service actually uses, `/api/v2/tx`
runs p50 = 1.5 KB with a p100 of 745 KB, and `/api/v1/tx` agrees. Testnet carries
no large transactions, so the upper end is worked out rather than sampled: at two
hex characters per byte plus ~210 bytes of JSON per input, a 1 MB Bitcoin
transaction renders to ~3.3 MB of response, so 8 MiB covers any standard
transaction with room. A consensus-maximum 4 MB-weight transaction would render
to ~13 MB and be refused — legal, not yet observed, and recoverable by raising
`MAX_TX_PROVIDER_RESPONSE_BYTES`.

A large budget on the shared pool would be worse than no budget, because it
multiplies — see the next section.

### Process-wide provider concurrency

`PROVIDER_CONCURRENCY` bounds fan-out *within* one request. It says nothing about
how many requests are being served at once, so concurrent callers multiply it:
total provider work in flight is `PROVIDER_CONCURRENCY x concurrent requests`,
and the memory buffered behind it is that count times the response budget. Both
grow with inbound traffic, which is exactly what a budget is supposed to prevent.

[`src/utils/provider-permits.ts`](../src/utils/provider-permits.ts) adds
process-wide counting semaphores. Every call through the bounded HTTP client
takes a permit before it opens a socket and releases it in a `finally`.

**Two pools, because the calls are not alike:**

- `blockbook` — `BLOCKBOOK_MAX_IN_FLIGHT` (50) for the five kilobyte-scale calls.
- `blockbook-tx` — `TX_PROVIDER_MAX_IN_FLIGHT` (4) for the two transaction
  lookups.

Separate pools mean the two limits move independently, a burst of expensive
lookups cannot starve the cheap calls of permits, and a saturated transaction
pool is visible in the metrics rather than hidden behind a healthy general one.

#### The arithmetic, stated honestly

Materializing a response costs several times its size on the wire: a `Buffer`,
then `toString()` to a UTF-16 string, then `JSON.parse` to objects. Three times
the response size is a conservative estimate, so the process-wide worst case is:

```
heap_worst_case  ≈  3 × response_budget × permits
```

| Pool | Budget | Permits | Worst case |
|---|---|---|---|
| `blockbook-tx` | 8 MiB | 4 | 96 MiB |
| `blockbook` | 1.5 MiB | 50 | 225 MiB |
| **Combined** | | | **321 MiB** |

`tx-provider-budget.unit.ts` asserts both the per-pool figure and the combined
one, so raising either a budget or a pool without looking at the other fails the
build.

Two things about that table are worth saying out loud. The general pool is the
larger term, and an earlier version of this document put it at "roughly 75 MB" —
the same arithmetic with the materialization factor left out. And 321 MiB is 63%
of a 512 MB heap, which is a real ceiling rather than a comfortable one.
Shrinking the general pool would fix it and would also halve `/utxo` and
`/addresses-info` throughput, so it is recorded here as a known trade rather than
changed in passing.

Three properties of the pools are deliberate:

- **The permit is held across the retry loop**, including its backoff. That is
  the honest definition of "in flight"; releasing between attempts would let the
  real count drift above the bound.
- **Waiting is bounded twice** — by queue depth (`BLOCKBOOK_QUEUE_MAX_DEPTH`) and
  by wait time (`BLOCKBOOK_QUEUE_MAX_WAIT_MS`). An unbounded queue would simply
  move the growth from sockets to promises. Exceeding either is a bounded
  `503 Service Unavailable` with `Retry-After`, not a hang. Its body carries the
  code `SERVICE_OVERLOADED`, which is what separates it from the other 503 — a
  request that outlived its own deadline — since the status alone is ambiguous.
- **Waiting is cancellation-aware.** A queued caller registers on the request's
  abort signal and leaves the queue the moment its client disappears, so
  abandoned work never reaches the provider and never holds capacity against live
  traffic. Work with no request behind it (the daemon) has no signal and simply
  never cancels.

Permits are acquired at the leaf rather than in the controller, which keeps
acquisition non-nested: one request holds at most `PROVIDER_CONCURRENCY` permits
from one pool, releases them between batches, and never waits for a second permit
while holding one — so the pools cannot deadlock against themselves or each
other.

#### What the pools do not bound

A permit is released when the response is parsed, which is **not** when its
memory is released: the controller then serializes the transaction back to the
client. For a well-behaved client that is fine — 48 concurrent `GET /tx` for
7.5 MB transactions are all served, verified in
`provider-response-oom.acceptance.ts`.

A client that requests large responses and never reads them is a different
matter, and is not bounded here: 48 such connections exhaust a 256 MB heap on the
way out. No provider-side budget applies, since nothing oversized was fetched,
and `connectionOutputBudgetMiddleware` does not catch it either — it samples
`socket.writableLength` once per request per connection, which sees a peer
pipelining on one socket but not 48 separate sockets each holding one unread
response. That is an open gap, pinned by a characterization test so that closing
it is visible.

### Rate limiting

Public, unauthenticated routes had no access control at all: every other budget
here bounds what *one* request can cost, and nothing bounded how many requests
one client could make.

`src/middleware/rate-limit.middleware.ts` counts requests in fixed windows, per
client and per route class, registered as the cheapest possible refusal — one
header read and a map lookup, after the bounded error writer (so the 429 is
bounded and carries the traceId) and **before** the body budget, so an over-limit
client's payload is never buffered at all.

Fixed windows rather than a sliding log on purpose: a log grows per request,
which would make the limiter the thing that consumes memory under attack. Two
counters and a timestamp per client is the whole state.

Two allowances, because the routes are not equally expensive:
`RATE_LIMIT_MAX_FANOUT_REQUESTS` for `/utxo` and `/addresses-info`, which each
cost up to `PROVIDER_CONCURRENCY` provider calls, and `RATE_LIMIT_MAX_REQUESTS`
for everything else. They are separate buckets, not one counter with two
ceilings. `GET /health` is exempt: monitoring polls it continuously, and sharing a
bucket with public traffic would let an attacker blind the operators.

#### Client identity behind a proxy

The decision that matters. Behind a proxy every request carries the *proxy's*
socket address, so keying on the socket alone puts the whole internet in one
bucket — simultaneously useless and an outage. Keying on `X-Forwarded-For`
unconditionally is worse: the header is attacker-controlled, so anyone could mint
unlimited identities, or impersonate another client into a block.

So `X-Forwarded-For` is honoured only when the immediate socket peer is listed in
`RATE_LIMIT_TRUSTED_PROXIES`, and then only its **left-most** hop. With no
trusted proxies configured — the default — the header is ignored entirely, which
is correct for a directly exposed API. Unlike the `inflate` flag, this is
legitimate configuration rather than a footgun: the *unsafe* state is the empty
default being wrong for your topology, and turning it on narrows trust to named
peers rather than widening it.

Claimed values are validated as address-shaped before becoming map keys, so a
long or exotic header cannot grow an entry or inflate label cardinality.

#### The limiter must not become the amplifier

An attacker with many source addresses would otherwise fill the key map, so
tracked clients are bounded by `RATE_LIMIT_MAX_TRACKED_CLIENTS` with
least-recently-seen eviction, swept on an `unref`'d timer so it cannot hold the
process open at shutdown. Eviction never removes the client currently being
counted — doing so would hand an attacker a free reset: flood the map to displace
your own counter, then resume.

Refusals are `429` with `Retry-After` and code `RATE_LIMITED`, and are counted by
`rate_limit_rejected_total{route}` where `route` is the **closed** vocabulary
`fanout` / `other` — never the raw path, which is attacker-controlled.

**This is half of what the finding asks for.** It recommends authentication as
well; rate limiting is the only access control implemented here, and the API
remains unauthenticated.

### Public reads that fan out

Two paths the earlier phases left unbounded, both public and unauthenticated.

**`GET /features`** read the whole collection with `find({})`. The collection is
small and operator-managed — 14 flags today — so `MONGO_MAX_DOCUMENTS` is a
ceiling rather than a page size: it exists so a collection that grew unexpectedly
cannot turn a public request into unbounded memory. The bound is applied in the
query, not to the result; capping an already-materialized array would buy
nothing. Filling the budget records a violation, because it means the collection
outgrew the assumption.

**`GET /health`** fans out to four dependencies per call and is deliberately
exempt from rate limiting, so that monitoring can never be blocked. Those two
facts together make it the one route where request volume multiplies upstream
load with nothing to bound it, so the result is cached for
`HEALTH_CACHE_TTL_MS`. The `200`/`500` semantics are unchanged — operators depend
on this as a readiness signal — and failures are cached too, because a failing
dependency is exactly when polling intensifies. A cached failure still reports
down.

### Validation error responses

A rejected request used to cost more than an accepted one. Ajv ran with
`allErrors: true`, retaining one error object per invalid array item, and
`strong-error-handler` then echoed the whole `details` array on every 4xx —
recursively, through `js2xmlparser`, if the client asked for XML. Measured on a
single request filling the 256 KiB body budget: **130,002 details, 23.35 MB held
by Ajv, and a 24.81 MB response**. A handful of such requests pipelined on one
unread socket is enough to exhaust the heap and abort the process.

Bounded in three places, outermost last:

1. **Generation.** `boundedAjvFactory` (`src/validation/bounded-ajv.factory.ts`)
   builds Ajv with `allErrors: false`, so validation stops at the first failure.
   This is the load-bearing control: it removes the 23 MB allocation rather than
   declining to serialize it. Truncating later would leave the memory spent.
   `allErrors: false` cannot be set through `rest.requestBodyParser.validation`
   directly — LoopBack always installs `ajv-errors`, which refuses to load
   without it — so the factory is supplied through the documented
   `ValidationOptions.ajvFactory` hook and omits that one plugin.
   `truncateValidationErrors` caps whatever survives at
   `MAX_VALIDATION_ERROR_DETAILS`, as insurance if the factory is ever bypassed.
2. **Serialization.** `writeBoundedError`
   (`src/middleware/bounded-error-writer.ts`) replaces both the middleware error
   path and LoopBack's reject action. It always writes JSON, so
   `strong-error-handler`'s XML and HTML serializers are unreachable for errors.
   Setting `negotiateContentType: false` alone is **not** enough: an undocumented
   `?_format=xml` query parameter is honoured *after* that check, and an
   unsupported value reflects into an `X-Warning` header. Status codes are
   preserved verbatim; the body is a fixed shape with a message chosen by status,
   never the framework's own message — `RestHttpErrors.invalidData` interpolates
   `JSON.stringify(data)`, so framework messages can carry request data.
   `MAX_ERROR_RESPONSE_BYTES` is the single owner of response size: if the bounded
   details would still exceed it, they are dropped and a violation is recorded.
3. **Accumulation.** Per-response budgets bound one answer, not a peer that
   pipelines many requests and never reads. HTTP/1.1 ordering keeps every
   completed response in the process until earlier ones drain, so N pipelined
   requests retain N responses. `connectionOutputBudgetMiddleware` drops a
   connection whose `socket.writableLength` exceeds
   `MAX_CONNECTION_BUFFERED_BYTES`. That value only grows when the peer stops
   draining, so a slow-but-reading client is never affected.

The public contract:

```json
{"error": {"statusCode": 422, "code": "VALIDATION_ERROR",
           "message": "Invalid request payload.",
           "details": [{"path": "/addressList/0", "code": "pattern"}]}}
```

`path` is a framework-generated JSON pointer validated against a strict
character class; `code` is an Ajv keyword. The submitted value, the schema
pattern, Ajv's `info` object and stack traces are never included. `5xx` messages
are replaced wholesale. `validateAddressList` uses the same `VALIDATION_ERROR`
code, so a client cannot tell the two 422 producers apart.

Result on the measurement above: **24.81 MB → 145 bytes**, for
`application/json`, `text/xml` and `?_format=xml` alike.

### Abandoned and over-long requests

Work used to outlive the client that asked for it. A `/utxo` fan-out over 50
addresses whose client resets after 150 ms issued **40 of its 50 provider calls
after the client was gone**, and nothing bounded the total: `PROVIDER_TIMEOUT_MS`
applies per attempt, so with one retry a single hop can take ~30 s and ten
sequential batches could occupy the process for minutes.

Every request now carries a cancellation signal, created in
`httpAccessLogMiddleware` and read through the request context in
`src/utils/trace-context.ts` — the same AsyncLocalStorage that already carries the
traceId. That matters because the provider services are module-scope singletons
shared by every concurrent request, so per-request state cannot live on them.

The signal trips on either of two things:

- **the client going away** — `res.on('close')` when `res.writableFinished` is
  false. That is the discriminator: `'close'` fires on success and abort alike,
  and `writableEnded` flips to true even for a response nobody received.
  `req.on('aborted')` has been documentation-deprecated since Node 17.
- **the deadline** — `MAX_REQUEST_DURATION_MS`.

Once tripped, two things stop:

1. **Dispatch.** Both fan-out helpers in `src/utils/concurrency.ts` check before
   each batch, reusing the abort-by-throw path the UTXO row budget already uses.
   Up to `PROVIDER_CONCURRENCY` in-flight calls may still settle; the next batch
   never starts.
2. **In-flight calls.** The bounded HTTP client destroys the outbound socket with
   the cancellation as the reason, the same typed-destroy path the provider
   deadline uses. A cancellation is explicitly **not** retryable — it would
   otherwise be classified as a network failure and retried, doing exactly the
   work cancellation exists to avoid.

The abort carries a reason, so consumers report why work stopped: a client abort
is logged as `499` (conventional for "client closed the request", and never
delivered), a deadline breach as `503`. Both increment
`request_cancelled_total{reason}`; a deadline additionally records a
`request_duration_ms` budget violation, because unlike a vanished client it *is*
a ceiling the service set for itself.

Aborted requests also now appear in the access log at all — it listened on
`'finish'`, which never fires for an abandoned request.

#### A broken response lifecycle is survived; a broken dependency is not

A client that disappears mid-response leaves framework and library callbacks
holding a reference to a finished response. When one of them writes, Node raises
`ERR_HTTP_HEADERS_SENT`, `ERR_STREAM_WRITE_AFTER_END`,
`ERR_STREAM_ALREADY_FINISHED` or `ERR_STREAM_DESTROYED` — possibly as an
`uncaughtException`, from a callback the application has no seam to catch. Those
four are logged and survived: the request is lost either way, and tearing the
process down would convert a per-request defect into an outage any client can
trigger at will.

`ECONNRESET` and `EPIPE` are treated differently, because they are **not**
response-specific — Mongo, the RSK node and the providers raise the same codes.
Surviving them unconditionally would leave a possibly degraded process alive with
nothing to restart it. They are survived only with provenance pointing at a
response: the failure happened on a `write`, and the error carries no remote-peer
identity (`address` / `port` / `hostname`), which an outbound connection's errors
do and an inbound response write does not.

That is a heuristic, and it is deliberately biased towards restarting — an
unattributable reset is fatal, because a process in an unknown state serving
traffic is worse than a restart. The four codes above need no heuristic.

#### The deadline ends the request, it does not merely mark it

Aborting a signal only reaches work that observes it. `web3`, `ethers` and
`mongoose` do not, so a deadline that stopped at the abort would leave those
requests holding an open connection with no response — from the client's side,
indistinguishable from a hung service.

So after the deadline trips, cooperative unwinding gets
`REQUEST_DEADLINE_GRACE_MS` to produce its own answer. If the response is still
unwritten when that elapses, the bounded 503 is written on the request's behalf
through the same error writer every other refusal uses, which already declines a
response that has ended and drops the connection when headers are already on the
wire.

Two deliberate asymmetries:

- **Only a deadline forces a response, never a client abort.** Nobody is
  listening on an abandoned request, and `499` is documented above as logged and
  never delivered.
- **A route that cancels cooperatively answers sooner** — at the deadline rather
  than after the grace. The acceptance suite asserts both timings, which is what
  distinguishes the two mechanisms rather than assuming one covers the other.

Every outbound Blockbook call *is* cancellable now: the bounded HTTP client
registers on the request signal, destroys the socket when it fires, and checks
the signal again between retries so a cancellation landing mid-backoff does not
fund another round trip. That covers `/broadcast`, `/estimate-fee`, `/tx` and the
`/tx-status` pre-check, which used to be bounded only by their timeout because
neither `loopback-connector-rest` nor `postman-request` accepts a signal.

What remains uncancellable is the RSK side — `web3` and `ethers` — and the
database.

### Bridge calldata decoding

Bridge ABI decoding is governed by **three** controls, and none of them is
sufficient alone:

> Only decode calldata that is **bounded in size**, carries a **selector this
> route expects**, from a transaction the EVM executed **successfully** — and
> only the calldata we already hold, never a copy the decoder fetches itself.

#### What this used to say, and why it was wrong

Until 2026-09 this section said the decode was governed by a single invariant —
"only decode calldata from a transaction the EVM executed successfully" — and
called it "simpler and strictly stronger" than a size budget. It is neither. It
is not a resource control at all.

The reasoning was that a Bridge call only succeeds if RSKj accepted its arguments
as semantically valid, so a successful receipt bounds what the decoder can be made
to allocate. That was checked against `receiveHeaders`, which does validate header
sizes before parsing and does revert, and then generalized to every Bridge
method. It does not generalize:
`registerFastBridgeBtcTransaction` wraps its whole body in a catch that returns
`GENERIC_ERROR` rather than reverting. Adversarial calldata to that method is
mined with `status: 1` and walks straight through the gate. One method's behaviour
says nothing about the next one's.

The second mistake was structural. `getBridgeTransactionByTxHash` takes only a
transaction hash and re-fetches the transaction and receipt itself, so a check
applied to the `RskTransaction` a caller held constrained nothing the parser went
on to decode. A guard on bytes the decoder never reads is advice, not a control.

#### The three controls

**1. Size.** `MAX_BRIDGE_CALLDATA_BYTES` (32 KiB) caps what may be handed to the
decoder, in [`assertBridgeCalldataWithinBudget`](../src/utils/bridge-utils.ts). It
holds whatever the EVM decided and whatever the ABI layout is, which is exactly
what the receipt gate could not do.

The number is derived. ABI decoding amplifies calldata into heap by a measured
~225x — 131 KB costs +26.7 MiB, 262 KB costs +55.2 MiB, 1.05 MB costs +225 MiB —
so the worst case is `225 x MAX_BRIDGE_CALLDATA_BYTES x concurrent requests`. At
32 KiB one request costs ~7.2 MiB. The concurrency half of that product is why
`/tx-status/{txId}` and `/tx-status-by-type/{txId}/{txType}` are counted as
fan-out routes by the rate limiter: the two bounds hold each other up, and
`resource-budgets.unit.ts` asserts the product against a documented ceiling so
relaxing either alone fails the build.

The bound is calibrated against real traffic, not chosen by feel. Across 12 000
recent blocks on each of mainnet and testnet — 3 769 successful Bridge
transactions — calldata sizes are p50 = 4 B, p90 = 228 B, p99 = 868 B,
p100 = 1604 B. 32 KiB clears the observed maximum by 20x. That margin matters in
the other direction: a bound set too low does not fail loudly, it leaves
legitimate pegouts in a status that never resolves.

The thin spot is `registerBtcTransaction`, which carries a user-supplied Bitcoin
transaction and a merkle proof. Worked out at 148 B per input, 32 KiB covers a
pegin of roughly 215 inputs; a larger one is legal and would be skipped by the
daemon — logged at `warn` with the transaction hash and counted, not silent — and
is recovered by raising `MAX_BRIDGE_CALLDATA_BYTES`. The public pegout route is
not exposed to this: its selector allowlist admits no method that carries a
Bitcoin transaction.

**2. Selector.** `PEGOUT_ROUTE_SELECTORS` is the set of methods the pegout HTTP
path will decode: `updateCollections`, `addSignature`, `releaseBtc`, and empty
calldata — a native pegout request *is* a plain value transfer to the Bridge, so
omitting `0x` would break the route for every ordinary user pegout.
`registerFastBridgeBtcTransaction` is permissionless and is not a pegout method,
so an unauthenticated lookup has no business handing it to the decoder;
`getBtcTransactionConfirmations` and `receiveHeaders` are refused for the same
reason. The size bound already covers all three — this makes the coverage
intentional rather than incidental, and keeps a future decoder bug on any of them
out of reach of a public route.

`PegoutDataProcessor.getFilters()` derives from that same set rather than
restating it. These selectors are load-bearing: the daemon filters before it
decodes, so a selector drifting between two definitions would stop indexing a
method rather than merely decoding it and discarding the result. The values are
pinned separately in `bridge-selector-allowlist.unit.ts`, because deriving one
list from the other means an equality test between them can no longer fail.

**3. Receipt status.** [`isSuccessfulReceipt`](../src/utils/bridge-utils.ts) is
kept, as a *semantic* filter: a reverted call produced no events and describes no
state change, so there is nothing worth decoding in it. It fails closed — a
missing receipt, a missing status, or a status shape it cannot read all count as
failure — and note that a receipt *object* is truthy even for a reverted
transaction, so testing `if (receipt)` reads a revert as a success. It bounds no
resources. Do not lean on it for that again.

#### One decode entry point

`RskNodeService.getBridgeTransaction` is the only place in the codebase that
decodes Bridge calldata, and it takes the transaction rather than its hash, so the
bytes that are bounded are the bytes that are decoded.
`bridge.service.getBridgeTransactionByHash` is gone; the daemon's block sync uses
the same guarded entry point, which also removed two duplicate RPC round trips per
transaction.

`bridge-decode-entrypoints.unit.ts` keeps this true structurally. It fails if a
production module calls `getBridgeTransactionByTxHash` again, if a second call
site of `decodeBridgeTransaction` appears, if the guard stops preceding the decode
in that file, or if `bridge-utils` re-acquires a dependency on the service layer.
Nothing at runtime would notice any of those.

Both paths still filter before they decode:

- **`GET /tx-status/{txId}` and `GET /tx-status-by-type/{txId}/PEGOUT`** —
  unauthenticated, and on a database miss they re-parse the transaction. Selector,
  then size, then receipt status. A refused selector answers `NOT_FOUND`, which is
  what "this is not a pegout" already means here; a size violation is rethrown
  rather than folded into `NOT_FOUND`, so a refused request is not disguised as an
  ordinary one.
- **Daemon block sync** — `node-bridge-data.provider.ts` runs
  **subscriber filter → receipt status → size → decode**. Subscriber interest is
  decided from the raw 4-byte selector before anything is decoded, which drops
  `receiveHeaders` and every other unsubscribed method for a string comparison.
  Only the survivors cost a receipt lookup. A calldata violation there is logged
  and skipped rather than thrown — one hostile transaction must not stop the sync
  — but *only* that: any other error keeps propagating, or a real node outage
  would look like a run of skipped transactions.

#### Evidence

`bridge-calldata-oom.acceptance.ts` runs the control in CI rather than describing
it. A child process with a 256 MB heap, handed 1.5 MiB of aliased-offset
`registerFastBridgeBtcTransaction` calldata, dies on SIGABRT with
`JavaScript heap out of memory`; the same payload through the guarded entry point
comes back refused with resident memory flat. If the payload ever stops being
lethal, that test says so instead of quietly passing.

This is the `2wp-api` side of the fix only. It does not remove the need for a fix
in `@rsksmart/bridge-transaction-parser`, which decodes without validating ABI
offsets or total size — other consumers of that library remain exposed, and there
is no published version to upgrade to.

## Observability

Every violation emits, at `warn`:

```json
{
  "event": "resource_budget_exceeded",
  "resource": "utxo_response_rows",
  "configuredLimit": 1000,
  "observedValue": 1005,
  "route": "POST /utxo",
  "traceId": "…"
}
```

The attacker-controlled payload is deliberately **never** logged — only the
configured limit, the observed scalar, the route, and the trace id.

Alongside the log, a `resource_budget_exceeded_total` counter is incremented,
labelled by `resource`, through the existing metrics stack
([`metric-logger.ts`](../src/utils/metric-logger.ts)). Counters are always
recorded in process; `METRICS_ENABLED=true` additionally emits each sample on the
metric debug-log channel. `getMetricCounters()` / `getMetricCounter()` expose the
registry.

`resource` values, one per budget category, are the members of
`ResourceBudgetName`: `request_body_bytes`, `provider_response_bytes`,
`provider_timeout_ms`, `utxos_per_address`, `utxo_response_rows`,
`address_info_txids`, `address_list_items`, `error_response_bytes`, `rate_limit`,
`validation_error_details`, `connection_buffered_bytes`, `request_duration_ms`,
`mongo_documents`, `bridge_calldata_bytes`,
`provider_permits`.

`bridge_calldata_bytes` is the one to alert on permanently: it should be **zero**
in normal operation. A sustained run of it is an exploitation attempt; a single
hit with `observedValue` near the limit is a recalibration due, not an attack.
`observedValue: -1` means the calldata was refused before it was measured
(malformed hex) — it is not a size.

The provider pool additionally publishes its own series, since "how many are in
flight right now" is a gauge and cannot be expressed as a monotonic counter:

| Metric | Type | Labels |
|---|---|---|
| `provider_permits_active` | gauge | `pool` |
| `provider_permits_queued` | gauge | `pool` |
| `provider_permits_granted_total` | counter | `pool` |
| `provider_permits_rejected_total` | counter | `pool`, `reason` |

`pool` is `blockbook` or `blockbook-tx`. `reason` is a closed vocabulary of
`queue_full` and `wait_timeout`. Saturation is `active` over that pool's limit,
derived rather than stored. Sustained refusals on `blockbook-tx` mean the pool is
undersized for real traffic, not that anything is under attack. Wait times are
aggregated as a sum/count/max triple on the pool, which is enough for a mean and
a tail without inventing histogram buckets nothing consumes yet.

## Responses

Violations always produce a bounded response and never terminate the process:

| Situation | Status |
|---|---|
| The client's own request drove the violation | `413 Payload Too Large` |
| The address list is invalid or too long (schema/validator) | `422 Unprocessable Entity` |
| A provider breached its size budget, or failed | `502 Bad Gateway` |
| A provider breached its time budget | `504 Gateway Timeout` |
| The client abandoned the request | `499` (logged, never delivered) |
| The request breached its own deadline | `503 Service Unavailable` |
| The provider pool and its queue are both full | `503 Service Unavailable` + `Retry-After`, code `SERVICE_OVERLOADED` |
| The client is over its rate-limit allowance | `429 Too Many Requests` + `Retry-After`, code `RATE_LIMITED` |

Every error body is JSON, bounded by `MAX_ERROR_RESPONSE_BYTES`, and carries no
attacker-controlled content — see **Validation error responses** above.

The error message carries only scalars, so an oversized request or provider
response is never reflected back to the caller.

## Tests

Each budget has coverage immediately below and immediately above its configured
value:

- `src/__tests__/unit/config/resource-budgets.unit.ts`
- `src/__tests__/unit/utils/resource-budget.unit.ts`
- `src/__tests__/unit/utils/bounded-http-client.unit.ts`
- `src/__tests__/unit/utils/concurrency.unit.ts`
- `src/__tests__/unit/middleware/request-body-budget.middleware.unit.ts`
- `src/__tests__/unit/services/bounded-blockbook-providers.unit.ts`
- `src/__tests__/unit/services/node-bridge-decode-gating.unit.ts`
- `src/__tests__/unit/services/pegout-status.decode-gating.unit.ts`
- `src/__tests__/unit/utils/bridge-utils.unit.ts`
- `src/__tests__/unit/utils/bridge-calldata-budget.unit.ts`
- `src/__tests__/unit/services/bridge-decode-equivalence.unit.ts`
- `src/__tests__/unit/services/rsk-node.bridge-decode.unit.ts`
- `src/__tests__/unit/services/bridge-selector-allowlist.unit.ts`
- `src/__tests__/unit/config/bridge-decode-entrypoints.unit.ts`
- `src/__tests__/acceptance/bridge-calldata-budget.acceptance.ts`
- `src/__tests__/acceptance/bridge-calldata-oom.acceptance.ts`
- `src/__tests__/unit/services/blockbook-service-shapes.unit.ts`
- `src/__tests__/unit/services/bounded-blockbook-tx-services.unit.ts`
- `src/__tests__/unit/services/bounded-tx-lookups.unit.ts`
- `src/__tests__/unit/config/tx-provider-budget.unit.ts`
- `src/__tests__/unit/config/rest-connector-retired.unit.ts`
- `src/__tests__/acceptance/provider-response-budget.acceptance.ts`
- `src/__tests__/acceptance/provider-response-oom.acceptance.ts`
- `src/__tests__/unit/utxo.controller.budgets.unit.ts`
- `src/__tests__/unit/validation/bounded-ajv.factory.unit.ts`
- `src/__tests__/unit/middleware/bounded-error-writer.unit.ts`
- `src/__tests__/unit/middleware/connection-output-budget.middleware.unit.ts`
- `src/__tests__/unit/utils/address-list-validation.unit.ts`
- `src/__tests__/acceptance/bounded-validation-errors.acceptance.ts`
- `src/__tests__/unit/utils/request-cancellation.unit.ts`
- `src/__tests__/unit/utils/trace-context.unit.ts`
- `src/__tests__/unit/utils/bounded-http-client.cancellation.unit.ts`
- `src/__tests__/acceptance/request-cancellation.acceptance.ts`
- `src/__tests__/acceptance/response-lifecycle.acceptance.ts`
- `src/__tests__/unit/addressesInfo.controller.budgets.unit.ts`
