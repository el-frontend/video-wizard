FROM node:lts-bookworm

# Install dependencies required for Chromium
RUN apt-get update && apt-get install -y \
  libnss3 \
  libdbus-1-3 \
  libatk1.0-0 \
  libgbm-dev \
  libasound2 \
  libxrandr2 \
  libxkbcommon-dev \
  libxfixes3 \
  libxcomposite1 \
  libxdamage1 \
  libatk-bridge2.0-0 \
  libcups2 \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration and lockfile
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy packages first (for better caching)
COPY packages/ ./packages/

# Copy remotion-server app
COPY apps/remotion-server/ ./apps/remotion-server/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Create renders directory
RUN mkdir -p apps/remotion-server/renders

# Set working directory to the server app
WORKDIR /app/apps/remotion-server

# Browser will be installed on first run by ensureBrowser() in the code

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV RENDERS_DIR=./renders

# Expose the server port
EXPOSE 3001

# Start the server
CMD ["pnpm", "start"]
