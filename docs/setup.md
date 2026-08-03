# Setup

`2wp-api` is a [LoopBack 4](https://loopback.io/) REST API for the 2-Way-Peg (peg-in/peg-out) solution. The same codebase can run in three modes (`--appmode=API`, `--appmode=DAEMON`, or both), selected at process start.

## Prerequisites

- **Node.js `>=20.0.0`** (`.nvmrc` pins `v20.18.2` — run `nvm use`)
- **npm** (dependencies are locked with `package-lock.json`; use `npm ci`)
- **Docker** and **Docker Compose**, to run MongoDB (and optionally the API) locally
- Access to a running **[Blockbook](https://github.com/trezor/blockbook)** server for the target Bitcoin network (its URL goes in `BLOCKBOOK_URL`)
- Access to an **RSK node** (defaults to the public testnet/mainnet nodes, see `RSK_NODE_HOST` in [ENV_VARIABLES.md](../ENV_VARIABLES.md))

## Install

```sh
nvm use
npm ci
```

## Configure environment variables

Copy `.env.test` to `.env` and adjust values for your environment:

```sh
cp .env.test .env
```

The full variable reference (name, dev value, meaning) is kept in [`ENV_VARIABLES.md`](../ENV_VARIABLES.md) at the repo root — that table is the source of truth, this page only calls out the pieces that affect how you run the service:

| Variable | Purpose |
|---|---|
| `PORT` / `HOST` | Where the REST server listens (defaults to `8080`/`0.0.0.0` per `ENV_VARIABLES.md`; `src/index.ts` falls back to port `3000` if `PORT` is unset) |
| `NODE_ENV` | `production` disables the OpenAPI spec endpoint and the `/explorer` UI (see [`api.md`](./api.md)) |
| `BLOCKBOOK_URL` | Bitcoin data provider (address info, UTXOs, last block) |
| `RSK_DB_CONNECTION_*` | MongoDB connection (host, port, db, user, password, auth source) |
| `RSK_PEGOUT_MINIMUM_CONFIRMATIONS`, `BTC_CONFIRMATIONS` | Confirmation thresholds used by the pegin/pegout status services |
| `SYNC_INITIAL_BLOCK_*`, `SYNC_INTERVAL_TIME` | Where the daemon starts syncing RSK blocks from, and how often |
| `FEE_PER_KB_*`, `MAX_FEE_AMOUNT_ALLOWED`, `BURN_DUST_VALUE` | Fee estimation and pegout limits |

## Run MongoDB

The project ships a single `docker-compose.yml` at the repo root with two services: `pp-api-db` (MongoDB) and `api` (this application). Data persists to `./rsk-database/db` via a bind mount.

Start **only the database** (useful when running the API/daemon directly with `npm`):

```sh
docker-compose up -d pp-api-db
```

Make sure `RSK_DB_CONNECTION_HOST=localhost` in `.env` for this case.

First time only, create the application's MongoDB user:

```sh
docker exec -it 2wp-rsk-mongo-database bash
mongosh
use rsk
db.createUser({
  user: "api-user",
  pwd: "api-pwd",
  roles: [{ role: "userAdmin", db: "rsk" }]
})
```

Start **both** the database and a containerized API build:

```sh
docker-compose up -d
```

The API container connects to Mongo using the `pp-api-db` service name (already set in `docker-compose.yml`); a local (non-Docker) API process should use `RSK_DB_CONNECTION_HOST=localhost` instead.

## Build & run

```sh
npm run build        # compile TypeScript (lb-tsc)
npm start            # API + daemon together
npm run start-api    # API only
npm run start-daemon # daemon only
```

The API listens on port 3000 by default (`http://127.0.0.1:3000`); see [`api.md`](./api.md) for the routes and the live `/explorer` UI.

## Lint

```sh
npm run lint        # eslint
npm run lint:fix     # eslint --fix, then prettier --write
```

## Testing

```sh
npm run unit-test        # dist/__tests__/**/*.unit.js, via mocha + nyc
npm run acceptance-test   # dist/__tests__/**/*.acceptance.js
npm run test:all          # both suites together
npm run coverage          # nyc text + lcov report (after a test run)
```

Each of these rebuilds the project first (`pretest`/`precoverage` run `npm run rebuild`).

## Other useful commands

- `npm run openapi-spec` — generate the OpenAPI spec to a file by booting the application and calling `exportOpenApiSpec` (see `src/openapi-spec.ts`).
- `npm run migrate` — run LoopBack's datasource migration script (`src/migrate.ts`).
