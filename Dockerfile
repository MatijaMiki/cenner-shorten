# Built by Coolify (Dockerfile build pack). Node is pinned: 22.23.4 is the first Node 22 with the fix for the bundled
# brotli decoder (CVE-2026-111497). Same steps as the Nixpacks build it replaces: `npm ci` (dev dependencies included),
# then `node server.js` on PORT 3333. The SQLite database lives on the /data volume (DB_PATH=/data/links.db in Coolify).
FROM node:22.23.4-alpine
WORKDIR /app

# better-sqlite3 is a native module: the build tools are there only in case no prebuilt binary fits, then removed.
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci \
 && npm cache clean --force \
 && apk del .build-deps

COPY . .

# Set after `npm ci` so the install matches the Nixpacks one. NODE_ENV and PORT set in Coolify override these.
ENV NODE_ENV=production PORT=3333
EXPOSE 3333
CMD ["node", "server.js"]
