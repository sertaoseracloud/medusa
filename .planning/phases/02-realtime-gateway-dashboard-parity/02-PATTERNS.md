# Phase 2: Realtime Gateway & Dashboard Parity - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 17
**Analogs found:** 17 / 17

**Note on dual codebase:** This project has a preserved `legacy/backend/` (pre-rewrite Express/ws system) and the Phase-1-built `backend/src/` (Fastify + Drizzle + ccxt). For net-new realtime files (gateway, registry, streaming), the closest analog is usually the **legacy** file — cited for the defect it must fix (per CONCERNS.md), not for code to copy. For files extending Phase 1's own code (adapter, authenticate, error handler), the closest analog is the **actual Phase 1 file** — cited for the concrete signature/convention to extend.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/realtime/ws-server.ts` | route/controller (WS) | streaming/pub-sub | `legacy/backend/src/app.ws.ts` (defect reference) + `backend/src/app.ts` (registration convention) | role-match (legacy = what to fix, Phase1 = how to register) |
| `backend/src/realtime/subscription-registry.ts` | service (in-memory store) | pub-sub | `legacy/backend/src/app.em.ts` (broadcast defect to fix) | role-match (anti-pattern reference) |
| `backend/src/realtime/topics.ts` | utility | transform | none (net new, no analog) | no analog |
| `backend/src/bus/event-bus.interface.ts` | port/interface | event-driven | `backend/src/exchanges/core/exchange-adapter.interface.ts` (interface-port convention) | role-match |
| `backend/src/bus/in-memory-bus.ts` | service (adapter of interface) | event-driven | `backend/src/exchanges/binance/binance.adapter.ts` (implements-interface convention) | role-match |
| `backend/src/exchanges/binance/binance.adapter.ts` (EXTENDED) | service/adapter | streaming (new methods) + CRUD (existing) | itself (Phase 1 file) | exact (extend, don't replace) |
| `backend/src/exchanges/binance/binance.stream.ts` | service | streaming | `legacy/backend/src/utils/exchange.ts` (legacy stream wrapper, for defects) + `backend/src/exchanges/binance/binance.adapter.ts` (error-mapping convention) | role-match |
| `backend/src/exchanges/binance/binance.user-data.ts` | service | streaming + event-driven (keepalive) | `legacy/backend/src/utils/exchange.ts` (userDataStream, for defects) + `backend/src/security/credential-vault.ts` (decrypt-at-use convention) | role-match |
| `backend/src/realtime/realtime.routes.ts` (WS route registration, if split from ws-server.ts) | route | request-response (handshake) | `backend/src/modules/symbols/infrastructure/symbols.routes.ts` | role-match |
| `frontend/src/contexts/realtime/index.tsx` | provider/context | streaming | `frontend/src/contexts/auth/index.tsx` | exact |
| `frontend/src/api/ws-client.ts` (or similar, WS client helper) | utility | streaming | `frontend/src/api/index.ts` (axios client conventions: token injection, base URL) | role-match |
| `frontend/src/components/dashboard/TickerCard/index.tsx` | component | streaming (render) | `frontend/src/private/Dashboard/index.tsx` | role-match |
| `frontend/src/components/dashboard/OrderBookTable/index.tsx` | component | streaming (render) | `frontend/src/private/Dashboard/index.tsx` | role-match |
| `frontend/src/components/dashboard/BalanceTable/index.tsx` | component | streaming (render) | `frontend/src/private/Dashboard/index.tsx` | role-match |
| `frontend/src/components/dashboard/SymbolCombobox/index.tsx` | component | request-response (GET /symbols) | `frontend/src/private/Settings/Symbols/index.tsx` (uses same `/symbols` endpoint) | role-match |
| `frontend/src/components/dashboard/TradingViewChart/index.tsx` | component | transform (third-party embed) | none in codebase (legacy `frontend/index.html` script tag only) | no analog |
| `backend/tests/realtime/*.test.ts`, `backend/tests/exchanges/binance-stream.test.ts` etc. | test | — | Phase 1 test files (e.g. `backend/tests/exchanges/*` per RESEARCH.md reference to "Plan 01-04" `vi.mock('ccxt', ...)`) | role-match (not read directly — cited by RESEARCH.md; planner should locate at plan time) |

## Pattern Assignments

### `backend/src/realtime/ws-server.ts` (route, streaming/pub-sub)

**Analogs:** `legacy/backend/src/app.ws.ts` (what to fix), `backend/src/app.ts` (how new plugins are registered in this codebase), `backend/src/shared/http/authenticate.ts` (JWT verification to reuse)

**Legacy defects to fix (`legacy/backend/src/app.ws.ts`, full file, 53 lines):**
```typescript
// Defect 1 — token in URL (line 27):
const token = info.req.url?.split("token=")[1]

// Defect 2 — backwards CORS check (line 19):
const corsValidation = (origin:string) => {
  return process.env.CORS_ORIGIN?.startsWith(origin)  // should be .includes(origin), direction reversed
}

// Defect 3 — verifyClient does the whole auth check at HTTP-upgrade time via
// raw jsonwebtoken, not via the app's shared JWT verification path:
const decoded = jwt.verify(token, process.env.JWT_SECRET as string)
```
None of this should be copied — SEC-06 requires first-message handshake auth instead of `verifyClient`/URL-token, and CORS must reuse the already-correct `.includes` direction from `backend/src/app.ts` lines 48-57 (`cors, { origin: corsOrigins, ... }`).

**Phase 1 registration convention to follow (`backend/src/app.ts` lines 40-77):**
```typescript
export async function buildApp(deps: BuildAppDeps): Promise<AppInstance> {
  const app = createBaseApp();
  ...
  await app.register(jwt, {
    secret: deps.secrets.JWT_SECRET,
    sign: { expiresIn: ACCESS_TOKEN_TTL },
  });
  registerErrorHandler(app);
  app.decorate('db', deps.db);
  app.decorate('secrets', deps.secrets);
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(symbolsRoutes);
  // NEW: await app.register(realtimeRoutes) or realtime plugin, same shape
}
```
`@fastify/websocket` should be registered here alongside the other plugins, and the WS route (`app.get('/realtime', { websocket: true }, handler)`) should reuse `app.jwt.verify(token)` (the same instance registered on line 64) — mirroring how `authenticate.ts` reuses `request.jwtVerify()` for REST (see below), not a second parallel JWT implementation.

**Auth pattern to mirror (`backend/src/shared/http/authenticate.ts`, full file, 30 lines):**
```typescript
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    const code = (err as JwtVerifyError)?.code;
    if (code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      throw new TokenExpiredError();
    }
    throw new InvalidCredentialsError();
  }
}
```
The WS handshake should call the equivalent `fastify.jwt.verify(msg.token)` (verify-string form, not `request.jwtVerify()`, since there's no `FastifyRequest` after upgrade) but keep the same two-branch error mapping (expired vs. generic invalid), and close the socket (code 4001) instead of throwing an HTTP error.

**Route registration style to mirror (`backend/src/modules/symbols/infrastructure/symbols.routes.ts` lines 11-30):**
```typescript
export const symbolsRoutes: FastifyPluginAsync = async (app) => {
  const symbols = createSymbolsRepository(app.db);
  const adapter = getExchangeAdapter(DEFAULT_EXCHANGE_ID);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/symbols', { schema: {...}, preHandler: [authenticate] }, async (request) => {
    ...
    return ok(result);
  });
};
```
Use the same `FastifyPluginAsync` shape for `realtimeRoutes`/`ws-server.ts`'s registration function.

---

### `backend/src/realtime/subscription-registry.ts` (service, pub-sub)

**Analog:** `legacy/backend/src/app.em.ts` (anti-pattern to replace, full file, 48 lines)

**Anti-pattern being replaced (lines 16-23):**
```typescript
function broadcast(jsonObject: { miniTicker?: any; book?: any[]; }) {
    if (!wss || !wss.clients) return;
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(jsonObject));
        }
    });
}
```
This broadcasts every event to every connected client with no topic scoping and no per-socket cleanup on disconnect (no `wss.clients.delete` anywhere, no `ws.on('close', ...)` handler at all in `app.ws.ts`'s `onConnection`). `subscription-registry.ts` must replace this `wss.clients.forEach` pattern with a `Map<topic, Set<WebSocket>>`, and must add socket cleanup on `close` (registered per-connection in `ws-server.ts`, calling `subscriptionRegistry.removeAll(socket)`) — the legacy code has no equivalent, which is itself the CONCERNS.md "Connection Lifecycle" defect to fix.

No positive code pattern to copy from this codebase for the registry's internal Map/Set structure — implement per `research/ARCHITECTURE.md`'s design (already approved, cited in CONTEXT.md).

---

### `backend/src/exchanges/binance/binance.adapter.ts` (EXTENDED — service, streaming)

**Analog:** itself (Phase 1 file, 135 lines) — extend, do not replace.

**Existing conventions to extend from (full file already read):**
```typescript
// Client caching by credential fingerprint (lines 79-91) — reuse this
// getClient/getPublicClient pattern for any REST calls the new streaming
// methods need (e.g. listenKey POST/PUT), do not add a second client cache:
private getClient(creds: DecryptedCredentials): InstanceType<typeof ccxt.binance> {
  const key = fingerprint(creds);
  const existing = this.clients.get(key);
  if (existing) return existing;
  const client = new ccxt.binance({ apiKey: creds.accessKey, secret: creds.secretKey, enableRateLimit: true });
  this.clients.set(key, client);
  return client;
}

// Error mapping convention (lines 20-27) — reuse mapExchangeError for any
// REST calls inside binance.stream.ts/binance.user-data.ts:
function mapExchangeError(err: unknown): Error {
  if (err instanceof ccxt.PermissionDenied) return new ExchangePermissionError();
  if (err instanceof ccxt.AuthenticationError) return new ExchangeAuthenticationError();
  if (err instanceof ccxt.NetworkError) return new ExchangeUnavailableError();
  return new ExchangeUnknownError();
}

// Interface implementation shape (line 72): `export class BinanceAdapter implements IExchangeAdapter`
// New streaming methods (subscribeTicker, subscribeOrderBook, subscribeUserData) should be
// added as additional methods on this same class, and the interface
// (exchange-adapter.interface.ts) extended with their signatures — mirroring
// how getBalance/getSymbols/testConnection are already declared there.
```

**Interface to extend (`backend/src/exchanges/core/exchange-adapter.interface.ts`, full file, 17 lines):**
```typescript
export interface IExchangeAdapter {
  readonly id: string;
  testConnection(creds: DecryptedCredentials): Promise<void>;
  getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]>;
  getSymbols(): Promise<NormalizedSymbol[]>;
  dispose(creds: DecryptedCredentials): void;
  // NEW methods to add here, following the same Promise/callback style used elsewhere in this file
}
```

**Normalized types to extend (`backend/src/exchanges/core/types.ts`, full file, 21 lines)** — add `NormalizedTicker`, `NormalizedOrderBook` alongside the existing `NormalizedBalance`/`NormalizedSymbol`, following the same flat-interface style (no nested classes, string-typed numeric fields for balances as seen in `NormalizedBalance`).

---

### `backend/src/exchanges/binance/binance.stream.ts` / `binance.user-data.ts` (service, streaming)

**Analog:** `legacy/backend/src/utils/exchange.ts` — **not read in full here** (not in required list) but referenced by CONCERNS.md/INTEGRATIONS.md as the source of `miniTickerStream`/`bookStream`/`userDataStream` factory functions the legacy `app.em.ts` consumes (see `broadcast` usage above: `miniTickerStream(markets => ...)`, `bookStream(order => ...)`, `userDataStream((balanceData) => ..., (executionData) => ..., (listStatusData) => ...)`). The legacy factory-function-returning-callbacks shape is a reasonable structural analog (factory takes credentials/settings, returns subscribe methods) but its lack of reconnect-with-backoff and its callback (not EventEmitter/bus-publish) style should NOT be copied — this phase must publish onto `bus/in-memory-bus.ts` instead of taking inline callbacks, and must wrap each connection in the backoff loop (RESEARCH.md Pattern 4).

**Credential decryption convention to reuse (`backend/src/security/credential-vault.ts`, full file, 40 lines):**
```typescript
export function openCredential(sealed: string, masterKey: Buffer): string {
  if (!sealed.startsWith(VERSION_PREFIX)) {
    throw new Error('Unknown credential vault format version');
  }
  ...
  return decrypt(nonce, ciphertext, authTag, masterKey);
}
```
`binance.user-data.ts` needs decrypted API credentials to call `POST /api/v3/userDataStream` — reuse `openCredential`/the existing `settings` module's decryption flow (see `get-settings.use-case.ts` below), do not re-implement decryption.

**Use-case wiring convention (`backend/src/modules/settings/application/get-settings.use-case.ts`, full file, 19 lines):**
```typescript
export function createGetSettingsUseCase(deps: GetSettingsDeps): { execute(userId: string): Promise<SettingsDto> } {
  return {
    async execute(userId: string): Promise<SettingsDto> {
      const record = await deps.settings.findByUserId(userId);
      return toSettingsDto(record, deps.masterKey);
    },
  };
}
```
This factory-function-returning-`{execute}` shape is the established use-case pattern in this codebase; if `binance.user-data.ts` needs an orchestration layer (e.g. "start user data stream for user X"), follow this same `createXUseCase(deps): { execute(...) }` shape rather than a bare exported function, for consistency with the rest of `modules/`.

---

### `backend/src/bus/event-bus.interface.ts` / `in-memory-bus.ts` (port + adapter)

**Analog:** `backend/src/exchanges/core/exchange-adapter.interface.ts` + `backend/src/exchanges/core/exchange-registry.ts` (port/adapter/registry convention)

```typescript
// Port convention (exchange-adapter.interface.ts) — plain interface, no framework coupling:
export interface IExchangeAdapter {
  readonly id: string;
  testConnection(creds: DecryptedCredentials): Promise<void>;
  ...
}

// Adapter registration convention (exchange-registry.ts, full file, 19 lines):
const registry: Record<string, IExchangeAdapter> = { binance: binanceAdapter };
export function getExchangeAdapter(id: string): IExchangeAdapter {
  const adapter = registry[id];
  if (!adapter) throw new Error(`Unknown exchange adapter id: ${id}`);
  return adapter;
}
```
`event-bus.interface.ts` should define `IEventBus` (`publish(topic, payload)`, `subscribe(topic, handler)`) as a plain interface exactly like `IExchangeAdapter`; `in-memory-bus.ts` implements it via `EventEmitter`, instantiated once and exported as a singleton the same way `binanceAdapter` is instantiated once at module scope in `exchange-registry.ts` (no DI framework in this codebase — plain module-level singletons is the established convention).

---

### `frontend/src/contexts/realtime/index.tsx` (provider/context, streaming)

**Analog:** `frontend/src/contexts/auth/index.tsx` (full file, 219 lines) — exact structural match (Context + Provider + hook).

**Structure to mirror:**
```typescript
// Context + null-check hook pattern (lines 26, 210-218):
const AuthContext = createContext<AuthContextData | null>(null);
...
export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
// -> RealtimeContext = createContext<RealtimeContextData | null>(null); useRealtime() with same guard.

// Ref-based timer/interval management for reconnect scheduling (lines 44-51):
const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const clearRefreshTimer = useCallback(() => {
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }
}, []);
// -> same ref+clear pattern for the WS reconnect backoff timer / heartbeat ping interval.

// localStorage persistence convention (lines 39, 55-58, 101-103, D-08's precedent):
const ACCESS_TOKEN_EXPIRES_AT_KEY = '@Beholder:accessTokenExpiresAt';
localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(expiresAtMs));
localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
// -> D-08's selected-symbol persistence should use the same '@Beholder:' key prefix,
// e.g. '@Beholder:selectedSymbol', matching this existing naming convention.

// Silent-failure / state-preservation precedent (comment at lines 106-110):
} catch {
  // The refresh token is gone (expired or revoked): sign out silently,
  // with no toast, alert, or explicit end-of-session copy anywhere (D-10).
  clearSession();
}
// -> D-04 requires the OPPOSITE for realtime data (preserve last-known state on
// disconnect, only toggle a connectionStatus flag) — do not clear ticker/book/
// balance state the way clearSession() clears auth state; model connection
// status as an orthogonal piece of state, per RESEARCH.md Pitfall 3.
```

**Auth token access for the WS handshake** — the realtime context needs the current access token to send as the first WS message; reuse how `api/index.ts` stores it (`api.defaults.headers.common.Authorization`) or read `localStorage.getItem('@Beholder:accessToken')` directly (same key used in `auth/index.tsx` lines 55, 121, 128), do not introduce a second token storage location.

---

### `frontend/src/api/*` (WS client helper, streaming)

**Analog:** `frontend/src/api/index.ts` (full file, 88 lines)

```typescript
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3333',
  withCredentials: false,
});
```
The WS client's server URL should derive from the same `VITE_API_URL` env convention (swapping `http(s)://` for `ws(s)://`), not a separately hardcoded value. The single-shared-in-flight-promise pattern for concurrent 401 refreshes (lines 26-49, `inFlightRefresh`) is a useful precedent if the realtime client ever needs to coordinate a single re-auth across multiple pending subscribe calls, though not required by CONTEXT.md's decisions.

---

### `frontend/src/components/dashboard/SymbolCombobox/index.tsx` (component, request-response)

**Analog:** `frontend/src/private/Settings/Symbols/index.tsx` — not read in full (outside required list) but is the existing consumer of `GET /symbols`; confirmed present at `frontend/src/private/Settings/Symbols/index.tsx` via directory listing. Planner/executor should read this file directly when implementing the combobox to reuse its query/fetch pattern against `/symbols?quote=&search=` (matching `symbols.schemas.ts`'s `listSymbolsQuerySchema` fields, confirmed in `symbols.routes.ts` line 19).

---

### `frontend/src/components/dashboard/*` (Ticker/OrderBook/Balance/TradingViewChart)

**Analog:** `frontend/src/private/Dashboard/index.tsx` (full file, 59 lines) — current placeholder page this phase fills in.

```typescript
export default function Dashboard() {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { ... }, []);

  return (
    <div className="grid gap-lg">
      <Card>
        <CardHeader><CardTitle>Sessão ativa</CardTitle></CardHeader>
        <CardContent>{error && <p className="text-role-body text-destructive">{error}</p>}{!error && <p className="text-role-body">{email ?? 'Carregando…'}</p>}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Dados de mercado em tempo real</CardTitle>
          <CardDescription>Mini ticker, book de ofertas e saldo chegam na Fase 2...</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
```
This file's placeholder second `<Card>` (lines 48-56) is exactly the slot the new `TickerCard`/`OrderBookTable`/`BalanceTable`/`SymbolCombobox`/`TradingViewChart` components replace. Use the same `Card`/`CardHeader`/`CardTitle`/`CardContent` shadcn components (already imported from `@/components/ui/card`) and the same `className="grid gap-lg"` layout convention for the dashboard grid. `TradingViewChart` has no codebase analog (net-new third-party embed) — use RESEARCH.md Pattern 5 (`key={symbol}` remount) directly.

---

## Shared Patterns

### JWT Verification (SEC-06 handshake reuse)
**Source:** `backend/src/shared/http/authenticate.ts` (full file) + `backend/src/app.ts` line 64-67 (`app.register(jwt, { secret: deps.secrets.JWT_SECRET, sign: { expiresIn: ACCESS_TOKEN_TTL } })`)
**Apply to:** `realtime/ws-server.ts`'s handshake — call `fastify.jwt.verify(msg.token)` against the same registered secret; do not add a second `jsonwebtoken`/`jwt.verify()` call like the legacy `app.ws.ts` did.

### Error Envelope / Domain Errors
**Source:** `backend/src/shared/http/response-envelope.ts` (`ok<T>(data, message)` → `{ data, message, timestamp }`) and `backend/src/shared/errors/domain-error.ts` (`abstract class DomainError extends Error { abstract statusCode; abstract code; }`), enforced centrally in `backend/src/shared/http/error-handler.ts`.
**Apply to:** Any REST-adjacent parts of this phase (none expected — realtime is WS-only) should keep this envelope shape. WS-side error messages sent to clients (e.g. `{ type: 'error', code, message }`) should mirror the `{ data: { code }, message }` shape from `error-handler.ts` lines 23-29 for consistency, per RESEARCH.md's note that "error message format/shape should stay consistent with the REST error envelope where practical."

### Singleton Registry / Adapter Pattern
**Source:** `backend/src/exchanges/core/exchange-registry.ts` (module-level `const registry = {...}`, `getExchangeAdapter(id)`)
**Apply to:** `bus/in-memory-bus.ts` (single shared `EventEmitter` instance), `realtime/subscription-registry.ts` (single shared `Map` instance) — this codebase does not use a DI container; module-scope singletons instantiated once and imported where needed is the established convention.

### localStorage Key Naming
**Source:** `frontend/src/contexts/auth/index.tsx` lines 39, 55-58 (`'@Beholder:accessTokenExpiresAt'`, `'@Beholder:accessToken'`, `'@Beholder:refreshToken'`)
**Apply to:** D-08's persisted selected-symbol key — use the same `'@Beholder:'` prefix convention (e.g. `'@Beholder:selectedSymbol'`).

### Context + Provider + Hook (frontend global state)
**Source:** `frontend/src/contexts/auth/index.tsx` (`createContext` + `Provider` + `useX()` hook with null-guard throw)
**Apply to:** `frontend/src/contexts/realtime/index.tsx` — exact structural match, see Pattern Assignments above.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/realtime/topics.ts` | utility | transform | Pure new string-builder helpers (`tickerTopic(ex,sym)` etc.); no existing topic-naming utility anywhere in the codebase to model against — implement per `research/ARCHITECTURE.md`'s already-approved naming convention (`ticker:{exchange}:{symbol}`, etc.) directly. |
| `frontend/src/components/dashboard/TradingViewChart/index.tsx` | component | transform (third-party embed) | No React component wraps a third-party script tag anywhere in this codebase; legacy `frontend/index.html` only references the TradingView script directly with no React wrapper. Use RESEARCH.md Pattern 5 code example as the baseline instead of a codebase analog. |
| `backend/src/exchanges/binance/binance.stream.ts` reconnect-with-backoff logic specifically | utility (within service) | streaming | No existing reconnect/backoff loop exists anywhere in `backend/src/` (Phase 1 had no persistent outbound connections). Use RESEARCH.md Pattern 4 code example directly. |

## Metadata

**Analog search scope:** `backend/src/` (all modules, exchanges, security, shared), `legacy/backend/src/` (`app.ws.ts`, `app.em.ts`), `frontend/src/` (contexts, api, private/Dashboard, private/Settings, components/ui)
**Files scanned:** 17 read directly (full content) + directory listings of `backend/src/**/*.ts` and `frontend/src/**/*.{ts,tsx}` for structural discovery
**Pattern extraction date:** 2026-09-13
