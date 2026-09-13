---
phase: 01
slug: foundation-adapter-auth-security
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-12
updated: 2026-09-13
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 [VERIFIED: npm registry] — no existing test framework in the legacy or current repo |
| **Config file** | `backend/vitest.config.ts` and `frontend/vitest.config.ts` — both created in Plan 01-01 Task 1 / Plan 01-03 Task 1 |
| **Quick run command** | `cd backend && npx vitest run <changed test file>` (frontend: `cd frontend && npx vitest run <file>`) |
| **Full suite command** | `cd backend && npx vitest run` then `cd frontend && npx vitest run` |
| **Estimated runtime** | ~30 seconds backend (integration tests share one Postgres test DB, `fileParallelism: false`), ~10 seconds frontend |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run` (full suite, both workspaces)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-02-T2 | 01-02 | 2 | AUTH-01 | T-01-ENUM | Login with valid email/password returns access+refresh tokens | integration | `npx vitest run tests/auth/login.test.ts` | ✅ | ✅ green |
| 01-02-T2 | 01-02 | 2 | AUTH-01 | T-01-ENUM | Login with invalid password returns 401, no tokens | integration | `npx vitest run tests/auth/login.test.ts` | ✅ | ✅ green |
| 01-06-T1 | 01-06 | 4 | SEC-02 | T-01-SEC02 | Access token expires ~15min; refresh issues a new one while refresh token is valid (rotation, old token dead) | integration | `npx vitest run tests/auth/refresh.test.ts` | ✅ | ✅ green |
| 01-06-T2 | 01-06 | 4 | SEC-03 / AUTH-03 | T-01-SEC03 | Explicit logout revokes refresh token; subsequent `/refresh` with same token rejected | integration | `npx vitest run tests/auth/logout.test.ts` | ✅ | ✅ green |
| 01-02-T3 | 01-02 | 2 | SEC-04 | T-01-SEC04 | Malformed/expired/foreign JWT on protected route returns 401, not 500/crash | integration | `npx vitest run tests/auth/jwt-verification.test.ts` | ✅ | ✅ green |
| 01-04-T1 | 01-04 | 3 | SEC-01 | T-01-SEC01 | Encrypting same plaintext twice produces different ciphertext (nonce uniqueness); decrypt round-trips; tampering throws | unit | `npx vitest run tests/security/credential-vault.test.ts` | ✅ | ✅ green |
| 01-05-T3 | 01-05 | 4 | SEC-07 | T-01-SEC07 | Settings API response never includes raw `secretKey`/`accessKey`; logger redaction verified | unit + integration | `npx vitest run tests/settings/response-shape.test.ts` | ✅ | ✅ green |
| 01-05-T3 | 01-05 | 4 | AUTH-02 | T-01-BADCRED | Saving credentials calls `testConnection` first; save rejected and nothing written if exchange call fails | integration (mocked ccxt) | `npx vitest run tests/settings/save-credentials.test.ts` | ✅ | ✅ green |
| 01-04-T2 | 01-04 | 3 | EXCH-01/02 | T-01-EXCHERR | `BinanceAdapter.testConnection` maps ccxt `AuthenticationError`/`PermissionDenied`/`NetworkError` to distinct domain exceptions | unit (mocked ccxt) | `npx vitest run tests/exchanges/binance-adapter.test.ts` | ✅ | ✅ green |
| 01-08-T2 | 01-08 | 6 | EXCH-03 | T-01-BOOTDOS | Boot sync only runs when table is empty; manual sync always runs; boot survives a failing exchange | integration | `npx vitest run tests/symbols/sync-trigger.test.ts` | ✅ | ✅ green |
| 01-08-T1 | 01-08 | 6 | EXCH-03 | T-01-EXCH03tx | Symbol sync failure mid-transaction leaves old symbols intact (atomicity); empty result never wipes the table | integration (DB rollback) | `npx vitest run tests/symbols/sync-atomicity.test.ts` | ✅ | ✅ green |
| 01-02-T2 | 01-02 | 2 | SEC-08 | T-01-SEC08 | 6th failed login attempt within 15 minutes from same IP returns 429 while other routes stay available | integration | `npx vitest run tests/auth/rate-limit.test.ts` | ✅ | ✅ green |
| 01-01-T3 | 01-01 | 1 | FOUND-04 | T-01-FOUND04 | Invalid request body returns 400 with per-field Zod error detail in the standard envelope; unknown errors return an opaque 500 | integration | `npx vitest run tests/http/validation-envelope.test.ts` | ✅ | ✅ green |
| 01-01-T1 | 01-01 | 1 | SEC-09 | T-01-SC | No high/critical advisories in installed dependencies | CLI gate | `npm audit --audit-level=high` | n/a | ✅ green |
| 01-01-T2 | 01-01 | 1 | FOUND-02 | — | `users` and `refresh_tokens` exist in the live database (schema push gate) | CLI gate | `npx drizzle-kit push` + information_schema assertion | n/a | ✅ green |
| 01-05-T2 | 01-05 | 4 | FOUND-02 / SEC-01 | — | `settings` exists in the live database (schema push gate) | CLI gate | `npx drizzle-kit push` + information_schema assertion | n/a | ✅ green |
| 01-08-T1 | 01-08 | 6 | FOUND-02 / EXCH-03 | — | `symbols` exists in the live database (schema push gate) | CLI gate | `npx drizzle-kit push` + `select 1 from symbols` | n/a | ✅ green |
| 01-03-T2 | 01-03 | 3 | FOUND-03 / AUTH-01 | T-01-ENUMf | Login form posts credentials, renders exact error copy for 401/429, and lands on the dashboard on success | component | `cd frontend && npx vitest run tests/login.test.tsx` | ✅ | ✅ green |
| 01-06-T3 | 01-06 | 4 | SEC-02 / SEC-03 | T-01-REFRESHLOOP | Background timer refreshes once before expiry; concurrent 401s trigger exactly one refresh; expiry signs out silently | component | `cd frontend && npx vitest run tests/silent-refresh.test.tsx` | ✅ | ✅ green |
| 01-07-T2 | 01-07 | 5 | AUTH-02 / SEC-07 | T-01-SEC07ui | Settings screen renders only the masked secret and the correct per-code error message; password warning always visible | component | `cd frontend && npx vitest run tests/settings.test.tsx` | ✅ | ✅ green |
| 01-08-T3 | 01-08 | 6 | EXCH-03 | T-01-SYNCFLOOD | Symbol panel renders the exact empty state, issues one sync per click, and renders the three badge states | component | `cd frontend && npx vitest run tests/symbols.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 scaffolding is created by Plan 01-01 Task 1 (backend) and Plan 01-03 Task 1 (frontend):

- [x] `backend/vitest.config.ts` — framework config (01-01-T1)
- [x] `backend/tests/setup/db.ts` — test database setup/teardown against `TEST_DATABASE_URL`, truncate-between-tests isolation (01-01-T1)
- [x] `backend/tests/setup/mock-ccxt.ts` — shared mock for `ccxt.binance` with overridable `fetchBalance`/`fetchMarkets` and the ccxt error classes (01-01-T1)
- [x] `npm run test` script wiring in `backend/package.json` = `vitest run` (01-01-T1)
- [x] `frontend/vitest.config.ts` + `@testing-library/react` (01-03-T1)
- [x] Live PostgreSQL dev and test databases with the phase schema pushed (01-01-T2, 01-05-T2, 01-08-T1)

---

## Manual-Only Verifications

Four blocking human checkpoints covered what automation cannot assert, each backed by automated tests for the underlying behaviour — all four resolved during execution/UAT:

| Checkpoint | Plan / Task | Covers | Resolved |
|---|---|---|---|
| Walking Skeleton browser verification | 01-03-T3 | Visual conformance to 01-UI-SPEC.md (dark palette, copy, inline field errors) | ✅ 2026-09-13, browser-driven verification (login→dashboard, session persistence) |
| Credentials + password screen verification | 01-07-T3 | Devtools inspection proving no plaintext secret on the wire; post-restart password revert (D-03/D-04) actually matches the warning | ✅ 2026-09-13, confirmed via Network tab + backend restart |
| End-of-phase fresh-install verification | 01-08-T4 | Full Phase 1 goal on a recreated database, including the D-14 second-boot no-resync behaviour | ✅ 2026-09-13, live boot synced 1365 real Binance symbols; second boot skipped resync |
| PostgreSQL provisioning | 01-01-T2 | No Postgres client or Docker CLI detected in the execution environment; the operator must supply `DATABASE_URL`/`TEST_DATABASE_URL` | ✅ Operator-provided Azure Database for PostgreSQL, schema pushed to dev + test databases |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (01-01-T1, 01-03-T1)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-09-13 — all 22 automated-verification rows confirmed green (backend 64/64, frontend 19/19 passing), all 4 manual-only checkpoints resolved.

---

## Validation Audit 2026-09-13

| Metric | Count |
|--------|-------|
| Requirement rows in map | 22 |
| Covered (test exists, green) | 22 |
| Partial | 0 |
| Missing | 0 |
| Manual-only checkpoints resolved | 4 / 4 |

All 16 distinct test files cited in the Per-Task Verification Map were confirmed present on disk and green as part of `/gsd:validate-phase 1`: `backend/tests/{auth/{login,refresh,logout,jwt-verification,rate-limit}.test.ts, security/credential-vault.test.ts, settings/{response-shape,save-credentials}.test.ts, exchanges/binance-adapter.test.ts, symbols/{sync-trigger,sync-atomicity}.test.ts, http/validation-envelope.test.ts}` and `frontend/tests/{login,silent-refresh,settings,symbols}.test.tsx`. No gaps found — the map was fully populated at plan time and every cited test was actually written and passing by phase completion (confirmed via `01-UAT.md`'s 64/64 backend + 19/19 frontend suite run and 12/13 UAT tests passed, 1 blocked on unavailable real Binance credentials — not a test gap).
