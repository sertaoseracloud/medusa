# Walking Skeleton — Beholder

**Phase:** 1
**Generated:** 2026-09-12

## Capability Proven End-to-End

> A single seeded operator can open the React app, log in with email/password, and land on an authenticated dashboard page whose data comes from a real `GET /auth/me` call served by Fastify against a real PostgreSQL row.

This exercises: Vite/React 19 build → React Router protected route → axios client → Fastify route → Zod validation → `@fastify/jwt` guard → Drizzle query against PostgreSQL (`users` read) → `refresh_tokens` insert (real write) → standard `{data, message, timestamp}` envelope back to the browser.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Repo layout | Legacy `backend/` and `frontend/` are `git mv`-ed to `legacy/backend/` and `legacy/frontend/` in Plan 01 Task 1; the rewrite occupies the now-free `backend/` and `frontend/` paths | PATTERNS.md documents analog files by their legacy path; keeping them readable under `legacy/` preserves the analog reference trail while freeing the canonical paths CLAUDE.md/PATTERNS.md assign to the new code. No legacy file is deleted in this phase. |
| Backend framework | Fastify 5.12.4 on Node 24 LTS (v24.14.1 confirmed present), TypeScript 5.7 strict, ESM, `tsx` for dev | FOUND-01; Fastify's schema-compiled validation + `setErrorHandler` are the backbone of D-25/D-26/D-27 |
| Validation | Zod 4.6.3 + `fastify-type-provider-zod` 7.0.0 on every route `body`/`params`/`querystring` | FOUND-04; `hasZodFastifySchemaValidationErrors()` feeds per-field errors into the single envelope (D-25) |
| Data layer | PostgreSQL 17 + Drizzle ORM 0.45.2 + `drizzle-kit` 0.31.10 + `postgres` (postgres.js) 3.4.9 | FOUND-02; Drizzle 0.45.2 resolves the STATE.md blocker "confirm 0.x stable, not 1.0 beta" |
| Schema migration flow | `npx drizzle-kit push` against `DATABASE_URL`, run as an explicit blocking task after each slice's schema file lands | Type checks pass from the schema file alone; without a push the live DB shape is unverified (false-positive green build) |
| Auth | argon2id password hashing; short-lived (15 min) stateless access JWT via `@fastify/jwt` 10.2.2; 14-day refresh token persisted as SHA-256 hash in a `refresh_tokens` table with `expires_at` + `revoked_at`; rotation on every refresh | SEC-02/SEC-03/SEC-04; one table serves both "still valid?" and "revoked?" (RESEARCH.md Pattern 1). 15 min / 14 days sits inside D-12's locked range. |
| User provisioning | No public registration. `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` upserted on every boot (password re-hashed and overwritten each time) | D-01, D-02, D-03 |
| Credential encryption | AES-256-GCM via Node built-in `crypto`, `randomBytes(12)` nonce per call, stored as `base64(nonce‖ciphertext‖authTag)` plus a `key_version` column | SEC-01; nonce discipline is the hard requirement (RESEARCH.md Pitfall 1) |
| Secrets | `security/secrets.ts` loads `JWT_SECRET` / `AES_KEY`; hard fail in `NODE_ENV=production`, in-memory generated temp key + one warning in development | D-23, D-24 — removes the legacy hardcoded-key fallback |
| Exchange access | `IExchangeAdapter` interface in `exchanges/core/`, concrete `BinanceAdapter` wrapping ccxt 4.5.78, resolved through `exchange-registry.ts` | EXCH-01/EXCH-02; business logic never imports ccxt directly |
| Module layout | Hexagonal per module: `modules/<name>/{domain,application,infrastructure}/`; ports defined per module, never in a shared/ports bucket | D-17, D-18 |
| Error contract | Domain exceptions (`DomainError` subclasses) thrown from use cases; one Fastify `setErrorHandler` translates ZodError → 400, DomainError → its own status, unknown → 500, all in `{data, message, timestamp}` | D-19, D-25, D-26, D-27 |
| Logging | pino 10.3.1 with a `redact` list covering `req.body.password`, `req.body.secretKey`, `req.body.accessKey`, `req.headers.authorization` | SEC-07 |
| API hardening | `@fastify/cors` explicit origin allowlist from env, `@fastify/helmet`, `@fastify/rate-limit` global 100/min + per-route 5/15min on login | SEC-05, SEC-08, D-20, D-21, D-22 |
| Frontend | React 19 + Vite + React Router 7 + shadcn (style new-york, base neutral, CSS variables, dark default) + axios | FOUND-03 + 01-UI-SPEC.md |
| Tests | Vitest 5.0.0, Fastify `.inject()` for integration, mocked ccxt for exchange tests, dedicated test database via `TEST_DATABASE_URL` | TEST-01, 01-VALIDATION.md |
| Deployment target | None in this phase — local full-stack run only, documented below | Deployment is not a Phase 1 requirement; no requirement ID covers it |

## Stack Touched in Phase 1

- [x] Project scaffold — `backend/` (Fastify, TS strict, Vitest, drizzle-kit) and `frontend/` (Vite, React 19, shadcn)
- [x] Routing — real routes: `GET /health`, `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`, `PATCH /auth/password`, `GET|PUT /settings/credentials`, `GET /symbols`, `POST /symbols/sync`
- [x] Database — real read (`users` lookup on login, `symbols` list) AND real write (`refresh_tokens` insert, `settings` encrypted upsert, `symbols` transactional replace)
- [x] UI — interactive elements wired to the API: login form, credentials form, "Sincronizar agora" button, logout button
- [x] Documented local full-stack run command (below)

### Local full-stack run command

```
# 1. PostgreSQL 17 (any of: local service, docker run, or hosted dev instance)
#    export DATABASE_URL=postgres://beholder:beholder@localhost:5432/beholder
# 2. Backend
cd backend && npm install && npx drizzle-kit push && npm run dev     # http://localhost:3333
# 3. Frontend (second terminal)
cd frontend && npm install && npm run dev                            # http://localhost:5173
```

`npm run dev` in `backend/` seeds the operator user from `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` and, if `symbols` is empty, syncs symbols in a non-blocking `onListen` hook.

## Out of Scope (Deferred to Later Slices)

Explicitly NOT part of the skeleton or Phase 1, and not to be re-litigated later:

- WebSocket gateway, topic pub/sub, live ticker/order book/balance, TradingView chart (Phase 2 — RT-01/02/03, SEC-06)
- TOTP 2FA, backup codes, and any `users` column reserving 2FA state (Phase 3 — RESEARCH.md Open Question 3 answers "do not pre-build")
- Price alerts and the shared rule engine (Phase 4), backtesting (Phase 5), performance reporting (Phase 6)
- Public registration / multi-user / multi-tenancy (single operator, D-01)
- Multiple exchange credential profiles or a second exchange adapter (v2, EXCH-V2-*, D-08)
- Automated data migration from the legacy Azure SQL database (REQUIREMENTS.md Out of Scope)
- KMS/Vault-backed key management (env-var master key is proportionate for v1)
- Production deployment, CI pipeline, TLS termination

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the decisions above:

- Phase 2: operator sees live ticker/order book/balance on the dashboard via topic-scoped WebSocket + TradingView chart
- Phase 3: operator enables TOTP 2FA with backup codes, enforced at login
- Phase 4: operator creates price alerts driven by a pure rule-evaluation module
- Phase 5: operator backtests the same rules against historical OHLCV candles
- Phase 6: operator reviews realized PnL and balance-over-time, REST-reconciled
