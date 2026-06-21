# Lucrom Backend — FASE 1 (Fundação)

Fundação de arquitetura da versão de produção do Lucrom, conforme o Blueprint Técnico aprovado. **Esta fase NÃO contém regras de negócio** (Score, Crédito, Fraude, Missões, Certificados): apenas a base de infraestrutura, segurança e observabilidade sobre a qual as fases seguintes serão construídas.

## Stack
- **NestJS 10** (TypeScript, monólito modular)
- **PostgreSQL 16** via **Prisma 5**
- **Redis 7** via **ioredis** (denylist de refresh token, rate limit, cache)
- **JWT** (access) + **Refresh Token** rotativo com detecção de reuso
- **RBAC** com enforcement real (roles + permissions em guards)
- **Auditoria** append-only + **logs** estruturados (pino)

## O que está incluído (escopo FASE 1)
- Esqueleto NestJS (`src/main.ts`, `src/app.module.ts`) com validação de env, versionamento de API (`/api/v1`) e `ValidationPipe` global.
- `PrismaModule`/`PrismaService` e schema IAM/RBAC/Audit (`prisma/schema.prisma`).
- `RedisModule`/`RedisService`.
- `AuthModule`: `register`, `login`, `refresh` (rotação) e `logout`.
- RBAC: `@Roles()`, `@RequirePermissions()`, `RolesGuard`, `PermissionsGuard`, `JwtAuthGuard` global.
- Auditoria: `@Audit()`, `AuditInterceptor`, `AuditService` e endpoint admin `GET /api/v1/admin/audit-logs`.
- Health: `GET /api/v1/health` (status de Postgres e Redis).
- Seed idempotente (`prisma/seed.ts`): roles, permissão `read:audit` e usuário admin inicial.

## Setup local
```bash
cp .env.example .env            # ajuste DATABASE_URL / REDIS_URL / segredos
pnpm install                    # ou npm install
pnpm prisma:generate
pnpm prisma:migrate             # cria as tabelas (migrate dev)
pnpm prisma:seed                # cria roles/permissões/admin
pnpm dev                        # sobe em http://localhost:3000
```

## Endpoints (FASE 1)
| Método | Rota | Auth |
|---|---|---|
| GET  | `/api/v1/health` | público |
| POST | `/api/v1/auth/register` | público |
| POST | `/api/v1/auth/login` | público |
| POST | `/api/v1/auth/refresh` | público (refresh token) |
| POST | `/api/v1/auth/logout` | público (refresh token) |
| GET  | `/api/v1/me` | JWT |
| GET  | `/api/v1/admin/audit-logs` | JWT + role `ADMIN` + permissão `read:audit` |

## Fora de escopo (fases seguintes)
Score Engine, Credit Engine, Fraud Engine, Missões, Certificados, Open Finance, PIX, IA Consultora, e a migração do frontend `lucrom/`. Nada do frontend existente foi alterado.
