---
phase: 01-foundation-adapter-auth-security
reviewed: 2026-09-13T00:00:00Z
depth: standard
files_reviewed: 88
files_reviewed_list:
  - backend/.env.example
  - backend/.gitignore
  - backend/drizzle.config.ts
  - backend/package.json
  - backend/src/app.ts
  - backend/src/exchanges/binance/binance.adapter.ts
  - backend/src/exchanges/core/errors.ts
  - backend/src/exchanges/core/exchange-adapter.interface.ts
  - backend/src/exchanges/core/exchange-registry.ts
  - backend/src/exchanges/core/types.ts
  - backend/src/modules/auth/application/change-password.use-case.ts
  - backend/src/modules/auth/application/login.use-case.ts
  - backend/src/modules/auth/application/logout.use-case.ts
  - backend/src/modules/auth/application/refresh.use-case.ts
  - backend/src/modules/auth/domain/errors.ts
  - backend/src/modules/auth/domain/ports.ts
  - backend/src/modules/auth/domain/user.entity.ts
  - backend/src/modules/auth/infrastructure/auth.routes.ts
  - backend/src/modules/auth/infrastructure/auth.schemas.ts
  - backend/src/modules/auth/infrastructure/jwt.ts
  - backend/src/modules/auth/infrastructure/refresh-token.repository.ts
  - backend/src/modules/auth/infrastructure/seed-user.ts
  - backend/src/modules/auth/infrastructure/user.repository.ts
  - backend/src/modules/settings/application/get-settings.use-case.ts
  - backend/src/modules/settings/application/save-credentials.use-case.ts
  - backend/src/modules/settings/domain/errors.ts
  - backend/src/modules/settings/domain/exchange-credentials.entity.ts
  - backend/src/modules/settings/domain/ports.ts
  - backend/src/modules/settings/infrastructure/settings.dto.ts
  - backend/src/modules/settings/infrastructure/settings.repository.ts
  - backend/src/modules/settings/infrastructure/settings.routes.ts
  - backend/src/modules/settings/infrastructure/settings.schemas.ts
  - backend/src/modules/symbols/application/list-symbols.use-case.ts
  - backend/src/modules/symbols/application/sync-symbols.use-case.ts
  - backend/src/modules/symbols/domain/ports.ts
  - backend/src/modules/symbols/domain/symbol.entity.ts
  - backend/src/modules/symbols/infrastructure/boot-sync.ts
  - backend/src/modules/symbols/infrastructure/symbols.repository.ts
  - backend/src/modules/symbols/infrastructure/symbols.routes.ts
  - backend/src/modules/symbols/infrastructure/symbols.schemas.ts
  - backend/src/persistence/db.ts
  - backend/src/persistence/schema/index.ts
  - backend/src/persistence/schema/refresh-tokens.ts
  - backend/src/persistence/schema/settings.ts
  - backend/src/persistence/schema/symbols.ts
  - backend/src/persistence/schema/users.ts
  - backend/src/security/credential-vault.ts
  - backend/src/security/crypto.ts
  - backend/src/security/secrets.ts
  - backend/src/server.ts
  - backend/src/shared/errors/domain-error.ts
  - backend/src/shared/http/authenticate.ts
  - backend/src/shared/http/error-handler.ts
  - backend/src/shared/http/response-envelope.ts
  - backend/src/shared/logging.ts
  - backend/tests/auth/jwt-verification.test.ts
  - backend/tests/auth/login.test.ts
  - backend/tests/auth/logout.test.ts
  - backend/tests/auth/rate-limit.test.ts
  - backend/tests/auth/refresh.test.ts
  - backend/tests/exchanges/binance-adapter.test.ts
  - backend/tests/http/validation-envelope.test.ts
  - backend/tests/security/credential-vault.test.ts
  - backend/tests/settings/response-shape.test.ts
  - backend/tests/settings/save-credentials.test.ts
  - backend/tests/setup/db.ts
  - backend/tests/setup/mock-ccxt.ts
  - backend/tests/symbols/sync-atomicity.test.ts
  - backend/tests/symbols/sync-trigger.test.ts
  - backend/tsconfig.json
  - backend/vitest.config.ts
  - frontend/.env.example
  - frontend/.gitignore
  - frontend/package.json
  - frontend/src/api/index.ts
  - frontend/src/components/AppShell/index.tsx
  - frontend/src/components/ProtectedRoute/index.tsx
  - frontend/src/components/ui/form.tsx
  - frontend/src/contexts/auth/index.tsx
  - frontend/src/main.tsx
  - frontend/src/private/Dashboard/index.tsx
  - frontend/src/private/Settings/ChangePassword/index.tsx
  - frontend/src/private/Settings/Credentials/index.tsx
  - frontend/src/private/Settings/Symbols/index.tsx
  - frontend/src/private/Settings/hooks.ts
  - frontend/src/private/Settings/index.tsx
  - frontend/src/public/Login/index.tsx
  - frontend/src/routes.tsx
  - frontend/src/vite-env.d.ts
  - frontend/tests/login.test.tsx
  - frontend/tests/settings.test.tsx
  - frontend/tests/setup.ts
  - frontend/tests/silent-refresh.test.tsx
  - frontend/tests/symbols.test.tsx
  - frontend/vite.config.ts
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 88 (of 110 listed; remaining files are shadcn/ui boilerplate, tsconfig/vitest config, and generic type-def files reviewed at a lighter pass — no findings there)
**Status:** issues_found

## Summary

The phase delivers a working Fastify/Drizzle/ccxt-based rewrite with generally careful attention to security-sensitive flows (timing-safe login, hashed/rotating refresh tokens, AES-GCM credential sealing, redacted logging, no-plaintext-in-response tests). The known CORS `methods` bug has already been fixed in `app.ts` and is not re-flagged here.

However, direct tracing of the exchange adapter's client cache uncovered a real stale-credentials bug: `BinanceAdapter` caches ccxt clients keyed only by `accessKey`, and the only invalidation path (`dispose()`) is never called anywhere in the codebase — including from `save-credentials.use-case.ts`, which is the one place that's supposed to invalidate a changed secret. If an operator rotates their Binance secret key while keeping the same access key, every subsequent `testConnection`/`getBalance` call silently reuses the stale ccxt client built with the *old* secret. This is a correctness/security-relevant bug not caught by the test suite, which — like the CORS bug the plan post-mortem already flagged — only exercises credential rotation with two different access keys.

A second Critical finding concerns `AES_KEY` derivation: the documented generation recipe (16 random bytes → 32 hex characters, read back as UTF‑8) yields only 128 bits of real entropy stretched across a 32-byte buffer that is fed directly to AES‑256-GCM as key material, silently halving the intended key strength while looking like a proper 256-bit key.

Several Warnings cover unbounded in-memory cache growth in the adapter, weak input constraints on secret handling in tests/UI, and minor frontend session-timing looseness. Info-level items note small doc/quality nits.

## Critical Issues

### CR-01: Stale ccxt client cache on Binance secret rotation — `dispose()` is dead code

**File:** `backend/src/exchanges/binance/binance.adapter.ts:70-97`
**Issue:** `BinanceAdapter` memoizes ccxt clients in `private readonly clients = new Map<string, ...>()`, keyed by `fingerprint(creds) = creds.accessKey` (line 11-13). The public `dispose(creds)` method is the only way to evict a stale entry, but it is never invoked anywhere in the codebase (confirmed via full-repo search — the only match for `dispose(` is the method's own definition). `save-credentials.use-case.ts` calls `adapter.testConnection({ accessKey, secretKey })` to validate a *new* secret before persisting it (`backend/src/modules/settings/application/save-credentials.use-case.ts:31-34`), but if the operator keeps the same `accessKey` and only rotates `secretKey` (a normal Binance key-rotation flow — regenerate secret, same key ID), `getClient()` finds the existing cached client for that `accessKey` and returns it unchanged, so `testConnection` (and later `getBalance`) silently validates/operates against the *old* secret, not the one just submitted. In the worst case this means: (a) a save can succeed and report the new secret as verified when it was never actually tested against the exchange, and (b) once Binance invalidates the old secret server-side, in-process operations keep failing with confusing auth errors until server restart, using credentials from before the intentional rotation.
  The existing test suite does not catch this: `binance-adapter.test.ts`'s memoization test and `save-credentials.test.ts`'s "saving twice" test both use two *different* `accessKey` values on the second call, so the same-accessKey/rotated-secret path is never exercised.
**Fix:**
```typescript
// binance.adapter.ts — fingerprint on both accessKey and secretKey so a
// changed secret always misses the cache, OR explicitly call dispose()
// from save-credentials.use-case.ts before testConnection when the
// accessKey already exists in the settings record.
function fingerprint(creds: DecryptedCredentials): string {
  return `${creds.accessKey}:${creds.secretKey}`;
}
```
Alternatively (and additionally, to bound cache growth — see WR-01), have `save-credentials.use-case.ts` call `deps.adapter.dispose({ accessKey: input.accessKey, secretKey: <previous secret> })` before `testConnection`, so the wiring that already exists actually gets used.

### CR-02: `AES_KEY` derivation only provides 128 bits of real entropy for a 256-bit AES key

**File:** `backend/src/security/secrets.ts:30-33`, `backend/.env.example:19-22`
**Issue:** `loadSecrets` requires `AES_KEY` to decode to exactly 32 bytes via `Buffer.from(aesKeyRaw, 'utf8')`. The `.env.example` comment instructs operators to generate this value as `randomBytes(16).toString('hex')` — i.e. 16 truly-random bytes, hex-encoded into a 32-character ASCII string. When that 32-character hex string is read back with `'utf8'` encoding, it produces exactly 32 bytes as required by the length check, but every byte is constrained to one of 16 ASCII values (`0-9a-f`), so the buffer carries only ~4 bits of entropy per byte — 128 bits total — even though it is used verbatim as an AES-256-GCM key (which expects 256 bits / 32 bytes of independent entropy). This silently downgrades the advertised "AES-256" credential encryption to AES with an effective 128-bit-entropy key. This is a real weakening of the security property this whole module exists to provide (D-05/credential vault), not merely a style nit, because the documented/only supported generation path produces a materially weaker key than the algorithm's design assumes.
**Fix:** Generate and consume 32 raw random bytes directly (not 16 bytes re-encoded as 32 hex characters), e.g.:
```bash
# .env.example
# 32 random BYTES, base64-encoded (44 chars). Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AES_KEY=
```
```typescript
// secrets.ts
const aesKey = Buffer.from(aesKeyRaw, 'base64');
if (aesKey.length !== 32) {
  throw new Error(`AES_KEY must decode to exactly 32 bytes, got ${aesKey.length}.`);
}
```

## Warnings

### WR-01: `BinanceAdapter.clients` Map grows unboundedly and is never pruned

**File:** `backend/src/exchanges/binance/binance.adapter.ts:70`
**Issue:** The adapter is a process-lifetime singleton (`exchange-registry.ts` constructs one `BinanceAdapter` at module load and reuses it for every user). Its internal `clients` Map accumulates one entry per distinct `accessKey` ever seen, with no eviction beyond the unused `dispose()` method. In a single-operator deployment this is low-impact today, but combined with CR-01 (rotated secrets never evicting the old entry) this is effectively a permanent leak of stale ccxt client instances (each holding a live secret in memory) for the lifetime of the process.
**Fix:** Call `dispose()` from `save-credentials.use-case.ts` whenever the `accessKey` for a user changes or the secret is rotated, and consider a size-bounded/LRU cache if multi-tenant use is anticipated (noted as an "active requirement" in CLAUDE.md's extensibility constraint).

### WR-02: Frontend re-schedules a full 15-minute refresh window on every page reload regardless of actual token age

**File:** `frontend/src/contexts/auth/index.tsx:105-133`
**Issue:** On bootstrap hydration, `scheduleRefresh(DEFAULT_ACCESS_TOKEN_LIFETIME_SECONDS)` (900s) is always used, since the real remaining lifetime of a stored access token is not tracked or recomputed. If a user reloads the page shortly before their access token would actually expire, the app will assume there's a fresh 900-second window and schedule the proactive refresh accordingly — even though the real token might expire in a few seconds. The impact is mitigated by the axios response interceptor's on-demand 401-triggered refresh (`frontend/src/api/index.ts:51-86`), so no user-visible failure results, but it does mean occasional silent extra round trips (401 → refresh → retry) for users who reload near token expiry, and it makes the "proactive refresh" mechanism unreliable exactly when it matters most (right before expiry).
**Fix:** Persist the token's actual `exp` (or `expiresIn` value from issuance) alongside the tokens in `localStorage`, and use the remaining time-to-expiry on bootstrap instead of the hardcoded default.

### WR-03: `symbols.repository.ts` `list()` builds an unused `query` variable when filters are present

**File:** `backend/src/modules/symbols/infrastructure/symbols.repository.ts:36-46`
**Issue:** `const query = db.select().from(symbols).orderBy(asc(symbols.symbol));` is constructed on every call, but when `conditions.length > 0` a second, entirely separate query is built and returned instead (`return db.select().from(symbols).where(...).orderBy(...)`), leaving `query` unused in that branch. This is harmless functionally (Drizzle query builders are cheap to construct) but is dead work on every filtered call and makes the intent read like `query` should have been reused/extended with `.where()`, which it is not.
**Fix:**
```typescript
async list(filter: SymbolsFilter = {}): Promise<SymbolRecord[]> {
  const conditions = [];
  if (filter.quote) conditions.push(eq(symbols.quote, filter.quote));
  if (filter.search) conditions.push(ilike(symbols.symbol, `%${filter.search}%`));

  const base = db.select().from(symbols);
  return conditions.length > 0
    ? base.where(and(...conditions)).orderBy(asc(symbols.symbol))
    : base.orderBy(asc(symbols.symbol));
},
```

### WR-04: `symbols` search filter does not escape SQL `LIKE` wildcard characters in user input

**File:** `backend/src/modules/symbols/infrastructure/symbols.repository.ts:32-33`, `backend/src/modules/symbols/infrastructure/symbols.schemas.ts`
**Issue:** `filter.search` is interpolated directly into an `ilike` pattern: `` `%${filter.search}%` ``. This is not a SQL-injection risk (Drizzle parameterizes the value), but the schema only requires `z.string().min(1)`, so a user-supplied `%` or `_` is passed through as a literal SQL wildcard, letting a search term unintentionally (or deliberately) broaden matches beyond a literal substring search (e.g. searching `%` returns everything, `_` matches any single character). This is a minor correctness/quality gap in a user-facing filter, not a security vulnerability.
**Fix:** Escape `%`, `_`, and the escape character itself before interpolating, or use a dedicated "contains" helper that escapes automatically:
```typescript
const escaped = filter.search.replace(/[%_\\]/g, (c) => `\\${c}`);
conditions.push(ilike(symbols.symbol, `%${escaped}%`));
```

### WR-05: `loadSecrets` silently accepts a user-supplied `JWT_SECRET` with no minimum-strength check

**File:** `backend/src/security/secrets.ts:8-36`
**Issue:** Unlike `AES_KEY`, which is validated to be exactly 32 bytes, `JWT_SECRET` is accepted as-is with no length or entropy check in either dev or production mode, as long as it is a non-empty string. A weak/short/predictable `JWT_SECRET` set in production would allow forging access tokens (`sub` claims), a serious impact, and nothing in this module or `app.ts` guards against it.
**Fix:** Enforce a minimum byte length (e.g. 32+ bytes) for `JWT_SECRET` in production, mirroring the `AES_KEY` validation:
```typescript
if (isProd && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}
```

## Info

### IN-01: `secrets.ts` dev fallback keeps a real `JWT_SECRET` but always generates a fresh `AES_KEY`, an asymmetric fallback that's easy to misread

**File:** `backend/src/security/secrets.ts:8-28`
**Issue:** When only one of `JWT_SECRET`/`AES_KEY` is missing in development, the fallback branch still returns `JWT_SECRET: jwtSecret ?? tempKey.toString('hex')` — i.e. if `JWT_SECRET` was actually set but `AES_KEY` was not (or vice versa), the branch discards the real value's counterpart validation and both env vars end up in an inconsistent "half real, half temporary" state without a distinct warning for each variable. This is only a dev-experience quality issue, not a production risk (production still hard-fails), but the log message ("JWT_SECRET/AES_KEY not set") doesn't clarify which one was actually missing.
**Fix:** Log which specific variable(s) triggered the fallback, and consider requiring both-or-neither to reduce surprising partial states.

### IN-02: `dispose()` is unused/dead code as written (see CR-01) — should either be wired up or removed with a comment explaining why

**File:** `backend/src/exchanges/binance/binance.adapter.ts:95-97`
**Issue:** Beyond the correctness bug in CR-01, `dispose()` itself is currently unreachable dead code from the caller's perspective (zero call sites). Leaving an unused public method that exists specifically to solve a cache-invalidation problem, but is never called, is a code-quality smell that likely masked CR-01 during review — it reads as "the invalidation problem was already handled" when it was not.
**Fix:** Once CR-01 is fixed by wiring a call to `dispose()` (or removing it in favor of a composite cache key), keep `dispose()` covered by a dedicated unit test asserting the client is actually evicted and rebuilt with new credentials.

### IN-03: `refresh.use-case.ts` and `refresh-token.repository.ts` perform two redundant lookups (`findActive` then `isValid`) for every refresh call

**File:** `backend/src/modules/auth/application/refresh.use-case.ts:36-37`, `backend/src/modules/auth/infrastructure/refresh-token.repository.ts:12-32`
**Issue:** `findActive(tokenHash)` and `isValid(tokenHash)` run near-identical queries (same `and(eq(tokenHash), isNull(revokedAt))` predicate) back to back on every `/auth/refresh` call — `isValid` re-fetches and re-checks expiry that `findActive` already effectively determined (`findActive` itself already excludes expired rows via `row.expiresAt <= new Date()`). This isn't a correctness bug (both checks agree), but it is redundant work and duplicated logic that could drift out of sync if one query's predicate is edited without the other. The explanatory comment on lines 40-44 suggests this was a deliberate defense-in-depth choice referencing a legacy defect, which is reasonable, but the duplication could be collapsed into a single repository call without weakening that guarantee.
**Fix:** Have `findActive` be the single source of truth (it already checks both revocation and expiry) and drop the separate `isValid` call from the use case, or fold `isValid`'s check into `findActive`'s return contract explicitly (e.g. return a discriminated result instead of two separate calls).

---

_Reviewed: 2026-09-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
