# Web, worker and migrations use the lockfile and workspace links in this image.
FROM node:24.22.3-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/
RUN --mount=type=cache,id=video-wizard-web-pnpm10,target=/pnpm/store \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --filter web...
COPY apps/web/ ./apps/web/
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev"]
