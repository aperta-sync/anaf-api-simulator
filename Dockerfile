# syntax=docker/dockerfile:1.7

# Stage 1: Root dependency install (cached)
FROM node:20-alpine AS root-deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=anaf-npm-root,target=/root/.npm npm ci

# Stage 2: Portal UI dependency install (cached)
FROM node:20-alpine AS portal-deps
WORKDIR /app/portal-ui
COPY portal-ui/package*.json ./
RUN --mount=type=cache,id=anaf-npm-portal,target=/root/.npm npm ci

# Stage 3: Build backend + UI assets
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=root-deps /app/node_modules ./node_modules
COPY --from=portal-deps /app/portal-ui/node_modules ./portal-ui/node_modules
COPY . .
RUN npm run build

# Stage 4: Production-only backend dependencies
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=anaf-npm-prod,target=/root/.npm npm ci --omit=dev

# Stage 5 (optional): Debug-friendly runtime with shell tooling
FROM node:20-alpine AS runner-debug
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
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runner
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
