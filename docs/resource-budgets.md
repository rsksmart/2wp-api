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
| `MAX_PROVIDER_RESPONSE_BYTES` | 4194304 (4 MiB) | One outbound provider response |
| `MAX_UTXOS_PER_ADDRESS` | 1000 | UTXO rows retained for one address |
| `UTXO_RESPONSE_MAX_ROWS` | 1000 | UTXO rows retained for one `/utxo` request |
| `MAX_ADDRESS_INFO_TXIDS` | 100 | `txids` per address in `/addresses-info` |
| `PROVIDER_TIMEOUT_MS` | 15000 | Outbound provider request deadline |
| `PROVIDER_MAX_RETRIES` | 1 | Extra attempts after the first (0 disables retries) |
| `PROVIDER_RETRY_BASE_DELAY_MS` | 100 | Base backoff between provider retries |
| `ADDRESS_LIST_MAX_ITEMS` | 50 | Addresses accepted in one request |
| `PROVIDER_CONCURRENCY` | 5 | Provider requests in flight per API request |
| `MAX_ERROR_RESPONSE_BYTES` | 8192 (8 KiB) | One serialized error response body |
| `MAX_VALIDATION_ERROR_DETAILS` | 3 | Validation details returned to the client |
| `MAX_CONNECTION_BUFFERED_BYTES` | 1048576 (1 MiB) | Response bytes buffered per connection |

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
`validation_error_details`, `connection_buffered_bytes`.

## Responses

Violations always produce a bounded response and never terminate the process:

| Situation | Status |
|---|---|
| The client's own request drove the violation | `413 Payload Too Large` |
| The address list is invalid or too long (schema/validator) | `422 Unprocessable Entity` |
| A provider breached its size budget, or failed | `502 Bad Gateway` |
| A provider breached its time budget | `504 Gateway Timeout` |

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
- `src/__tests__/unit/addressesInfo.controller.budgets.unit.ts`
