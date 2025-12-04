# 2wp-API Startup Guide

This guide provides step-by-step instructions to start the 2wp-API application, ensuring all required services are properly configured and running.

## Prerequisites

Before starting the API, ensure you have the following installed:
- **Node.js** (version 20.18.2 as specified in `.nvmrc`)
- **npm** (comes with Node.js)
- **Docker** and **Docker Compose** (for running required databases)
- **nvm** (Node Version Manager) - recommended for managing Node.js versions

## Step 1: Verify Node.js and npm Versions

First, ensure you're using the correct Node.js version:

```bash
# Check if nvm is available
nvm --version

# Use the correct Node.js version (20.18.2)
nvm use

# Verify the version
node --version
npm --version
```

**Expected output:**
- Node.js: v20.18.2
- npm: Should be compatible with Node.js 20.18.2

## Step 2: Install Dependencies

Install all required npm packages:

```bash
# Install dependencies from package-lock.json
npm ci
```

## Step 3: Environment Configuration

Create a `.env` file in the root directory with the required environment variables. You can use the example from `ENV_VARIABLES.md` as a template:

```bash
# Copy the example environment file (if available)
cp .env.test .env

# Or create a new .env file manually
touch .env
```

**Required environment variables for basic operation:**
```dotenv
NETWORK='testnet'
BTC_CONFIRMATIONS=100
RSK_PEGOUT_MINIMUM_CONFIRMATIONS=10
BLOCKBOOK_URL='https://your-blockbook-url'
MAX_AMOUNT_ALLOWED_IN_SATOSHI=100000000

# SessionDB (Redis) Configuration
SESSIONDB_HOST='localhost'
SESSIONDB_PORT=6379
SESSIONDB_PASSWORD='sessiondb-2wp-api-password'
SESSIONDB_INDEX=1

# Federation Addresses history
FEDERATION_ADDRESSES_HISTORY='2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv 2N1y7hSneV9HuWnpLTtGqdRnway1Ag3dQoj 2NF9ndVaez5owUShjSxNnY2E31QkRjLu63k 2N5exbrgeGBuKXqcinfz68atduq6ApHN4b4 2Mu7ayegt8AYi7vGYtG2KGaXErPWBQhPVfu 2N1rW3cBZNzs2ZxSfyNW7cMcNBktt6fzs88 2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB'

# DAEMON SYNC - https://explorer.testnet.rsk.co/block/2019830
SYNC_INITIAL_BLOCK_HEIGHT=2019830
SYNC_INITIAL_BLOCK_HASH='0xf5d6a4b3df6311f5852de936142e669e7fba12c8476dc22d8a9c88267e78aee3'
SYNC_INITIAL_BLOCK_PREV_HASH='0x4e2ac28a61452e911d6f598679abb5ccf8c7988e773e30bfa0891a4e722a2961'
SYNC_MIN_DEPTH=6
SYNC_INTERVAL_TIME=2000

# MongoDB Configuration
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
```

## Step 4: Start SessionDB (Redis)

The SessionDB is required for the API to function properly. Start it using Docker:

```bash
# Navigate to SessionDB directory
cd SessionDB

# Start Redis container
docker-compose up -d

# Verify the container is running
docker-compose ps

# Return to root directory
cd ..
```

**Expected output:** Redis container should be running on port 6379.

## Step 5: Start RSK Database (MongoDB)

The RSK database must be running before starting the API. Follow these steps:

```bash
# Navigate to rsk-database directory
cd rsk-database

# Copy your .env file to this directory (required for docker-compose)
cp ../.env .

# Start MongoDB container
docker-compose up -d

# Verify the container is running
docker-compose ps

# Return to root directory
cd ..
```

**Expected output:** MongoDB container should be running on port 27017.

## Step 6: Create MongoDB User (First Time Only)

If this is your first time setting up the database, you need to create a user with admin permissions:

```bash
# Access the MongoDB container
docker exec -it 2wp-rsk-mongo-database bash

# Connect to MongoDB shell
mongosh

# Switch to rsk database
use rsk

# Create admin user
db.createUser(
  {
    user: "api-user",
    pwd: "api-pwd",
    roles: [
      { role: "userAdmin", db:"rsk" }
    ]
  }
)

# Exit MongoDB shell
exit

# Exit container
exit
```

## Step 7: Build the Application

Before starting the API, build the TypeScript application:

```bash
# Build the application
npm run build
```

## Step 8: Start the API

Now you can start the API using the `start-api` command:

```bash
# Start only the API (without daemon)
npm run start-api
```

**Expected output:** The API should start and be accessible at `http://127.0.0.1:3000`.

## Step 9: Verify API is Running

Open your browser and navigate to:
- **API Explorer:** http://127.0.0.1:3000/explorer
- **API Root:** http://127.0.0.1:3000/

You should see the API documentation and be able to test endpoints.

## Alternative Commands

### Start Both API and Daemon
```bash
npm start
```

### Start Only Daemon
```bash
npm run start-daemon
```

### Development Mode with Watch
```bash
npm run build:watch
```

## Stopping Services

To stop all services when you're done:

```bash
# Stop API (Ctrl+C in the terminal where it's running)

# Stop MongoDB
cd rsk-database
docker-compose down
cd ..

# Stop Redis
cd SessionDB
docker-compose down
cd ..
```

## Support

If you encounter issues not covered in this guide:
1. Review `ENV_VARIABLES.md` for environment variable details
2. Check the application logs in the `log/` directory
3. Verify all Docker containers are running properly
