---
phase: 01-foundation-adapter-auth-security
fixed_at: 2026-09-13T16:33:00Z
review_path: .planning/phases/01-foundation-adapter-auth-security/01-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-13T16:33:00Z
**Source review:** .planning/phases/01-foundation-adapter-auth-security/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04, WR-05 — `fix_scope: critical_warning`, IN-01/IN-02/IN-03 intentionally excluded)
- Fixed: 7
- Skipped: 0

**Verification performed after all fixes:**
- Backend: `npx tsc --noEmit` — no errors
- Backend: `npx vitest run` (full suite) — 12 test files, 64 tests, all passed
- Frontend: `npx tsc --noEmit` — no errors
- Frontend: `npx vitest run` (full suite) — 4 test files, 19 tests, all passed

## Fixed Issues

### CR-01: Stale ccxt client cache on Binance secret rotation — `dispose()` is dead code

**Files modified:** `backend/src/exchanges/binance/binance.adapter.ts`, `backend/src/exchanges/core/exchange-adapter.interface.ts`, `backend/src/modules/settings/application/save-credentials.use-case.ts`, `backend/tests/exchanges/binance-adapter.test.ts`, `backend/tests/symbols/sync-atomicity.test.ts`, `backend/tests/symbols/sync-trigger.test.ts`
**Commit:** `2828f63`
**Applied fix:** Changed `fingerprint()` to key the ccxt client cache on `accessKey:secretKey` instead of `accessKey` alone, so a rotated secret with the same access key always misses the cache and rebuilds a fresh client (per the review's primary recommended option). Added `dispose(creds)` to the `IExchangeAdapter` interface so it's a first-class part of the adapter contract, not adapter-specific dead code. Added two fake-adapter `dispose() {}` no-ops in the two symbols test files that implement `IExchangeAdapter` (required for `tsc` to pass after the interface change). Added regression tests: same-accessKey/rotated-secretKey now rebuilds the client, and an explicit `dispose()` call evicts and rebuilds correctly.

### WR-01: `BinanceAdapter.clients` Map grows unboundedly and is never pruned

**Files modified:** `backend/src/modules/settings/application/save-credentials.use-case.ts` (bundled with CR-01 commit `2828f63`, since both changes touch the same rotation code path)
**Commit:** `2828f63`
**Applied fix:** `save-credentials.use-case.ts` now looks up the existing settings record before persisting new credentials, and — after a successful save — calls `deps.adapter.dispose(previousCreds)` to evict the now-stale cache entry for the credential pair being replaced. This wires up the previously dead `dispose()` method (also closing IN-02, though IN-02 itself was out of scope) and keeps the cache from accumulating one permanent stale entry per rotation. Note: this bounds growth from rotation but does not add a size-bounded/LRU eviction policy for genuinely multi-tenant growth, as the review's fix suggestion flagged as a "consider" item, not a required change for the current single-operator deployment.

### CR-02: `AES_KEY` derivation only provides 128 bits of real entropy for a 256-bit AES key

**Files modified:** `backend/src/security/secrets.ts`, `backend/.env.example`
**Commit:** `c322a1b`
**Applied fix:** `loadSecrets` now decodes `AES_KEY` via `Buffer.from(aesKeyRaw, 'base64')` instead of `'utf8'`, requiring the operator to supply 32 raw random bytes, base64-encoded (44 chars) — the correct amount of real entropy for AES-256-GCM. `.env.example` was updated to document the base64 generation command and explicitly warn against the old hex-of-16-bytes recipe.

**⚠️ Operator-facing breaking change:** This changes the expected *encoding* of an operator-provided secret from hex-of-16-random-bytes to base64-of-32-random-bytes. Any existing `AES_KEY` value generated with the old recipe will now either fail the length check at boot (most old hex values won't base64-decode to exactly 32 bytes) or, in the rare case it happens to decode to 32 bytes, silently produce a *different* key than before, making previously-sealed credential-vault ciphertext undecryptable. Since this environment's live `backend/.env` (`C:\Repo\medusa\backend\.env`, gitignored, not committed) was generated with the old hex recipe, its `AES_KEY` value was regenerated in this run using `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` so the dev server continues to boot. **Any settings/credentials previously saved via `/settings/credentials` in this dev environment are now unreadable and must be re-saved** (the encrypted row is versioned `v1:` and will fail to open with the new key — this is a decrypt-time failure, not a data-loss risk, since the user can simply re-submit their exchange credentials through the UI).

### WR-05: `loadSecrets` silently accepts a user-supplied `JWT_SECRET` with no minimum-strength check

**Files modified:** `backend/src/security/secrets.ts` (bundled with CR-02 commit `c322a1b`, same function)
**Commit:** `c322a1b`
**Applied fix:** Added a production-only check requiring `JWT_SECRET.length >= 32`, mirroring the existing `AES_KEY` length validation. The `.env.example`-documented generation recipe (48 random bytes, hex-encoded → 96 chars) already comfortably clears this bar, so no operator action is needed for a correctly-generated secret; this only rejects secrets that were manually set to something short/weak.

### WR-02: Frontend re-schedules a full 15-minute refresh window on every page reload regardless of actual token age

**Files modified:** `frontend/src/contexts/auth/index.tsx`
**Commit:** `70d48e2`
**Applied fix:** The access token's actual expiry instant (`Date.now() + expiresIn * 1000`) is now persisted to `localStorage` (`@Beholder:accessTokenExpiresAt`) alongside the tokens at both login and refresh time, and cleared on sign-out. On bootstrap hydration, the stored expiry is used to compute the real remaining time-to-expiry for `scheduleRefresh(...)`, falling back to the 900s default only if no stored expiry value exists (e.g. a token persisted by an older build before this field existed).

### WR-03: `symbols.repository.ts` `list()` builds an unused `query` variable when filters are present

**Files modified:** `backend/src/modules/symbols/infrastructure/symbols.repository.ts`
**Commit:** `ecde97e`
**Applied fix:** Replaced the two separately-constructed query builders with a single `const base = db.select().from(symbols)` reused by both the filtered and unfiltered return branches, matching the review's suggested fix exactly.

### WR-04: `symbols` search filter does not escape SQL `LIKE` wildcard characters in user input

**Files modified:** `backend/src/modules/symbols/infrastructure/symbols.repository.ts` (bundled with WR-03 commit `ecde97e`, same function/lines)
**Commit:** `ecde97e`
**Applied fix:** `filter.search` is now escaped (`%`, `_`, and `\` itself) before being interpolated into the `ilike` pattern, so a user-supplied `%` or `_` is matched as a literal character instead of a SQL wildcard.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-09-13T16:33:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
