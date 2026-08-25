# API Reference

`2wp-api` exposes a LoopBack 4 REST API. Routes are defined per-controller in `src/controllers/*.controller.ts` and booted automatically (`src/application.ts` boots every file matching `controllers/**/*.controller.js`).

## Live documentation

When `NODE_ENV` is not `production`, the running application also serves:

- **REST Explorer** — `http://<host>:<port>/explorer` (interactive, try-it-out UI)
- **OpenAPI spec** — `http://<host>:<port>/openapi.json` (served by `@loopback/rest`; both are disabled in production, see `src/index.ts`)

An OpenAPI spec can also be generated to a file offline with `npm run openapi-spec` (see [`setup.md`](./setup.md)).

## Routes

| Method | Path | Controller | Purpose |
|---|---|---|---|
| `GET` | `/api` | `ApiInformationController` | Returns the running API's version (from `package.json`) |
| `GET` | `/health` | `HealthCheckController` | Aggregate health check: MongoDB (sync status), Blockbook, RSK node, and the RSK Bridge, each reported independently |
| `GET` | `/features` | `FeaturesController` | Returns the feature-flag documents stored in MongoDB |
| `GET` | `/pegin-configuration` | `PeginConfigurationController` | Returns current peg-in configuration: minimum/maximum value, federation address, required BTC confirmations |
| `POST` | `/addresses-info` | `AddressesInfoController` | Given a list of BTC addresses, returns each address's info (balance, txids, capped provider-side at `MAX_ADDRESS_INFO_TXIDS`) via Blockbook, resolved with bounded concurrency |
| `POST` | `/utxo` | `UtxoController` | Given a list of BTC addresses, returns their unspent transaction outputs (rejects with `413` if the combined result exceeds `UTXO_RESPONSE_MAX_ROWS`, enforced as results arrive) |
| `GET` | `/estimate-fee/{block}` | `EstimateFeeController` | Estimated BTC/byte fee to get a transaction mined within `{block}` blocks |
| `POST` | `/broadcast` | `BroadcastController` | Broadcasts a raw signed BTC transaction (hex-encoded) to the network |
| `GET` | `/tx` | `TxController` | Returns transaction info for an RSK tx hash (`tx` query parameter) |
| `GET` | `/tx-status/{txId}` | `TxStatusController` | Looks up a transaction's status, trying native peg-in, native peg-out, and Flyover in turn until one matches |
| `GET` | `/tx-status-by-type/{txId}/{txType}` | `TxStatusController` | Same lookup as `/tx-status/{txId}`, but scoped to a known `txType` (`pegin`, `pegout`, `flyover-pegin`, `flyover-pegout`) instead of trying all of them |

Request/response shapes (path parameters, body schemas, response models) are documented on each handler via `@loopback/rest` decorators (`@get`/`@post`/`@param`/`@requestBody`/`@response`) and are what populates the REST Explorer and generated OpenAPI spec above — that's the definitive, always-current version of the contract.

## Request and response formats

The API is JSON-only, and the policy is enforced rather than assumed.

| Axis | Policy |
|---|---|
| Request `Content-Type` | `application/json` only (a `charset` parameter is fine). Anything else, or an absent header, is refused with a bounded `415`. |
| Request `Content-Encoding` | `identity` only. `gzip`, `deflate` and `br` are refused with a bounded `415` **before** any decompressor is constructed, so no zlib or Brotli decoder is reachable from a public route. This is a security control, not a preference — the runtime's Brotli decoder has an unpatched state-corruption defect that faults natively during request parsing, so relaxing it to accommodate a client that compresses requests reintroduces a remote process kill. Asserted for `/utxo` and `/broadcast` in `src/__tests__/acceptance/format-restrictions.acceptance.ts`, where the block is labelled security-critical. |
| Response format | Always `application/json`. An `Accept` value asking for XML or HTML, and the legacy `?_format=xml|html` query parameter, are **ignored** rather than rejected — the response stays JSON. This is the chosen contract: unsupported `Accept` values do not produce a `406`. |
| HTTP methods | Only the methods declared per route. Anything else is refused by routing and never reaches a handler. |
| Request body | Required where declared, and bounded by `MAX_REQUEST_BODY_BYTES`. Since nothing may be compressed, wire size equals decoded size and one limit bounds both. |

Refusals are counted on the `format_rejected_total` metric, labelled `reason` =
`content_encoding` | `media_type` | `method` | `body_size`. The rejected header
value is never used as a label.

## Resource budgets

Requests and provider responses are bounded by explicit, environment-driven resource budgets — request body size, provider response size and deadline, UTXO row counts, address-info `txids`, and Bridge calldata decode size. Violations produce a bounded `413`/`502`/`504` and a structured `event=resource_budget_exceeded` log. See [`resource-budgets.md`](./resource-budgets.md).

## Data access layer

Several of these routes read/write through a shared storage-provider contract — see [`data-services.md`](./data-services.md).
