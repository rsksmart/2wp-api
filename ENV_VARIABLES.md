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
|NETWORK                       |`testnet or mainnet`           |'testnet or mainnet'                                     |
|BLOCKBOOK_URL                 |                               |'Blockbook url'                                          |
|SESSIONDB_HOST                |                               |'Redis host'                                             |
|SESSIONDB_PORT                |                               |'Redis port'                                             |
|SESSIONDB_PASSWORD            |                               |'Redis password'                                         |
|SESSIONDB_INDEX               |1                              |'Redis index'                                            |
|MAX_AMOUNT_ALLOWED_IN_SATOSHI |                               |'Pegin Pegout max allowed in satoshis'                   |
|METRICS_ENABLED               |`true or false`                |'enable trace log'                                       |


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

 #sessionDB
SESSIONDB_HOST='localhost'
SESSIONDB_PORT=6379
SESSIONDB_PASSWORD='sessiondb-2wp-api-password'
SESSIONDB_INDEX=1
BRIDGE_ADDRESS='0x0000000000000000000000000000000001000006'
RSK_NODE_HOST='https://public-node.testnet.rsk.co'
TTL_SESSIONDB_EXPIRE_MILLISECONDS=3600000
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
```