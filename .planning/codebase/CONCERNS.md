# Codebase Concerns

**Analysis Date:** 2026-09-12

## Critical Security Issues

### Hardcoded AES Encryption Key

**Risk:** Cryptographic bypass - encryption is ineffective if environment variable is not set
**Files:** `backend/src/utils/crypto.ts` (line 4)
**Current mitigation:** Default hardcoded key "TextMustBe32BytesLongandExactter" used if `AES_KEY` env var not set
**Impact:** API keys and secrets stored with this key are cryptographically exposed. Any attacker who reads the code can decrypt all stored secrets.
**Recommendations:** 
- Remove hardcoded default key entirely
- Throw error if `AES_KEY` not set instead of using fallback
- Rotate all encrypted data if deployed with default key
- Use a proper key management solution (Azure Key Vault, AWS KMS)

### Hardcoded AES-CTR Mode IV Generation

**Risk:** Counter mode using default IV reduces cryptographic effectiveness
**Files:** `backend/src/utils/crypto.ts` (lines 13, 20)
**Current mitigation:** None - uses CTR mode without explicit IV management
**Impact:** Same key-plaintext pair produces same ciphertext, defeating semantic security
**Recommendations:** Use authenticated encryption (AES-GCM) or generate random IV per encryption

### Token Validation Bypass - Logout Ineffective

**Risk:** Tokens remain valid after logout; authentication bypass possible
**Files:** `backend/src/modules/sessions/services/blacklist.service.ts` (entire file)
**Current mitigation:** Blacklist array created but never checked
**Impact:** A user can continue using a token after logout. The blacklist array is in-memory, lost on restart, and doesn't work in distributed deployments.
**Recommendations:**
- Implement persistent blacklist (Redis, database, or token-based approach)
- Add blacklist check to `backend/src/middlewares/auth.middleware.ts`
- Or use short JWT expiration + refresh tokens
- For immediate fix: check blacklist in auth middleware (line 4-10)

### JWT Verification Missing Error Handling

**Risk:** Malformed tokens crash the server
**Files:** `backend/src/middlewares/auth.middleware.ts` (line 8)
**Current mitigation:** None - jwt.verify not wrapped in try-catch
**Impact:** Any malformed JWT causes unhandled exception, triggering error middleware
**Recommendations:** Wrap jwt.verify in try-catch block, return 401 on verification failure

### CORS Misconfiguration

**Risk:** Open CORS allows requests from any origin
**Files:** `backend/src/app.ts` (line 11)
**Current mitigation:** `cors()` called with no options
**Impact:** Cross-origin attacks, data exfiltration possible from any website
**Recommendations:** 
- Configure `cors()` with whitelist: `cors({origin: process.env.CORS_ORIGINS?.split(',')})` 
- See also: `backend/src/app.ws.ts` line 18-19 for broken CORS check in WebSocket

### Sensitive Data Exposed in Responses

**Risk:** Encryption keys returned in API responses
**Files:** `backend/src/modules/sessions/controllers/settings.controller.ts` (lines 26, 60)
**Current mitigation:** None - secretKey included in JSON response
**Impact:** API responses containing secretKey can be exposed via logs, proxies, or CSRF
**Recommendations:**
- Never return `secretKey` in responses
- Return only non-sensitive fields (email, apiUrl, streamUrl)
- If client needs secretKey for encryption, handle client-side only

### Sensitive Data Logged

**Risk:** Passwords and API keys logged to console
**Files:** `backend/src/modules/sessions/controllers/settings.controller.ts` (line 39)
**Current mitigation:** None - `console.log(req.body)` logs entire request including password
**Impact:** Credentials exposed in logs, log aggregation systems, container logs
**Recommendations:** Remove console.log or implement structured logging that redacts sensitive fields

### Axios Dependency Vulnerabilities

**Risk:** Multiple high-severity vulnerabilities in axios 0.26.1
**Files:** `backend/package.json` (line 23), `frontend/package.json` (line 12)
**Current mitigation:** None
**Impact:** SSRF, credential leakage, header injection, prototype pollution exploits possible
**Vulnerabilities include:**
- GHSA-wf5p-g6vw-rhxx: CSRF vulnerability
- GHSA-jr5f-v2jv-69x6: SSRF and credential leakage
- GHSA-3p68-rc4w-qgx5: NO_PROXY bypass SSRF
- GHSA-w9j2-pvgh-6h63: Authentication bypass via validateStatus
- 8+ additional CVEs related to prototype pollution and header injection
**Recommendations:** 
- Upgrade to axios 1.7.7 or later
- Run `npm audit fix` after upgrade
- Test all API calls thoroughly after update

### WebSocket Token in URL Parameter

**Risk:** JWT tokens exposed in WebSocket URL
**Files:** `backend/src/app.ws.ts` (line 27, 34)
**Current mitigation:** None - token extracted from `info.req.url?.split("token=")[1]`
**Impact:** Tokens visible in browser history, proxy logs, server logs. Violates JWT best practices.
**Recommendations:**
- Use Authorization header with WebSocket connection
- Or use secure cookie-based authentication
- Implement proper token exchange protocol for WebSocket upgrades

### WebSocket CORS Validation Backwards

**Risk:** CORS check logic is reversed
**Files:** `backend/src/app.ws.ts` (line 18-19, 24)
**Current mitigation:** None - checking if `CORS_ORIGIN` starts with request origin (wrong direction)
**Impact:** CORS bypass possible; intended origin whitelist ineffective
**Recommendations:** Change to `process.env.CORS_ORIGIN?.includes(info.origin)`

---

## High-Priority Issues

### Zero Test Coverage

**Problem:** No unit, integration, or end-to-end tests
**Files:** Backend: none found, Frontend: none found
**Risk:** Refactoring breaks production; security bugs undetected; regression cycles
**Blocks:** Confidence to deploy, PR reviews, refactoring
**Priority:** High
**Approach:** 
- Start with backend API tests (Jest/Vitest)
- Add frontend component tests (Vitest + React Testing Library)
- Target 70%+ coverage on critical paths (auth, data mutations)
- Add pre-commit testing hook

### Missing Input Validation

**Problem:** API endpoints accept data without validation
**Files:** Multiple service files like `backend/src/modules/symbols/services/update-symbols.service.ts`
**Risk:** Invalid data written to database; potential code injection
**Approach:** Use class-validator or Yup on backend; validate before repository operations

### Error Handling Gaps

**Problem:** Many catch blocks just re-throw or don't log properly
**Files:** `backend/src/modules/sessions/controllers/session.controller.ts` (line 25), `settings.controller.ts` (line 33, 67)
**Risk:** Errors silently propagate; no audit trail; difficult to debug production issues
**Approach:** 
- Implement centralized error handling
- Log errors with context (user ID, request path, timestamp)
- Return appropriate HTTP status codes and user-friendly messages

---

## Database & Data Integrity Issues

### Sync Without Transaction

**Problem:** deleteAll() followed by bulkInsert() with no atomic operation
**Files:** `backend/src/modules/symbols/services/sync-symbols.service.ts` (lines 40-42)
**Risk:** If bulkInsert fails midway, all symbols deleted and not restored
**Impact:** Data loss; users see empty symbol list
**Fix approach:** Use database transaction: wrap in `db.transaction()` or use `Sequelize.Transaction`

### Nullable Repository Returns

**Problem:** Methods return destructured dataValues that could be null
**Files:** `backend/src/modules/sessions/repositories/settings.repository.ts` (lines 15, 20, 25)
**Risk:** Calling code assumes non-null; crashes when user not found
**Example:** Line 15: `const { dataValues } = await Settings.findOne()` → if null, destructuring fails
**Fix approach:** Check if result exists before destructuring; return null explicitly

### No Return Value on Update

**Problem:** Repository update method doesn't return updated record
**Files:** `backend/src/modules/sessions/repositories/settings.repository.ts` (line 63)
**Risk:** Caller can't verify update succeeded
**Fix approach:** Add `return await user.save()` on line 63

---

## Dependency Issues

### Redundant Crypto Packages

**Problem:** Both bcrypt and bcryptjs installed
**Files:** `backend/package.json` (lines 24-25)
**Risk:** Version mismatch, increased bundle size, confusion about which to use
**Recommendation:** Remove bcryptjs; only use bcrypt (already used in `backend/src/modules/sessions/services/session.service.ts`)

### Mismatched Package Usage

**Problem:** package.json lists typeorm, sequelize, sequelize-cli but code uses only Sequelize
**Files:** `backend/package.json` (lines 36-37, vs. code in database/index.ts)
**Risk:** Unused dependencies; confusion about ORM choice; wasted maintenance
**Recommendation:** Remove typeorm if not needed, clarify Sequelize as official ORM

### Babel Vulnerability (Frontend)

**Problem:** @babel/traverse < 7.23.2 has critical code execution vulnerability
**Files:** `frontend/package.json` (devDependencies)
**Impact:** Arbitrary code execution during build
**Fix:** Run `npm audit fix` and upgrade Babel packages

---

## State Management Issues

### Missing Dependency Arrays

**Problem:** useCallback functions missing dependencies, causing stale closures
**Files:** 
- `frontend/src/contexts/symbols/index.tsx` (lines 87-90: getSymbol has empty deps, uses no external state)
- `frontend/src/contexts/symbols/index.tsx` (lines 92-100: updateSymbol has empty deps)
- `frontend/src/contexts/symbols/index.tsx` (lines 109-119: changeQuote functions marked async but not)
**Risk:** Functions capture old state; callback identity unstable; useEffect won't re-run when dependencies change
**Fix approach:** Add proper dependency arrays to all useCallback functions

### Unhandled Promise Rejections

**Problem:** API calls in useEffect don't catch errors; isSyncing can stay true forever
**Files:** `frontend/src/contexts/symbols/index.tsx` (lines 102-107: syncSymbols)
**Risk:** UI shows perpetual loading state; no user feedback on failure
**Fix approach:** Add .catch() to api.post in syncSymbols to always reset isSyncing

### Missing Error Handling in Contexts

**Problem:** API calls in auth context don't check response success
**Files:** `frontend/src/contexts/auth/index.tsx` (line 97-101)
**Risk:** Accessing undefined response.data.data crashes app
**Example:** Line 98: `response.data.data.user` - if response is error, data is undefined
**Fix approach:** Check response.status and error before accessing nested properties

---

## Performance Concerns

### Console Logging in Production

**Problem:** Extensive console.log statements left in code
**Files:** 
- `backend/src/database/index.ts` (line 12: `logging: console.log`)
- `backend/src/modules/sessions/controllers/settings.controller.ts` (line 39: `console.log(req.body)`)
- `backend/src/app.ws.ts` (lines 6, 10, 40)
- `backend/src/utils/exchange.ts` (line 2)
- Frontend: `src/private/Dashboard/hooks.ts`, `src/public/Login/index.tsx`
**Risk:** Performance degradation in production; disk I/O overhead; security exposures (passwords in logs)
**Approach:** 
- Disable database logging in production: `logging: process.env.NODE_ENV === 'development' ? console.log : false`
- Remove request body logging
- Implement structured logging for errors only

### N+1 Query Pattern in Frontend

**Problem:** Same /symbols endpoint called separately for each filter
**Files:** `frontend/src/contexts/symbols/index.tsx` (lines 51-85)
**Risk:** Three separate HTTP calls on page load (getSymbolsMiniTicker, getSymbolsSettings, getSymbolsBook)
**Impact:** Increased network latency; repeated filtering on client side
**Fix approach:** Fetch symbols once, filter in memory in three separate states

### Broadcast to All WebSocket Clients

**Problem:** All market data broadcast to every connected client without filtering
**Files:** `backend/src/app.em.ts` (lines 16-23)
**Risk:** Bandwidth waste; clients receive data they don't subscribe to
**Approach:** Implement subscription mechanism; only broadcast to interested clients

---

## Code Quality Issues

### @ts-ignore Comments

**Problem:** Type checking bypassed in multiple places
**Files:** 
- `backend/src/app.em.ts` (lines 38, 40, 42)
- `backend/src/modules/symbols/services/sync-symbols.service.ts` (line 17)
- `frontend/src/contexts/auth/index.tsx` (lines 48, 68)
**Risk:** Type safety eliminated; bugs undetected at compile time
**Approach:** Fix underlying types; use `unknown` with type guards instead

### Repetitive Field Update Logic

**Problem:** Manual field-by-field update checks repeated in multiple services
**Files:** 
- `backend/src/modules/symbols/services/update-symbols.service.ts` (lines 24-58)
- `backend/src/modules/sessions/repositories/settings.repository.ts` (lines 31-62)
**Risk:** Bug-prone; maintenance burden; code duplication
**Fix approach:** Implement helper function for conditional field updates

### Any Types Overused

**Problem:** Function signatures use `any` instead of proper types
**Files:** Multiple places in services and contexts
**Risk:** Defeats TypeScript benefits; type safety lost
**Approach:** Define explicit interfaces for all API responses; use strict tsconfig

---

## Fragile Areas

### Exchange Service Initialization

**Files:** `backend/src/app.em.ts` (lines 5-14)
**Why fragile:** Initialization has no error handling. If settings null or wss missing, throws error but doesn't gracefully degrade
**Risk:** Server crashes during startup if exchange fails to initialize
**Safe modification:** Wrap initialization in try-catch; log and continue with disabled streams

### Symbol Filter Operations

**Files:** `backend/src/modules/symbols/services/sync-symbols.service.ts` (line 34-35)
**Why fragile:** Assumes every symbol has MIN_NOTIONAL and LOT_SIZE filters. If missing, .find() returns undefined, accessing .minNotional crashes.
**Risk:** One malformed exchange response crashes entire sync
**Safe modification:** Add null checks: `symbolMapped.filters.find(...)?.minNotional ?? '0'`

### WebSocket Connection Lifecycle

**Files:** `backend/src/app.ws.ts` and `backend/src/app.em.ts`
**Why fragile:** No heartbeat/ping-pong; stale connections persist; no cleanup on disconnect
**Risk:** Memory leak from accumulating dead connections; missed data for disconnected clients
**Safe modification:** Implement ws.ping() on interval; cleanup on client close event

---

## Missing Critical Features

### Token Refresh Mechanism

**Problem:** JWT tokens never refresh; no sliding expiration
**Impact:** Long-lived tokens dangerous; short expiration causes frequent re-logins
**Solution:** Implement refresh token rotation

### Rate Limiting

**Problem:** No rate limiting on API endpoints
**Risk:** Brute force attacks on login; DoS on API
**Solution:** Add express-rate-limit middleware

### Audit Logging

**Problem:** No audit trail of who changed what
**Risk:** No accountability for data mutations; compliance gaps
**Solution:** Log all mutations (login, settings updates, symbol changes) with user ID and timestamp

### HTTPS Enforcement

**Problem:** No enforcement of HTTPS on backend
**Risk:** Data in transit exposed (credentials, tokens)
**Solution:** Add helmet HSTS header; require HTTPS in production

---

## Tech Debt Summary

| Area | Severity | Effort | Impact |
|------|----------|--------|--------|
| Axios vulnerabilities | Critical | High | Security bypass, data leakage |
| Hardcoded encryption key | Critical | Low | Complete cryptographic failure |
| No token blacklist check | Critical | Medium | Authentication bypass |
| Zero test coverage | High | High | Regression risk, deployment confidence |
| Missing input validation | High | Medium | Data integrity, injection attacks |
| WebSocket token in URL | High | Low | Token exposure, CORS bypass |
| Sensitive data in logs | High | Low | Credential exposure |
| Error handling gaps | Medium | Medium | Debugging difficulty, crashes |
| Database transaction gaps | Medium | Low | Data loss risk |
| Performance: duplicate API calls | Medium | Low | Latency increase |
| Type safety (@ts-ignore) | Medium | High | Bug detection |

---

*Concerns audit: 2026-09-12*
