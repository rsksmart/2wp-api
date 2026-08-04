[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=rsksmart_2wp-api&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=rsksmart_2wp-api)

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/rsksmart/2wp-api/badge)](https://scorecard.dev/viewer/?uri=github.com/rsksmart/2wp-api)

# 2wp-api

This is the API component for 2-Way-Peg solution.

The solution will be a web interface, which integrates with a **Rest API (this application)**, which in turn communicates with internal services such as the blockchain node and databases. In addition, a daemon/worker will be created that will be responsible for obtaining data from the blockchain and changing the status of the transaction.

## Development Mode

The **2wp-api** application will run on **3000 port**.

Include a .env file with the required environment variables listed in `.env.test` file (you can copy that file).

> **_NOTE:_**  You must have access to a Blockbook server running in the required network and provide its url in the `.env` file. If you want to setup locally please read the [instructions.](https://github.com/trezor/blockbook?tab=readme-ov-file#build-and-installation-instructions)

### Check npm and node versions

Install and run the `use` command to get the needed npm and node version

```sh
nvm use
```

### Install dependencies
To only install resolved dependencies in `package-lock.json`:

```sh
npm ci
```

### Database (MongoDB)

See [Docker Deployment](#docker-deployment) below to start MongoDB (and optionally the API) via `docker-compose`.

## Environment Variables

To verify all environment variables, please click [here](./ENV_VARIABLES.md) for environment variables details.

## Connecting to MongoDB

The database user is created automatically on the container's first startup from your `.env`'s `RSK_DB_CONNECTION_*` values (see [Docker Configuration Summary](#docker-configuration-summary) below and [`docs/setup.md`](./docs/setup.md) for the manual/edge-case fallback).

## Using npm to run the application

If you want to start the API alongside the daemon run:

```sh
npm start
```

If you prefer to execute just the API run:

```sh
npm run start-api
```

Open http://127.0.0.1:3000 in your browser to discover the API capabilities

If you prefer to execute just the daemon run:

```sh
npm run start-daemon
```

## Endpoints / API Reference

The running application serves an interactive REST Explorer at `/explorer` and an OpenAPI spec at `/openapi.json` (both disabled when `NODE_ENV=production`). For the full route table plus the data-access extension point, see [`docs/api.md`](./docs/api.md) and [`docs/data-services.md`](./docs/data-services.md).

## Testing

```sh
npm run unit-test        # dist/__tests__/**/*.unit.js
npm run acceptance-test  # dist/__tests__/**/*.acceptance.js
npm run test:all         # both suites
npm run coverage         # nyc report (after a test run)
```

## Fix code style and formatting issues

```sh
npm run eslint
```

To automatically fix such issues:

```sh
npm run eslint:fix

```

## Build & test project
```
npm ci
npm run unit-test
npm run eslint
npm run only-coverage
```

## Docker Deployment

The project includes Docker Compose configuration for running both the API and MongoDB database together.

### Docker Configuration Summary

- **API Service**: Runs on port 3000, connects to MongoDB using service name `pp-api-db`
- **MongoDB Service**: Runs on ports 27017-27019, automatically initializes with user and database from environment variables

### Start Database Only (Development)

To start only the MongoDB database for local development:

```bash
# Start MongoDB container
docker-compose up -d pp-api-db

# View logs
docker-compose logs -f pp-api-db
```

The database will be accessible at `localhost:27017`. Make sure your `.env` file has `RSK_DB_CONNECTION_HOST=localhost` for local development.

### Start Full API Stack

To start both the API and MongoDB together:

```bash
# Start all services
docker-compose up -d
```

The API will be accessible at `http://localhost:3000` and will automatically connect to MongoDB using the Docker service name.

**Note**: When running in Docker, the API uses `pp-api-db` as the MongoDB host (configured in docker-compose.yml). For local development without Docker, use `localhost`.

## Other useful commands

- `npm run openapi-spec`: Generate OpenAPI spec into a file

## Documentation

See [`docs/`](./docs/) for setup details beyond this README ([`setup.md`](./docs/setup.md)), the full routes table and live API docs ([`api.md`](./docs/api.md)), and the `GenericDataService` storage extension point and its MongoDB implementations ([`data-services.md`](./docs/data-services.md)).

[![LoopBack](<https://github.com/strongloop/loopback-next/raw/master/docs/site/imgs/branding/Powered-by-LoopBack-Badge-(blue)-@2x.png>)](http://loopback.io/)

## Report Security Vulnerabilities

To report a vulnerability, please use the [vulnerability reporting guideline](./SECURITY.md) for details on how to do it.
