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
| `POST` | `/addresses-info` | `AddressesInfoController` | Given a list of BTC addresses, returns each address's info (balance, txids, capped at `ADDRESS_INFO_MAX_TXIDS`) via Blockbook, resolved with bounded concurrency |
| `POST` | `/utxo` | `UtxoController` | Given a list of BTC addresses, returns their unspent transaction outputs (rejects with `413` if the combined result exceeds `UTXO_RESPONSE_MAX_ROWS`) |
| `GET` | `/estimate-fee/{block}` | `EstimateFeeController` | Estimated BTC/byte fee to get a transaction mined within `{block}` blocks |
| `POST` | `/broadcast` | `BroadcastController` | Broadcasts a raw signed BTC transaction (hex-encoded) to the network |
| `GET` | `/tx` | `TxController` | Returns transaction info for an RSK tx hash (`tx` query parameter) |
| `GET` | `/tx-status/{txId}` | `TxStatusController` | Looks up a transaction's status, trying native peg-in, native peg-out, and Flyover in turn until one matches |
| `GET` | `/tx-status-by-type/{txId}/{txType}` | `TxStatusController` | Same lookup as `/tx-status/{txId}`, but scoped to a known `txType` (`pegin`, `pegout`, `flyover-pegin`, `flyover-pegout`) instead of trying all of them |

Request/response shapes (path parameters, body schemas, response models) are documented on each handler via `@loopback/rest` decorators (`@get`/`@post`/`@param`/`@requestBody`/`@response`) and are what populates the REST Explorer and generated OpenAPI spec above — that's the definitive, always-current version of the contract.

## Data access layer

Several of these routes read/write through a shared storage-provider contract — see [`data-services.md`](./data-services.md).
