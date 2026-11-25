ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends chromium-headless-shell ffmpeg fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/hyperframes-worker/package.json ./apps/hyperframes-worker/
COPY apps/remotion-server/package.json ./apps/remotion-server/
RUN pnpm install --frozen-lockfile --filter remotion-server... && mkdir -p apps/remotion-server/renders
COPY apps/hyperframes-worker/ ./apps/hyperframes-worker/
COPY apps/remotion-server/ ./apps/remotion-server/
WORKDIR /app/apps/remotion-server
ENV NODE_ENV=production PORT=3001 RENDERS_DIR=./renders REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium-headless-shell PRODUCER_HEADLESS_SHELL_PATH=/usr/bin/chromium-headless-shell
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "server/index.ts"]
