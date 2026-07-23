FROM node:22-bookworm-slim AS opl-framework
ARG OPL_FRAMEWORK_REPO=https://github.com/gaofeng21cn/one-person-lab.git
ARG OPL_FRAMEWORK_REF=main
WORKDIR /opt/opl-framework-src

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN git init \
  && git remote add origin "${OPL_FRAMEWORK_REPO}" \
  && git fetch --depth 1 origin "${OPL_FRAMEWORK_REF}" \
  && git checkout --detach FETCH_HEAD \
  && git rev-parse HEAD > /tmp/opl-framework-commit

RUN npm ci \
  && npm run build \
  && npm prune --omit=dev

RUN mkdir -p /opt/opl-framework \
  && cp -a bin dist contracts package.json node_modules /opt/opl-framework/ \
  && cp /tmp/opl-framework-commit /opt/opl-framework/OPL_FRAMEWORK_COMMIT \
  && printf '%s\n' "${OPL_FRAMEWORK_REPO}" > /opt/opl-framework/OPL_FRAMEWORK_REPO \
  && printf '%s\n' "${OPL_FRAMEWORK_REF}" > /opt/opl-framework/OPL_FRAMEWORK_REF

FROM node:22-bookworm-slim AS codex-cli
ARG OPL_CODEX_NPM_SPEC=@openai/codex@latest
WORKDIR /opt/codex-cli

RUN npm install -g --prefix /opt/codex-cli "${OPL_CODEX_NPM_SPEC}" \
  && npm cache clean --force \
  && printf '%s\n' "${OPL_CODEX_NPM_SPEC}" > /opt/codex-cli/OPL_CODEX_NPM_SPEC

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ARG OPL_WEBUI_IMAGE_PROFILE=webui-full
ARG OPL_WEBUI_BUN_VERSION=1.2.23

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "bun@${OPL_WEBUI_BUN_VERSION}"

COPY package.json bun.lock ./
COPY packages/desktop/package.json ./packages/desktop/package.json
COPY packages/shared-scripts/package.json ./packages/shared-scripts/package.json
COPY packages/web-cli/package.json ./packages/web-cli/package.json
COPY packages/web-host/package.json ./packages/web-host/package.json
COPY patches/ ./patches/

RUN bun install --frozen-lockfile --ignore-scripts --network-concurrency 8

COPY . .
COPY --from=opl-framework /opt/opl-framework ./resources/opl-image-seed/payload/opl_framework
COPY --from=codex-cli /opt/codex-cli ./resources/opl-image-seed/payload/codex_cli

RUN mkdir -p ./resources/opl-image-seed/payload/companion_skills ./resources/opl-image-seed/payload/domain_modules \
  && printf '%s\n' '{"component":"companion_skills","reconcile":"opl connect sync-skills via startup maintenance"}' > ./resources/opl-image-seed/payload/companion_skills/seed.json \
  && printf '%s\n' '{"component":"domain_modules","reconcile":"OPL managed package channel via startup maintenance"}' > ./resources/opl-image-seed/payload/domain_modules/seed.json \
  && printf '%s\n' "OPL managed domain modules are reconciled by startup maintenance from the package channel." > ./resources/opl-image-seed/payload/domain_modules/README.txt \
  && node scripts/prepare-opl-image-seed.js \
  && test -z "$(find ./resources/opl-image-seed/payload -xtype l -print -quit)"

ENV NODE_ENV=production
ENV OPL_WEBUI_IMAGE_PROFILE=${OPL_WEBUI_IMAGE_PROFILE}
RUN NODE_OPTIONS=--max-old-space-size=4096 bunx electron-vite build --config packages/desktop/electron.vite.config.ts
RUN node scripts/pack-web-cli.js

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG OPL_WEBUI_IMAGE_PROFILE=webui-full

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git python3 tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist-web-cli/staging/aionui-web ./aionui-web
COPY --from=builder /app/dist-web-cli/staging/aionui-web/opl-image-manifest.json /opt/opl/image-manifest.json
COPY --from=builder /app/dist-web-cli/staging/aionui-web/opl-image-seed /opt/opl/seed
COPY --from=builder /app/dist-web-cli/staging/aionui-web/opl-webui-entrypoint.sh /opt/opl/entrypoint.sh
ENV PORT=3000
ENV NODE_ENV=production
ENV AIONUI_ALLOW_REMOTE=1
ENV HOME=/data
ENV AIONUI_DATA_DIR=/data
ENV OPL_DATA_DIR=/data
ENV OPL_PROJECTS_DIR=/projects
ENV OPL_WORKSPACE_ROOT=/projects
ENV OPL_WEBUI_RECOVERY_DIR=/recovery
ENV OPL_WEBUI_IMAGE_PROFILE=${OPL_WEBUI_IMAGE_PROFILE}
ENV OPL_IMAGE_MANIFEST_PATH=/opt/opl/image-manifest.json
ENV OPL_IMAGE_SEED_DIR=/opt/opl/seed
ENV PATH=/opt/opl/seed/payload/opl_framework/bin:/opt/opl/seed/payload/codex_cli/bin:${PATH}

RUN set -eu; \
  mkdir -p /data /projects /recovery; \
  chmod 755 /opt/opl/entrypoint.sh; \
  broken_links="$(find /opt/opl/seed/payload -xtype l -print)"; \
  if [ -n "${broken_links}" ]; then \
    printf '%s\n' 'OPL image seed contains broken symlinks:' >&2; \
    printf '%s\n' "${broken_links}" >&2; \
    exit 1; \
  fi; \
  if [ ! -d /opt/opl/seed/payload/opl_framework ]; then \
    if [ "${OPL_WEBUI_IMAGE_PROFILE}" = "webui-slim" ]; then \
      printf '%s\n' 'Slim OPL WebUI image has metadata-only seed payload.'; \
      exit 0; \
    fi; \
    printf '%s\n' 'OPL framework seed directory missing: /opt/opl/seed/payload/opl_framework' >&2; \
    find /opt/opl/seed -maxdepth 3 -mindepth 1 -print >&2; \
    exit 1; \
  fi; \
  if [ ! -f /opt/opl/seed/payload/opl_framework/bin/opl ]; then \
    printf '%s\n' 'OPL framework CLI seed missing: /opt/opl/seed/payload/opl_framework/bin/opl' >&2; \
    find /opt/opl/seed/payload/opl_framework -maxdepth 4 -print >&2; \
    exit 1; \
  fi; \
  if [ ! -d /opt/opl/seed/payload/codex_cli ]; then \
    printf '%s\n' 'Codex CLI seed directory missing: /opt/opl/seed/payload/codex_cli' >&2; \
    find /opt/opl/seed -maxdepth 3 -mindepth 1 -print >&2; \
    exit 1; \
  fi; \
  if [ ! -x /opt/opl/seed/payload/codex_cli/bin/codex ]; then \
    printf '%s\n' 'Codex CLI seed executable missing or not executable: /opt/opl/seed/payload/codex_cli/bin/codex' >&2; \
    find /opt/opl/seed/payload/codex_cli -maxdepth 5 -print >&2; \
    exit 1; \
  fi; \
  printf '%s\n' '#!/usr/bin/env sh' \
    'exec /opt/opl/seed/payload/opl_framework/bin/opl "$@"' \
    > /usr/local/bin/opl; \
  printf '%s\n' '#!/usr/bin/env sh' \
    'exec /opt/opl/seed/payload/codex_cli/bin/codex "$@"' \
    > /usr/local/bin/codex; \
  chmod 755 /usr/local/bin/opl /usr/local/bin/codex; \
  if ! command -v opl >/dev/null 2>&1 || [ ! -x /usr/local/bin/opl ]; then \
    printf '%s\n' 'OPL wrapper check failed: /usr/local/bin/opl is not executable or not on PATH.' >&2; \
    ls -l /usr/local/bin/opl >&2 || true; \
    exit 1; \
  fi; \
  if ! command -v codex >/dev/null 2>&1 || [ ! -x /usr/local/bin/codex ]; then \
    printf '%s\n' 'Codex wrapper check failed: /usr/local/bin/codex is not executable or not on PATH.' >&2; \
    ls -l /usr/local/bin/codex >&2 || true; \
    exit 1; \
  fi

VOLUME ["/data", "/projects", "/recovery"]
EXPOSE 3000

ENTRYPOINT ["tini", "--", "/opt/opl/entrypoint.sh"]
CMD ["start", "--remote", "--port", "3000"]
