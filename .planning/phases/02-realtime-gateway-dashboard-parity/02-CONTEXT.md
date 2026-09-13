# Phase 2: Realtime Gateway & Dashboard Parity - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

User sees live market data (ticker, order book, balance) on the dashboard through a secure, topic-scoped WebSocket connection, with the TradingView chart widget preserved. This phase replaces the legacy WebSocket gateway's known defects (JWT in URL, backwards CORS check, broadcast-to-all with no topic filtering, no heartbeat/reconnect handling) with a hardened, pub/sub-based realtime layer. This phase does not add 2FA (Phase 3), alerts (Phase 4), backtesting (Phase 5), or performance reporting (Phase 6) — those consume the same realtime/exchange infrastructure later but are out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Profundidade dos dados ao vivo (live data depth)
- **D-01:** O book de ofertas mostra profundidade com múltiplos níveis, não só o melhor bid/ask do sistema legado — isso é uma melhoria sobre a paridade legada (legado usava só `bookTicker`), aceita explicitamente pelo usuário.
- **D-02:** Profundidade de 10 níveis de cada lado (bid/ask), usando o partial depth stream nativo da Binance (`depth10@100ms`) — sem agregação manual de order book.
- **D-03:** O painel de saldo mostra **todos os ativos** retornados pela conta Binance (não filtrado por saldo > 0) — decisão explícita do usuário, contrária à recomendação (que era filtrar por saldo > 0 para evitar uma lista de 300+ ativos majoritariamente zerados). O planner/executor deve implementar sem filtro de saldo mínimo.

### UX de reconexão/queda de stream
- **D-04:** Quando o WebSocket do cliente cai, o dashboard mostra um banner discreto ("Reconectando...") mas mantém os últimos valores de ticker/book/saldo visíveis (não zera nem esconde) até a reconexão suceder.
- **D-05:** Se o stream servidor→Binance cair (não o WS do cliente), o backend tenta reconectar automaticamente com backoff exponencial — não espera um restart manual do processo. Consistente com D-16 da Fase 1 (boot não trava se a Binance estiver indisponível), estendido aqui para reconexão em runtime, não só no boot.

### Streaming: ccxt.pro vs. implementação manual
- **D-06:** A normalização dos streams de WebSocket da Binance (ticker, book, saldo/execuções) é feita manualmente sobre a API nativa de WebSocket da Binance — **não usar ccxt.pro** (biblioteca paga). Resolve o bloqueio registrado em STATE.md. Justificativa: sem custo de licenciamento; o sistema é single-user hoje; a Fase 1 já usa `ccxt` (gratuito) só para REST via `IExchangeAdapter`, então a extensão natural é adicionar métodos de streaming sobre esse mesmo adapter, não trocar de biblioteca.

### Seleção de símbolo no dashboard
- **D-07:** O usuário escolhe qual par acompanhar via um dropdown com busca, reaproveitando o endpoint `GET /symbols` (com filtro por moeda de cotação/busca) já construído na Fase 1 — ao trocar de par, o dashboard resubscreve os tópicos daquele símbolo (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`).
- **D-08:** O par selecionado persiste entre sessões via `localStorage` (mesmo padrão já usado para os tokens de autenticação na Fase 1) — o usuário não precisa reescolher o par toda vez que abre o dashboard.
- **D-09 (fora de escopo, registrado para não reabrir depois):** Múltiplos pares simultâneos (lista de favoritos/watchlist) foi explicitamente rejeitado como escopo desta fase — usuário optou por seleção single-symbol via dropdown, não uma capacidade de watchlist. Ver `<deferred>`.

### Claude's Discretion
- Estrutura exata do payload de cada tópico (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`, `account:{userId}`) — os nomes de tópico já vêm de `research/ARCHITECTURE.md`; o formato exato do payload JSON fica a critério do planner/executor.
- Parâmetros exatos do backoff exponencial (delay inicial, fator de multiplicação, teto máximo) para a reconexão servidor→Binance (D-05).
- Biblioteca cliente para o WebSocket do frontend (nativa `WebSocket` do browser vs. uma lib como `reconnecting-websocket`) — desde que implemente o comportamento de D-04.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Architecture (research)
- `.planning/research/ARCHITECTURE.md` — Realtime Gateway component (`ws-server.ts`, `subscription-registry.ts`, `topics.ts`), Internal Message Bus (in-process EventEmitter for MVP, `bus/event-bus.interface.ts` + `bus/in-memory-bus.ts`), topic naming convention (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`, `account:{userId}`), Pattern 2 "Topic-Based Pub/Sub Fan-out" — the direct fix for the legacy broadcast-to-all problem.

### Legacy system analysis (o que corrigir)
- `.planning/codebase/CONCERNS.md` — WebSocket-specific defects this phase must fix: "WebSocket Token in URL Parameter" (`app.ws.ts` line 27/34), "WebSocket CORS Validation Backwards" (`app.ws.ts` line 18-19/24), "Broadcast to All WebSocket Clients" (`app.em.ts` line 16-23), "WebSocket Connection Lifecycle" fragile area (no heartbeat/ping-pong, no cleanup on disconnect — `app.ws.ts`/`app.em.ts`), "Exchange Service Initialization" fragile area (no error handling on startup — `app.em.ts` lines 5-14).
- `.planning/codebase/INTEGRATIONS.md` — legacy WS data flow: streams are `miniTicker`, `bookTickers` (top-of-book only), `userData` (balance + execution updates); JWT currently passed via WS URL query param (`token=<jwt>`); CORS check currently reversed (`CORS_ORIGIN?.startsWith` instead of `.includes`).
- `.planning/codebase/ARCHITECTURE.md` — legacy Exchange Monitor (`app.em.ts`) singleton pattern and WebSocket Server (`app.ws.ts`) responsibilities, for parity reference.

### Project-level
- `.planning/PROJECT.md` — core value (real-time data reliability), constraints (segurança, extensibilidade multi-exchange).
- `.planning/REQUIREMENTS.md` — requisitos mapeados à Fase 2: SEC-06 (WS auth via handshake, não URL), RT-01 (pub/sub por tópico), RT-02 (dashboard com dados ao vivo, paridade legada), RT-03 (widget TradingView preservado), TEST-02 (UAT manual via Claude Browser).
- `.planning/ROADMAP.md` §Phase 2 — goal e success criteria desta fase.
- `.planning/STATE.md` — bloqueio "Phase 2 planning should resolve ccxt.pro streaming cost/licensing vs. hand-rolled WS normalization" — resolvido nesta discussão (D-06).

### Prior phase context (Foundation)
- `.planning/phases/01-foundation-adapter-auth-security/01-CONTEXT.md` — arquitetura hexagonal por módulo (D-17/D-18), padrão de error handler central (D-19/D-25 a D-27), `IExchangeAdapter` e registry de exchanges (`exchanges/core/exchange-registry.ts`, `exchanges/binance/binance.adapter.ts`) que este phase estende com métodos de streaming, autenticação JWT (`shared/http/authenticate.ts`) que o handshake do WS deve reaproveitar/espelhar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/exchanges/core/exchange-registry.ts` + `backend/src/exchanges/binance/binance.adapter.ts` (Fase 1) — o adapter existente deve ganhar métodos de streaming (ticker/book/userData), não ser substituído.
- `backend/src/modules/auth/infrastructure/jwt.ts` e `shared/http/authenticate.ts` (Fase 1) — o handshake de autenticação do WebSocket (SEC-06) deve reaproveitar a mesma verificação de access token já implementada para REST, não reimplementar JWT verify do zero.
- `backend/src/modules/symbols/*` (Fase 1) — `GET /symbols` já filtra por moeda de cotação e busca; o dropdown de seleção de símbolo (D-07) consome esse endpoint diretamente.
- `frontend/src/api/index.ts` (Fase 1) — cliente axios com interceptor de refresh já estabelecido; o cliente WebSocket do frontend é um módulo novo, mas deve seguir a mesma convenção de localização (`frontend/src/api/` ou equivalente).

### Established Patterns (a seguir)
- Arquitetura hexagonal por módulo (domain/application/infrastructure) estabelecida na Fase 1 — o novo módulo `realtime/` (ou `modules/realtime/`) deve seguir a mesma convenção.
- Error handler central único (Fastify `setErrorHandler`) — erros do REST continuam passando por ele; o WebSocket precisa de seu próprio tratamento de erro de conexão/handshake, mas consistente no formato de mensagens de erro enviadas ao cliente.

### Established Patterns (a evitar, do legado)
- Broadcast para todos os clientes sem filtro por tópico (`app.em.ts` linhas 16-23) — substituído por pub/sub com registry de tópicos (D-01 a D-03 de research/ARCHITECTURE.md).
- Token JWT na URL do WebSocket — substituído por handshake via primeira mensagem (SEC-06, já requisito, não uma nova decisão desta discussão).
- Verificação CORS invertida no WS (`CORS_ORIGIN?.startsWith(info.origin)` em vez de `.includes`).

### Integration Points
- Novo diretório `realtime/` (ws-server.ts, subscription-registry.ts, topics.ts) conforme `research/ARCHITECTURE.md`, mais `bus/` (event-bus.interface.ts, in-memory-bus.ts) para o message bus interno.
- Frontend: novo hook/contexto de WebSocket (paralelo ao `contexts/auth`) que gerencia conexão, reconexão (D-04), e subscrição de tópicos baseada no símbolo selecionado (D-07/D-08).

</code_context>

<specifics>
## Specific Ideas

- Book de ofertas com 10 níveis de profundidade (D-02), não o "melhor bid/ask" do legado — o usuário quer mais detalhe visual de pressão de compra/venda do que o sistema anterior oferecia.
- Painel de saldo mostrando **todos** os ativos, mesmo os zerados (D-03) — decisão explícita do usuário, indo contra a recomendação padrão de filtrar por saldo > 0.
- Seleção de símbolo via dropdown com busca (reaproveitando o endpoint da Fase 1), não uma lista fixa nem uma watchlist de múltiplos pares.

</specifics>

<deferred>
## Deferred Ideas

- **Lista de favoritos / múltiplos pares simultâneos no dashboard** — o usuário considerou mas optou por seleção single-symbol nesta fase (D-09). Se o produto evoluir para acompanhar vários pares ao mesmo tempo, isso é uma capacidade nova para uma fase futura (possivelmente parte do v2, junto com multi-exchange).

### Reviewed Todos (not folded)
None — nenhum todo pendente foi encontrado para esta fase (`todo.match-phase 2` retornou 0 matches).

</deferred>

---

*Phase: 2-Realtime Gateway & Dashboard Parity*
*Context gathered: 2026-09-13*
