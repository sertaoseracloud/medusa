---
phase: 01
slug: foundation-adapter-auth-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-12
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 [VERIFIED: npm registry] — no existing test framework in the legacy or current repo |
| **Config file** | none yet — `vitest.config.ts` must be created in Wave 0 |
| **Quick run command** | `npx vitest run --project backend <changed-file-pattern>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (no suite exists yet — estimate for Wave 0 scaffold) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | — | AUTH-01 | — | Login with valid email/password returns access+refresh tokens | integration | `npx vitest run tests/auth/login.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | AUTH-01 | — | Login with invalid password returns 401, no tokens | integration | `npx vitest run tests/auth/login.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-02 | T-01-SEC02 | Access token expires ~15min; refresh issues a new one while refresh token is valid | integration | `npx vitest run tests/auth/refresh.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-03 / AUTH-03 | T-01-SEC03 | Explicit logout revokes refresh token; subsequent `/refresh` with same token rejected | integration | `npx vitest run tests/auth/logout.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-04 | T-01-SEC04 | Malformed/expired JWT on protected route returns 401, not 500/crash | integration | `npx vitest run tests/auth/jwt-verification.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-01 | T-01-SEC01 | Encrypting same plaintext twice produces different ciphertext (nonce uniqueness); decrypt round-trips | unit | `npx vitest run tests/security/credential-vault.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-07 | T-01-SEC07 | Settings API response never includes raw `secretKey`/`accessKey`; logger redaction verified | unit + integration | `npx vitest run tests/settings/response-shape.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | AUTH-02 | — | Saving credentials calls `testConnection` first; save rejected if exchange call fails | integration (mocked ccxt) | `npx vitest run tests/settings/save-credentials.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | EXCH-01/02 | — | `BinanceAdapter.testConnection` maps ccxt `AuthenticationError`/`PermissionDenied`/`NetworkError` to distinct domain exceptions | unit (mocked ccxt) | `npx vitest run tests/exchanges/binance-adapter.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | EXCH-03 | — | Symbol sync boot logic only runs when table is empty; manual sync always runs | integration | `npx vitest run tests/symbols/sync-trigger.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | EXCH-03 | — | Symbol sync failure mid-transaction leaves old symbols intact (atomicity) | integration (DB rollback) | `npx vitest run tests/symbols/sync-atomicity.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-08 | T-01-SEC08 | 6th failed login attempt within 15 minutes from same IP returns 429 | integration | `npx vitest run tests/auth/rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | FOUND-04 | — | Invalid request body on any route returns 400 with per-field Zod error detail in standard envelope | integration | `npx vitest run tests/http/validation-envelope.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task ID / Plan / Wave columns are TBD until `gsd-planner` produces PLAN.md files — the planner MUST update this table with real task IDs.*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config, none exists yet
- [ ] `tests/setup/db.ts` — test database setup/teardown helper (transactional isolation or dedicated test schema)
- [ ] `tests/setup/mock-ccxt.ts` — shared mock for `ccxt.binance` so exchange-dependent tests don't hit real Binance
- [ ] All test files listed in the map above — none exist yet (repo has zero test files)
- [ ] `npm run test` script wiring in `backend/package.json`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
