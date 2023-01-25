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
COPY --chown=node DEVELOPING.md .
COPY --chown=node tsconfig.json .
COPY --chown=node .dockerignore .
COPY --chown=node .env .
COPY --chown=node .env.test .
COPY --chown=node .eslint.json .
COPY --chown=node .eslintignore .
COPY --chown=node .eslintrc.js .
COPY --chown=node .git .
COPY --chown=node .github .
COPY --chown=node .gitignore .
COPY --chown=node .mocharc.json .
COPY --chown=node .npmrc .
COPY --chown=node .nyc_output .
COPY --chown=node .nycrc.json .
COPY --chown=node .prettierignore .
COPY --chown=node .prettierrc .
COPY --chown=node .yo-rc.json .
COPY --chown=node DEVELOPING.md .
COPY --chown=node Dockerfile .
COPY --chown=node ENV_VARIABLES.md .
COPY --chown=node LICENSE .
COPY --chown=node README.md .
COPY --chown=node SECURITY.md .
COPY --chown=node SessionDB .
COPY --chown=node SessionDB/* .
COPY --chown=node SessionDB/data/* .
COPY --chown=node docker-compose.yml .
COPY --chown=node public/* .
COPY --chown=node log/* .
COPY --chown=node log .
COPY --chown=node rsk-database/* .
COPY --chown=node src/controllers ./controllers
COPY --chown=node src/datasources ./datasources
COPY --chown=node src/models ./models
COPY --chown=node src/repositories ./repositories
COPY --chown=node src/services ./services
COPY --chown=node src/utils ./utils
COPY --chown=node src/application.ts .
COPY --chown=node src/constants.ts .
COPY --chown=node src/daemon-runner.ts .
COPY --chown=node src/index.ts .
COPY --chown=node src/migrate.ts .
COPY --chown=node src/openapi-spec.ts .
COPY --chown=node src/sequence.ts .
COPY --chown=node src/tsconfig.json .
COPY --chown=node src/dependency-injection-bindings.ts .
COPY --chown=node src/dependency-injection-handler.ts .
COPY --chown=node src ./src

RUN npm run build

# Bind to all network interfaces so that it can be mapped to the host OS
ENV HOST=0.0.0.0 PORT=3000

EXPOSE ${PORT}
CMD [ "node", "." ]
