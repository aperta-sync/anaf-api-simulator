# syntax=docker/dockerfile:1.7

ARG NODE_ALPINE_IMAGE=node:20-alpine@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c
ARG DISTROLESS_NODE_IMAGE=gcr.io/distroless/nodejs20-debian12:nonroot@sha256:2cd820156cf039c8b54ae2d2a97e424b6729070714de8707a6b79f20d56f6a9a

# Stage 1: Root dependency install (cached)
FROM ${NODE_ALPINE_IMAGE} AS root-deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=anaf-npm-root,target=/root/.npm npm ci

# Stage 2: Portal UI dependency install (cached)
FROM ${NODE_ALPINE_IMAGE} AS portal-deps
WORKDIR /app/portal-ui
COPY portal-ui/package*.json ./
RUN --mount=type=cache,id=anaf-npm-portal,target=/root/.npm npm ci

# Stage 3: Build backend + UI assets
FROM ${NODE_ALPINE_IMAGE} AS builder
WORKDIR /app
ARG VITE_APP_VERSION=0.1.0
ENV VITE_APP_VERSION=${VITE_APP_VERSION}
COPY --from=root-deps /app/node_modules ./node_modules
COPY --from=portal-deps /app/portal-ui/node_modules ./portal-ui/node_modules
COPY . .
RUN npm run build

# Stage 4: Production-only backend dependencies
FROM ${NODE_ALPINE_IMAGE} AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=anaf-npm-prod,target=/root/.npm npm ci --omit=dev

# Stage 5 (optional): Debug-friendly runtime with shell tooling
FROM ${NODE_ALPINE_IMAGE} AS runner-debug
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/simulation/presentation/http/assets ./src/simulation/presentation/http/assets

ENV NODE_ENV=production \
    ANAF_MOCK_PORT=3003 \
    ANAF_MOCK_STORE=memory \
    ANAF_MOCK_LATENCY_MS=200 \
    ANAF_MOCK_STRICT_OWNERSHIP=true

EXPOSE 3003

CMD ["node", "dist/main.js"]

# Stage 6: Hardened minimal runtime image (default)
FROM ${DISTROLESS_NODE_IMAGE} AS runner
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/simulation/presentation/http/assets ./src/simulation/presentation/http/assets

ENV NODE_ENV=production \
    ANAF_MOCK_PORT=3003 \
    ANAF_MOCK_STORE=memory \
    ANAF_MOCK_LATENCY_MS=200 \
    ANAF_MOCK_STRICT_OWNERSHIP=true

EXPOSE 3003

CMD ["dist/main.js"]
