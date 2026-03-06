# syntax=docker/dockerfile:1

FROM node:lts-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:lts-alpine AS runtime
WORKDIR /app

ARG IMAGE_VERSION=local
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="mcp/seq-otel" \
      org.opencontainers.image.description="Unofficial Standalone MCP server for Datalust Seq OpenTelemetry access" \
      org.opencontainers.image.url="https://hub.docker.com/r/mcp/seq-otel" \
      org.opencontainers.image.documentation="https://github.com/MCLifeLeader/seq-mcp/blob/main/README.md" \
      org.opencontainers.image.source="https://github.com/MCLifeLeader/seq-mcp" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$IMAGE_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE"

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
