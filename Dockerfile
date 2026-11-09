# syntax=docker/dockerfile:1

# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:22-alpine AS frontend-builder

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
FROM node:22-alpine AS backend-builder

WORKDIR /build

COPY package.json package-lock.json* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci --ignore-scripts

COPY packages/backend ./packages/backend

WORKDIR /build/packages/backend
RUN npm run build

# ============================================================
# Stage 3: Build the shared Flutter Web frontend
# ============================================================
# Flutter Web output is architecture-independent, so build it on BuildKit's
# native build platform and copy the static bundle into each runtime image.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS flutter-web-builder

ARG FLUTTER_VERSION=3.47.9
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git unzip xz-utils zip libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
    | tar -xJ -C /opt
ENV PATH="/opt/flutter/bin:${PATH}"
RUN git config --global --add safe.directory /opt/flutter

WORKDIR /build/packages/flutter_app
COPY packages/flutter_app/pubspec.yaml packages/flutter_app/pubspec.lock ./
RUN flutter pub get
COPY packages/flutter_app ./
RUN flutter build web --release

# ============================================================
# Stage 4: Production runtime
# ============================================================
FROM node:22-alpine AS runtime

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
COPY --from=flutter-web-builder /build/packages/flutter_app/build/web ./packages/flutter_app/build/web

# Create data directories with correct ownership
RUN mkdir -p /app/data/photos && chown -R forma:forma /app/data

# Switch to non-root
USER forma

# Persistent data volumes
VOLUME ["/app/data"]

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/body-tracker.db \
    PHOTOS_PATH=/app/data/photos

CMD ["node", "packages/backend/dist/index.js"]
