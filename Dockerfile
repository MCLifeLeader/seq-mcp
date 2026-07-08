# syntax=docker/dockerfile:1

ARG NPM_VERSION=11.13.0

FROM node:24.15.0-alpine AS build
WORKDIR /app
ARG NPM_VERSION

COPY package.json package-lock.json* ./
RUN npm install -g "npm@$NPM_VERSION"
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.15.0-alpine AS runtime
WORKDIR /app
ARG NPM_VERSION

ARG IMAGE_VERSION=none
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="mcp/seq-otlp" \
      org.opencontainers.image.description="Unofficial Standalone MCP server for Datalust Seq OpenTelemetry access" \
      org.opencontainers.image.url="https://hub.docker.com/r/mcp/seq-otlp" \
      org.opencontainers.image.documentation="https://github.com/MCLifeLeader/seq-mcp/blob/main/README.md" \
      org.opencontainers.image.source="https://github.com/MCLifeLeader/seq-mcp" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$IMAGE_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      io.modelcontextprotocol.server.name="seq-otlp"

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install -g "npm@$NPM_VERSION"
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY catalog ./catalog
COPY assets ./assets
COPY README.md ./README.md
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

USER node

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
