# Architecture Research

**Domain:** Multi-exchange crypto trading bot (real-time dashboard, credential management, price alerts, backtesting, performance reporting — no automated order execution)
**Researched:** 2026-09-12
**Confidence:** MEDIUM-HIGH (component boundaries and pub/sub pattern are well-established industry consensus; specific library choices are MEDIUM, cross-checked against CCXT docs and multiple architecture write-ups)

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Dashboard)                              │
│  Auth UI · Settings/Credentials UI · Live Ticker/Book · Alerts UI ·        │
│  Backtest UI · Reports UI                                                  │
└───────────────┬───────────────────────────────────────┬───────────────────┘
                │ REST (auth, CRUD, backtest run, reports)│ WebSocket (subscribe per symbol/exchange)
                ▼                                         ▼
┌───────────────────────────────┐         ┌───────────────────────────────────┐
│         API Gateway            │         │     Realtime Gateway (WS server)   │
│  Auth, Settings, Symbols,      │         │  Connection mgmt, JWT auth,        │
│  Alerts CRUD, Backtest jobs,   │         │  subscription registry             │
│  Reports                       │         │  (client ↔ topic map)              │
└───────────────┬────────────────┘         └───────────────┬─────────────────┘
                │                                            │ subscribes to
                ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Internal Message Bus / Pub-Sub                       │
│         (Redis Pub/Sub, or in-process EventEmitter at small scale)       │
│   Topics: ticker:{exchange}:{symbol}, book:{exchange}:{symbol},          │
│           account:{userId}, alert:{userId}                              │
└───────────────┬───────────────────────────────────────┬─────────────────┘
                │ publishes normalized events             │ consumes for
                ▼                                          │ evaluation
┌───────────────────────────────────┐         ┌────────────▼────────────────┐
│     Exchange Adapter Layer         │         │   Alert Evaluation Service   │
│  IExchangeAdapter interface        │         │  (subscribes to bus,         │
│  ├─ BinanceAdapter                 │         │   evaluates price rules,     │
│  ├─ BybitAdapter (future)          │         │   fires notifications)       │
│  └─ ...AdapterN                    │         └──────────────────────────────┘
│  Each: REST client + WS stream     │
│  client, normalizes to common      │         ┌──────────────────────────────┐
│  domain shape (Ticker, OrderBook,  │         │   Backtesting Engine          │
│  Balance, Symbol)                  │         │  (offline, reads historical   │
└───────────────┬─────────────────────┘         │   candles from DB/exchange   │
                │ credentials (decrypted        │   REST, reuses strategy      │
                │  per-request, never persisted  │   evaluation code shared     │
                │  in plaintext)                 │   with Alert Evaluation)     │
                ▼                                 └──────────────────────────────┘
┌───────────────────────────────────┐
│   Credential Vault / Secrets       │
│  Encrypted at rest, decrypted      │
│  in-memory only, per adapter call  │
└───────────────┬─────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Persistence Layer                                    │
│  Users/Settings · Symbols · Alerts · Backtest Results · Trade/Report     │
│  History (relational DB) + optional time-series store for candles/ticks  │
└─────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        External Exchanges                                │
│           Binance · Bybit · Kraken · ... (REST + WebSocket)              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| API Gateway (REST) | AuthN/Z, CRUD for settings/symbols/alerts, trigger backtests, serve reports | Express/Fastify/NestJS controller layer, stateless, horizontally scalable |
| Realtime Gateway (WS server) | Manage client connections, authenticate on connect, track per-client subscriptions, push only subscribed topics | `ws`/Socket.IO/uWebSockets.js server holding a subscription registry (map of topic → set of client sockets) |
| Internal Message Bus | Decouple exchange adapters (producers) from delivery (consumers: WS gateway, alert evaluator, reporting) | Redis Pub/Sub (multi-instance) or in-process EventEmitter (single-instance MVP) |
| Exchange Adapter Layer | Encapsulate exchange-specific REST/WS quirks, normalize to a common domain model, expose a uniform interface | One class/module per exchange implementing a shared `IExchangeAdapter` interface (candidate: build on top of CCXT for REST + normalize native WS streams) |
| Credential Vault | Store and decrypt exchange API keys safely, scoped per adapter call | AES-GCM (random IV) at rest at minimum; ideally external secret manager (Key Vault) reference + envelope encryption |
| Alert Evaluation Service | Subscribe to normalized ticker/book events, evaluate user-defined price rules, emit notifications | Stateless worker consuming from message bus, reads alert rules from DB (cached), publishes to notification channel |
| Backtesting Engine | Run a strategy/rule against historical data offline, produce performance report | Reuses the *same* rule-evaluation code as Alert Evaluation Service, fed historical candles instead of live ticks (event-driven replay loop) |
| Reporting Service | Aggregate historical executions/backtest runs into performance summaries | Reads from Persistence Layer, computed on demand or via scheduled jobs |
| Persistence Layer | Durable storage for users, settings, symbols, alerts, backtest results, reports | Relational DB (Postgres recommended over Azure SQL/MSSQL for this domain) + optional time-series extension/store for OHLCV history |

## Recommended Project Structure

```
backend/src/
├── modules/                     # Feature/domain modules (REST-facing)
│   ├── auth/                    # login, JWT, refresh, 2FA
│   ├── settings/                # user + exchange credential CRUD
│   ├── symbols/                 # tradable symbol sync/listing
│   ├── alerts/                  # price alert CRUD
│   ├── backtests/               # backtest job submission + results
│   └── reports/                 # performance reporting endpoints
├── exchanges/                   # Exchange Adapter Layer (the key abstraction)
│   ├── core/
│   │   ├── exchange-adapter.interface.ts   # IExchangeAdapter contract
│   │   ├── types.ts                        # normalized Ticker/OrderBook/Balance/Symbol
│   │   └── exchange-registry.ts            # resolves adapter by exchange id
│   ├── binance/
│   │   ├── binance.adapter.ts
│   │   ├── binance.rest.ts
│   │   └── binance.stream.ts
│   └── bybit/ (future exchange, same shape as binance/)
├── realtime/                    # Realtime Gateway
│   ├── ws-server.ts              # connection lifecycle, auth handshake
│   ├── subscription-registry.ts  # topic ↔ client bookkeeping
│   └── topics.ts                  # topic naming helpers (ticker:{ex}:{sym})
├── bus/                          # Internal Message Bus abstraction
│   ├── event-bus.interface.ts    # publish/subscribe contract
│   ├── in-memory-bus.ts          # MVP: single-instance EventEmitter
│   └── redis-bus.ts              # scale-out: Redis Pub/Sub
├── strategy/                     # Shared rule/strategy evaluation (used by alerts AND backtesting)
│   ├── rule-evaluator.ts
│   └── strategy.types.ts
├── backtesting/
│   ├── historical-data.provider.ts   # fetch candles from exchange REST or DB cache
│   └── backtest-runner.ts            # replay loop, reuses strategy/rule-evaluator
├── security/
│   ├── credential-vault.ts       # encrypt/decrypt exchange API keys
│   └── crypto.ts
├── persistence/                  # ORM models/migrations, repositories
└── shared/                       # cross-cutting: logging, error types, validation
```

### Structure Rationale

- **`exchanges/`** is isolated from `modules/` — REST controllers never talk to an exchange SDK directly; they go through the registry. This is what makes "add exchange #2" a pure-addition change instead of a rewrite.
- **`bus/`** is an interface with two implementations so the MVP can ship with an in-process EventEmitter (zero extra infra) and swap to Redis Pub/Sub later without touching producers/consumers — this addresses the current system's "broadcast to all" problem without over-engineering day one.
- **`strategy/`** is shared explicitly between `alerts` (live) and `backtesting` (historical replay) so the same rule logic that decides "price crossed threshold" is exercised in both paths — this is the standard event-driven backtester principle (same code, different data source).
- **`realtime/`** owns only connection/subscription bookkeeping, not exchange logic — it is a pure fan-out layer between the bus and WebSocket clients.

## Architectural Patterns

### Pattern 1: Exchange Adapter (Ports & Adapters / Strategy Pattern)

**What:** Define a single `IExchangeAdapter` interface (e.g., `getSymbols()`, `getBalance()`, `subscribeTicker(symbol, cb)`, `subscribeOrderBook(symbol, cb)`, `subscribeUserData(cb)`). Each exchange implements it, translating exchange-specific REST/WS payloads into a shared normalized shape (`Ticker`, `OrderBookLevel[]`, `Balance[]`, `Symbol`). Callers (services, monitors, alert evaluator) depend only on the interface, never on a concrete exchange SDK.

**When to use:** As soon as a second exchange is a stated requirement — retrofitting this after a Binance-only implementation ships is exactly the kind of rewrite this project already went through once.

**Trade-offs:** Slightly more upfront ceremony (interface + per-exchange implementation + normalization mapping) vs. calling `node-binance-api` directly; pays off immediately when exchange #2 arrives, and forces symbol/precision/rate-limit differences to be handled explicitly rather than leaking into business logic.

**Example:**
```typescript
interface IExchangeAdapter {
  id: string; // "binance", "bybit"
  getSymbols(): Promise<NormalizedSymbol[]>;
  getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]>;
  subscribeTicker(symbol: string, onTick: (t: NormalizedTicker) => void): Unsubscribe;
  subscribeOrderBook(symbol: string, onBook: (b: NormalizedOrderBook) => void): Unsubscribe;
  subscribeUserData(creds: DecryptedCredentials, onEvent: (e: UserDataEvent) => void): Unsubscribe;
}

class BinanceAdapter implements IExchangeAdapter { /* wraps CCXT or native SDK */ }
class BybitAdapter implements IExchangeAdapter { /* same contract, different wire format */ }

const registry = new ExchangeRegistry([new BinanceAdapter(), new BybitAdapter()]);
const adapter = registry.get(user.settings.exchangeId);
```

CCXT (github.com/ccxt/ccxt) is the de facto standard unified library covering 100+ exchanges' REST APIs with consistent data shapes and built-in rate limiting; it is a strong candidate as the underlying implementation inside each adapter for REST calls (balances, symbol/exchange-info, order books snapshot), while native exchange WebSocket streams are usually still integrated per-exchange since CCXT's streaming support (`ccxt.pro`) is a separate paid/commercial module — evaluate cost/benefit before adopting `ccxt.pro` vs. hand-rolling stream normalization.

### Pattern 2: Topic-Based Pub/Sub Fan-out (replaces broadcast-to-all)

**What:** Every normalized market-data event from an exchange adapter is published to a named topic (e.g., `ticker:binance:BTCUSDT`, `book:bybit:ETHUSDT`, `account:{userId}`). The WebSocket gateway maintains a subscription registry mapping each connected client to the topics it asked for (client sends `{type: "subscribe", topic: "ticker:binance:BTCUSDT"}` after connecting). On each bus event, the gateway looks up only the subscribed clients for that topic and pushes to them — never a global `clients.forEach(...)`.

**When to use:** Always, once more than a couple of symbols/exchanges are supported — broadcast-to-all (current system) means every client pays the bandwidth/CPU cost of every symbol on every exchange even if they only watch one pair.

**Trade-offs:** Requires bookkeeping (topic → socket set, and cleanup on disconnect) instead of a single array of sockets; this is a small, well-understood cost. At single-instance scale, a plain `Map<topic, Set<WebSocket>>` plus an in-process EventEmitter is sufficient — no external infra needed. Only introduce Redis Pub/Sub (or Kafka) when running multiple gateway instances behind a load balancer, since then adapters and WS gateways may live in different processes/machines and need a shared bus.

**Example:**
```typescript
// subscription-registry.ts
const topicToClients = new Map<string, Set<WebSocket>>();

function subscribe(topic: string, client: WebSocket) {
  if (!topicToClients.has(topic)) topicToClients.set(topic, new Set());
  topicToClients.get(topic)!.add(client);
}

// on bus event
eventBus.on('ticker', (ticker: NormalizedTicker) => {
  const topic = `ticker:${ticker.exchange}:${ticker.symbol}`;
  for (const client of topicToClients.get(topic) ?? []) {
    client.send(JSON.stringify({ topic, data: ticker }));
  }
});
```

### Pattern 3: Shared Strategy/Rule Evaluation for Alerts and Backtesting

**What:** Both live price alerts and backtesting need to answer the same question — "given this price data and this rule, does it trigger?" — so implement one `evaluateRule(rule, priceEvent): boolean` (or richer signal-generation function) and feed it live ticks in production (via the message bus) and historical candles in backtests (via a replay loop over stored/fetched OHLCV data). This is the standard event-driven backtester principle: the event loop and core evaluation logic stay identical; only the event *source* changes (live WS stream vs. historical iterator).

**When to use:** From the moment both alerts and backtesting exist as requirements — designing them as two entirely separate codebases the current milestone is explicitly the trap to avoid, since it doubles maintenance and risks the backtest not matching live behavior.

**Trade-offs:** Requires the rule/strategy layer to be pure and side-effect-free (no direct DB/network calls inside evaluation) so it can be driven by either a live stream or a replayed array; this discipline is worth enforcing early since retrofitting purity into evaluation logic later is painful.

## Data Flow

### Real-Time Market Data Flow (replaces current broadcast-to-all)

```
Exchange WS stream (per exchange)
    ↓
Exchange Adapter (normalizes payload → NormalizedTicker/NormalizedOrderBook)
    ↓
Internal Message Bus (publish to topic: ticker:{exchange}:{symbol})
    ↓                                   ↓
Realtime Gateway (fan-out to      Alert Evaluation Service
subscribed clients only)          (evaluates user rules,
    ↓                              publishes alert:{userId} on match)
Frontend (client only receives        ↓
topics it explicitly subscribed  Notification delivery
to via UI — e.g. watched pairs)  (WS push / email / push notification)
```

### Backtest Flow (offline, decoupled from live path)

```
User submits backtest request (symbol, exchange, date range, rule/strategy params)
    ↓
Backtest Runner fetches historical candles
   (from exchange REST API and/or locally cached OHLCV store)
    ↓
Replay loop feeds candles one-by-one into the SAME rule-evaluator
used by Alert Evaluation Service
    ↓
Runner accumulates simulated signals/trades → computes performance metrics
    ↓
Result persisted (Backtest Results table) → Reporting Service surfaces it
```

### Settings/Credentials Flow (security-critical, unchanged in shape from legacy but hardened)

```
Frontend submits exchange API key/secret (HTTPS only)
    ↓
Settings Controller validates input
    ↓
Credential Vault encrypts (AES-GCM, random IV per record — NOT the legacy fixed-IV/hardcoded-key pattern)
    ↓
Persisted encrypted; plaintext never logged, never returned in API responses
    ↓
On use: Exchange Adapter requests decrypted credentials just-in-time,
holds them in memory only for the duration of the adapter call/stream setup
```

### Key Data Flows

1. **Live ticker/book to dashboard:** Exchange adapter → bus topic → gateway subscription lookup → only interested clients. This is the single biggest architectural change from the legacy system (`app.em.ts` forEach broadcast) and should be a foundational decision, not a later optimization.
2. **Alert evaluation piggybacks on the same bus topics** consumed for live dashboard data — no separate polling loop against exchanges is needed for alerts.
3. **Backtesting is intentionally offline/pull-based** (historical REST fetch + replay), not wired into the live bus — keeps it from competing for real-time resources and keeps live-path latency unaffected by potentially long-running backtest jobs (run backtests as background jobs/worker, not inline in the request-response cycle).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user / dev-personal (this project's actual current scale — single-tenant, out of scope for multi-tenant) | Single Node.js process; in-process EventEmitter as the bus; `Map`-based subscription registry; one WS server instance is entirely sufficient |
| A handful of exchanges × dozens of symbols, still single instance | Still fine in one process; the important thing is topic-based subscription (Pattern 2), not the bus transport — this avoids wasted CPU/bandwidth on unwatched pairs even without horizontal scaling |
| Multiple backend instances / horizontal scale (future, not required now) | Swap `in-memory-bus` for `redis-bus` (same `IEventBus` interface) so adapters running on one instance can feed WS gateways running on others; WS gateway instances must be stateless re: business logic (subscription state can live per-instance since clients reconnect to one instance, or centralize in Redis if session affinity isn't guaranteed by the load balancer) |

### Scaling Priorities

1. **First bottleneck (even at small scale):** naive broadcast-to-all, not connection count — fix via topic-based subscriptions (Pattern 2) regardless of how many users the system ultimately has, since this is a correctness/efficiency issue, not just a scale issue.
2. **Second bottleneck (only relevant if the project later adds multi-tenancy or many concurrent watched symbols):** single-process bus becomes a limit only when running multiple backend instances — defer the Redis swap until horizontal scaling is actually needed; the `IEventBus` interface makes this a low-cost future change, not a blocker now.

## Anti-Patterns

### Anti-Pattern 1: Broadcast-to-all WebSocket fan-out (the legacy system's current design)

**What people do:** Loop over every connected client and send every piece of market data to everyone, regardless of what they're viewing (`backend/src/app.em.ts` in the legacy codebase).

**Why it's wrong:** Wastes bandwidth/CPU proportional to (clients × symbols × exchanges) instead of (clients × symbols they actually watch); makes adding a second exchange or more symbols directly degrade every client's experience; leaks data across symbols a client never asked for.

**Do this instead:** Topic-based subscription registry (Pattern 2) — clients explicitly subscribe to the symbols/exchanges they're viewing; server only pushes to interested sockets.

### Anti-Pattern 2: Exchange-specific logic leaking into business/service layer

**What people do:** Call `node-binance-api` (or any single exchange SDK) directly from services, controllers, or the WebSocket monitor, as the legacy `backend/src/utils/exchange.ts` factory does.

**Why it's wrong:** Every new exchange requires touching every call site; symbol formats, rate limits, and error shapes differ per exchange and end up scattered through business logic instead of centralized; makes testing require mocking a specific exchange SDK everywhere.

**Do this instead:** Exchange Adapter Layer (Pattern 1) — all exchange-specific code lives behind `IExchangeAdapter`; services/controllers only see normalized domain types.

### Anti-Pattern 3: Separate, divergent implementations for backtesting vs. live alerting

**What people do:** Build the backtest engine as an isolated tool with its own copy of "does this rule trigger" logic, written independently from the live alert evaluator.

**Why it's wrong:** The two implementations drift over time; a backtest can show a strategy "works" while the live alert logic behaves subtly differently (different edge-case handling, different rounding, different rule syntax) — this is the classic backtest/live mismatch that undermines trust in backtest results.

**Do this instead:** Shared, pure `strategy/rule-evaluator` module consumed by both the live Alert Evaluation Service (fed live ticks) and the Backtest Runner (fed historical candles) — same code, different event source (Pattern 3).

### Anti-Pattern 4: Decrypting and holding exchange credentials broadly in process memory / logging them

**What people do:** Decrypt API keys/secrets once at startup or on every request and pass them around loosely, or log request/response bodies that include them (legacy system logs `secretKey`, returns it in API responses).

**Why it's wrong:** Increases the blast radius of a memory dump, log leak, or error-reporting tool capturing sensitive data; legacy system also uses a hardcoded fallback AES key and fixed IV, which defeats the encryption entirely.

**Do this instead:** Centralize decrypt-on-demand in the Credential Vault, scoped tightly to the exchange adapter call that needs it; never include credentials in logs or API responses; use random IV per encryption and a properly managed key (env var at minimum, external secret manager ideally); this is explicitly already flagged in this project's own `CONCERNS.md` and must be fixed as part of the rewrite, not carried forward.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Binance (and future: Bybit, Kraken, etc.) | REST for symbols/balance/historical candles + native WebSocket for ticker/book/user-data streams, all behind `IExchangeAdapter` | Consider CCXT for the REST portion (unified symbol/precision handling, built-in rate limiting) to reduce per-exchange boilerplate; `ccxt.pro` streaming is a separate commercial add-on — evaluate vs. hand-rolled WS normalization before committing |
| Secrets/credential storage | AES-GCM encryption at rest at minimum; ideally an external vault (e.g., Azure Key Vault or equivalent if staying on Azure, or HashiCorp Vault otherwise) referenced by ID rather than storing ciphertext directly in the app DB | Legacy system's hardcoded key + fixed IV is a critical, in-scope fix per PROJECT.md constraints |
| Notification delivery (for price alerts) | Push over the existing authenticated WebSocket channel for in-app alerts; optionally email/webhook for out-of-app delivery | Keep this as a pluggable output from Alert Evaluation Service, not hardcoded to one channel, since notification channels are likely to expand |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API Gateway ↔ Exchange Adapter Layer | Direct function calls through `ExchangeRegistry.get(exchangeId)` | Synchronous, used for REST-style operations (get balance, sync symbols) |
| Exchange Adapter Layer ↔ Realtime Gateway | Internal Message Bus (publish/subscribe), never direct references | Decouples adapters from delivery — adapters don't need to know how many clients exist or care about WS at all |
| Realtime Gateway ↔ Frontend | WebSocket, topic-based subscribe/unsubscribe messages, JWT auth on connect (not in URL query string — legacy system's JWT-in-URL is an in-scope fix) | Client explicitly declares interest; server enforces per-user authorization on private topics (e.g., `account:{userId}`) |
| Alert Evaluation Service ↔ Internal Message Bus | Subscribes to same market-data topics as Realtime Gateway | No separate polling path against exchanges needed for alerts |
| Backtesting Engine ↔ Strategy/Rule module | Direct import/call, shared with Alert Evaluation Service | Enforces logic parity between live and historical evaluation |
| Backtesting Engine ↔ Persistence/Exchange REST | Pull-based, on-demand or background job | Not on the live real-time path; can run as an async job queue if backtests become long-running |

## Suggested Build Order (dependency-driven, informs roadmap phasing)

1. **Exchange Adapter Layer + normalized domain types**, built with Binance as the first (not the only) implementation. This must exist before anything else touches exchange data, since retrofitting it after a Binance-only rewrite would repeat the mistake the current milestone is trying to fix.
2. **Core rewrite of auth, settings/credentials (with Credential Vault), and symbol sync**, consuming the adapter layer. Security fixes (encryption, JWT handling, CORS) belong here since they're foundational, not deferrable.
3. **Realtime Gateway with topic-based subscriptions**, fed by the adapter layer through the Internal Message Bus (in-process implementation is sufficient at this stage). This replaces the legacy broadcast-and-forget WebSocket design.
4. **Shared Strategy/Rule Evaluation module**, introduced once real-time data flow is stable — this is the shared foundation for both alerts and backtesting, so building it before either feature avoids duplicating logic later.
5. **Price Alerts**, as a consumer of the Message Bus + Rule Evaluation module. Can be added as a genuinely additive feature without touching the adapter or gateway layers, provided step 3's bus/topic design is already in place.
6. **Backtesting Engine**, as a consumer of the Rule Evaluation module fed by historical data (pulled via the same Exchange Adapter's REST capability). Independent of the live path; can be built in parallel with or after Alerts.
7. **Performance Reporting**, reading from persisted backtest results and (if in scope) historical account/trade data — a thin layer on top of steps 2 and 6, safely last.

**Answer to the specific downstream question — can alerting/backtesting be added after the core rewrite without a rearchitecture?** Yes, *provided* the core rewrite establishes (a) the Exchange Adapter interface, (b) the topic-based Message Bus, and (c) a pure/shared Strategy evaluation module from the start. If the core rewrite instead hardcodes Binance calls into services and keeps broadcast-to-all WebSocket delivery (i.e., just re-implements the legacy shape in a new stack), then adding multi-exchange support, alerts, and backtesting later **would** require the same kind of rearchitecture this milestone already exists to avoid repeating.

## Sources

- [CCXT GitHub — unified trading API for 100+ exchanges](https://github.com/ccxt/ccxt) — HIGH confidence, official repo/docs
- [CCXT Python Guide (Bitget Academy)](https://www.bitget.com/academy/ccxt-crypto-trading) — MEDIUM confidence, third-party but consistent with official CCXT docs
- [Market Data Distribution: Order Book Snapshots, Deltas, and WebSocket Feed Design](https://hosseinnejati.medium.com/market-data-distribution-order-book-snapshots-deltas-and-websocket-feed-design-466ba56a0c23) — MEDIUM confidence, community architecture write-up, consistent with general pub/sub fan-out pattern
- [Scaling Pub/Sub with WebSockets and Redis (Ably)](https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis) — MEDIUM-HIGH confidence, vendor blog but well-established pattern (topic-based fan-out via Redis)
- [Event-Driven Backtesting with Python — QuantStart](https://www.quantstart.com/articles/Event-Driven-Backtesting-with-Python-Part-I/) — MEDIUM confidence, widely cited reference for event-driven backtester design
- [PyEventBT documentation — unified backtest/live strategy code](https://pyeventbt.com/) — MEDIUM confidence, smaller project but explicitly documents the shared-code pattern also echoed in QuantStart and general industry practice
- Project's own `.planning/codebase/ARCHITECTURE.md` and `CONCERNS.md` (legacy system analysis) — used to identify the specific anti-patterns being corrected

---
*Architecture research for: multi-exchange crypto trading bot*
*Researched: 2026-09-12*
