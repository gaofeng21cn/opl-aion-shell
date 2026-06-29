FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun

COPY package.json bun.lock ./
COPY packages/desktop/package.json ./packages/desktop/package.json
COPY packages/shared-scripts/package.json ./packages/shared-scripts/package.json
COPY packages/web-cli/package.json ./packages/web-cli/package.json
COPY packages/web-host/package.json ./packages/web-host/package.json
COPY patches/ ./patches/

RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

ENV NODE_ENV=production
RUN bunx electron-vite build --config packages/desktop/electron.vite.config.ts
RUN node scripts/pack-web-cli.js

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist-web-cli/staging/aionui-web ./aionui-web

ENV PORT=3000
ENV NODE_ENV=production
ENV AIONUI_ALLOW_REMOTE=1
ENV HOME=/data
ENV AIONUI_DATA_DIR=/data
ENV OPL_DATA_DIR=/data
ENV OPL_PROJECTS_DIR=/projects
ENV OPL_WORKSPACE_ROOT=/projects
ENV OPL_IMAGE_MANIFEST_PATH=/app/aionui-web/opl-image-manifest.json
ENV OPL_IMAGE_SEED_DIR=/app/aionui-web/opl-image-seed

RUN mkdir -p /data /projects

VOLUME ["/data", "/projects"]
EXPOSE 3000

ENTRYPOINT ["tini", "--", "./aionui-web/opl-webui-entrypoint.sh"]
CMD ["start", "--remote", "--port", "3000"]
