FROM node:18-alpine

ENV NODE_ENV=production
ARG NPM_BUILD="npm install --omit=dev"
EXPOSE 8080/tcp

LABEL maintainer="Mercury Workshop"
LABEL summary="Scramjet Demo Image"
LABEL description="Example application of Scramjet"

WORKDIR /app

# Copy package metadata. Use glob so build doesn't fail when package-lock.json is absent.
COPY package*.json ./

# Install build tools needed for native modules, then install dependencies.
RUN apk add --upgrade --no-cache python3 make g++
# Use npm ci when a lockfile exists for reproducible installs; otherwise fall back to npm install.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy app source
COPY . .

# Fail the build before deployment if the server cannot be parsed by Node.
RUN node --check server.js

ENTRYPOINT [ "node" ]
CMD ["server.js"]
