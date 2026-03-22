FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# ── Install all deps (needed for both frontend build and backend runtime) ────
FROM base AS deps
COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/package.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN bun install --frozen-lockfile

# ── Build frontend ────────────────────────────────────────────────────────────
FROM deps AS frontend-builder
COPY packages/types ./packages/types
COPY apps/frontend/index.html ./apps/frontend/index.html
COPY apps/frontend/tsconfig.json ./apps/frontend/tsconfig.json
COPY apps/frontend/tsconfig.node.json ./apps/frontend/tsconfig.node.json
COPY apps/frontend/vite.config.ts ./apps/frontend/vite.config.ts
COPY apps/frontend/src ./apps/frontend/src
COPY apps/frontend/public ./apps/frontend/public
RUN bun run --cwd apps/frontend build

# ── Production deps only (for backend runtime) ────────────────────────────────
FROM deps AS prod-deps
RUN bun install --frozen-lockfile --production

# ── Final image ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY packages/types ./packages/types
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/package.json ./apps/backend/package.json

# Frontend dist served as static files
COPY --from=frontend-builder /app/apps/frontend/dist ./public

ENV NODE_ENV=production
ENV STATIC_DIR=./public

EXPOSE 3000

CMD ["bun", "run", "apps/backend/src/index.ts"]
