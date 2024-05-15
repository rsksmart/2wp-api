FROM node:18-alpine as build

RUN apk add --no-cache build-base git python3

WORKDIR /home/node/app
RUN chown node:node .
USER node

COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . ./

RUN npm run build

CMD ["node", "."]
