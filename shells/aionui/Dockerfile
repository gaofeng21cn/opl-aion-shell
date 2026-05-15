FROM node:20-slim AS builder
WORKDIR /app
ARG VITE_OPL_DEFAULT_LANGUAGE=zh-CN
ENV VITE_OPL_DEFAULT_LANGUAGE=${VITE_OPL_DEFAULT_LANGUAGE}

# Install bun
RUN npm install -g bun

# Install all dependencies (including devDeps for build)
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --ignore-scripts

# Copy source
COPY . .

# Build renderer (no Electron needed) and server bundle
RUN bun run build:renderer:web
RUN node scripts/build-server.mjs

FROM rust:1.95-bookworm AS native-helper
WORKDIR /opl
ENV PATH=/usr/local/cargo/bin:${PATH}
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl nodejs npm \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun
RUN git clone --depth 1 https://github.com/gaofeng21cn/one-person-lab.git .
RUN cargo build --release --workspace \
  && node scripts/native-helper-prebuild.mjs pack \
    --source-dir target/release \
    --prebuild-root /opt/opl/native-helper-prebuilds \
    --target "$(node -p "process.platform + '-' + process.arch")" \
  && node scripts/native-helper-prebuild.mjs check \
    --prebuild-root /opt/opl/native-helper-prebuilds \
    --target "$(node -p "process.platform + '-' + process.arch")"

# ---- Runtime image ----
FROM node:24-slim AS runtime
WORKDIR /app

USER root
ARG APT_MIRROR=
ARG APT_SECURITY_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then \
    sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
  fi \
  && if [ -n "$APT_SECURITY_MIRROR" ]; then \
    sed -i "s|http://deb.debian.org/debian-security|$APT_SECURITY_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
  fi
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git libicu72 make python3 zsh \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun
RUN curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash \
  && ln -sf /root/.local/bin/officecli /usr/local/bin/officecli \
  && officecli --version
RUN set -eux; \
  tmp="$(mktemp -d)"; \
  mkdir -p /opt/opl/skills; \
  curl -fsSL https://github.com/iOfficeAI/OfficeCLI/archive/refs/heads/main.tar.gz \
    | tar -xz -C "$tmp" --strip-components=1; \
  mkdir -p /opt/opl/skills/officecli; \
  cp "$tmp/SKILL.md" /opt/opl/skills/officecli/SKILL.md; \
  cp -R "$tmp/skills/officecli-docx" /opt/opl/skills/officecli-docx; \
  cp -R "$tmp/skills/officecli-pptx" /opt/opl/skills/officecli-pptx; \
  cp -R "$tmp/skills/officecli-xlsx" /opt/opl/skills/officecli-xlsx; \
  rm -rf "$tmp"; \
  tmp="$(mktemp -d)"; \
  curl -fsSL https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/archive/refs/heads/main.tar.gz \
    | tar -xz -C "$tmp" --strip-components=1; \
  mkdir -p /opt/opl/skills/ui-ux-pro-max; \
  cp "$tmp/.claude/skills/ui-ux-pro-max/SKILL.md" /opt/opl/skills/ui-ux-pro-max/SKILL.md; \
  for entry in data scripts templates; do \
    if [ -d "$tmp/src/ui-ux-pro-max/$entry" ]; then \
      cp -R "$tmp/src/ui-ux-pro-max/$entry" "/opt/opl/skills/ui-ux-pro-max/$entry"; \
    fi; \
  done; \
  rm -rf "$tmp"
COPY --from=native-helper /opt/opl/native-helper-prebuilds /opt/opl/native-helper-prebuilds

# Copy only build artifacts and production deps
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/out/renderer ./out/renderer
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --production --ignore-scripts

ENV PORT=3000
ENV NODE_ENV=production
ENV NPM_CONFIG_PRODUCTION=false
ENV ALLOW_REMOTE=true
ENV DATA_DIR=/data
ENV VITE_OPL_DEFAULT_LANGUAGE=zh-CN
ENV OPL_PACKAGED_SKILLS_ROOT=/opt/opl/skills
ENV OPL_NATIVE_HELPER_PREBUILD_ROOT=/opt/opl/native-helper-prebuilds

RUN printf '%s\n' \
  '#!/usr/bin/env sh' \
  'set -eu' \
  'mkdir -p "${DATA_DIR:-/data}" "${HOME:-/data}" "${CODEX_HOME:-/data/codex}" "${OPL_WORKSPACE_ROOT:-/data/workspaces}"' \
  'exec "$@"' \
  > /usr/local/bin/opl-webui-entrypoint \
  && chmod +x /usr/local/bin/opl-webui-entrypoint

# SQLite data volume — mount with: -v $(pwd)/data:/data
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["opl-webui-entrypoint"]
CMD ["bun", "dist-server/server.mjs"]
