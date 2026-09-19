FROM node:23-alpine AS build

RUN apk add --no-cache build-base git python3

WORKDIR /home/node/app
RUN chown node:node .
USER node

COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . ./

RUN npm run build

# API and daemon are deployed as separate processes. APP_MODE keeps the
# default behaviour (both in one process) while letting the orchestrator
# select API or DAEMON explicitly instead of relying on an omitted flag.
ENV APP_MODE=ALL
CMD ["sh", "-c", "node . --appmode=$APP_MODE"]
