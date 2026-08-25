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

Two transports, for two different needs:

- **Bounded HTTP client** —
  [`src/utils/bounded-http-client.ts`](../src/utils/bounded-http-client.ts), used
  by the high-risk Blockbook endpoints (`/utxo`, `/addresses-info`). Enforces an
  overall deadline, rejects on declared `Content-Length`, aborts the socket
  mid-stream once the byte budget is passed, insists the response is declared as
  JSON, does not follow redirects, and retries only transient failures
  (timeouts, network errors, 5xx) a bounded number of times. Size-budget
  breaches, malformed responses, and 4xx answers are never retried.
- **LoopBack REST connector** — the remaining datasources, configured from
  [`rest-datasource-budgets.ts`](../src/datasources/rest-datasource-budgets.ts).
  The connector can enforce a request timeout (set on both the datasource
  `options` and every operation template) and an explicit JSON expectation. It
  **cannot** bound response size — it buffers the whole body before the
  application sees it — and has no retry policy to bound. That limitation is
  precisely why the two high-risk endpoints use the bounded client instead.

### Process-wide provider concurrency

`PROVIDER_CONCURRENCY` bounds fan-out *within* one request. It says nothing about
how many requests are being served at once, so concurrent callers multiply it:
total provider work in flight is `PROVIDER_CONCURRENCY x concurrent requests`,
and the memory buffered behind it is that count times
`MAX_PROVIDER_RESPONSE_BYTES`. Both grow with inbound traffic, which is exactly
what a budget is supposed to prevent.

[`src/utils/provider-permits.ts`](../src/utils/provider-permits.ts) adds a
process-wide counting semaphore. Every call through the bounded HTTP client takes
a permit before it opens a socket and releases it in a `finally`, so the total is
capped at `BLOCKBOOK_MAX_IN_FLIGHT` regardless of how many requests are in
flight.

Three properties are deliberate:

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

The pool is acquired at the leaf rather than in the controller, which keeps
acquisition non-nested: one request holds at most `PROVIDER_CONCURRENCY` permits,
releases them between batches, and never waits for a second permit while holding
one — so the pool cannot deadlock against itself.

Worth stating explicitly: only the two fan-out endpoints (`/utxo`,
`/addresses-info`) go through the bounded client and therefore through the pool.
`/broadcast`, `/estimate-fee`, `/tx` and the `/tx-status` pre-check use the
LoopBack REST connector, which offers no per-call seam; each issues a single call
per request rather than fanning out, so they do not multiply the same way.

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

Aborting a signal only reaches work that observes it. `web3`, `ethers`,
`mongoose` and `loopback-connector-rest` do not, so a deadline that stopped at
the abort would leave those requests holding an open connection with no response
— from the client's side, indistinguishable from a hung service.

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

Not cancellable: anything going through `loopback-connector-rest`, since neither
the connector nor `postman-request` accepts a signal. `/broadcast` and the
tx/fee/last-block providers are bounded only by their timeout.

### Bridge calldata decoding

Bridge ABI decoding is **not** governed by a size budget. It is governed by a
different invariant, which is both simpler and strictly stronger:

> Only decode calldata from a transaction the EVM executed **successfully**.

A Bridge call only succeeds if RSKj accepted its arguments as semantically valid
— 80-byte block headers, real DER signatures, real Bitcoin transactions. That
bounds what the ABI decoder can be made to allocate far more tightly than any
byte cap could, and it needs no knowledge of ABI layout.

The check is [`isSuccessfulReceipt`](../src/utils/bridge-utils.ts). It fails
closed: a missing receipt, a missing status, or a status shape it cannot read all
count as failure. Note that a receipt *object* is truthy even for a reverted
transaction — testing `if (receipt)` is exactly the gap that lets adversarial
calldata reach the decoder and abort the process.

Two paths reach the decoder, and both are gated:

- **`GET /tx-status/{txId}` and `GET /tx-status-by-type/{txId}/pegout`** —
  unauthenticated, and on a database miss they re-parse the transaction. The
  receipt is already fetched here, so the gate is free. A mined-but-reverted
  transaction returns `NOT_FOUND` and is never parsed.
  See `pegout-status.service.ts`.
- **Daemon block sync** — `node-bridge-data.provider.ts` now runs
  **filter → status → decode**. Subscriber interest is decided from the raw
  4-byte selector before anything is decoded, which drops `receiveHeaders` and
  every other unsubscribed method for the cost of a string comparison. Only the
  survivors cost a receipt lookup. A skipped transaction never aborts the sync.

Because filtering now happens *before* the decode, the filter selectors are
load-bearing: a selector drifting between the root `rsk-precompiled-abis` and the
copy nested under the parser would silently stop indexing a method rather than
merely decoding it and discarding the result. `node-bridge-decode-gating.unit.ts`
pins them.

This is the `2wp-api` side of the fix only. It does not remove the need for a fix
in `@rsksmart/bridge-transaction-parser`, which decodes without a status check
and without validating ABI offsets — other consumers of that library remain
exposed, and there is no published version to upgrade to.

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
`address_info_txids`, `address_list_items`, `error_response_bytes`,
`validation_error_details`, `connection_buffered_bytes`, `request_duration_ms`,
`provider_permits`.

The provider pool additionally publishes its own series, since "how many are in
flight right now" is a gauge and cannot be expressed as a monotonic counter:

| Metric | Type | Labels |
|---|---|---|
| `provider_permits_active` | gauge | `pool` |
| `provider_permits_queued` | gauge | `pool` |
| `provider_permits_granted_total` | counter | `pool` |
| `provider_permits_rejected_total` | counter | `pool`, `reason` |

`reason` is a closed vocabulary of `queue_full` and `wait_timeout`. Saturation is
`active / BLOCKBOOK_MAX_IN_FLIGHT`, derived rather than stored. Wait times are
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
