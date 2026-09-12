# Project Research Summary

**Project:** Beholder (multi-exchange crypto trading bot — complete rewrite)
**Domain:** Single-user crypto portfolio monitoring/configuration dashboard (no automated order execution)
**Researched:** 2026-09-12
**Confidence:** MEDIUM-HIGH

## Executive Summary

Beholder is a single-user, monitoring-and-configuration crypto trading dashboard — not a high-frequency trading engine — being fully rewritten off a 2022-era stack (TypeScript 4.6, Express, Sequelize/Azure SQL, React 18/Vite 2.9) riddled with critical security debt (hardcoded AES key, fixed IV, ineffective JWT blacklist, inverted CORS, JWT-in-URL WebSocket auth, vulnerable axios). Experts building this class of product converge on a small set of well-established patterns: a unified exchange-abstraction layer (CCXT-backed, one adapter interface per exchange) rather than hand-rolled per-exchange clients; topic-based WebSocket pub/sub instead of broadcast-to-all; envelope-encrypted credential storage; and a single shared rule-evaluation module reused by both live price alerts and historical backtesting so the two never drift apart.

The recommended approach keeps the team on Node.js 24 LTS + TypeScript 5.7 (strict) and React 19 — the performance ceiling of Node/React is far above what a single-user system needs, and switching to Go/Rust or Solid would trade away the deep JS/TS crypto-exchange ecosystem (CCXT, otplib) for performance headroom nobody will use. The two substantive stack changes are Express to Fastify (native schema validation, roughly 2-3x JSON throughput, directly fixes the "missing input validation" gap) and Azure SQL to PostgreSQL 17 (plus TimescaleDB later for OHLCV/backtest data), both low-risk, high-value swaps that also remove Azure lock-in per the user's explicit openness to changing infrastructure.

The main risks are not technology choices but domain-specific correctness traps that are easy to introduce while "fixing" the legacy bugs: switching to AES-GCM without fixing nonce/key discipline (worse than the original bug), fixing WebSocket-JWT-in-URL by moving to a cookie without CSRF/origin protection, applying one generic rate limiter across exchanges with wildly different per-IP weight models (risking a Binance IP ban that takes down the whole dashboard), and, once backtesting is built, lookahead bias and survivorship bias silently inflating backtest results that inform real trading decisions. All of these are addressable with disciplined engineering (envelope encryption, first-message WS auth, per-exchange rate limiters, golden-dataset regression tests) rather than a different architecture, and each has a clear phase in which it must be addressed to avoid retrofitting.

## Key Findings

### Recommended Stack

Stay on Node.js 24 LTS + TypeScript 5.7 (strict mode) and React 19; swap Express to Fastify and Azure SQL Server to PostgreSQL 17 (plus TimescaleDB extension when backtesting ships). Real-time layer stays on raw ws (not Socket.io — its rooms/namespaces solve a multi-room problem this single-feed dashboard doesn't have). Multi-exchange integration uses CCXT as the unified REST/normalization layer.

Core technologies:
- Node.js 24 LTS + TypeScript 5.7 (strict) — backend runtime/language; existing team knowledge, deep crypto-exchange ecosystem, actual legacy bottleneck was security/code-quality debt, not language throughput
- Fastify 5.x — HTTP framework replacing Express 4.17; native JSON Schema/Zod validation, ~2-3x throughput, same mental model as Express (low migration risk)
- PostgreSQL 17 (+ TimescaleDB later) + Drizzle ORM — replaces Azure SQL/Sequelize; stronger TS ORM ecosystem, JSONB for exchange-specific settings, portable off Azure, single engine for relational + future time-series data
- React 19 + Vite 7 + React Router 7 — frontend stays; ecosystem depth (forms, TanStack Query/virtual, component libraries) outweighs SolidJS's raw reactivity edge for this CRUD-plus-realtime app
- ws 8.18+ + CCXT 4.5+ — WebSocket server and unified multi-exchange REST/WS client; CCXT directly solves the "multi-exchange beyond Binance" requirement
- argon2 (or bcrypt 5.x, not both) + Node crypto AES-256-GCM + otplib — credential hashing, encryption-at-rest, and 2FA/TOTP, replacing bcryptjs duplication and the broken aes-js fixed-IV scheme

### Expected Features

Must have (table stakes): secure login/session with refresh tokens; encrypted exchange credential storage (properly done this time); multi-exchange support (2+ exchanges behind a common interface, not "all exchanges"); real-time ticker/order book/balance display; trade/order history; TOTP-based 2FA; basic PnL view; TradingView charting; rate limiting; input validation everywhere.

Should have (competitive differentiators): unified normalized multi-exchange dashboard; candle/OHLCV-based backtesting of simple alert/rule logic (explicitly not tick-level/order-book replay); multi-condition alerts (% change, volume spikes); performance reports with realized/unrealized PnL and balance-over-time; 2FA backup codes (plus optional WebAuthn later); exchange credential health checks on save; audit log of credential/settings changes.

Defer (v2+): WebAuthn/passkeys, advanced performance metrics (Sharpe, max drawdown, per-strategy attribution), push notification delivery, third+ exchange support, cross-exchange aggregate reporting. Explicitly anti-scope (do not build): automated order execution, institutional-grade tick-level backtesting, multi-tenancy, SMS-based 2FA.

### Architecture Approach

The system should be organized around an isolated Exchange Adapter layer (IExchangeAdapter, CCXT-backed) that all business logic depends on instead of any concrete exchange SDK, a topic-based internal pub/sub bus (in-process EventEmitter now, swappable for Redis later) that replaces the legacy broadcast-to-all WebSocket design, and a single shared, pure Strategy/Rule Evaluation module consumed by both the live Alert Evaluation Service and the offline Backtesting Engine so live and backtested logic never diverge.

Major components:
1. Exchange Adapter Layer (exchanges/) — one implementation per exchange behind a shared interface; normalizes ticker/order book/balance/symbol shapes; owns per-exchange rate limiting
2. Internal Message Bus (bus/) — topic-based pub/sub (ticker:{exchange}:{symbol}) decoupling adapters from the Realtime Gateway and Alert Evaluation Service
3. Realtime Gateway (realtime/) — WebSocket connection lifecycle, subscription registry (client-topic map), JWT auth on handshake (never in URL)
4. Strategy/Rule Evaluation (strategy/) — pure, side-effect-free rule evaluator shared by Alerts (live ticks) and Backtesting (historical replay)
5. Credential Vault (security/) — envelope-encrypted (AES-256-GCM, random nonce per record) exchange credential storage, decrypt-on-demand only
6. Backtesting Engine & Reporting Service — offline, pull-based; reads historical OHLCV via the adapter's REST capability and persisted durable trade/balance history (not WS-derived state)

### Critical Pitfalls

1. AES-GCM "fixed" without nonce/key discipline — switching cipher mode alone doesn't fix the legacy encryption bug; nonce reuse under GCM is worse than the original CTR flaw. Use envelope encryption, random 96-bit nonce per record, versioned ciphertext format, fail loudly if the master key is missing.
2. WebSocket auth "fixed" by moving JWT to a cookie without CSRF/origin protection — prefer the first-message auth pattern (unauthenticated connect, immediate short-lived-token frame) over cookies; if cookies are used, enforce HttpOnly/Secure/SameSite plus explicit Origin allowlisting, and force-close WS connections on session revocation.
3. One generic rate limiter applied across all exchanges — Binance limits are per-IP and weight-based; a uniform limiter risks a 429 to 418 IP ban that silently takes down every user's data on that exchange. Build per-exchange adapters with their own tuned limiter, respect Retry-After/weight headers, isolate dev/staging egress IPs from production.
4. Backtesting lookahead bias — computing a signal and "filling" it using the same candle's own close/high/low silently produces unrealistic, too-good results. Enforce strict decision-at-bar-N/execute-at-bar-N+1 architecture and add a golden-dataset regression test in CI.
5. Real-time WS data treated as system-of-record for financial reports — WS streams are best-effort and can drop/reorder messages; reports/PnL must be built from REST-reconciled, durable trade/balance snapshots, not summed WebSocket ticks, with idempotency keys to prevent double-counting on reconnect.

## Implications for Roadmap

Based on research (especially the ARCHITECTURE.md "Suggested Build Order" and the PITFALLS.md pitfall-to-phase mapping), the dependency chain is clear: exchange abstraction must exist before multi-exchange, credentials, or business logic touch it; the rule-evaluation module must exist before either alerts or backtesting; and security fixes are foundational, not deferrable.

### Phase 1: Foundation — Exchange Adapter Layer + Core Rewrite (Auth, Settings, Credentials)
Rationale: Everything else (multi-exchange, dashboard, alerts, reports) depends on the IExchangeAdapter interface existing first; retrofitting it later repeats the exact mistake this rewrite exists to fix. Security fixes (encryption, JWT, CORS) are foundational and must ship with this phase, not after.
Delivers: Fastify + PostgreSQL/Drizzle backend skeleton; IExchangeAdapter interface + BinanceAdapter (CCXT-backed); envelope-encrypted Credential Vault (AES-256-GCM, random nonce, versioned format); hardened JWT auth with refresh/rotation; input validation (Zod) on all endpoints; rate limiting.
Addresses: Table-stakes security fixes, encrypted credential storage, secure login/refresh tokens, rate limiting, input validation (FEATURES.md P1 items).
Avoids: Pitfall 1 (AES-GCM nonce/key discipline), Pitfall 3 groundwork (per-exchange rate limiter design), legacy CONCERNS.md security debt.

### Phase 2: Realtime Gateway + Dashboard Parity
Rationale: With the adapter layer and auth in place, rebuild the real-time data path correctly before adding any new feature surface — this is the single biggest architectural break from the legacy forEach broadcast design.
Delivers: Internal Message Bus (in-process EventEmitter, IEventBus interface for future Redis swap); topic-based Realtime Gateway with subscription registry; WS auth via first-message token exchange (not URL, not naive cookie); ticker/order-book/balance dashboard restored to feature parity; TradingView widget preserved.
Uses: ws 8.18+, Fastify, React 19 + TanStack Query + react-virtual for list rendering.
Implements: Exchange Adapter Layer (consumed), Internal Message Bus, Realtime Gateway (ARCHITECTURE.md components 2-3).
Avoids: Pitfall 2 (WS auth/session revocation), broadcast-to-all anti-pattern.

### Phase 3: Multi-Exchange Support
Rationale: Proves the adapter abstraction with a second real implementation before building anything (alerts, reports) that assumes multi-exchange data shapes — do this while the abstraction is fresh, not after bolting on unrelated features.
Delivers: Second exchange adapter (e.g., Bybit or Coinbase); multi-exchange-aware credential storage, symbol sync, and dashboard UI; per-exchange rate limiter tuning and circuit-breaker/backoff behavior; per-exchange connection-health indicators.
Addresses: FEATURES.md "multi-exchange support" (P1) and "unified dashboard" differentiator.
Avoids: Pitfall 3 (per-exchange rate limits), degraded-exchange cascading failure.

### Phase 4: 2FA
Rationale: Independent of the trading-feature work and can run in parallel with Phase 3, but must reuse the encryption-at-rest mechanism from Phase 1 and be designed jointly with the token refresh/session-revocation model from Phase 1-2 — not bolted on separately.
Delivers: TOTP enrollment/verification (otplib), encrypted TOTP secret storage, backup/recovery codes (forced download before enabling), rate-limited verify endpoint, explicit session-revocation policy on 2FA disable/reset.
Addresses: FEATURES.md 2FA table-stakes requirement.
Avoids: Pitfall 7 (2FA without recovery path or session interaction).

### Phase 5: Shared Rule Engine + Price Alerts
Rationale: Build the pure rule-evaluation module now, driven by live data first, so it can be reused unmodified by backtesting in the next phase rather than inventing two condition languages.
Delivers: strategy/rule-evaluator module (pure, side-effect-free); Alert Evaluation Service consuming the Message Bus; basic single-condition threshold alerts with in-app notification; alert CRUD.
Addresses: FEATURES.md price alerts (P1).
Avoids: Anti-Pattern 3 (divergent alert/backtest logic), sets up Pitfall 6 mitigation (don't derive alert triggers solely from WS ticks — reconcile against REST periodically).

### Phase 6: Backtesting
Rationale: Reuses the Phase 5 rule engine against historical data; is the highest-risk feature for silent correctness bugs (lookahead/survivorship bias), so it needs its own dedicated phase with mandatory regression tests before any UI is built on top.
Delivers: Point-in-time historical symbol/market universe model (including delisted pairs, or an explicit documented limitation); OHLCV ingestion/caching; Backtest Runner replaying candles through the shared rule evaluator; golden-dataset no-lookahead regression test in CI; results UI with an explicit assumptions/limitations panel.
Addresses: FEATURES.md backtesting differentiator (candle-based, not tick-level).
Avoids: Pitfall 4 (lookahead bias), Pitfall 5 (survivorship bias).

### Phase 7: Performance Reporting
Rationale: Depends on multi-exchange support (Phase 3) being stable and benefits from a durable, REST-reconciled data pipeline that should already exist by this point — deliberately last so it isn't built twice.
Delivers: Scheduled balance-snapshot job; durable append-only trade/balance ingestion (REST-reconciled, idempotent, not WS-derived); per-exchange realized PnL and balance-over-time chart; reconciliation job comparing WS-derived running totals against REST truth.
Addresses: FEATURES.md basic performance report (P1/P2).
Avoids: Pitfall 6 (real-time data treated as system of record for financial history).

### Phase Ordering Rationale

- The adapter layer, message bus, and rule-evaluation module are each "build once, reuse everywhere" foundations — research is unanimous that retrofitting any of them after features are built on top produces exactly the kind of rearchitecture this rewrite already exists to escape.
- Security (encryption, auth, WS auth) is front-loaded into Phases 1-2 because PROJECT.md treats every CONCERNS.md item as in-scope, non-deferrable, and several PITFALLS.md items (nonce discipline, WS auth) are easiest to get right when the auth system is being designed, not patched later.
- 2FA (Phase 4) is architecturally independent but is sequenced after the auth/session model (Phase 1-2) specifically because PITFALLS.md flags 2FA-session interaction as a common miss when built in isolation.
- Alerts before backtesting (Phase 5 before 6) so the shared rule engine is proven against live data first; backtesting then reuses it rather than building two evaluators.
- Reporting is last (Phase 7) because it depends on multi-exchange data normalization (Phase 3) and a durable ingestion pipeline that is cheaper to build once, informed by lessons from the realtime/alerts phases, than to build early and redo.

### Research Flags

Phases likely needing deeper research during planning:
- Phase 3 (Multi-Exchange Support): exchange-specific rate-limit models, auth schemes, and WS stream quirks vary significantly (Binance vs. Bybit/Coinbase); needs research into the specific second exchange chosen.
- Phase 6 (Backtesting): lookahead/survivorship-bias-safe design and historical OHLCV sourcing (including delisted-pair data availability/cost) is a specialized area; needs deeper research before implementation.
- Phase 7 (Performance Reporting): multi-currency valuation and per-exchange trade/execution normalization patterns are exchange-specific and may need targeted research once Phase 3's second exchange is known.

Phases with standard patterns (skip research-phase):
- Phase 1 (Foundation): Fastify/PostgreSQL/Drizzle/AES-GCM/JWT patterns are well-documented, HIGH-confidence, standard 2026 practice.
- Phase 2 (Realtime Gateway): topic-based pub/sub over ws is an established, well-documented pattern (Ably, general WS architecture references).
- Phase 4 (2FA): TOTP via otplib + backup codes is a well-trodden, standard implementation path.
- Phase 5 (Price Alerts): threshold-based alert evaluation over an existing ticker stream is a simple, well-understood pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Version numbers (Node 24 LTS, Fastify 5, React 19, PostgreSQL 17) verified against official release channels; relative performance claims are MEDIUM (directionally reliable, not precise benchmarks) |
| Features | MEDIUM-HIGH | Multi-exchange abstraction, 2FA, and alert patterns are HIGH confidence (CCXT/otplib official docs); backtesting scope and "what SaaS products ship" are MEDIUM (WebSearch-sourced product roundups, cross-checked across multiple 2026 sources) |
| Architecture | MEDIUM-HIGH | Component boundaries and pub/sub pattern are well-established industry consensus (Ably, QuantStart event-driven backtesting); specific library integration details (e.g., ccxt.pro streaming cost) are MEDIUM and need verification at implementation time |
| Pitfalls | MEDIUM-HIGH | Rate-limit and crypto-security pitfalls verified against official Binance docs and ccxt maintainer guidance (HIGH); backtesting bias and WS-auth patterns are MEDIUM-HIGH (corroborated across multiple independent quant/security sources) |

Overall confidence: MEDIUM-HIGH

### Gaps to Address

- ccxt.pro streaming cost/licensing: CCXT's WebSocket streaming module (ccxt.pro) is a separate commercial product; ARCHITECTURE.md flags this as needing a cost/benefit evaluation vs. hand-rolled per-exchange WS normalization before committing — resolve during Phase 2/3 planning.
- Drizzle vs. Prisma: Drizzle is recommended but Drizzle 1.0 is still in beta (pin to last stable 0.x); this is a team-preference decision, not fully settled — confirm before Phase 1 implementation.
- TimescaleDB extension availability: Recommended for future OHLCV storage but availability depends on the chosen PostgreSQL host (e.g., Azure Database for PostgreSQL support varies) — verify before Phase 6.
- Second exchange choice: FEATURES.md and PITFALLS.md both defer to "whichever exchange the user actually holds funds on" — this concrete choice affects Phase 3 research scope and should be confirmed early in requirements/roadmap definition.
- Historical OHLCV data source for delisted pairs: Full delisted-asset history may require a paid data provider; Phase 6 planning should explicitly decide whether to pay for this or ship with a documented "currently-listed pairs only" limitation for v1.

## Sources

### Primary (HIGH confidence)
- Node.js LTS schedule — endoflife.date (https://endoflife.date/nodejs)
- Node.js 26.0.0 release blog — nodejs.org (https://nodejs.org/en/blog/release/v26.0.0)
- ccxt GitHub repository (https://github.com/ccxt/ccxt) and CCXT official docs (https://docs.ccxt.com/)
- Binance Spot API rate limits, official docs (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits)
- ccxt Manual (https://docs.ccxt.com/en/latest/manual.html) and ccxt rate-limit issue discussion (https://github.com/ccxt/ccxt/issues/18878)
- .planning/codebase/STACK.md, ARCHITECTURE.md, INTEGRATIONS.md, CONCERNS.md — direct legacy codebase analysis

### Secondary (MEDIUM confidence)
- Rust vs Go vs Node.js 2026 comparison (https://caffeinatedcoder.medium.com/rust-vs-go-vs-node-js-which-backend-language-will-dominate-in-2026-b46e652d12f4)
- Express vs Fastify in 2026 — Stack Harbor (https://stackharbor.com/en/knowledge-base/fastify-vs-express-production/)
- Node.js WebSocket Server Comparison 2026 — AnyCable (https://anycable.io/compare/nodejs-websocket/)
- Drizzle vs Prisma in 2026 — Encore (https://encore.dev/articles/drizzle-vs-prisma)
- Analyzing Cryptocurrencies with PostgreSQL/TimescaleDB — Tiger Data (https://blog.timescale.com/analyzing-ethereum-bitcoin-and-1200-cryptocurrencies-using-postgresql-3958b3662e51)
- React vs SolidJS vs Vue in 2026 (https://www.resumelens.org/blog/react/react-vs-vue-vs-svelte-2026)
- Best crypto trading bot roundups 2026: Koinly (https://koinly.io/blog/best-crypto-trading-bots/), altFINS (https://altfins.com/best/crypto-trading-and-investing/crypto-trading-bots/), VentureBurn (https://ventureburn.com/15-crypto-trading-bots-reviewed-for-2026-automation-ai-tools-and-risk-controls/), Pionex (https://www.pionex.com/blog/12-best-ai-crypto-portfolio-management-tools-in-2026-automation-fees-custody-compared/)
- otplib on npm (https://www.npmjs.com/package/otplib); speakeasy vs authy vs otplib comparison (https://npm-compare.com/authy,otplib,speakeasy)
- Market Data Distribution: Order Book Snapshots, Deltas, WS Feed Design (https://hosseinnejati.medium.com/market-data-distribution-order-book-snapshots-deltas-and-websocket-feed-design-466ba56a0c23)
- Scaling Pub/Sub with WebSockets and Redis — Ably (https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis); Ably WebSocket authentication guide (https://ably.com/blog/websocket-authentication)
- Event-Driven Backtesting with Python — QuantStart (https://www.quantstart.com/articles/Event-Driven-Backtesting-with-Python-Part-I/); PyEventBT documentation (https://pyeventbt.com/)
- A Taxonomy of Backtest Lies: Survival Bias, Lookahead Bias (https://www.susanpotter.net/quant/backtest-bias-taxonomy/)
- CoinAPI: Eliminating Survivorship Bias in Crypto Backtesting (https://www.coinapi.io/blog/how-to-eliminate-survivorship-bias-in-crypto-backtesting)
- WebSocket.org: WebSocket Authentication guide (https://websocket.org/guides/authentication/)
- AES-256-GCM practical pattern for encrypting secrets at rest (https://dev.to/chu_minh_f513921733ff7d9/aes-256-gcm-in-go-a-practical-pattern-for-encrypting-secrets-at-rest-2dhc)

### Tertiary (LOW confidence)
- Look-Ahead-Freedom as Temporal Non-Interference, arXiv (https://arxiv.org/pdf/2607.04958) — formal treatment, useful conceptually but not implementation-specific
- NautilusTrader (https://nautilustrader.io/), hftbacktest GitHub (https://github.com/nkaz001/hftbacktest), Jesse (https://jesse.trade/), OctoBot GitHub (https://github.com/drakkar-software/octobot) — used for complexity-spectrum context on backtesting scope, not direct implementation guidance

---
*Research completed: 2026-09-12*
*Ready for roadmap: yes*
