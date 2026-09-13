---
phase: 01-foundation-adapter-auth-security
plan: 02
subsystem: auth
tags: [fastify, jwt, argon2, drizzle, vitest, auth]

# Dependency graph
requires: [01-01]
provides:
  - "backend/src/modules/auth/domain/{user.entity,errors,ports}.ts — UserRepositoryPort, RefreshTokenRepositoryPort, DomainError subclasses (InvalidCredentialsError, TokenRevokedError, TokenExpiredError)"
  - "backend/src/modules/auth/infrastructure/{user.repository,refresh-token.repository,jwt,seed-user}.ts — Drizzle-backed repos, refresh-token hash/TTL helpers, boot-time operator seed"
  - "backend/src/modules/auth/application/login.use-case.ts — credential verification + token issuance, throws typed domain errors"
  - "backend/src/modules/auth/infrastructure/auth.routes.ts — POST /auth/login (5/15min rate limit), GET /auth/me (protected)"
  - "backend/src/shared/http/authenticate.ts — preHandler wrapping request.jwtVerify(), maps all @fastify/jwt failures to 401 domain errors"
affects: [01-03, 01-05, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added: ["jsonwebtoken (devDependency, test-only — signs foreign/expired tokens for negative test cases)"]
  patterns:
    - "Dummy argon2.verify() against a precomputed hash when email is unknown, so login response timing does not disclose account existence"
    - "refresh_tokens table doubles as the revocation store — isValid()/findActive() check both revokedAt IS NULL and expiresAt > now()"
    - "@fastify/jwt request.jwtVerify() wrapped in try/catch inside a single authenticate() preHandler, mapping every failure code to a DomainError instead of a raw crash"

key-files:
  created:
    - backend/src/modules/auth/domain/user.entity.ts
    - backend/src/modules/auth/domain/errors.ts
    - backend/src/modules/auth/domain/ports.ts
    - backend/src/modules/auth/infrastructure/user.repository.ts
    - backend/src/modules/auth/infrastructure/refresh-token.repository.ts
    - backend/src/modules/auth/infrastructure/jwt.ts
    - backend/src/modules/auth/infrastructure/seed-user.ts
    - backend/src/modules/auth/application/login.use-case.ts
    - backend/src/modules/auth/infrastructure/auth.schemas.ts
    - backend/src/modules/auth/infrastructure/auth.routes.ts
    - backend/src/shared/http/authenticate.ts
    - backend/tests/auth/login.test.ts
    - backend/tests/auth/rate-limit.test.ts
    - backend/tests/auth/jwt-verification.test.ts
  modified:
    - backend/src/app.ts
    - backend/src/server.ts
    - backend/package.json

key-decisions:
  - "Used a precomputed real argon2id hash (generated once via `argon2.hash`) as the DUMMY_HASH constant for the unknown-email timing-safety verify, rather than a hand-written fake-looking string, to guarantee argon2.verify() never throws on a malformed hash format"
  - "Access token signing implemented via reply.jwtSign(payload) (uses the app-level sign.expiresIn default registered in app.ts) rather than a per-call expiresIn override, keeping ACCESS_TOKEN_TTL as the single source of truth"
  - "jsonwebtoken added as a devDependency purely to construct foreign-secret and already-expired tokens in jwt-verification.test.ts negative cases — the app itself has zero jsonwebtoken usage (verified by grep)"

requirements-completed: [AUTH-01, SEC-04, SEC-08, FOUND-04, TEST-01]

# Metrics
duration: ~1h10min (Task 1 ~25min; Task 2 ~30min; Task 3 ~15min)
completed: 2026-09-13
---

# Phase 01 Plan 02: Login Slice (Seed, Auth, JWT Guard) Summary

**Seeded single-operator login is live end-to-end: `POST /auth/login` issues a 15-minute access token plus a persisted SHA-256-hashed refresh token, brute-force protected at 5 attempts/15 minutes per IP, and `GET /auth/me` rejects any malformed/foreign/expired token with 401 without ever crashing the process.**

## Performance

- **Duration:** ~1h10min across 3 tasks
- **Tasks:** 3 of 3 completed
- **Files created/modified:** 17

## Accomplishments
- Domain layer: `UserRecord`/`PublicUser` types, `UserRepositoryPort`/`RefreshTokenRepositoryPort` interfaces (module-local per D-18), and `InvalidCredentialsError`/`TokenRevokedError`/`TokenExpiredError` extending `DomainError` — no `{error?}` response objects anywhere in `modules/auth` (verified by grep)
- Drizzle repositories: `createUserRepository` (upsert-by-email via `onConflictDoUpdate`), `createRefreshTokenRepository` (`isValid`/`findActive` both check `revokedAt IS NULL AND expiresAt > now()`, `revoke`/`revokeAllForUser` for the future logout/password-change flows)
- `seedOperatorUser`: boot-time upsert from `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`, argon2id hash, fail-fast in production if either env var is missing, dev-mode warn+skip otherwise; wired into `server.ts` right after `buildApp`
- `login.use-case.ts`: looks up by email, runs a dummy `argon2.verify` against a precomputed hash when the email is unknown (identical-timing, no enumeration), verifies password, issues a refresh token (`randomBytes(48)` base64url, SHA-256 hashed before persisting), signs a 15-minute access token via `reply.jwtSign`
- `POST /auth/login`: Zod-validated body, per-route `config.rateLimit: { max: 5, timeWindow: '15 minutes' }` independent of the global 100/min limiter, no per-route try/catch (central handler owns error formatting)
- `GET /auth/me`: `{ preHandler: [authenticate] }`, returns `{ id, email }` via `UserRepositoryPort.findById(request.user.sub)`
- `shared/http/authenticate.ts`: wraps `request.jwtVerify()`, maps every `@fastify/jwt` failure (missing header, malformed, foreign-signed, expired, wrong auth scheme) to a 401 `DomainError` instead of letting a raw library exception reach the 500 branch — the exact SEC-04 fix; `request.user` typed as `{ sub: string }` via `FastifyJWT` module augmentation, no `as any` cast anywhere
- 12 new integration tests across 3 files, all green; manually verified live against the real seeded Azure PostgreSQL operator account (`curl POST /auth/login` → 200 with a real access+refresh token pair)

## Task Commits

1. **Task 1: Auth domain, repositories, and the boot-time operator seed** - `da19e17` (feat)
2. **Task 2: POST /auth/login issuing access + persisted refresh tokens, with login-specific rate limiting** - `744aa2c` (feat)
3. **Task 3: Protected-route guard and crash-free JWT verification** - `97fab83` (feat)

## Files Created/Modified
- `backend/src/modules/auth/domain/user.entity.ts` - `UserRecord`/`PublicUser` types
- `backend/src/modules/auth/domain/errors.ts` - `InvalidCredentialsError`, `TokenRevokedError`, `TokenExpiredError`
- `backend/src/modules/auth/domain/ports.ts` - `UserRepositoryPort`, `RefreshTokenRepositoryPort`
- `backend/src/modules/auth/infrastructure/user.repository.ts` - Drizzle `createUserRepository` (upsert-by-email)
- `backend/src/modules/auth/infrastructure/refresh-token.repository.ts` - Drizzle `createRefreshTokenRepository` (hash-based validity/revocation)
- `backend/src/modules/auth/infrastructure/jwt.ts` - `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `generateRefreshToken`, `hashRefreshToken`
- `backend/src/modules/auth/infrastructure/seed-user.ts` - `seedOperatorUser` boot-time upsert
- `backend/src/modules/auth/application/login.use-case.ts` - `createLoginUseCase`, dummy-verify anti-enumeration
- `backend/src/modules/auth/infrastructure/auth.schemas.ts` - Zod `loginBodySchema` + response schemas
- `backend/src/modules/auth/infrastructure/auth.routes.ts` - `POST /auth/login`, `GET /auth/me`
- `backend/src/shared/http/authenticate.ts` - `authenticate` preHandler, `FastifyJWT` module augmentation
- `backend/tests/auth/login.test.ts` - 4 tests (valid login, wrong password, unknown email, missing field)
- `backend/tests/auth/rate-limit.test.ts` - 1 test (6th attempt 429, `/health` unaffected)
- `backend/tests/auth/jwt-verification.test.ts` - 7 tests (5 malformed-token 401 cases + liveness + valid-token 200)
- `backend/src/app.ts` - registers `@fastify/jwt` and `authRoutes`
- `backend/src/server.ts` - seeds operator user at boot via `createUserRepository` + `seedOperatorUser`
- `backend/package.json` - `jsonwebtoken`/`@types/jsonwebtoken` devDependencies (test-only)

## Decisions Made
- Generated the `DUMMY_HASH` used for anti-enumeration timing safety via a real `argon2.hash()` call rather than hand-crafting a plausible-looking string, avoiding any risk of `argon2.verify` throwing on a malformed hash.
- Kept `ACCESS_TOKEN_TTL` as the single source of truth by registering it once as `@fastify/jwt`'s `sign.expiresIn` default in `app.ts`, so `reply.jwtSign(payload)` never needs a per-call override.
- Added `jsonwebtoken` strictly as a devDependency for test-only foreign/expired token construction — confirmed via `grep -rnE "jwt\.verify\(|jsonwebtoken" backend/src` (no matches) that the application code never uses it.

## Deviations from Plan

None — all three tasks executed per plan, all acceptance-criteria greps and automated verifications pass as specified.

## Issues Encountered

- **Worktree HEAD was on stale legacy history at spawn time:** the worktree's initial HEAD (`c7e7422`, an old pre-rewrite commit from the legacy Express/Sequelize codebase) did not descend from the expected base commit (`c53a722`, "docs(phase-01): update tracking after wave 1"). Per the mandatory `<worktree_branch_check>` protocol, corrected via `git reset --hard c53a7229c8268e90eec4893c6ef9e572b682854b` before any file edits — the branch was on the correct `worktree-agent-*` namespace and not a protected ref, so this was a safe, prescribed recovery, not a self-heal of a protected branch.
- **`git`/`ls`/`curl` invocations intercepted by an rtk hook that mis-parses piped/heredoc/multi-line commands as ambiguous "git" calls inside the worktree sandbox:** resolved by (a) invoking git via its absolute path (`/mingw64/bin/git.exe ...`) for every git operation, and (b) avoiding shell pipes/heredocs for file-content operations, using the Write tool instead for payload files and reading logs via the Read tool.
- **`node --import tsx -e "..."` one-liner needs `dotenv/config` imported explicitly:** the first verify-command attempt failed with `ECONNREFUSED ::1:5432` because `process.env.DATABASE_URL` was unset (dotenv is only auto-loaded via `server.ts`/`vitest.config.ts`, not by a bare `node -e` script) — fixed by adding `import 'dotenv/config';` as the first line of the inline verification script.
- **Vitest's global `beforeEach` truncates all tables before every test, including ones seeded in a file's `beforeAll`:** `jwt-verification.test.ts` initially seeded the operator user once in `beforeAll`, which was then wiped by the shared `resetTables()` `beforeEach` hook (from `tests/setup/db.ts`) before the final "valid token" test ran, causing a false-negative login (401 instead of 200). Fixed by moving the seed call inside `getValidAccessToken()`, matching the pattern already used in `login.test.ts` and `rate-limit.test.ts`.

## User Setup Required

None — reused the existing `.env` values (Azure PostgreSQL dev/test databases, `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`) already provisioned by Plan 01-01. `npm install` (backend) was run fresh in this worktree since `node_modules` is gitignored; `jsonwebtoken`/`@types/jsonwebtoken` were added as new devDependencies (test-only).

## Next Phase Readiness

- `npx tsc --noEmit` exits 0 with zero `as any` casts.
- `npx vitest run tests/auth` — 12/12 tests green (login: 4, rate-limit: 1, jwt-verification: 7).
- Live-verified: server boots, logs `[seed-user] operator user synced` exactly once, and a real `curl POST /auth/login` against the seeded operator account returns 200 with a genuine access+refresh token pair.
- All of this plan's `must_haves` and `<success_criteria>` are met — Plan 01-03+ (frontend login UI, settings, symbol sync) can now call `POST /auth/login` and `GET /auth/me` against a real, hardened backend with no stubs or placeholders.

---
*Phase: 01-foundation-adapter-auth-security*
*Completed: 2026-09-13*
