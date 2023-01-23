[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=rsksmart_2wp-api&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=rsksmart_2wp-api)

# 2wp-api

This is the API component for 2-Way-Peg solution.

The solution will be a web interface, which integrates with a **Rest API (this application)**, which in turn communicates with internal services such as the blockchain node and databases. In addition, a daemon/worker will be created that will be responsible for obtaining data from the blockchain and changing the status of the transaction.


## Development Mode

The **2wp-api** application will run on **3000 port**.

Include a .env file with the required environment variables listed in `.env.test` file (you can copy that file).

### Check npm and node versions
```sh
npm -version
6.14.16
```

```sh
node -v
v14.19.1
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
docker-compose up -d
```

### RSK DB
Move to the `rsk-database` folder, copy your `.env` file in it and then run:
```sh
docker-compose up -d
```

For some reason passing `--env-file` argument to docker-compose doesn't seem to be working fine. That's why we need to copy the `.env` file here too.

## Environment Variables

To verify all environment variables, please click [here](./ENV_VARIABLES.md) for environment variables details.

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

## Fix code style and formatting issues

```sh
npm run eslint
```

To automatically fix such issues:

```sh
npm run eslint:fix

```
## Deployment
In the root directory run:
```shell
docker-compose up
```

## Other useful commands

- `npm run openapi-spec`: Generate OpenAPI spec into a file

## Tests

```sh
npm run test
```

[![LoopBack](https://github.com/strongloop/loopback-next/raw/master/docs/site/imgs/branding/Powered-by-LoopBack-Badge-(blue)-@2x.png)](http://loopback.io/)

## Report Security Vulnerabilities

To report a vulnerability, please use the [vulnerability reporting guideline](./SECURITY.md) for details on how to do it.
