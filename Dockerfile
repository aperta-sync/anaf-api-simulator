# Stage 1: Build source
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Install production dependencies only
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 3: Tiny final image
FROM node:20-alpine
WORKDIR /app

# Copy production essentials
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/simulation/presentation/http/assets ./src/simulation/presentation/http/assets

ENV NODE_ENV=production
ENV ANAF_MOCK_PORT=3003
ENV ANAF_MOCK_LATENCY_MS=200
ENV ANAF_MOCK_STRICT_OWNERSHIP=true

EXPOSE 3003

CMD ["node", "dist/main.js"]
