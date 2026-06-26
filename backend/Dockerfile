# ─────────────────────────────────────────────────────────────
# Lucrom backend — production image
# Multi-stage: build (deps + tsc + prisma) → slim runtime.
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# Apply migrations, then start. (Seed once manually: see README.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
