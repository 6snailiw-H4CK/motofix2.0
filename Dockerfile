FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:server
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV AUTOMATIC_BACKUP_ENABLED=false

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node
EXPOSE 8080

CMD ["node", "dist-server/server.js"]
