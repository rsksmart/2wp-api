# Build stage: needs the toolchain for native modules, the sources and the
# devDependencies. None of that belongs in the image that runs in production.
FROM node:24-alpine AS build

RUN apk add --no-cache build-base git python3

WORKDIR /home/node/app
RUN chown node:node .
USER node

COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . ./

RUN npm run build

# Drop devDependencies from the tree that gets copied forward. Pruning here
# rather than reinstalling in the runtime stage keeps any compiled native module
# exactly as it was built, and needs no toolchain in the final image.
RUN npm prune --omit=dev

# Runtime stage: compiled output, production dependencies and the static assets,
# on the same Node major the build used.
FROM node:24-alpine AS runtime

WORKDIR /home/node/app
RUN chown node:node .
USER node

COPY --chown=node:node --from=build /home/node/app/node_modules ./node_modules
COPY --chown=node:node --from=build /home/node/app/dist ./dist
# `public/` is read with readFileSync at module load, so omitting it fails the
# container at boot rather than 404ing a request.
COPY --chown=node:node --from=build /home/node/app/public ./public
COPY --chown=node:node --from=build /home/node/app/package*.json ./

CMD ["node", "."]
