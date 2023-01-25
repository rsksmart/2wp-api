# Check out https://hub.docker.com/_/node to select a new base image
FROM node:14-slim

RUN apt-get update && apt-get install -y git curl wget vim htop tree
# Set to a non-root built-in user `node`
USER node

# Create app directory (with user `node`)
RUN mkdir -p /home/node/app

WORKDIR /home/node/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY --chown=node package*.json ./

RUN npm ci

# Bundle app source code
COPY --chown=node . .
COPY --chown=node DEVELOPING.md .
COPY --chown=node LICENSE .
COPY --chown=node SessionDB .
COPY --chown=node docker-compose.yml .
COPY --chown=node public .
COPY --chown=node src .
COPY --chown=node Dockerfile .
COPY --chown=node README.md .
COPY --chown=node coverage .
COPY --chown=node log .
COPY --chown=node rsk-database .
COPY --chown=node tsconfig.json .
COPY --chown=node ENV_VARIABLES.md .
COPY --chown=node SECURITY.md .
COPY --chown=node log-config.json .
COPY --chown=node package.json .
COPY --chown=node sonar-project.properties .
# COPY --chown=node node_modules .
# COPY --chown=node dist .
# COPY --chown=node tsconfig.tsbuildinfo .

RUN npm run build

# Bind to all network interfaces so that it can be mapped to the host OS
ENV HOST=0.0.0.0 PORT=3000

EXPOSE ${PORT}
CMD [ "node", "." ]
