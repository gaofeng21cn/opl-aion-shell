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

# ---- Runtime image ----
FROM oven/bun:latest AS runtime
WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates libicu76 zsh \
  && rm -rf /var/lib/apt/lists/*
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

# Copy only build artifacts and production deps
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/out/renderer ./out/renderer
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --production --ignore-scripts

ENV PORT=3000
ENV NODE_ENV=production
ENV ALLOW_REMOTE=true
ENV DATA_DIR=/data
ENV VITE_OPL_DEFAULT_LANGUAGE=zh-CN
ENV OPL_PACKAGED_SKILLS_ROOT=/opt/opl/skills

# SQLite data volume — mount with: -v $(pwd)/data:/data
VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "dist-server/server.mjs"]
