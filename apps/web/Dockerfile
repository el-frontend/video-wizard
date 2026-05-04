# Web app + worker share the same image — only the CMD differs in
# docker-compose. Dev-mode by default to match the rest of the stack
# (processing-engine, remotion-server) and give contributors hot reload
# out of the box.
FROM node:lts-bookworm

# pnpm via corepack (matches remotion-server)
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Workspace plumbing first so this layer caches when only app code changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Workspace packages the web app depends on.
COPY packages/ ./packages/

# Web app source.
COPY apps/web/ ./apps/web/

# Install everything in one go (workspace-aware).
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/web

EXPOSE 3000

# Default command — overridden by the worker service in docker-compose.
CMD ["pnpm", "dev"]
