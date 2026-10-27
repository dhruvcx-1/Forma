# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy workspace manifests for caching
COPY package.json package-lock.json* ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/

# Install all deps (including workspace hoisted)
RUN npm ci --ignore-scripts

# Copy frontend source
COPY packages/frontend ./packages/frontend

# Build
WORKDIR /build/packages/frontend
RUN npm run build

# ============================================================
# Stage 2: Build backend
# ============================================================
FROM node:20-alpine AS backend-builder

WORKDIR /build

COPY package.json package-lock.json* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci --ignore-scripts

COPY packages/backend ./packages/backend

WORKDIR /build/packages/backend
RUN npm run build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM node:20-alpine AS runtime

# Security: non-root user
RUN addgroup -S forma && adduser -S forma -G forma

WORKDIR /app

# Install production backend deps only
COPY package.json package-lock.json* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci --omit=dev --ignore-scripts --workspace=packages/backend

# Copy built artifacts
COPY --from=backend-builder /build/packages/backend/dist ./packages/backend/dist
COPY --from=frontend-builder /build/packages/frontend/dist ./packages/frontend/dist

# Create data directories with correct ownership
RUN mkdir -p /app/data/photos && chown -R forma:forma /app/data

# Switch to non-root
USER forma

# Persistent data volumes
VOLUME ["/app/data"]

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/body-tracker.db \
    PHOTOS_PATH=/app/data/photos

CMD ["node", "packages/backend/dist/index.js"]
