---
phase: 01
slug: foundation-adapter-auth-security
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-13
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Fastify REST API | All request bodies, headers and origins are untrusted and cross here | Credentials, JWTs, Binance keys, arbitrary user input |
| Fastify process → PostgreSQL | Query parameters cross here; must stay parameterized | Password hashes, hashed refresh tokens, AES-GCM ciphertext, symbol data |
| Fastify process → environment/secrets | `JWT_SECRET` / `AES_KEY` enter the process here | Master secrets used to sign JWTs and encrypt credentials |
| Browser → `POST /auth/login` | Untrusted credentials and unbounded request volume | Email/password |
| Browser → protected routes | Untrusted `Authorization` header values | Bearer access tokens |
| Environment → seed routine | `SEED_USER_PASSWORD` enters the process and reaches the users table | Operator password |
| Browser origin → API | Frontend origin must be inside the backend's CORS allowlist | Cross-origin request eligibility |
| Browser storage → API requests | Tokens held in `localStorage`, readable by any script on the origin | Access/refresh tokens |
| Backend process → Binance REST API | Outbound credentialed calls; responses/errors are untrusted input | Exchange API keys, market data |
| Backend process → encrypted-at-rest storage | Plaintext credentials exist only inside this process, never beyond the vault boundary | Binance accessKey/secretKey |
| Authenticated browser → `PUT /settings/credentials` | The highest-value secret in the system crosses here | Binance accessKey/secretKey |
| Backend → log sink | Request bodies containing credentials pass near the logger | Potentially sensitive fields, redacted |
| Browser → `POST /auth/refresh` | Unauthenticated endpoint that mints access tokens — highest-value unauthenticated surface | Refresh token |
| Browser → `POST /auth/logout` / `PATCH /auth/password` | Authenticated session-state mutations | Refresh token, password change |
| Operator keyboard → browser form | Plaintext Binance secret exists in the browser only between keystroke and request | Binance secretKey |
| Binance REST → symbol ingestion | Untrusted external data written into the database | Market symbol metadata |
| Boot sequence → server availability | A failure here must not deny service | N/A (availability boundary) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-SEC05 | Spoofing/Info Disclosure | `@fastify/cors` in `backend/src/app.ts` | mitigate | Explicit origin allowlist from `CORS_ORIGINS`; no `origin: true`/bare `cors()` | closed |
| T-01-SEC08a | DoS | All API routes | mitigate | `@fastify/rate-limit` global 100/min | closed |
| T-01-FOUND04 | Tampering | Every route body/params/query | mitigate | Zod schema per route via `fastify-type-provider-zod` | closed |
| T-01-V7 | Info Disclosure | Unhandled exceptions/logs | mitigate | Central `setErrorHandler` fixed message; pino redact | closed |
| T-01-V6 | Tampering/EoP | `backend/src/security/secrets.ts` | mitigate | Fail-fast in prod when JWT_SECRET/AES_KEY absent; dev fallback fresh `randomBytes(32)` | closed |
| T-01-SQLI | Tampering | Drizzle queries against PostgreSQL | mitigate | Parameterized query builder; Zod validates first | closed |
| T-01-SC | Tampering | npm installs | mitigate | Package legitimacy audit; `npm audit --audit-level=high` gate | closed |
| T-01-SEC08 | DoS/EoP | `POST /auth/login` | mitigate | Per-route `rateLimit max:5/15min` keyed by IP | closed |
| T-01-SEC04 | Tampering/DoS | `shared/http/authenticate.ts` | mitigate | `request.jwtVerify()`, no raw `jwt.verify` | closed |
| T-01-ENUM | Info Disclosure | Login failure responses | mitigate | Identical 401 message + dummy argon2 verify for unknown emails (timing-safe) | closed |
| T-01-TOKSTORE | Info Disclosure | `refresh_tokens` rows | mitigate | Only `sha256(token)` stored | closed |
| T-01-PWLOG | Info Disclosure | Seed routine/login logs | mitigate | pino redact covers `req.body.password`; seed logs email only | closed |
| T-01-SEC07a | Info Disclosure | Login response payload | mitigate | DTO is `{id,email}`; `passwordHash` never leaves repository | closed |
| T-01-SEC05f | Spoofing | Frontend origin vs `CORS_ORIGINS` | mitigate | `VITE_API_URL`/`CORS_ORIGINS` explicit pair, no wildcard | closed |
| T-01-XSSTOK | Info Disclosure | Access/refresh tokens in `localStorage` | accept | Single-operator local tool, no UGC rendered, React escapes by default; compensating: 15min access token + revocable rotated refresh | closed |
| T-01-ENUMf | Info Disclosure | Login error rendering | mitigate | UI renders server's single generic 401 message, no branching | closed |
| T-01-SILENT | Repudiation | Hydration on 401 | mitigate | Failed `GET /auth/me` on bootstrap clears tokens silently, returns to `/login` | closed |
| T-01-SEC01 | Tampering/Info Disclosure | `security/crypto.ts` nonce gen | mitigate | `randomBytes(12)` fresh nonce every `encrypt()` call | closed |
| T-01-GCMTAMPER | Tampering | Sealed credential strings in DB | mitigate | AES-GCM auth tag verified on every open, flipped byte throws | closed |
| T-01-KEYROT | Tampering | Ciphertext format | mitigate | `v1:` version prefix + `key_version` column enables future re-encryption | closed |
| T-01-CREDLOG | Info Disclosure | Vault/adapter code paths | mitigate | No logging in `credential-vault.ts`; pino redact covers accessKey/secretKey | closed |
| T-01-EXCHERR | Info Disclosure/Repudiation | ccxt error handling | mitigate | Errors mapped to 4 domain errors; raw ccxt errors never reach response body | closed |
| T-01-RLDRIFT | DoS | Binance rate limits | mitigate | One memoized ccxt instance per credential fingerprint, `enableRateLimit:true` | closed |
| T-01-SEC07 | Info Disclosure | `settings.dto.ts` + route response schema | mitigate | Masking at DTO boundary; Zod response schema cannot express raw secret; `response-shape.test.ts` asserts no raw value in any response | closed |
| T-01-SEC07log | Info Disclosure | pino output for save requests | mitigate | redact covers `req.body.accessKey/secretKey` | closed |
| T-01-SEC01s | Info Disclosure | `settings` table at rest | mitigate | Only `v1:`-prefixed AES-256-GCM ciphertext written | closed |
| T-01-BADCRED | Spoofing/Repudiation | Credential save flow | mitigate | `adapter.testConnection` awaited before any repository write | closed |
| T-01-EXCHERRm | Info Disclosure | Error responses on failed saves | mitigate | Only 4 curated PT-BR domain messages emitted | closed |
| T-01-IDOR | EoP | Settings routes | mitigate | User id from verified JWT (`request.user.sub`), never body/query; `userId` unique | closed |
| T-01-FOUND04s | Tampering | `PUT /settings/credentials` body | mitigate | Zod body schema with `min(16)` on accessKey/secretKey | closed |
| T-01-SEC03 | Spoofing/Repudiation | Refresh-token replay after logout | mitigate | `revokedAt`/`isNull` checked on every `isValid`/`findActive` call | closed |
| T-01-SEC02 | Spoofing | Long-lived credential exposure | mitigate | 15-min access token, 14-day refresh rotated on every use | closed |
| T-01-REPLAY | Spoofing | Rotated refresh token reuse | mitigate | Rotation revokes presented token in same DB transaction as replacement issuance | closed |
| T-01-RTBRUTE | DoS/Spoofing | `POST /auth/refresh` guessing | mitigate | Per-route `rateLimit max:30/15min` + 48-random-byte tokens | closed |
| T-01-PWCHANGE | EoP | `PATCH /auth/password` | mitigate | Requires valid access token AND current password; all refresh tokens revoked on success | closed |
| T-01-REFRESHLOOP | DoS | Frontend 401 interceptor | mitigate | Single shared in-flight refresh promise, `/auth/refresh`/`/auth/login` excluded from retry | closed |
| T-01-PWREVERT | Repudiation | Password reverting on restart (D-03) | accept | Documented env-var-seeded single-operator behavior; UI warning permanently rendered | closed |
| T-01-SEC07ui | Info Disclosure | Credentials card rendering | mitigate | Only server-provided masked strings rendered, no reveal toggle; component test asserts fixture secret never in DOM | closed |
| T-01-DIRECTEX | Info Disclosure | Any client-side exchange call | mitigate | Browser never calls Binance directly; no exchange hostnames in `frontend/src` | closed |
| T-01-DBLSUBMIT | DoS | Save button during live exchange round trip | mitigate | Submit control disabled for whole request | closed |
| T-01-ERRCODE | Info Disclosure | Error rendering | mitigate | UI branches on backend's stable error `code`, renders only 4 curated strings | closed |
| T-01-PWWARN | Repudiation | Password-change expectations | mitigate | D-04 warning permanently rendered above form | closed |
| T-01-SECINPUT | Info Disclosure | Secret input field | mitigate | `type="password"` on secret input | closed |
| T-01-EXCH03tx | Tampering/DoS | `sync-symbols.use-case.ts` | mitigate | Delete+insert share one Drizzle transaction, rollback on mid-flight failure | closed |
| T-01-BOOTDOS | DoS | Boot-time sync | mitigate | Registered on `onListen` (never `onReady`), wrapped in try/catch | closed |
| T-01-EMPTYWIPE | Tampering | Adapter returning zero symbols | mitigate | Empty adapter result throws instead of committing empty replace | closed |
| T-01-SYNCFLOOD | DoS | `POST /symbols/sync` | mitigate | Per-route `rateLimit max:5/1min` + disabled button while in flight | closed |
| T-01-SYMAUTH | EoP | `GET /symbols`, `POST /symbols/sync` | mitigate | Both routes carry `authenticate` preHandler | closed |
| T-01-SYMINJ | Tampering | Exchange-supplied symbol strings | mitigate | Drizzle parameterized queries; `%`/`_`/`\` escaped before `ilike`; React escapes render | closed |
| T-01-FOUND04y | Tampering | `GET /symbols` querystring | mitigate | Zod querystring schema validates `quote`/`search` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

50/50 threats closed. All `mitigate`-disposition threats verified present in the implementation by direct code inspection (file:line evidence in the audit trail below); both `accept`-disposition threats have documented rationale and verified compensating controls.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-XSSTOK | Access/refresh tokens stored in `localStorage` (`frontend/src/contexts/auth/index.tsx`, `frontend/src/api/index.ts`). Single-operator local tool, no user-generated content rendered, React escapes by default. Compensating controls verified in code: 15-minute access token TTL + revocable, rotated refresh tokens. Revisit if any HTML-rendering surface or multi-user access is ever added. | gsd-security-auditor (per 01-03-PLAN.md disposition) | 2026-09-13 |
| AR-02 | T-01-PWREVERT | Operator password reverts to `SEED_USER_PASSWORD` on every server restart (`seed-user.ts`) per D-03 — a deliberate property of the env-var-seeded single-operator model, not a defect. UI warning verified present and permanently rendered in `ChangePassword/index.tsx`. Revisit only if multi-user provisioning is introduced (v2). | gsd-security-auditor (per 01-06-PLAN.md disposition) | 2026-09-13 |

*Accepted risks do not resurface in future audit runs.*

---

## Additional Observations (informational, not formal threats)

- **`GET/POST /health/echo` debug route** (`backend/src/app.ts`, gated by `NODE_ENV !== 'production'`): a Zod-validated echo probe used only by `tests/http/validation-envelope.test.ts`. Not registered as a formal threat and not a blocker (dev-only, schema-validated), but flagged for awareness — remove or add a formal threat entry if this route is ever intended to ship reachable in a non-production-but-internet-exposed environment.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-13 | 50 | 50 | 0 | gsd-security-auditor (ASVS Level 1, retroactive verification of plan-time threat register — all 8 PLAN.md `<threat_model>` blocks) |

Verification performed by direct code inspection (file:line citations) against the live implementation in `backend/src/{app.ts, security, exchanges, modules/auth, modules/settings, modules/symbols, persistence, shared}` and `frontend/src/{api, contexts/auth, private/Settings, public/Login}`, cross-checked against `backend/tests/settings/response-shape.test.ts` and `frontend/tests/settings.test.tsx` for test-based evidence. No `## Threat Flags` sections were found in any of the 8 phase SUMMARY.md files (no additional flags to fold in beyond the plan-time register).

Two Critical bugs found and fixed by an earlier `/gsd:code-review 1 --fix` pass (commits `2828f63`, `c322a1b`) were re-checked and confirmed fixed as part of this audit: stale ccxt client cache on Binance secret rotation, and insufficient `AES_KEY` entropy (128 vs. 256 bits).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-13
