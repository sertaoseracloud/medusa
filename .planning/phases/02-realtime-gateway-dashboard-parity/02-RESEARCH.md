# Phase 2: Realtime Gateway & Dashboard Parity - Research

**Researched:** 2026-09-13
**Domain:** Fastify WebSocket gateway (pub/sub), Binance native WebSocket streams, React real-time client state, TradingView embed
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** O book de ofertas mostra profundidade com múltiplos níveis, não só o melhor bid/ask do sistema legado — isso é uma melhoria sobre a paridade legada (legado usava só `bookTicker`), aceita explicitamente pelo usuário.
- **D-02:** Profundidade de 10 níveis de cada lado (bid/ask), usando o partial depth stream nativo da Binance (`depth10@100ms`) — sem agregação manual de order book.
- **D-03:** O painel de saldo mostra **todos os ativos** retornados pela conta Binance (não filtrado por saldo > 0) — decisão explícita do usuário, contrária à recomendação (que era filtrar por saldo > 0 para evitar uma lista de 300+ ativos majoritariamente zerados). O planner/executor deve implementar sem filtro de saldo mínimo.
- **D-04:** Quando o WebSocket do cliente cai, o dashboard mostra um banner discreto ("Reconectando...") mas mantém os últimos valores de ticker/book/saldo visíveis (não zera nem esconde) até a reconexão suceder.
- **D-05:** Se o stream servidor→Binance cair (não o WS do cliente), o backend tenta reconectar automaticamente com backoff exponencial — não espera um restart manual do processo. Consistente com D-16 da Fase 1 (boot não trava se a Binance estiver indisponível), estendido aqui para reconexão em runtime, não só no boot.
- **D-06:** A normalização dos streams de WebSocket da Binance (ticker, book, saldo/execuções) é feita manualmente sobre a API nativa de WebSocket da Binance — **não usar ccxt.pro** (biblioteca paga). Resolve o bloqueio registrado em STATE.md. A Fase 1 já usa `ccxt` (gratuito) só para REST via `IExchangeAdapter`, então a extensão natural é adicionar métodos de streaming sobre esse mesmo adapter, não trocar de biblioteca.
- **D-07:** O usuário escolhe qual par acompanhar via um dropdown com busca, reaproveitando o endpoint `GET /symbols` (com filtro por moeda de cotação/busca) já construído na Fase 1 — ao trocar de par, o dashboard resubscreve os tópicos daquele símbolo (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`).
- **D-08:** O par selecionado persiste entre sessões via `localStorage` (mesmo padrão já usado para os tokens de autenticação na Fase 1) — o usuário não precisa reescolher o par toda vez que abre o dashboard.
- **D-09 (fora de escopo, registrado para não reabrir depois):** Múltiplos pares simultâneos (lista de favoritos/watchlist) foi explicitamente rejeitado como escopo desta fase — usuário optou por seleção single-symbol via dropdown, não uma capacidade de watchlist.

### Claude's Discretion
- Estrutura exata do payload de cada tópico (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`, `account:{userId}`) — os nomes de tópico já vêm de `research/ARCHITECTURE.md`; o formato exato do payload JSON fica a critério do planner/executor.
- Parâmetros exatos do backoff exponencial (delay inicial, fator de multiplicação, teto máximo) para a reconexão servidor→Binance (D-05).
- Biblioteca cliente para o WebSocket do frontend (nativa `WebSocket` do browser vs. uma lib como `reconnecting-websocket`) — desde que implemente o comportamento de D-04.

### Deferred Ideas (OUT OF SCOPE)
- **Lista de favoritos / múltiplos pares simultâneos no dashboard** — o usuário considerou mas optou por seleção single-symbol nesta fase (D-09). Se o produto evoluir para acompanhar vários pares ao mesmo tempo, isso é uma capacidade nova para uma fase futura (possivelmente parte do v2, junto com multi-exchange).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| SEC-06 | Autenticação de WebSocket via handshake/primeira mensagem (não via token na URL) | Pattern 1 (WS First-Message Auth Handshake), Security Domain V2/V3/V4, Pitfall 4 |
| RT-01 | Distribuição de dados em tempo real via pub/sub por tópico (não broadcast para todos os clientes) | Architecture Patterns (subscription-registry, topics.ts), System Architecture Diagram, Anti-Pattern "Broadcasting every event" |
| RT-02 | Dashboard com dados em tempo real via WebSocket (mini ticker, book de ofertas, saldo) — paridade com o sistema legado, estendida por D-01/D-02/D-03 | Pattern 2 (miniTicker + depth10@100ms), Pattern 3 (listenKey lifecycle), Pitfall 1 |
| RT-03 | Widget de gráfico TradingView preservado no dashboard | Pattern 5 (TradingView free widget symbol change), Pitfall 2 |
| TEST-02 | Validação manual de UAT via navegador (Claude Browser) simulando a visão do usuário final | Validation Architecture section (automated coverage) complements, does not replace, the manual UAT step |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Backend: TypeScript strict, Fastify (not Express), modular hexagonal structure per module (`domain/application/infrastructure`) — the new `realtime/` module should follow the same layering conventions established in Phase 1's `modules/auth/`.
- Naming conventions: kebab-case files with role suffixes (`.service.ts`, `.repository.ts`, `.routes.ts`); this phase introduces new suffix-free files (`ws-server.ts`, `subscription-registry.ts`, `topics.ts`) matching `research/ARCHITECTURE.md`'s already-approved structure, not the module suffix convention — acceptable since `realtime/` and `bus/` are cross-cutting infrastructure, not a `modules/*` feature slice.
- Central error handler pattern (`registerErrorHandler(app)` in `app.ts`) — WebSocket connections need their own error handling for handshake/message failures (not routed through the REST error handler), but error message format/shape should stay consistent with the REST error envelope where practical.
- No `@ts-ignore`/`any` escape hatches encouraged by project convention notes (legacy codebase overused these; Phase 1 explicitly avoided `as any` per its summaries) — the WS code examples in this research use `as any` only for illustrative socket property attachment and should be replaced with a proper typed socket interface during planning/implementation.
- Security surface (CONCERNS.md) must be fully corrected, not carried forward — this phase's WS auth/CORS/heartbeat patterns directly address three named CONCERNS.md items (token-in-URL, backwards CORS check, no heartbeat/reconnect).
- Tests required as part of v1 scope (TEST-01) — Vitest is the established framework (Phase 1); this phase's Wave 0 gaps (see Validation Architecture) must be filled, not deferred.

## Summary

This phase replaces the legacy broadcast-to-all, token-in-URL WebSocket gateway with a topic-scoped pub/sub layer built on `@fastify/websocket` (the current, actively maintained successor to the deprecated `fastify-websocket`), reusing the same `@fastify/jwt` verification Phase 1 already wired up for REST — but via a first-message handshake instead of a URL query param. On the exchange side, Binance's native WebSocket streams (`<symbol>@miniTicker`, `<symbol>@depth10@100ms`, and the listenKey-based user data stream) are consumed directly and normalized by hand inside `BinanceAdapter`, per D-06 (no `ccxt.pro`). The user data stream carries a real operational pitfall: the `listenKey` silently expires after 60 minutes without a periodic `PUT /api/v3/userDataStream` keepalive call, which must be scheduled independently of the WebSocket connection's own lifecycle. On the frontend, the existing pattern (Context + Provider + hook, matching `contexts/auth`) is reused for a new `contexts/realtime` (or `websocket`) module; a small, single-purpose reconnection helper (`reconnecting-websocket`) is a reasonable fit given the project currently has zero WS client code, though native `WebSocket` + a hand-rolled backoff loop is also viable and was left to discretion in CONTEXT.md — this research recommends the library for its maturity on the reconnect/backoff/heartbeat edge cases, with an explicit legitimacy caveat (see Package Legitimacy Audit) given its age. The TradingView chart is embedded via the free, public "Advanced Real-Time Chart" widget script (`tv.js`) — **not** the licensed Charting Library — which does **not** expose a `setSymbol()` runtime API; the practical pattern for changing the watched symbol is destroying and recreating the `TradingView.widget(...)` instance (or remounting the React wrapper component) with a new `symbol` option, not calling a widget method.

**Primary recommendation:** Build `realtime/ws-server.ts` on `@fastify/websocket@11.x`, authenticate via a first WS message (`{type: "auth", token}`) verified through the existing `app.jwt.verify()`, fan out over a `Map<topic, Set<WebSocket>>` registry fed by an in-process `EventEmitter` bus (per `research/ARCHITECTURE.md`), extend `BinanceAdapter` (not replace) with `subscribeTicker`/`subscribeOrderBook`/`subscribeUserData` methods wrapping raw `ws` connections to `wss://stream.binance.com:9443`, and manage the userData `listenKey` keepalive on its own 30-minute interval timer, decoupled from Binance stream reconnect logic.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WS client auth (SEC-06 handshake) | API/Backend (Realtime Gateway) | Browser/Client (sends token as first message) | Same JWT verification as REST; must happen server-side, cannot be trusted from client |
| Topic subscription registry | API/Backend (Realtime Gateway) | — | In-process bookkeeping (`Map<topic, Set<WebSocket>>`); no external infra needed at this scale |
| Binance stream connection + normalization | API/Backend (Exchange Adapter Layer) | — | Server holds one shared outbound connection per stream type, independent of client connection count |
| listenKey lifecycle (create/keepalive/close) | API/Backend (Exchange Adapter Layer) | — | Pure server-side REST scheduling concern, invisible to clients |
| Server→Binance reconnect w/ backoff (D-05) | API/Backend (Realtime Gateway / Exchange Adapter) | — | Must survive independently of any single client connection |
| Client WS reconnect + banner (D-04) | Browser/Client | — | Purely a UI/UX concern; server has no visibility into individual client reconnect state beyond re-auth |
| Symbol selection + localStorage persistence (D-07/D-08) | Browser/Client | API/Backend (`GET /symbols`, reused from Phase 1) | Selection state is client-local; data source is the existing REST endpoint |
| Order book depth rendering (10 levels, D-01/D-02) | Browser/Client | — | Binance already provides the aggregated 10-level snapshot; client only renders, no aggregation logic needed |
| Balance panel (all assets, D-03) | Browser/Client | API/Backend (`account:{userId}` topic) | Server pushes normalized balance array unfiltered; client renders all rows without a min-balance filter |
| TradingView chart (RT-03) | Browser/Client | — | Pure client-side third-party embed; no backend involvement |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/websocket` | 11.3.0 [VERIFIED: npm registry] | WS route registration inside the existing Fastify app | Official Fastify ecosystem plugin (successor to deprecated `fastify-websocket`); integrates with existing `app.jwt` decorator and route-level hooks |
| `ws` | 8.21.3 [VERIFIED: npm registry] (transitive, via `@fastify/websocket`) | Underlying WebSocket implementation for both the Fastify server and the outbound Binance connections | De facto standard Node WS library; already a transitive dependency, no need to add a second WS client library for the Binance-outbound side |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `reconnecting-websocket` | 4.4.0 [ASSUMED — training data + WebSearch, registry-verified only] | Frontend WS client with built-in exponential backoff reconnect | If choosing a library over hand-rolled reconnect logic (Claude's Discretion per CONTEXT.md) — mature, WebSocket-API-compatible drop-in wrapper |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `reconnecting-websocket` | Native `WebSocket` + hand-rolled backoff (`setTimeout` loop with jitter) | Zero new dependency, full control over the D-04 banner-state transitions; more code to write and test for edge cases (network offline events, visibility change, duplicate-connection races) that the library already handles |
| In-process `EventEmitter` bus | Redis Pub/Sub | Redis is unnecessary at this project's single-instance scale (per `research/ARCHITECTURE.md` Scaling Considerations) — would add operational surface (a Redis instance/connection) with zero benefit until horizontal scaling is a real requirement |
| Hand-rolled Binance stream normalization (D-06, locked) | `ccxt.pro` | Rejected by user decision — paid/commercial licensing, not justified for single-user scale |

**Installation:**
```bash
# Backend
cd backend && npm install @fastify/websocket

# Frontend (only if the discretion decision favors a library over native WebSocket)
cd frontend && npm install reconnecting-websocket
```

**Version verification:** `npm view @fastify/websocket version` → `11.3.0`, published 2026-09-04 (confirmed via `npm view @fastify/websocket time.modified`). `npm view reconnecting-websocket version` → `4.4.0`, last published 2022-06-26 — the package is stable but has not shipped a release in several years; still the most-downloaded (760k+/week) WS reconnect wrapper and API-compatible with the native `WebSocket` interface, so the age reflects feature completeness for a narrow problem more than abandonment, but the planner should still gate its install behind a `checkpoint:human-verify` per the audit below.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `@fastify/websocket` | npm | new major (11.x, 2026-09) under a package first published years earlier as `fastify-websocket` | ~268k/week | github.com/fastify/fastify-websocket | OK | Approved |
| `reconnecting-websocket` | npm | 4.4.0 published 2022-06-26 (~4 years stale) | ~764k/week | github.com/pladaria/reconnecting-websocket | OK | Approved, flagged for staleness |
| `ws` | npm | long-established, transitive dep only | very high | github.com/websockets/ws | OK (not directly installed, already present via Fastify ecosystem) | No action — already a transitive dependency |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none blocked by slopcheck, but `reconnecting-websocket`'s last-publish date (2022) is called out here for planner awareness — not a slopcheck finding, a manual staleness observation. No `postinstall` scripts detected on either package (`npm view <pkg> scripts.postinstall` returned empty for both).

*Both packages passed `npm view <pkg> version` registry existence checks and `slopcheck install --ecosystem npm` (`[OK]` verdict for both, confirmed 2026-09-13). Per the package name provenance rule, both package names originated from WebSearch/training knowledge rather than an authoritative source (Context7/official docs), so they remain tagged `[ASSUMED]` in the Standard Stack table above despite the clean slopcheck/registry result — the planner should still gate `reconnecting-websocket` (the one actually net-new to package.json; `@fastify/websocket` is an official first-party Fastify org package and lower risk) behind a `checkpoint:human-verify` before install.*

## Architecture Patterns

### System Architecture Diagram

```
Browser (React Dashboard)
  │
  │ 1. GET /symbols?query= (REST, reused from Phase 1)     ─────────────┐
  │ 2. user selects symbol → localStorage persists choice               │
  ▼                                                                      │
Frontend WS client (contexts/realtime)                                  │
  │ connects: wss://.../realtime                                        │
  │ sends first message: {type:"auth", token: <accessToken>}            │
  │ then: {type:"subscribe", topic:"ticker:binance:BTCUSDT"}            │
  │       {type:"subscribe", topic:"book:binance:BTCUSDT"}              │
  │       {type:"subscribe", topic:"account:{userId}"}                 │
  ▼                                                                      │
┌─────────────────────────────────────────────────────────────────┐    │
│ Fastify Realtime Gateway (realtime/ws-server.ts)                  │    │
│  - on connection: wait for first message only (no other handler   │    │
│    registered yet) → verify via app.jwt.verify(token)             │    │
│    → reject + close(4001) if invalid/missing (SEC-06)             │    │
│  - on "subscribe": subscription-registry.subscribe(topic, socket)  │    │
│    (private topics like account:{userId} checked against the      │    │
│     authenticated user's own id before allowing subscription)      │    │
│  - on socket close: subscription-registry cleanup (remove from all │    │
│    topic sets) — fixes legacy memory-leak fragile area             │    │
└───────────────────────────┬────────────────────────────────────┘    │
                            │ fan-out only to subscribed sockets        │
                            ▲                                           │
                 publishes  │                                           │
┌───────────────────────────┴────────────────────────────────────┐    │
│ Internal Message Bus (bus/in-memory-bus.ts, EventEmitter)         │    │
└───────────────────────────┬────────────────────────────────────┘    │
                            │ normalized events                        │
┌───────────────────────────┴────────────────────────────────────┐    │
│ BinanceAdapter (extended, not replaced — exchanges/binance/)      │    │
│  subscribeTicker(symbol)   → wss://stream.binance.com:9443/ws/    │    │
│                               <symbol>@miniTicker                 │    │
│  subscribeOrderBook(symbol)→ .../<symbol>@depth10@100ms           │    │
│  subscribeUserData(creds)  → POST /api/v3/userDataStream          │    │
│                               (get listenKey) → wss:.../<listenKey>│    │
│                               + PUT keepalive every 30 min          │    │
│  - each stream: own reconnect-with-backoff loop (D-05), independent│    │
│    of client WS connections and of each other                      │◄──┘ 3. dashboard renders ticker/book/
└──────────────────────────────────────────────────────────────────┘      balance from pushed topic messages;
                            │                                              on disconnect: banner shown, last
                            ▼                                              known values frozen (D-04)
                 Binance WebSocket servers
```

### Recommended Project Structure
```
backend/src/
├── realtime/
│   ├── ws-server.ts              # Fastify WS route, handshake auth, message routing
│   ├── subscription-registry.ts  # Map<topic, Set<WebSocket>>, subscribe/unsubscribe/cleanup
│   └── topics.ts                 # topic string builders: tickerTopic(ex,sym), bookTopic(ex,sym), accountTopic(userId)
├── bus/
│   ├── event-bus.interface.ts    # publish/subscribe contract (IEventBus)
│   └── in-memory-bus.ts          # EventEmitter-backed implementation (MVP)
├── exchanges/binance/
│   ├── binance.adapter.ts        # EXTENDED: add subscribeTicker/subscribeOrderBook/subscribeUserData
│   ├── binance.stream.ts         # NEW: raw ws connections to stream.binance.com, normalization, reconnect/backoff
│   └── binance.user-data.ts      # NEW: listenKey create/keepalive(30min)/close lifecycle
frontend/src/
├── contexts/realtime/
│   └── index.tsx                 # Provider + useRealtime() hook: connect, auth-handshake, subscribe/unsubscribe, banner state
├── components/dashboard/
│   ├── TickerCard/
│   ├── OrderBookTable/
│   ├── BalanceTable/
│   ├── SymbolCombobox/
│   └── TradingViewChart/
```

### Pattern 1: WS First-Message Auth Handshake (SEC-06)

**What:** On connection, the server does not trust any query-param or header-based token. It registers exactly one `message` handler synchronously at connection time, expects the *first* message to be `{type: "auth", token: string}`, verifies it via the same `app.jwt.verify()`-equivalent used for REST (reusing `@fastify/jwt`'s registered secret), and only after successful verification does it register the subscribe/unsubscribe message handlers (or swaps the handler function). Any other first message, or an invalid/expired token, causes the server to close the socket with a specific close code (e.g. 4001) before any topic data is ever sent.

**When to use:** Always for this gateway — this is the direct fix for CONCERNS.md's "WebSocket Token in URL Parameter."

**Example:**
```typescript
// Source: pattern synthesized from @fastify/websocket docs (blog.logrocket.com/using-websockets-with-fastify,
// betterstack.com/community/guides/scaling-nodejs/fastify-websockets) + existing shared/http/authenticate.ts reuse
app.register(async function (fastify) {
  fastify.get('/realtime', { websocket: true }, (socket, req) => {
    let authenticated = false;

    socket.on('message', async (raw) => {
      const msg = JSON.parse(raw.toString());

      if (!authenticated) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          socket.close(4001, 'auth required as first message');
          return;
        }
        try {
          const decoded = fastify.jwt.verify(msg.token); // same verification used by authenticate.ts
          (socket as any).userId = decoded.sub;
          authenticated = true;
          socket.send(JSON.stringify({ type: 'auth_ok' }));
        } catch {
          socket.close(4001, 'invalid token');
        }
        return;
      }

      if (msg.type === 'subscribe') {
        // reject private topics (account:{userId}) that don't match (socket as any).userId
        subscriptionRegistry.subscribe(msg.topic, socket);
      }
    });

    socket.on('close', () => subscriptionRegistry.removeAll(socket));
  });
});
```

### Pattern 2: Binance Native Stream Consumption (miniTicker + depth10@100ms)

**What:** Connect directly to `wss://stream.binance.com:9443/ws/<symbol>@miniTicker` and `.../<symbol>@depth10@100ms` (lowercase symbol, e.g. `btcusdt`). Each stream delivers a JSON payload on its own cadence; the depth stream at the `@100ms` suffix pushes full 10-level snapshots (not deltas) every 100ms, so no manual order-book diffing/aggregation is required — directly satisfies D-02's "no manual order book aggregation."

**When to use:** For the ticker and book topics this phase requires.

**Example:**
```typescript
// Source: developers.binance.com/docs/binance-spot-api-docs/web-socket-streams (miniTicker, partial book depth)
import WebSocket from 'ws';

function subscribeOrderBook(symbol: string, onSnapshot: (b: NormalizedOrderBook) => void) {
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth10@100ms`);
  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    // data: { lastUpdateId, bids: [[price, qty], ...10], asks: [[price, qty], ...10] }
    onSnapshot({ symbol, bids: data.bids, asks: data.asks, lastUpdateId: data.lastUpdateId });
  });
  return ws; // caller wraps with reconnect-with-backoff (Pattern 4)
}
```

### Pattern 3: User Data Stream — listenKey Lifecycle (real pitfall)

**What:** The user data stream (balance + execution updates) is NOT authenticated via the symbol WS URL — it requires (1) `POST /api/v3/userDataStream` (signed with API key) to obtain a `listenKey`, (2) connecting to `wss://stream.binance.com:9443/ws/<listenKey>`, and (3) sending `PUT /api/v3/userDataStream?listenKey=<listenKey>` at least once every 60 minutes (Binance recommends ~30 minutes) or the stream is silently closed server-side with no warning to the open WebSocket connection.

**When to use:** For the `account:{userId}` balance topic (RT-02).

**Why this is a pitfall:** The listenKey keepalive is entirely independent of the WebSocket connection's own health — a perfectly healthy, un-dropped WebSocket connection will still be forcibly closed by Binance if the keepalive PUT is missed, and there is no client-side symptom until the close event fires. This must be implemented as its own `setInterval`, started the moment the listenKey is created, and torn down + a fresh listenKey obtained if the WS connection itself needs to reconnect (a stale listenKey cannot be reused indefinitely across reconnects without re-verifying it's still valid).

**How to avoid:** Schedule the keepalive interval (e.g. every 30 min) as soon as the listenKey is issued, independent of stream reconnect logic; on any reconnect of the user-data WS, treat it as an opportunity to also validate/refresh the listenKey rather than assuming the old one is still alive.

**Example:**
```typescript
// Source: developers.binance.com/docs/binance-spot-api-docs/user-data-stream,
// developers.binance.com/docs/derivatives/usds-margined-futures/user-data-streams/Keepalive-User-Data-Stream
async function startUserDataStream(creds: DecryptedCredentials) {
  const { listenKey } = await binanceRest.post('/api/v3/userDataStream', creds);
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${listenKey}`);

  const keepalive = setInterval(async () => {
    await binanceRest.put(`/api/v3/userDataStream?listenKey=${listenKey}`, creds); // recommended every ~30 min
  }, 30 * 60 * 1000);

  ws.on('close', () => clearInterval(keepalive)); // cleanup — do not leak the interval
  return { ws, listenKey };
}
```

### Pattern 4: Server-Side Reconnect-With-Backoff for Outbound Binance Streams (D-05)

**What:** Each of the three outbound Binance connections (ticker, book, userData) is wrapped in its own reconnect loop, independent of any client WebSocket connection. On `close`/`error`, wait an exponential backoff delay (e.g. start 1s, ×2 factor, cap at 30s, optional jitter) before reconnecting, and re-publish to the same bus topic once reconnected — clients never see this at the protocol level, only as a brief data gap.

**When to use:** For all three Binance-outbound stream types, per D-05 ("backend tenta reconectar automaticamente... não espera restart manual").

**Example:**
```typescript
function connectWithBackoff(connect: () => WebSocket, maxDelayMs = 30_000) {
  let delay = 1000;
  let ws: WebSocket;

  const attempt = () => {
    ws = connect();
    ws.on('open', () => { delay = 1000; }); // reset backoff on success
    ws.on('close', () => {
      setTimeout(attempt, delay);
      delay = Math.min(delay * 2, maxDelayMs);
    });
  };

  attempt();
}
```
Exact initial delay/factor/cap values are Claude's Discretion per CONTEXT.md — the above are reasonable industry-standard defaults, not a locked decision.

### Pattern 5: TradingView Free Widget Symbol Change (remount, not setSymbol)

**What:** The free "Advanced Real-Time Chart" embed (`tv.js`, `new TradingView.widget({...})`) is a different product from TradingView's licensed Charting Library — only the licensed library's `IChartingLibraryWidget` interface exposes a runtime `setSymbol()` method. The free embed widget has no public JS API for changing the symbol after construction; the documented/community pattern is to destroy the widget's container content and re-run `new TradingView.widget({...})` with the new `symbol` option (or, in React, unmount/remount the chart component keyed by the selected symbol).

**When to use:** Whenever the user changes the selected symbol via the combobox (D-07).

**How to avoid the pitfall:** Do not attempt to call `.setSymbol()` or similar on a `tv.js`-created widget instance expecting it to work like the Charting Library — it will not, since that method belongs to a different, license-gated product. Key the React wrapper component on the `symbol` prop (e.g. `<TradingViewChart key={symbol} symbol={symbol} />`) so React fully remounts the container and script initialization on symbol change, matching the "destroy and recreate" pattern.

**Example:**
```typescript
// Source: tradingview.com/widget-docs/widgets/charts/advanced-chart/,
// tradingview.com/widget-docs/tutorials/build-page/dynamic-symbols/ (documents the free-embed
// re-render approach vs. the licensed library's setSymbol — the two are for different products)
function TradingViewChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = ''; // clear previous widget instance
    // eslint-disable-next-line no-new
    new (window as any).TradingView.widget({
      symbol: `BINANCE:${symbol}`,
      container_id: containerRef.current.id,
      autosize: true,
      theme: 'dark',
    });
  }, [symbol]); // full re-init on symbol change — there is no setSymbol on this widget

  return <div id="tv-chart-container" ref={containerRef} />;
}
```

### Anti-Patterns to Avoid
- **Trusting a token in the WS upgrade URL:** the exact legacy defect (`app.ws.ts` line 27/34) — replaced by Pattern 1.
- **Broadcasting every event to every connected client:** the exact legacy defect (`app.em.ts` lines 16-23) — replaced by the subscription-registry fan-out.
- **Reusing one listenKey indefinitely without keepalive:** silently drops the balance stream after 60 minutes with no client-visible error until the socket closes.
- **Expecting `setSymbol()` on the free TradingView embed:** that API only exists on the paid Charting Library; calling it on a `tv.js` widget instance will throw/no-op.
- **Coupling the server→Binance reconnect loop to any single client's WebSocket lifecycle:** the Binance-side streams must stay alive (or independently reconnect) regardless of how many/few clients are currently connected — this is what makes D-05 correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side WS reconnect/backoff state machine (D-04's underlying mechanics) | A custom `setTimeout` retry loop with manual online/offline/visibility edge-case handling | `reconnecting-websocket` (if the discretion decision favors a library) | Handles reconnect timing, close-code differentiation, and buffering edge cases that are easy to get subtly wrong on the first attempt; drop-in `WebSocket`-compatible API means minimal integration cost |
| Order book depth aggregation from raw diff/delta streams | A manual bid/ask merge-and-sort structure | Binance's `depth10@100ms` partial-snapshot stream (already aggregated server-side) | D-02 explicitly avoids this — Binance sends a ready-to-render 10-level snapshot on every tick, so building a local order book from `depthUpdate` diffs would be solving a harder problem than this phase requires |
| JWT verification logic for the WS handshake | A second, parallel JWT verify implementation inside `realtime/` | The same `@fastify/jwt` instance/secret already registered in `app.ts` (`fastify.jwt.verify()`), mirroring `shared/http/authenticate.ts`'s error-mapping approach | Two independent JWT verification code paths is exactly the kind of drift that causes security bugs — one path, reused, is the whole point of SEC-06's "reuse the same verification" |

**Key insight:** every piece of this phase that looks like it needs custom protocol logic (order book merging, reconnect backoff, JWT verification) already has a standard, narrower-scope answer — Binance's own partial-depth stream, a mature reconnect wrapper, and the existing `@fastify/jwt` instance, respectively. The only genuinely new hand-rolled code this phase requires is the topic subscription registry and the listenKey lifecycle scheduler, both of which are inherently project-specific glue, not solved problems with an off-the-shelf library.

## Common Pitfalls

### Pitfall 1: listenKey silent expiration
**What goes wrong:** The user data (balance) stream stops updating after ~60 minutes with no error surfaced to the connected client.
**Why it happens:** Binance closes the underlying stream server-side if no keepalive PUT is received; the WebSocket `close` event is the only signal, and it looks identical to any other disconnect.
**How to avoid:** Independent `setInterval` keepalive (every ~30 min) starting the moment the listenKey is issued; treat any userData WS reconnect as a trigger to also verify/refresh the listenKey.
**Warning signs:** Balance panel silently freezing while ticker/book keep updating (isolates the problem to the userData stream specifically).

### Pitfall 2: Confusing the free TradingView embed with the licensed Charting Library API surface
**What goes wrong:** Code is written assuming `widget.setSymbol('BINANCEUSDT')` works, based on Charting Library documentation/tutorials that surface prominently in search results.
**Why it happens:** TradingView's documentation covers both products under similar URLs (`widget-docs/tutorials/...`), and the "dynamic symbol" tutorial content is easy to conflate across the two products.
**How to avoid:** Confirm which script is loaded (`tv.js` = free embed, no `setSymbol`) before assuming any widget-instance API exists; use the remount pattern (Pattern 5) instead.
**Warning signs:** `TypeError: widget.setSymbol is not a function` or the chart simply not updating when the option object is mutated post-construction.

### Pitfall 3: Client WS reconnect state clobbering "frozen last-known data" (D-04)
**What goes wrong:** On disconnect, the naive implementation clears ticker/book/balance state to `null`/`undefined`, causing the UI to blank out instead of showing stale-but-present data with a banner.
**Why it happens:** It's natural to reset state on `onclose` the same way `onerror` is handled; but D-04 explicitly requires the opposite — keep rendering the last received values.
**How to avoid:** Model connection status (`connected` / `reconnecting` / `failed`) as state fully separate from the last-received ticker/book/balance payloads; only the banner visibility reacts to connection status, the data-rendering components never get reset on disconnect.
**Warning signs:** Dashboard flashing to empty/skeleton state on every brief network blip instead of showing the discreet banner over frozen data.

### Pitfall 4: Private topic authorization gap
**What goes wrong:** A client subscribes to `account:{someOtherUserId}` and the server happily adds it to that topic's socket set, leaking another user's balance data.
**Why it happens:** The subscription-registry as sketched in `research/ARCHITECTURE.md` is topic-agnostic by design (any client can request any topic string); it does not itself enforce per-user authorization on `account:{userId}` topics.
**How to avoid:** The `subscribe` message handler must check that a requested `account:{userId}` topic's `{userId}` matches the authenticated socket's own `userId` (set during the Pattern-1 handshake) before registering the subscription; `ticker:*`/`book:*` topics are public and need no such check.
**Warning signs:** No automated test exists that attempts cross-user subscription and asserts rejection — this is the kind of gap that only surfaces via a targeted security test, not general functional testing.

## Code Examples

See Architecture Patterns section above (Patterns 1–5) — each includes a sourced, runnable code example for: WS handshake auth, Binance ticker/book stream consumption, listenKey lifecycle, server-side reconnect-with-backoff, and TradingView symbol-change-by-remount.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `fastify-websocket` (deprecated package name) | `@fastify/websocket` (moved under the official `@fastify` npm org) | package renamed/moved to official scope prior to v5; current major is 11.x | Any tutorial referencing the old unscoped package name is stale — install the scoped package |
| `bookTicker` (best bid/ask only) | `depth10@100ms` partial book depth (10 levels) | N/A — both streams have coexisted for years; this is a project-level choice (D-02), not a Binance API change | Legacy system used the older/simpler stream; this phase intentionally upgrades to a richer stream, which is why it's called out as "not paridade, um upgrade" in CONTEXT.md |

**Deprecated/outdated:**
- `fastify-websocket` (unscoped) — deprecated in favor of `@fastify/websocket`; do not install the old package name.
- `node-binance-api`'s built-in WS wrapper (used by the legacy system) — this phase intentionally bypasses it per D-06, connecting to Binance's native WS endpoints directly instead of through any exchange-specific WS wrapper library.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `reconnecting-websocket` (pladaria/reconnecting-websocket, v4.4.0) is the correct/best-fit package name for a frontend WS reconnect helper | Standard Stack, Don't Hand-Roll | If the planner installs a different or hallucinated package sharing a similar name, functionality could differ; mitigated by registry+slopcheck verification already performed, but the package *identity* (that this is the "recommended" one vs. e.g. `robust-websocket` or a hand-rolled approach) is a judgment call, not a verified fact |
| A2 | The TradingView free embed widget (`tv.js`) has no runtime `setSymbol()`/equivalent API, and only the licensed Charting Library exposes `IChartingLibraryWidget.setSymbol()` | Architecture Patterns (Pattern 5), Common Pitfalls (Pitfall 2) | If TradingView has since added a limited public API to the free embed that this research missed, the recommended "remount on symbol change" approach is still correct/safe but potentially more heavyweight than necessary — low risk either way since remounting is a valid fallback regardless |
| A3 | Binance recommends userData keepalive "about every 30 minutes" against a 60-minute expiry, and this cadence is safe under Node `setInterval` drift/backgrounding on a typical server host | Architecture Patterns (Pattern 3), Common Pitfalls (Pitfall 1) | If the interval is missed once (e.g., process restart without immediate rescheduling) the balance stream silently goes stale until manually reconnected — mitigated by tying keepalive scheduling to listenKey creation, but worth an explicit test/monitor |

## Open Questions

1. **Exact backoff parameters for server→Binance reconnect (D-05)**
   - What we know: exponential backoff with a cap is the standard pattern (Pattern 4 above uses 1s start, ×2, 30s cap as illustrative defaults).
   - What's unclear: whether the project wants jitter, a maximum retry count before alerting an operator, or specific values tuned to Binance's own rate-limit/ban behavior for reconnect storms.
   - Recommendation: Leave as Claude's Discretion per CONTEXT.md; the planner should pick concrete values (this research's defaults are a reasonable starting point) and document them in the plan rather than leaving them implicit in code.

2. **Frontend WS client: library vs. hand-rolled (Claude's Discretion per CONTEXT.md)**
   - What we know: both approaches satisfy D-04's behavioral requirement; `reconnecting-websocket` is mature but has not been released in ~4 years; hand-rolled requires more test surface but zero new dependency.
   - What's unclear: which the planner/executor should actually choose — this research recommends the library given the zero-existing-WS-client-code context, but does not lock the decision.
   - Recommendation: Planner should make an explicit choice and document it in the phase plan (not defer implicitly to the executor).

3. **Depth stream reconnect and lastUpdateId continuity**
   - What we know: `depth10@100ms` sends full snapshots (not deltas), so there is no "resume from last update" concern on reconnect — a fresh connection just starts receiving fresh snapshots.
   - What's unclear: whether the client should show a brief "stale" indicator for the book specifically during the ~1-3 seconds of a Binance-side reconnect, separate from the D-04 client-WS banner (which is about the client↔server connection, not server↔Binance).
   - Recommendation: Out of scope to solve definitively in research; the planner should decide whether book/ticker topic messages need a `stale: true` flag surfaced during a server-side Binance reconnect, or whether the brief gap is acceptable to leave unsignaled given D-05 already keeps reconnects fast.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ | (project uses Node LTS per FOUND-01) | — |
| npm | Package installation | ✓ | 11.11.0 | — |
| Outbound network access to `stream.binance.com:9443` | Binance native WS streams | Not verified from this sandboxed research environment — assumed available in the actual deployment target | — | If blocked (e.g. corporate firewall/dev sandbox), the executor must verify connectivity to Binance's WS endpoints before implementation, separate from this research pass |
| `@fastify/websocket` | Realtime Gateway (RT-01, SEC-06) | ✓ (registry-verified, not yet installed in `backend/package.json`) | 11.3.0 | — |
| `reconnecting-websocket` | Frontend WS reconnect (D-04, if library chosen) | ✓ (registry-verified, not yet installed in `frontend/package.json`) | 4.4.0 | Native `WebSocket` + hand-rolled backoff |
| TradingView `tv.js` CDN script | Chart widget (RT-03) | ✓ (already referenced in legacy `frontend/index.html`; public CDN, no auth) | unversioned (TradingView serves this as a rolling script, not semver-pinned) | none needed — this is the only viable free embed option |

**Missing dependencies with no fallback:** none identified — all core dependencies are either already present (ws via Fastify, ccxt via Phase 1) or freely installable.
**Missing dependencies with fallback:** `reconnecting-websocket` has a viable native-`WebSocket` fallback per Claude's Discretion.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 (backend and frontend, both already configured per Phase 1) |
| Config file | `backend/vitest.config.ts`, `frontend/vitest.config.ts` (established in Phase 1; not yet re-read in this research pass — assume present per `01-*-SUMMARY.md` references to `npx vitest run`) |
| Quick run command | `cd backend && npx vitest run tests/realtime` (new directory this phase); `cd frontend && npx vitest run src/contexts/realtime` |
| Full suite command | `cd backend && npx vitest run`; `cd frontend && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-06 | WS connection rejects missing/invalid token as first message; accepts valid token | integration | `npx vitest run tests/realtime/ws-auth.test.ts` | ❌ Wave 0 |
| SEC-06 | Cross-user subscription to `account:{otherUserId}` is rejected (Pitfall 4) | integration | `npx vitest run tests/realtime/subscription-authz.test.ts` | ❌ Wave 0 |
| RT-01 | Subscribing to `ticker:binance:BTCUSDT` receives only that topic's events, not other symbols' | unit/integration | `npx vitest run tests/realtime/subscription-registry.test.ts` | ❌ Wave 0 |
| RT-02 | BinanceAdapter normalizes a raw `depth10@100ms` payload into the expected `NormalizedOrderBook` shape (10 bids/10 asks) | unit | `npx vitest run tests/exchanges/binance-stream.test.ts` | ❌ Wave 0 |
| RT-02 | listenKey keepalive is scheduled on stream start and cleared on stream close | unit | `npx vitest run tests/exchanges/binance-user-data.test.ts` | ❌ Wave 0 |
| RT-03 | TradingViewChart component remounts (fresh widget init) when `symbol` prop changes | component | `npx vitest run src/components/TradingViewChart.test.tsx` | ❌ Wave 0 |
| D-04 | Client realtime context keeps last-known ticker/book/balance state visible while `connectionStatus === 'reconnecting'` | component | `npx vitest run src/contexts/realtime/reconnect-state.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** relevant quick-run command above (e.g. `tests/realtime` subset).
- **Per wave merge:** full suite (`npx vitest run` in both `backend/` and `frontend/`).
- **Phase gate:** Full suite green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `backend/tests/realtime/ws-auth.test.ts` — covers SEC-06 handshake accept/reject
- [ ] `backend/tests/realtime/subscription-authz.test.ts` — covers private-topic authorization (Pitfall 4)
- [ ] `backend/tests/realtime/subscription-registry.test.ts` — covers RT-01 topic-scoped fan-out
- [ ] `backend/tests/exchanges/binance-stream.test.ts` — covers RT-02 ticker/depth normalization (mock `ws` similar to existing `vi.mock('ccxt', ...)` pattern from Plan 01-04)
- [ ] `backend/tests/exchanges/binance-user-data.test.ts` — covers listenKey lifecycle/keepalive scheduling
- [ ] `frontend/src/contexts/realtime/*.test.tsx` — covers D-04 frozen-state-on-disconnect behavior
- [ ] `frontend/src/components/TradingViewChart.test.tsx` — covers RT-03 remount-on-symbol-change
- [ ] Shared test fixture: a fake/mock Binance WS server (or `vi.mock('ws')`) for integration-style tests without hitting the real Binance endpoint

*No existing test infrastructure covers real-time/WebSocket behavior — Phase 1's test suite covers REST-only paths (auth, settings, symbols). All of the above are net-new for this phase.*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Reuse `@fastify/jwt` verification (same secret/algorithm as REST) for the WS first-message handshake — no separate auth mechanism |
| V3 Session Management | yes | WS connection lifetime tied to access token validity; no separate WS-specific session/token issuance introduced |
| V4 Access Control | yes | Per-topic authorization check for private topics (`account:{userId}` must match the authenticated socket's own user id) — see Pitfall 4 |
| V5 Input Validation | yes | All incoming WS messages (`{type, topic, token}`) must be JSON-parsed defensively (try/catch around `JSON.parse`) and shape-validated (e.g. with Zod, matching the existing REST convention) before use — a malformed message must not crash the connection handler |
| V6 Cryptography | no (n/a) | No new cryptographic primitives introduced this phase — credential encryption is Phase 1's `security/crypto.ts`, reused unchanged for decrypting Binance API keys before opening the userData stream |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Token-in-URL exposure (legacy defect, CONCERNS.md) | Information Disclosure | First-message handshake (Pattern 1) — token never appears in any URL, proxy log, or browser history |
| Backwards/misconfigured CORS check on WS upgrade (legacy defect) | Tampering / Spoofing | Fix the `CORS_ORIGIN?.includes(info.origin)` direction (not `.startsWith`) explicitly, matching the already-corrected REST CORS config from Phase 1's `app.ts` |
| Cross-user topic subscription (private balance data leak) | Information Disclosure | Server-side authorization check on `account:{userId}` subscribe requests (Pitfall 4) |
| Unbounded/malformed WS message crashing the connection handler | Denial of Service | Defensive `JSON.parse` + schema validation on every incoming message; close the connection with a specific code rather than letting an exception propagate uncaught |
| Dead/stale connections accumulating (legacy "Connection Lifecycle" fragile area, CONCERNS.md) | Denial of Service (resource exhaustion) | Heartbeat via `ws`'s built-in ping/pong (`server.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => ws.isAlive = true) })` + periodic `terminate()` of non-responsive sockets) — not explicitly a locked decision in CONTEXT.md but directly addresses a named CONCERNS.md item and should be included in the plan |

## Sources

### Primary (HIGH confidence)
- [Binance Spot API — WebSocket Streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams) — miniTicker and partial book depth stream names, payload shapes, update cadence
- [Binance Spot API — User Data Stream](https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream) — listenKey creation/lifecycle
- [Binance — Keepalive User Data Stream (Futures docs, same PUT semantics referenced for spot)](https://developers.binance.com/docs/derivatives/usds-margined-futures/user-data-streams/Keepalive-User-Data-Stream) — 60-minute expiry, ~30-minute recommended keepalive cadence
- `npm view @fastify/websocket version` / `time.modified` — 11.3.0, published 2026-09-04 (direct registry query, this session)
- `npm view reconnecting-websocket version` / `time.modified` — 4.4.0, published 2022-06-26 (direct registry query, this session)
- `slopcheck install @fastify/websocket --ecosystem npm` / `slopcheck install reconnecting-websocket --ecosystem npm` — both `[OK]` (direct tool run, this session)
- [TradingView — Advanced Chart: Widget Code & Settings](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/) — free embed widget configuration surface
- [TradingView — Widget Tutorials: Dynamic Symbol Change](https://www.tradingview.com/widget-docs/tutorials/build-page/dynamic-symbols/) — documents the query-param and options-object approaches for the free embed (not a runtime API call)
- Project's own `.planning/research/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/phases/01-foundation-adapter-auth-security/01-02-SUMMARY.md`, `01-04-SUMMARY.md` — existing codebase facts (JWT setup, exchange adapter shape, legacy defects)

### Secondary (MEDIUM confidence)
- [Using WebSockets with Fastify — LogRocket Blog](https://blog.logrocket.com/using-websockets-with-fastify/) — `@fastify/websocket` usage patterns, preValidation-hook-based auth
- [Getting Started with Fastify WebSockets — Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/) — synchronous message-handler attachment requirement
- [reconnecting-websocket GitHub repo](https://github.com/pladaria/reconnecting-websocket) — feature set, API compatibility with native `WebSocket`
- [TradingView Interface: IChartingLibraryWidget (licensed product docs, used only to establish the setSymbol/free-embed distinction)](https://www.tradingview.com/charting-library-docs/latest/api/interfaces/Charting_Library.IChartingLibraryWidget/)

### Tertiary (LOW confidence)
- Community React wrapper packages (`react-tradingview-widget`, `react-tradingview-embed`) surfaced via WebSearch — not verified for this project's needs; the plain `tv.js` embed (Pattern 5) is recommended over adding a third-party React wrapper dependency, consistent with the UI-SPEC's note that the widget is "not part of the shadcn registry surface" and should use the "standard `<script>` embed."

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@fastify/websocket` and `ws` versions directly registry-verified; `reconnecting-websocket` registry-verified but flagged for staleness and provenance (WebSearch-sourced name)
- Architecture: HIGH — directly extends `research/ARCHITECTURE.md`'s already-approved topic/bus design; no new architectural decisions introduced, only implementation-level detail
- Pitfalls: MEDIUM-HIGH — Binance listenKey behavior and TradingView free-vs-licensed widget distinction are both well-documented in official sources; exact reconnect backoff tuning and depth-stream staleness signaling remain open/discretionary

**Research date:** 2026-09-13
**Valid until:** 30 days (Binance WS API and Fastify plugin versions are the fastest-moving elements; TradingView embed behavior is stable long-term)
