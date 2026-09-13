# Phase 1: Foundation — Adapter, Auth & Security - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 34 (backend) + 6 (frontend)
**Analogs found:** 30 / 40 (legacy analogs exist for nearly every file — this is a full rewrite, so every analog is a "pattern-carries-over, framework-swaps" match, never an exact/copy-paste match)

**Important framing:** This is a from-scratch rewrite (legacy `backend/` uses Express/Sequelize/MSSQL/node-binance-api; new backend uses Fastify/Drizzle/PostgreSQL/ccxt, hexagonal per-module structure). No legacy backend file can be copied verbatim. What carries over: (1) naming conventions (kebab-case, `.service`/`.controller`/`.repository`/`.model` suffixes — now reinterpreted as `domain/application/infrastructure` folders per CLAUDE.md + CONTEXT.md D-17/D-18), (2) the `{data, message, timestamp}` response envelope (CONTEXT.md D-26, locked), (3) the functional shape of each flow (login → settings → symbols sync), which is what the legacy files document as "what to keep functionally, fix technically." Frontend analogs are closer to real reuse (React stays React, only the auth/token storage strategy changes for silent refresh, D-09/D-10).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/modules/auth/domain/user.entity.ts` | model | CRUD | `backend/src/models/settings.model.ts` | role-match (splits auth fields out per Open Question #2) |
| `backend/src/modules/auth/domain/errors.ts` (`InvalidCredentialsError`, `TokenRevokedError`, etc.) | model | request-response | none (legacy has no typed exceptions) | no analog — new pattern from RESEARCH.md Pattern 1/D-19 |
| `backend/src/modules/auth/application/login.use-case.ts` | service | request-response | `backend/src/modules/sessions/services/session.service.ts` | exact (same responsibility: verify credentials, issue token) |
| `backend/src/modules/auth/application/refresh.use-case.ts` | service | request-response | `backend/src/modules/sessions/services/blacklist.service.ts` (closest legacy revocation-adjacent logic, though never wired in) | role-match (new logic, no direct legacy equivalent for token refresh) |
| `backend/src/modules/auth/application/logout.use-case.ts` | service | request-response | `backend/src/modules/sessions/services/blacklist.service.ts` | role-match (same intent — revoke — but legacy never checks it; this is the exact bug being fixed) |
| `backend/src/modules/auth/infrastructure/user.repository.ts` | model (repository) | CRUD | `backend/src/modules/sessions/repositories/settings.repository.ts` | exact |
| `backend/src/modules/auth/infrastructure/refresh-token.repository.ts` | model (repository) | CRUD | `backend/src/modules/sessions/repositories/settings.repository.ts` (closest CRUD-repo shape; no legacy equivalent table) | role-match |
| `backend/src/modules/auth/infrastructure/auth.controller.ts` (login/refresh/logout routes) | controller | request-response | `backend/src/modules/sessions/controllers/session.controller.ts` | exact |
| `backend/src/modules/auth/infrastructure/seed-user.ts` (boot-time seed, D-01–D-03) | utility | batch | none (legacy has no seed mechanism — public registration didn't exist either) | no analog — new pattern |
| `backend/src/modules/settings/domain/exchange-credentials.entity.ts` | model | CRUD | `backend/src/models/settings.model.ts` (accessKey/secretKey fields) | role-match |
| `backend/src/modules/settings/domain/errors.ts` (`InvalidCredentialsFormatError`, `ExchangeUnreachableError`, `ExchangePermissionError`) | model | request-response | none | no analog — new pattern from RESEARCH.md Pattern 3/D-07 |
| `backend/src/modules/settings/application/get-settings.use-case.ts` | service | CRUD | `backend/src/modules/sessions/services/settings.service.ts` | exact |
| `backend/src/modules/settings/application/save-credentials.use-case.ts` (calls `testConnection` before persisting, D-06) | service | CRUD | `backend/src/modules/sessions/services/update-settings.service.ts` | exact (same update flow; new behavior: pre-flight exchange check + typed errors instead of silent accept) |
| `backend/src/modules/settings/infrastructure/settings.repository.ts` | model (repository) | CRUD | `backend/src/modules/sessions/repositories/settings.repository.ts` | exact |
| `backend/src/modules/settings/infrastructure/settings.controller.ts` | controller | request-response | `backend/src/modules/sessions/controllers/settings.controller.ts` | exact |
| `backend/src/modules/settings/infrastructure/settings.dto.ts` (masks `secretKey`, D-05) | utility (serializer) | transform | `backend/src/modules/sessions/controllers/settings.controller.ts` (inline field-picking at lines 19-31, currently returns raw `secretKey` — the anti-pattern to fix) | role-match |
| `backend/src/modules/symbols/domain/symbol.entity.ts` | model | CRUD | `backend/src/models/symbol.model.ts` | exact |
| `backend/src/modules/symbols/application/sync-symbols.use-case.ts` (atomic tx, D-15; boot-gated, D-13/D-14; non-blocking, D-16) | service | batch | `backend/src/modules/symbols/services/sync-symbols.service.ts` | exact (same responsibility; new behavior: wraps in Drizzle transaction instead of unguarded `deleteAll()`+`bulkInsert()`) |
| `backend/src/modules/symbols/infrastructure/symbols.repository.ts` | model (repository) | CRUD | `backend/src/modules/symbols/repositories/symbols.repository.ts` | exact |
| `backend/src/modules/symbols/infrastructure/symbols.controller.ts` | controller | request-response | `backend/src/modules/symbols/controllers/symbols.controller.ts` | exact |
| `backend/src/exchanges/core/exchange-adapter.interface.ts` (`IExchangeAdapter`) | service (interface) | request-response | `backend/src/utils/exchange.ts` (factory function shape: takes settings, returns object with methods) | role-match (legacy factory pattern is explicitly what's being replaced by Adapter/Strategy, per CONTEXT.md "Established Patterns (a evitar)") |
| `backend/src/exchanges/core/exchange-registry.ts` | service | event-driven | none | no analog — new pattern |
| `backend/src/exchanges/binance/binance.adapter.ts` | service | request-response | `backend/src/utils/exchange.ts` (`balance()`, `exchangeInfo()` methods specifically) | role-match |
| `backend/src/security/credential-vault.ts` | utility | transform | `backend/src/utils/crypto.ts` | exact (same responsibility: encrypt/decrypt secretKey; new behavior: AES-256-GCM + random nonce instead of AES-CTR + hardcoded key) |
| `backend/src/security/crypto.ts` (low-level cipher helpers) | utility | transform | `backend/src/utils/crypto.ts` | exact |
| `backend/src/security/secrets.ts` (startup validation, D-23/D-24) | config | request-response | `backend/src/utils/crypto.ts` (lines 3-9, the hardcoded-fallback anti-pattern being fixed) | role-match |
| `backend/src/persistence/schema/*.ts` (Drizzle tables: users, refresh_tokens, settings, symbols) | model | CRUD | `backend/src/models/settings.model.ts`, `backend/src/models/symbol.model.ts` | role-match (Sequelize `db.define` → Drizzle `pgTable`, same field-naming conventions) |
| `backend/src/persistence/db.ts` | config | CRUD | `backend/src/database/index.ts` | exact |
| `backend/src/shared/errors/domain-error.ts` (`DomainError` base class) | model | request-response | none | no analog — new pattern from D-19 |
| `backend/src/shared/http/error-handler.ts` (Fastify `setErrorHandler`) | middleware | request-response | `backend/src/middlewares/error.middleware.ts` | exact (same responsibility; new behavior: maps `ZodError` + `DomainError` subtypes instead of one generic `error.status/message`) |
| `backend/src/shared/http/response-envelope.ts` | utility | transform | `backend/src/modules/sessions/controllers/session.controller.ts` (inline `{data, message, timestamp}` construction, lines 12-23) | role-match |
| `backend/src/shared/logging.ts` (pino + redact) | config | event-driven | `backend/src/app.ts` (morgan logging line 14) | role-match |
| `backend/src/app.ts` (Fastify instance, plugin registration) | config | request-response | `backend/src/app.ts` (Express instance, middleware registration) | exact |
| `backend/src/server.ts` (boot: secrets validation, seed, symbol sync via `onListen`) | config | event-driven | `backend/src/server.ts` | exact |
| auth `preHandler`/decorator for protected routes | middleware | request-response | `backend/src/middlewares/auth.middleware.ts` | exact (same responsibility; new behavior: `@fastify/jwt`'s built-in try/catch instead of raw `jwt.verify()` which crashes on malformed tokens — SEC-04) |
| `frontend/src/contexts/auth/index.tsx` (silent refresh timer, D-09/D-10, revoke-on-logout D-11) | provider | event-driven | `frontend/src/contexts/auth/index.tsx` (legacy, same file path) | exact (reuse structure: Context+Provider+hook, `signIn`/`signOut`/`updateUser`; new behavior: silent background refresh timer, in-memory/short-lived storage vs. plain localStorage-only) |
| `frontend/src/api/index.ts` (axios instance, refresh interceptor) | utility | request-response | `frontend/src/api/index.ts` (legacy, same file path) | exact |
| `frontend/src/public/Login/index.tsx` | component | request-response | `frontend/src/public/Login/index.tsx` (legacy, same file path) | exact |
| `frontend/src/private/Settings/index.tsx` (password-change warning D-04, masked secretKey display D-05) | component | CRUD | `frontend/src/private/Settings/index.tsx` (legacy, same file path) | exact |
| `frontend/src/private/Settings/Symbols/index.tsx` (manual sync button, D-13) | component | request-response | `frontend/src/private/Settings/Symbols/index.tsx` (legacy, same file path) | exact |

## Pattern Assignments

### `backend/src/modules/auth/application/login.use-case.ts` (service, request-response)

**Analog:** `backend/src/modules/sessions/services/session.service.ts`

**Core pattern to evolve, not copy verbatim** (full file, lines 1-46):
```typescript
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import settingsRepository from "../repositories/settings.repository";

const SessionService = async ({email, password}:Session): Promise<SessionResponse> => {
    if(!email || !password) {
      return { error: '401 Unauthorized', status: 401 };
    }
    const user = await settingsRepository.getByEmail(email)
    if(!user){
      return { error: '401 Unauthorized', status: 401 };
    }
    const isValid = bcrypt.compareSync(password, user.password);
    if(!isValid) {
      return { error: '401 Unauthorized', status: 401 };
    }
    const token = jwt.sign(
      {id:user.id},
      process.env.JWT_SECRET as string,
      { expiresIn: parseInt(process.env.JWT_EXPIRES_IN as string) }
    );
    return { status: 201, token_type: "Bearer", token, user: {id: user.id} };
}
```
**What to keep:** the functional shape — validate presence, look up by email, verify password hash, issue token, return `{id}` only (never the full user row).
**What to fix (do not copy):** the `{error?, status}` response-object pattern (CONTEXT.md D-19 explicitly bans this) — throw `InvalidCredentialsError extends DomainError` instead; `bcrypt.compareSync` → `argon2.verify` (async); manual `jwt.sign` → `@fastify/jwt`'s `reply.jwtSign()`; also issue+persist a `refresh_tokens` row (RESEARCH.md Pattern 1) which legacy never did at all.

---

### `backend/src/modules/auth/application/logout.use-case.ts` / `refresh.use-case.ts` (service, request-response)

**Analog:** `backend/src/modules/sessions/services/blacklist.service.ts`

**Anti-pattern to explicitly NOT repeat** (full file, lines 1-22):
```typescript
const blacklist = [];

const BlacklistService =  ({authorization}:Blacklist): BlacklistResponse => {
  if(!authorization) {
    return { error: '401 Unauthorized', status: 401 };
  }
  blacklist.push(authorization);
    return { status: 200, authorization: "revoked" };
}
```
This is the exact CONCERNS.md bug (RESEARCH.md Pitfall 2): an in-memory array that is never checked anywhere else in the codebase — logout is a complete no-op. The new implementation MUST use the persistent `refresh_tokens` table (RESEARCH.md Pattern 1) and — critically — `RefreshUseCase` MUST query `isRefreshTokenValid()` on every call, not just at issuance:
```typescript
// modules/auth/infrastructure/refresh-token.repository.ts (RESEARCH.md Pattern 1)
export async function isRefreshTokenValid(db: DrizzleDB, tokenHash: string): Promise<boolean> {
  const [row] = await db.select().from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);
  return !!row && row.expiresAt > new Date();
}
export async function revokeRefreshToken(db: DrizzleDB, tokenHash: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
}
```

---

### `backend/src/modules/settings/application/save-credentials.use-case.ts` (service, CRUD)

**Analog:** `backend/src/modules/sessions/services/update-settings.service.ts` + `backend/src/modules/sessions/repositories/settings.repository.ts` (`update` fn, lines 29-64)

**Core pattern to evolve** (repository update, lines 29-64):
```typescript
const update = async (id: number, newSettings: NewSettings) => {
  const user = await getById(id);
  if(newSettings.email !== user.email){ user.email = newSettings.email; }
  if(newSettings.password){ user.password = bcrypt.hashSync(newSettings.password, 10); }
  if(newSettings.accessKey && newSettings.accessKey !== user.accessKey){ user.accessKey = newSettings.accessKey; }
  if(newSettings.secretKey){ user.secretKey = crypto.encrypt(newSettings.secretKey); }
  await user.save()
}
```
**What to keep:** partial-update-if-present shape, encrypt `secretKey` before persisting.
**What to fix:** no test-connection call exists at all in legacy (D-06 requires calling `adapter.testConnection()` BEFORE any write — reject the whole save if it fails); no distinction between error types (D-07 requires ccxt error mapping, RESEARCH.md Pattern 3); `bcrypt.hashSync` → `argon2.hash`; must never let the raw `secretKey` reach the response DTO (see next section).

**Controller anti-pattern to fix** — legacy returns raw `secretKey` in every response, the exact D-05 violation:
```typescript
// backend/src/modules/sessions/controllers/settings.controller.ts, lines 19-31
return res.status(200).json({
  data:{ user:{ email: data.user?.email, apiUrl: data.user?.apiUrl, streamUrl: data.user?.streamUrl,
    accessKey: data.user?.accessKey, secretKey: data.user?.secretKey } },
  message: 'Success', timestamp: new Date().toISOString(),
});
```
New `settings.dto.ts` must apply a masking function (e.g., `mask(secretKey)` → last 4 chars only) at this exact serialization boundary, per RESEARCH.md Anti-Patterns section: "apply masking at the DTO/serialization boundary, not ad hoc in each controller."

---

### `backend/src/security/credential-vault.ts` / `crypto.ts` (utility, transform)

**Analog:** `backend/src/utils/crypto.ts` (full file, lines 1-29)

**Anti-pattern to fix — hardcoded key + fixed IV (CTR mode has no per-call nonce):**
```typescript
const aesKey = process.env.AES_KEY? process.env.AES_KEY : "TextMustBe32BytesLongandExactter";
const key = aes.utils.utf8.toBytes(aesKey);
function encrypt(text: string) {
  const bytes = aes.utils.utf8.toBytes(text);
  const aesCTR = new aes.ModeOfOperation.ctr(key);   // same key, no nonce param — deterministic
  const encryptedBytes = aesCTR.encrypt(bytes);
  return aes.utils.hex.fromBytes(encryptedBytes);
}
```
Replace with RESEARCH.md Pattern 2 (AES-256-GCM, random 96-bit nonce per call, Node built-in `crypto`):
```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
const ALGO = 'aes-256-gcm';
export function encrypt(plaintext: string, masterKey: Buffer) {
  const nonce = randomBytes(12); // never deterministic — Pitfall 1
  const cipher = createCipheriv(ALGO, masterKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { nonce, ciphertext, authTag: cipher.getAuthTag() };
}
```
The master key itself must come from `security/secrets.ts` (D-23/D-24 fail-fast/dev-temp-key), not a hardcoded fallback string like legacy line 4.

---

### `backend/src/exchanges/binance/binance.adapter.ts` (service, request-response)

**Analog:** `backend/src/utils/exchange.ts` (factory function, full file lines 1-56)

**What carries over — the factory-takes-settings shape:**
```typescript
const exchange = (settings: any) => {
  const binance = new Binance({ APIKEY: settings.accessKey, APISECRET: settings.secretKey, ... });
  const balance = async () => { return binance.balance(); }
  return { exchangeInfo, miniTickerStream, bookStream, userDataStream, balance };
}
```
**What to fix:** this is Binance-only (`node-binance-api`) and is explicitly named in CONTEXT.md "Established Patterns (a evitar)" as the pattern the new `IExchangeAdapter` interface replaces. New adapter wraps `ccxt.binance` and maps its typed error hierarchy (RESEARCH.md Pattern 3):
```typescript
async testConnection(creds: DecryptedCredentials): Promise<void> {
  const exchange = new ccxt.binance({ apiKey: creds.accessKey, secret: creds.secretKey, enableRateLimit: true });
  try { await exchange.fetchBalance(); }
  catch (err) {
    if (err instanceof ccxt.AuthenticationError) throw new InvalidCredentialsError();
    if (err instanceof ccxt.PermissionDenied) throw new InsufficientPermissionsError();
    if (err instanceof ccxt.NetworkError) throw new ExchangeUnavailableError();
    throw new ExchangeAdapterUnknownError(err);
  }
}
```
Reuse one long-lived ccxt instance per credential set (RESEARCH.md Anti-Patterns: don't instantiate ccxt per request).

---

### `backend/src/modules/symbols/application/sync-symbols.use-case.ts` (service, batch)

**Analog:** `backend/src/modules/symbols/services/sync-symbols.service.ts` (full file, lines 1-50)

**What carries over — fetch, normalize, replace shape:**
```typescript
const { symbols: exchangeSymbols } = await exchangeInfo();
const symbols = exchangeSymbols.map((symbolMapped) => ({
  symbol: symbolMapped.symbol,
  basePrecision: symbolMapped.baseAssetPrecision,
  quotePrecision: symbolMapped.quoteAssetPrecision,
  minNotional: symbolMapped.filters.find(f => f.filterType === 'MIN_NOTIONAL').minNotional,
  minLotSize: symbolMapped.filters.find(f => f.filterType === 'LOT_SIZE').minQty,
  isFavorite: false,
}));
await symbolsRepository.deleteAll();
const syncSymbols = await symbolsRepository.bulkInsert(symbols);
```
**What to fix — no transaction (CONCERNS.md, D-15):** `deleteAll()` then `bulkInsert()` are two unguarded calls; if bulk insert throws mid-way, symbols table is left empty. New version (RESEARCH.md Pattern 5):
```typescript
async function execute() {
  const normalized = await adapter.getSymbols();
  await db.transaction(async (tx) => {
    await tx.delete(symbols);
    await tx.insert(symbols).values(normalized);
    // throw mid-way rolls back the whole transaction, including the delete
  });
}
```
Also wire boot-time trigger via `onListen` (not `onReady`, D-16/Pitfall 5), gated on `count === 0` (D-14).

---

### `backend/src/shared/http/error-handler.ts` (middleware, request-response)

**Analog:** `backend/src/middlewares/error.middleware.ts` (full file, lines 1-11)

**What carries over — the envelope shape itself (D-26 keeps it):**
```typescript
export default async (error: any, _req, res) => {
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';
  res.status(status).json({ data: {}, message, timestamp: new Date().toISOString() });
}
```
**What to fix:** single generic catch-all → central `setErrorHandler` (Fastify) that discriminates `ZodError`, `DomainError` subtypes, and unknown errors (D-27, RESEARCH.md Pattern 4):
```typescript
app.setErrorHandler((err, req, reply) => {
  const timestamp = new Date().toISOString();
  if (hasZodFastifySchemaValidationErrors(err)) {
    return reply.status(400).send({
      data: { fields: err.validation.map(v => ({ field: v.instancePath.replace(/^\//, ''), message: v.message })) },
      message: 'Validation failed', timestamp,
    });
  }
  if (err instanceof DomainError) {
    return reply.status(err.statusCode).send({ data: null, message: err.message, timestamp });
  }
  req.log.error(err); // pino redact — never logs raw req.body (SEC-07)
  return reply.status(500).send({ data: null, message: 'Internal server error', timestamp });
});
```

---

### Auth guard middleware (middleware, request-response)

**Analog:** `backend/src/middlewares/auth.middleware.ts` (full file, lines 1-17)

**Anti-pattern to fix — raw `jwt.verify` with no try/catch (SEC-04, crashes server on malformed token):**
```typescript
export default async (req, res, next) => {
  const { authorization } = req.headers;
  if(authorization) {
    const token = authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string); // throws uncaught on bad token
    res.locals.user = decoded;
    return next();
  }
  return res.status(401).json({ data: {}, message: 'Unauthorized', timestamp: new Date().toISOString() })
}
```
Replace with `@fastify/jwt`'s `request.jwtVerify()` inside a `preHandler`, which wraps verify failures and is caught by the central error handler instead of crashing the process.

---

### `frontend/src/contexts/auth/index.tsx` (provider, event-driven)

**Analog:** same file, legacy version (full file, lines 1-122) — closest real reuse in this phase.

**What carries over directly:**
```typescript
const AuthContext = createContext<AuthContextData>({} as AuthContextData);
export const AuthProvider = ({ children }: Props) => {
  const [data, setData] = useState<AuthState>(() => {
    const token = localStorage.getItem('@Beholder:token');
    if (token) { api.defaults.headers.authorization = `Bearer ${token}`; return {token} }
    return {} as AuthState;
  });
  const signIn = useCallback(async ({ email, password }) => {
    const response = await api.post('/sessions', { email, password }).catch(...);
    const { token } = response?.data.data;
    localStorage.setItem('@Beholder:token', token);
    api.defaults.headers.authorization = `Bearer ${token}`;
    setData({ token });
  }, []);
  const signOut = useCallback(async () => {
    await api.post('/logout');
    localStorage.removeItem('@Beholder:token');
    setData({} as AuthState);
  }, []);
  ...
```
**What to add (new, no legacy equivalent):** silent background refresh timer that calls `/auth/refresh` before the ~15min access token expires (D-09); on refresh-token expiry, clear state silently with no explicit "session expired" message (D-10); explicit `signOut` must call the new `/auth/logout` endpoint that actually revokes server-side (fixes the fact that legacy `signOut` posts to `/logout`, which routes to the no-op blacklist service above).

## Shared Patterns

### Response Envelope
**Source:** `backend/src/modules/sessions/controllers/session.controller.ts` (lines 12-23), locked by CONTEXT.md D-26
**Apply to:** every controller in `modules/auth`, `modules/settings`, `modules/symbols`
```typescript
{ data: {...}, message: string, timestamp: new Date().toISOString() }
```
Central `setErrorHandler` (see above) must be the only place that constructs the error variant of this envelope — no per-controller try/catch formatting error responses.

### Repository Shape (CRUD)
**Source:** `backend/src/modules/sessions/repositories/settings.repository.ts`, `backend/src/modules/symbols/repositories/symbols.repository.ts`
**Apply to:** all `infrastructure/*.repository.ts` files
Legacy pattern: plain object of named async functions (`getById`, `getByEmail`, `update`, `deleteAll`, `bulkInsert`) wrapping the ORM. Carries over structurally to Drizzle repositories — same named-function-per-operation shape, same file naming (`*.repository.ts`), just swapping Sequelize calls for Drizzle query builder calls, and the module's own port interface (D-18) as the exported contract instead of an untyped default export.

### Error Handling — Typed Exceptions, Not `{error?}` Objects
**Source:** anti-pattern documented across `session.service.ts`, `settings.service.ts`, `update-settings.service.ts`, `blacklist.service.ts` (`SessionResponse`, `SettingsResponse`, `BlacklistResponse` all use `{error?: string, status: number}`)
**Apply to:** every `application/*.use-case.ts` file
D-19 requires replacing this project-wide idiom with `DomainError` subclasses thrown from use cases, caught only by the central `setErrorHandler`.

### Credential Masking at the Serialization Boundary
**Source:** `backend/src/modules/sessions/controllers/settings.controller.ts` lines 19-31 / 53-64 (anti-pattern: raw `secretKey` returned twice, in both `index` and `update`)
**Apply to:** `modules/settings/infrastructure/settings.dto.ts`, used by both the GET and PATCH settings controller actions
D-05 requires masking applied once, centrally, at the DTO boundary — not duplicated inline in each controller action as legacy does.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/modules/auth/infrastructure/seed-user.ts` | utility | batch | Legacy has no seed mechanism (no registration screen ever existed either) — new pattern per D-01–D-03, planner should reference RESEARCH.md Code Examples "Startup secrets validation" as the closest sibling pattern (env-var-driven, fail-fast in prod) |
| `backend/src/shared/errors/domain-error.ts` | model | request-response | No typed exception hierarchy exists in legacy codebase at all — build from RESEARCH.md D-19 description and Pattern 4's `DomainError` usage in the error handler example |
| `backend/src/exchanges/core/exchange-registry.ts` | service | event-driven | Legacy has no multi-exchange concept (single hardcoded `node-binance-api` factory) — build from RESEARCH.md Recommended Project Structure (`exchanges/core/exchange-registry.ts`) |
| `backend/src/security/secrets.ts` | config | request-response | Legacy has no startup validation at all (hardcoded fallback key instead) — use RESEARCH.md Code Examples "Startup secrets validation (D-23/D-24)" verbatim as the reference implementation, not a legacy analog |
| `backend/vitest.config.ts`, `backend/tests/**` | test | — | Zero test files exist in legacy codebase (confirmed via CONCERNS.md/TESTING.md) — no analog possible; planner must build from RESEARCH.md Validation Architecture test map |

## Metadata

**Analog search scope:** `backend/src/**/*.ts` (29 files, full legacy backend), `frontend/src/**/*.{ts,tsx}` (30 files, scoped to auth/settings/login-relevant files for this phase)
**Files scanned:** 20 read in full (session.service.ts, session.controller.ts, auth.middleware.ts, error.middleware.ts, blacklist.service.ts, crypto.ts, settings.repository.ts, settings.service.ts, update-settings.service.ts, settings.controller.ts, exchange.ts, sync-symbols.service.ts, symbols.repository.ts, settings.model.ts, symbol.model.ts, settings.routes.ts, app.ts, server.ts, database/index.ts, contexts/auth/index.tsx, api/index.ts, public/Login/index.tsx, private/Settings/index.tsx)
**Pattern extraction date:** 2026-09-12
