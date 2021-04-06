# 2wp-api

This is the API component for 2-Way-Peg solution.
## Development Mode
Include a .env file with the required environment variables:
```js
NETWORK='testnet' // or mainnet
FEDERATION_ADDRESS=<Address>
BTC_CONFIRMATIONS=100 // default
INPUT_SIZE=180 // default
FAST_MINING_BLOCK=1
AVERAGE_MINING_BLOCK=6
LOW_MINING_BLOCK=12
LEGACY_REGEX='^[mn][1-9A-HJ-NP-Za-km-z]{26,35}' // testnet
SEGWIT_REGEX='^[2][1-9A-HJ-NP-Za-km-z]{26,35}' // testnet
NATIVE_SEGWIT_REGEX='^[tb][0-9A-HJ-NP-Za-z]{26,41}' // testnet
SESSIONDB_HOST=<HOST>
SESSIONDB_PORT=<PORT>
SESSIONDB_PASSWORD=<PASSWORD>
SESSIONDB_INDEX=<INDEX> // default 1
BRIDGE_ADDRESS='0x0000000000000000000000000000000001000006' // default
RSK_NODE_HOST=<RSK_NODE_HOST:PORT>
```
### Install dependencies

```sh
npm install
```

To only install resolved dependencies in `package-lock.json`:

```sh
npm ci
```
### Session DB
Move to the `SessionDB` folder and run:

```sh
docker-compose up
```

## Run the application
```sh
npm start
```


Open http://127.0.0.1:3000 in your browser.


## Fix code style and formatting issues

```sh
npm run lint
```

To automatically fix such issues:

```sh
npm run lint:fix
```

## Other useful commands

- `npm run openapi-spec`: Generate OpenAPI spec into a file
- `npm run docker:build`: Build a Docker image for this application
- `npm run docker:run`: Run this application inside a Docker container

## Tests

```sh
npm test
```

[![LoopBack](https://github.com/strongloop/loopback-next/raw/master/docs/site/imgs/branding/Powered-by-LoopBack-Badge-(blue)-@2x.png)](http://loopback.io/)
