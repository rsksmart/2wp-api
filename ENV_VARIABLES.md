# [2wp-api] Environment Variables
This table was created to guide and centralize the **environment variables** necessary for correct execution.

|NAME                          |DEV VALUE                      |DETAILS                                                  |
|------------------------------|-------------------------------|---------------------------------------------------------|
|RSK_DB_CONNECTION_USER        |                               |'Database connection user'                               |
|RSK_DB_CONNECTION_PASSWORD    |                               |'Database connection password'                           |
|RSK_DB_CONNECTION_HOST        |                               |'Database Host'                                          |
|RSK_DB_CONNECTION_PORT        |                               |'Database connection port'                               |
|RSK_DB_CONNECTION_DATABASE    |                               |'Database name'                                          |
|RSK_DB_CONNECTION_AUTH_SOURCE |                               |'Database auth source'                                   |
|RSK_PEGOUT_MINIMUM_CONFIRMATIONS |                            |'10 blocks for testnet. 4000 blocks for mainnet'         |
|SYNC_INITIAL_BLOCK_HEIGHT     |                               |'Initial Block Height'                                   |
|SYNC_INITIAL_BLOCK_HASH       |                               |'Initial Block Hash'                                     |
|SYNC_INITIAL_BLOCK_PREV_HASH  |                               |'Initial Block previous hash'                            |
|SYNC_INTERVAL_TIME            |                               |'Sync time'                                              |
|PORT                          |8080                           |'Api port'                                               |
|HOST                          |'0.0.0.0`                      |'Api host'                                               |
|FAST_MINING_BLOCK             |1                              |'Block confirmation fast'                                |
|AVERAGE_MINING_BLOCK          |6                              |'Block confirmation average'                             |
|LOW_MINING_BLOCK              |12                             |'Block confirmation low'                                 |
|FEE_PER_KB_FAST_MIN           |100                            |'Fee per kb fast'                                        |
|FEE_PER_KB_AVERAGE_MIN        |100                            |'Fee per kb average'                                     |
|FEE_PER_KB_SLOW_MIN           |100                            |'Fee per kb slow'                                        |
|BURN_DUST_VALUE               |2000                           |'Burn dust value'                                        |
|BTC_CONFIRMATIONS             |100                            |'testnet or mainnet'                                     |
|NETWORK                       |`testnet or mainnet`           |'testnet or mainnet. Required: the daemon refuses to start with any other value' |
|BLOCKBOOK_URL                 |                               |'Blockbook url'                                          |
|MAX_AMOUNT_ALLOWED_IN_SATOSHI |                               |'Pegin Pegout max allowed in satoshis'                   |
|LOG_FORMAT                    |`json or pretty`               |'Log output format. Defaults to json'                    |
|LOG_LEVEL                     |`debug, info, warn, error, fatal` |'Minimum log level. Defaults to info'           |
|METRICS_ENABLED               |`true or false`                |'enable metric debug log'                                |
|NODE_ENV|`production or development`|'Indicates if the app should be built for a production environment or not'
|DEPLOY_ENV                    |`local`                        |'Deployment environment whose backoffice feature flags are retrieved. Defaults to local'|
|BACKOFFICE_API_URL            |`http://localhost:3010`        |'Base URL of the backoffice API serving the feature flags. Empty disables the integration (local features only)'|
|BACKOFFICE_API_EMAIL          |                               |'Backoffice service account email (read-only feature-flags role)'|
|BACKOFFICE_API_PASSWORD       |                               |'Backoffice service account password. Secret — never commit'|
|BACKOFFICE_FLAGS_CACHE_TTL_MS |60000                          |'How long retrieved flags are cached before re-fetching'|
|BACKOFFICE_HTTP_TIMEOUT_MS    |2000                           |'Timeout for each backoffice HTTP request'|
|ATLAS_EVENTS_ENABLED          |`false`                        |'Kill switch for Atlas SWAP event publication. Only the literal `true` enables it'|
|ATLAS_SQS_QUEUE_URL           |                               |'URL of the SQS FIFO queue the Atlas events are published to. Required when `ATLAS_EVENTS_ENABLED=true`; the daemon aborts at startup without it'|
|AWS_REGION                    |`us-east-1`                    |'AWS region of the Atlas SQS queue'                      |
|ATLAS_SQS_ENDPOINT            |`http://localhost:4566`        |'Custom SQS endpoint. Local development and tests only (LocalStack); leave empty in deployments'|

### Atlas SWAP events

While `ATLAS_EVENTS_ENABLED=true`, the daemon publishes Atlas SWAP events to the
SQS FIFO queue at `ATLAS_SQS_QUEUE_URL` as it processes Bridge transactions.
**Only the daemon publishes**: the publisher is registered by
`configureDaemonDependencies` and is simply not bound in the API process.

Peg-out, one event per transition: `swap.created` (RECEIVED), `swap.pending`
(WAITING_FOR_CONFIRMATION), `swap.completed` (RELEASE_BTC) and `swap.rejected`
(REJECTED). `WAITING_FOR_SIGNATURE` publishes nothing: it is an internal
federation sub-state with no equivalent in the v1.0 schema.

Peg-in, keyed by `btcTxId`, two events per outcome: `LOCKED` publishes
`swap.created` and `swap.completed`, and a rejection publishes `swap.created`
followed by `swap.rejected`. `swap.pending` has no trigger, because the daemon
observes only Rootstock and never sees the deposit on Bitcoin.

The `swap.completed` of a peg-in carries `duration_ms: null` — the Bitcoin
broadcast time is unknown, and a zero would drag the average duration down — and
`fee: "0.00000000"`, because the Bridge credits the whole amount sent. Its
`destination_tx_hash` is the Rootstock transaction that credited the RBTC.

Rejection reasons are translated to the names of the rskj enums
(`RejectedPeginReason`, `NonRefundablePeginReason`) in
`models/atlas/atlas-pegin-reasons.ts`, and the raw numbers of both logs travel in
`error_message`. The `error_code` always names the `rejected_pegin` reason, the
root cause present in every branch; the exception is a rejection the Bridge
followed with no refund branch at all, reported as
`PEGIN_REJECTED_NO_REFUND_BRANCH`. **This table has to stay aligned with rskj**:
a value added there falls back to `UNKNOWN` with a `warn`, which degrades well
but only if someone reads the warning.

`swap_id` and `wallet_address` are normalized — 0x-prefixed and lowercase — in
both flows, so one transaction cannot reach Atlas under two spellings. Bitcoin
addresses are left alone, since base58 is case sensitive.

The `swap_id` identifies the swap on the chain the funds come from: a peg-out
carries its `originatingRskTxHash`, a peg-in its `btcTxId`. The queue's
`MessageGroupId` is that same `swap_id`, so the transitions of one swap stay
ordered while different swaps are processed in parallel. The queue must have
content based deduplication **disabled**: `MessageDeduplicationId` is the
`event_id`.

The network travels in the chain ids (`rootstock_testnet` / `bitcoin_testnet`),
derived from `NETWORK`. Because a wrong network would silently contaminate the
analytics database, `NETWORK` is validated when the daemon starts and the daemon
aborts if it is neither `mainnet` nor `testnet`.

`ATLAS_SQS_QUEUE_URL` is validated the same way, and only while the switch is
on: a blank url would not disable publication, it would fail every send and lose
the events with no retry, so the daemon aborts at startup rather than running
blind. With `ATLAS_EVENTS_ENABLED` off the variable is not read at all.

Publication happens after the status has been written to Mongo and never fails
the caller: if SQS is unreachable the failure is logged at error level and block
processing continues. Events lost in that window are not recovered.

Every publication, successful or not, logs one line carrying
`metric: 'atlas_events_published_total'` with `status`, `flow`, `eventType` and
the running `total`. **That field name is the contract with the log aggregator**
— it is what an alert on lost events queries, so it must not be renamed for
style. The counter makes the loss above visible; it does not fix it, and
idempotency by `btcTxId` means a re-sync will not retry a peg-in it already
recorded.

Credentials come from the standard AWS SDK chain (an IAM role in deployments,
`test`/`test` against LocalStack). `docker compose up` starts a LocalStack
container that creates the queue from `ci/localstack-init`; from inside the
compose network the endpoint host is `localstack`, not `localhost`.

### Backoffice feature flags

When the `BACKOFFICE_*` variables are set, every feature flag configured on the
backoffice (e.g. `FLYOVER`, `UNION_BRIDGE`, `POWPEG`, `MAINTENANCE_MODE`) is
retrieved for the environment matching `DEPLOY_ENV` and merged into the
`/features` response under its lowercased key (e.g. `flyover`). New flags added
on the backoffice flow through without code changes.

A boolean flag is served as `enabled`/`disabled`; a string, number or JSON flag
is served as it stands, so the backoffice can hold text (e.g.
`terms_and_conditions`) or structured configuration. Flags holding no value at
all (`null`, or none) are ignored and logged. A boolean flag never overwrites a
stored feature holding neither `enabled` nor `disabled` — the backoffice can
still replace that text by serving a value of its own.

A non-boolean flag whose key extends a boolean flag's key sets a property on
that feature row instead, named after the camelCased remainder (e.g.
`WALLET_LEDGER_SUPPORTED_BROWSERS` sets `supportedBrowsers` of
`wallet_ledger`), so new properties defined on the backoffice need no code
changes either. `name`, `value` and `pairs` are reserved; a flag whose
remainder camelCases to one of them, or that matches no boolean flag, is
served as a flag of its own.

The same retrieval asks for the backoffice providers (`include=providers`) and
merges each one the same way, under its lowercased key (e.g. `boltz`), carrying
the pairs it can serve in a nested `pairs` array:

```json
{"name": "boltz", "value": "enabled", "pairs": [
  {"fromNetwork": "BITCOIN", "toNetwork": "ROOTSTOCK",
   "fromToken": "BTC", "toToken": "RBTC", "enabled": true}
]}
```

A pair is nested only when both the pair and its provider are enabled, so a
disabled provider is served as `disabled` with an empty `pairs` array. A
provider needs a `key` and a boolean `enabled` to be served at all (others are
ignored and logged), and nothing else about it is exposed. A pair needs only
`enabled` and is served exactly as it arrives, so attributes added on the
backoffice reach `/features` without code changes. A payload carrying no
`providers` is served as flags only.

Values are cached for `BACKOFFICE_FLAGS_CACHE_TTL_MS`; once expired, the stale
values keep being served while a refresh runs in the background, so only the
very first retrieval waits on the backoffice. On backoffice downtime the last
retrieved values are served (or the flags are simply omitted from `/features`),
and failed or invalid retrievals are logged.


##Example for .env.local.test file

```dotenv
NETWORK='testnet'
BTC_CONFIRMATIONS=100
RSK_PEGOUT_MINIMUM_CONFIRMATIONS=10
FAST_MINING_BLOCK=1
AVERAGE_MINING_BLOCK=6
LOW_MINING_BLOCK=12
BLOCKBOOK_URL='https://'
MAX_AMOUNT_ALLOWED_IN_SATOSHI=100000000

# Federation Addresses history
FEDERATION_ADDRESSES_HISTORY='2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv 2N1y7hSneV9HuWnpLTtGqdRnway1Ag3dQoj 2NF9ndVaez5owUShjSxNnY2E31QkRjLu63k 2N5exbrgeGBuKXqcinfz68atduq6ApHN4b4 2Mu7ayegt8AYi7vGYtG2KGaXErPWBQhPVfu 2N1rW3cBZNzs2ZxSfyNW7cMcNBktt6fzs88 2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB'

BRIDGE_ADDRESS='0x0000000000000000000000000000000001000006'
RSK_NODE_HOST='https://public-node.testnet.rsk.co'
LOG_FORMAT=pretty
LOG_LEVEL=debug
METRICS_ENABLED=false;

# DAEMON SYNC - https://explorer.testnet.rsk.co/block/2019830
SYNC_INITIAL_BLOCK_HEIGHT=2019830
SYNC_INITIAL_BLOCK_HASH='0xf5d6a4b3df6311f5852de936142e669e7fba12c8476dc22d8a9c88267e78aee3'
SYNC_INITIAL_BLOCK_PREV_HASH='0x4e2ac28a61452e911d6f598679abb5ccf8c7988e773e30bfa0891a4e722a2961'
SYNC_MIN_DEPTH=6
SYNC_INTERVAL_TIME=2000

# MONGODB CONNECTION
RSK_DB_CONNECTION_USER='api-user'
RSK_DB_CONNECTION_PASSWORD='api-pwd'
RSK_DB_CONNECTION_HOST='localhost'
RSK_DB_CONNECTION_PORT='27017'
RSK_DB_CONNECTION_DATABASE='rsk'
RSK_DB_CONNECTION_AUTH_SOURCE='rsk'

#FeePerKB (Sat/b)
FEE_PER_KB_FAST_MIN=100
FEE_PER_KB_AVERAGE_MIN=100
FEE_PER_KB_SLOW_MIN=100
MAX_FEE_AMOUNT_ALLOWED=5000000

#Dust value (Satoshi)
BURN_DUST_VALUE=2000

NODE_ENV=development

# Backoffice feature flags (empty BACKOFFICE_API_URL disables the integration)
BACKOFFICE_API_URL='http://localhost:3010'
BACKOFFICE_API_EMAIL='2wp-api@example.com'
BACKOFFICE_API_PASSWORD='replace-with-the-service-account-password'
BACKOFFICE_FLAGS_CACHE_TTL_MS=60000
BACKOFFICE_HTTP_TIMEOUT_MS=2000
```