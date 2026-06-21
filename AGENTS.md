# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout
- The original deliverable shipped as `lucrom_fonte.tar.gz` (a Replit export). The runnable app has been extracted into `lucrom/` and is the source of truth for development. The tarball and `Lucrom_Auditoria_Completa.docx` / `Banco Digital` files are reference artifacts only.
- `lucrom/` is a Vite + React 18 + TypeScript + Tailwind v4 single-page app (a Brazilian digital-bank UI). The entire app lives in one large file: `lucrom/src/LucromUnificado.jsx` (~12.5k lines, marked `@ts-nocheck`). `src/components/ui/*` are shadcn/ui components.

### Running / building (all commands run from `lucrom/`)
- The Vite config (`lucrom/vite.config.ts`) REQUIRES two env vars or it throws on startup: `PORT` and `BASE_PATH`. Always set them, e.g. `PORT=5000 BASE_PATH=/ pnpm dev`.
- Dev server: `PORT=5000 BASE_PATH=/ pnpm dev` (serves on `0.0.0.0:5000`).
- Build: `PORT=5000 BASE_PATH=/ pnpm build` (output `dist/public`). The `PORT`/`BASE_PATH` vars are required even for build.
- Preview built output: `PORT=5000 BASE_PATH=/ pnpm serve`.
- Typecheck (the only "lint"-style check; there is no ESLint config): `pnpm typecheck`.

### Notes / gotchas
- The original `package.json` used pnpm `catalog:` / `workspace:*` references from a larger monorepo that was NOT included in the export. These were pinned to concrete versions so the package installs standalone. The `@workspace/api-client-react` workspace dependency was removed because nothing in `src/` imports it.
- `typescript` was added to devDependencies so the `typecheck` script works (the original relied on the monorepo root).
- `index.html` references `/favicon.svg`, which is not included; the resulting 404 is harmless.
- The app loads FingerprintJS from a remote CDN at runtime; it fails open (no network = no crash).

### Backend (`backend/`) — FASE 1 foundation
- `backend/` is a standalone **NestJS 10 + Prisma 5 + PostgreSQL + Redis** project implementing only the FASE 1 foundation of the production blueprint: IAM, RBAC, JWT + refresh-token rotation, audit trail and structured logs. It contains **no business rules** (Score/Credit/Fraud/Missions/Certificates are out of scope) and does not import or modify `lucrom/`.
- Requires PostgreSQL and Redis. They are NOT preinstalled on a fresh VM. One-off setup: `sudo apt-get install -y postgresql redis-server`, then `sudo service postgresql start && sudo service redis-server start`. Create the DB role/database used by `DATABASE_URL` (default `lucrom:lucrom@localhost:5432/lucrom`): `sudo -u postgres psql -c "CREATE ROLE lucrom LOGIN PASSWORD 'lucrom' CREATEDB;" && sudo -u postgres createdb -O lucrom lucrom`.
- First run (from `backend/`): `cp .env.example .env`, `npm install`, `npm run prisma:migrate`, `npm run prisma:seed`, then `npm run build && node dist/main.js` (or `npm run dev`). Seed creates roles + an admin user `admin@lucrom.local` / `ChangeMe123!`.
- Env is strictly validated at boot (`src/config/env.validation.ts`): the app refuses to start if `DATABASE_URL`, `REDIS_URL` or JWT secrets are missing/invalid. Postgres/Redis being down does NOT crash boot — `GET /api/v1/health` still responds with `degraded`.
- API is prefixed and versioned: routes live under `/api/v1/*`. Auth is enforced globally (`JwtAuthGuard`); opt out per-route with `@Public()`.
- `@prisma/client` auto-generates on `npm install` (postinstall). After editing `prisma/schema.prisma`, run `npm run prisma:migrate`.
- **FASE 2 (business engines migrated from the frontend):** `src/modules/{score,missions,certificates,education}` plus `gamification` (XP/creditBonus accumulators). The engines (`*.engine.ts`) are faithful ports of `lucrom/src/LucromUnificado.jsx` (ScoreEngine, withAutoMissions/INIT_MISSIONS, EMIT_CERT, EDU_VIDEOS) — formulas/weights/missions/certificates are unchanged and locked by unit tests (`npm test`, in `test/*.spec.ts`). Finance/fiscal inputs are passed in request bodies (those domains belong to later phases); the Score Engine's fraud-flag input defaults to "none" since the Fraud Engine is out of scope. Catalog rows (6 missions, 4 videos) come from `prisma/seed.ts`.
- **Hardening de produção (Tier 1):** middleware/cross-cutting em `src/common/{idempotency,rate-limit,pagination}` + helmet/compression em `main.ts` + `/health/live` e `/health/ready`. `IdempotencyInterceptor` (global, Redis) exige header `Idempotency-Key` nas rotas `@Idempotent()` (credit request/release, pix charge/transfer) e faz replay da 1ª resposta; falha-aberto se Redis cair. `RateLimitGuard` (global, Redis) com default 300/60s e `@RateLimit(10,60)` em `auth`; falha-aberto. `score/me` é cacheado no Redis (TTL 60s, invalidado ao criar snapshot). Listas de `credit/applications` e `admin/audit-logs` retornam paginação por cursor `{data,nextCursor,hasMore}`. **Nada disso altera regras de negócio.** Para escala horizontal use PgBouncer (pooler) no `DATABASE_URL`.
- **FASE 3 (financial core):** `src/modules/{credit,fraud,ledger,open-finance,pix,advisor}`. `fraud.engine.ts` and `credit/price-table.ts` are faithful ports of the frontend `FraudEngine` (5 rules) and `PriceTable` (PMT/IOF/CET) — locked by tests. Credit release posts a balanced double-entry to the Ledger inside the same DB transaction (no money moves without a ledger record); ledger accounts (`1.1.1`,`1.1.2`,…) and the 5 fraud rules are seeded. Open Finance and PIX are integration layers only: `NoopOpenFinanceProvider`/`NoopPixProvider` throw `501 Not Implemented` until a real aggregator/PSP is wired (swap the `*_PROVIDER` token in the module). Advisor IA is rule-based (no LLM), reads only the caller's own data and records every interaction in `advisor_interactions` + the audit trail. Credit approve/release/reject require role `PARTNER`/`ADMIN`; ledger is `ADMIN`-only.
