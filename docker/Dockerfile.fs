# Nimbus Filesystem Tools Service Dockerfile
# Filesystem MCP tools service

FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy workspace configuration
COPY package.json bun.lock bunfig.toml ./
COPY tsconfig.json ./

# Copy shared packages
COPY shared/ ./shared/

# Copy fs tools service
COPY services/fs-tools-service/ ./services/fs-tools-service/

# Install dependencies
RUN bun install --frozen-lockfile

# Production image
FROM oven/bun:1.1-alpine AS production

LABEL maintainer="Nimbus Team <team@nimbus.dev>"
LABEL org.opencontainers.image.description="Nimbus Filesystem Tools - MCP Tools Service"

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 nimbus && \
    adduser -u 1001 -G nimbus -s /bin/sh -D nimbus

# Copy application
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/services/fs-tools-service ./services/fs-tools-service
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R nimbus:nimbus /app

USER nimbus

ENV NODE_ENV=production
ENV PORT=3011

EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3011/health || exit 1

WORKDIR /app/services/fs-tools-service
CMD ["bun", "run", "start"]
