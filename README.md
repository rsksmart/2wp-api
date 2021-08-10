# 2wp-api

This is the API component for 2-Way-Peg solution.
## Development Mode
Include a .env file with the required environment variables listed in `.env.test` file (you can copy that file).
If you are running the API for testing purposes set the variable `LOCAL_TEST=1` with the required `TEST_FEDERATION_ADDRESS`, remove the variable from file or set to `0` in other cases.
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
docker-compose up -d
```

### RSK DB
Move to the `rsk-database` folder, copy your `.env` file in it and then run:
```sh
docker-compose up -d
```

For some reason passing `--env-file` argument to docker-compose doesn't seem to be working fine. That's why we need to copy the `.env` file here too.

## Run the application
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


## Fix code style and formatting issues

```sh
npm run lint
```

To automatically fix such issues:

```sh
npm run lint:fix

```
## Depĺoyment
In the root directory run:
```shell
docker-compose up
```

## Other useful commands

- `npm run openapi-spec`: Generate OpenAPI spec into a file

## Tests

```sh
npm test
```

[![LoopBack](https://github.com/strongloop/loopback-next/raw/master/docs/site/imgs/branding/Powered-by-LoopBack-Badge-(blue)-@2x.png)](http://loopback.io/)
