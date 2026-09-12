# Feature Research

**Domain:** Crypto trading bot / multi-exchange portfolio monitoring dashboard (single-user, no auto-execution)
**Researched:** 2026-09-12
**Confidence:** MEDIUM-HIGH (multi-exchange abstraction, 2FA, alerts patterns are HIGH confidence via CCXT/otplib docs and established practice; backtesting scope and "what mature SaaS products ship" are MEDIUM — WebSearch-sourced, cross-checked across multiple 2026 product roundups: Koinly, 3Commas-style platforms, altFINS, Pionex)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any credible crypto monitoring/trading product in 2026. Missing these makes the product feel broken or unsafe.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Secure login + session management | Baseline for any financial app | LOW | Already exists (JWT); needs refresh-token/sliding expiration per Active requirements |
| Encrypted exchange API credential storage | Users won't paste API keys into a system that stores them in plaintext or with hardcoded keys | MEDIUM | Existing AES approach has critical flaws (hardcoded key, fixed IV) per CONCERNS.md — must be redone with per-record IV, KMS/env-managed key, ideally envelope encryption |
| Multi-exchange support (2+ exchanges) | 2026 users hold assets across Binance, Coinbase, Kraken, Bybit, OKX; single-exchange tools feel dated | HIGH | See dedicated section below. Realistic v1 scope: Binance + 1 additional exchange behind a common interface, not "all exchanges" |
| Real-time price/ticker + order book display | This is the existing dashboard's core value; competitors all show live data | MEDIUM | Already implemented via WebSocket; must be preserved and made exchange-agnostic |
| Balance / portfolio view across connected accounts | Users expect to see holdings without checking each exchange app | MEDIUM | Existing for Binance; extending to multi-exchange requires per-exchange balance normalization |
| Price alerts (threshold-based) | Nearly universal in portfolio trackers (Koinly, CoinStats, 3Commas, altFINS) — users expect to be notified without watching screens | MEDIUM | See dedicated section below |
| Trade/order history log | Users expect a record of what happened, even without auto-trading | LOW-MEDIUM | Exchange APIs expose historical trades/orders; storing + displaying is straightforward |
| 2FA (TOTP-based) | Standard for any app touching exchange credentials; users increasingly refuse to use finance tools without it | MEDIUM | See dedicated section below |
| Basic performance/PnL view | Users want to know "am I up or down" without exporting to a spreadsheet | MEDIUM | See performance reporting section |
| Responsive, functional charting (TradingView widget or equivalent) | Existing feature; charts are assumed baseline in any trading UI | LOW | Preserve TradingView widget integration |
| Rate limiting / abuse protection on API | Not user-visible, but its absence causes outages/bans from exchanges and is now an explicit Active requirement | LOW-MEDIUM | Needed both to protect the app's own API and to respect exchange API rate limits |
| Input validation on all endpoints | Table stakes for any financial app; already an Active requirement due to legacy gaps | LOW-MEDIUM | Standard with schema validation (Zod/Joi) |

### Differentiators (Competitive Advantage)

Features that go beyond parity and set the rewrite apart — align with Core Value (reliable, secure, modern monitoring bot).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Unified multi-exchange dashboard with normalized data model | Most legacy/hobby bots are single-exchange; presenting balances/tickers from multiple exchanges in one consistent UI is a real differentiator for a "monitoring bot," not just a nice-to-have | HIGH | Depends entirely on the exchange abstraction layer (see below); this is the single biggest architectural investment in the milestone |
| Backtesting on historical data | Lets users validate a strategy idea before manually acting on it (no auto-execution exists, so this is "would this alert/strategy have been useful" not "would this have made money live") | HIGH | Scope must be tightly bounded — see dedicated section. Full HFT-grade backtesting (order book replay, latency modeling) is out of proportion for a single-user monitoring bot |
| Configurable, multi-condition price alerts (not just single threshold) | Basic threshold alerts are table stakes; % change over time window, volume spikes, or combined conditions are a step up | MEDIUM | Layer this on top of the basic alert engine once built; don't build it first |
| Performance reports with standard trading metrics (realized/unrealized PnL, win rate, max drawdown) | Differentiates from "just a balance viewer" toward "gives you insight" | MEDIUM-HIGH | Requires reliable historical trade data ingestion per exchange; complexity scales with number of exchanges supported |
| 2FA with backup/recovery codes + optional WebAuthn/passkey support | TOTP alone is table stakes in 2026; recovery codes prevent lockout, and passkeys are increasingly expected in security-conscious products | MEDIUM | Recovery codes are cheap to add once TOTP exists; WebAuthn is a stretch goal, not required for parity |
| Exchange credential health checks (permission/IP-restriction validation on save) | Prevents silent failures later (e.g., API key missing "read" permission) — a UX and security win few hobby bots implement | LOW-MEDIUM | Call a lightweight authenticated endpoint (e.g., account info) immediately after credentials are saved and surface errors |
| Audit log of settings/credential changes | Security-conscious differentiator; shows when credentials were changed/rotated | LOW | Simple append-only table, given the security focus already baked into this milestone |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Automated order execution / algorithmic auto-trading | "Real" trading bots execute trades automatically; feels like the natural next step after monitoring | Explicitly Out of Scope in PROJECT.md; introduces massive regulatory, financial-loss, and reliability risk (order routing, partial fills, exchange downtime handling, custody of trade decisions) — disproportionate to a single-user rewrite | Keep system read-only/advisory: alerts and backtesting inform manual decisions the user executes on the exchange itself |
| Supporting "all" exchanges via one generic REST client | Feels efficient — "just hit their REST API directly" | Every exchange has different auth schemes, rate limits, response shapes, and websocket protocols; hand-rolling this for many exchanges multiplies maintenance burden and bug surface | Use a proven abstraction library (CCXT) for exchange-specific REST/WS quirks, and layer a thin internal interface on top for the 2-3 exchanges actually needed |
| Institutional-grade backtesting (tick-level order book replay, latency/slippage simulation) | "More accurate backtesting" sounds strictly better | This is HFT-market-maker-tier complexity (see NautilusTrader, hftbacktest) — requires full L2/L3 historical order book data feeds, is expensive to source, and is irrelevant for a manual/monitoring use case with no auto-execution | Candle/OHLCV-based backtesting against historical klines, sufficient for evaluating alert/strategy logic at the timeframes a manual trader acts on |
| Multi-tenancy / multi-user accounts | Seems like an obvious "while we're rewriting it" addition | Explicitly Out of Scope in PROJECT.md; adds authorization complexity (per-user credential isolation, RBAC) not needed for a single-user system | Keep single-user; revisit only if a future milestone explicitly requires it |
| SMS-based 2FA | Common pattern users recognize from banks | SIM-swapping vulnerability is well documented; also requires SMS provider integration/cost for a single-user app where it adds little over TOTP | TOTP (authenticator app) as primary 2FA, backup codes for recovery |
| Real-time streaming for every exchange simultaneously via raw WebSocket multiplexing at full tick rate | "More real-time is better" | Multiplies connection management, reconnection/backoff logic, and broadcast complexity per exchange; existing single-exchange monitor already has anti-patterns here (synchronous forEach broadcast, no worker threads) | Normalize update frequency (e.g., throttle ticker broadcasts to UI-relevant intervals like 1s) and use one abstraction-managed connection per exchange, not raw per-stream sockets scattered through the codebase |

## Deep Dive: Multi-Exchange Support

**How mature products implement it:** Virtually every serious multi-exchange bot/dashboard (3Commas, Cryptohopper, OctoBot, and countless smaller tools) builds on top of a unified exchange abstraction rather than hand-writing REST clients per exchange. The de facto standard in the Node/TypeScript and Python ecosystems is **CCXT** (https://github.com/ccxt/ccxt) — MIT-licensed, actively maintained, supports 100+ exchanges (including Binance) with a unified interface for markets, tickers, order books, balances, and orders, plus WebSocket streaming (`ccxt.pro` semantics folded into the library) for tickers/order books/trades/orders. It is non-custodial — API keys stay local, calls go directly exchange-to-client. (HIGH confidence — verified via official CCXT docs and GitHub repo.)

**Recommended approach for this rewrite:**
- Adopt CCXT as the exchange integration layer, replacing the current `node-binance-api`-specific `backend/src/utils/exchange.ts` factory with a CCXT-backed equivalent that preserves the existing "factory returns miniTickerStream/bookStream/userDataStream/balance/exchangeInfo" shape at the interface level, but implements it against CCXT under the hood.
- Even with CCXT normalizing wire protocols, still build a thin internal domain interface (e.g., `ExchangeAdapter` with `getBalance`, `streamTicker`, `streamOrderBook`, `getSymbols`) so business logic never depends on CCXT's shape directly — this preserves the existing repository/service layering pattern and keeps the door open to swap/extend later.
- Scope v1 to Binance (parity) + one additional exchange (e.g., Coinbase or Bybit — whichever the user actually holds funds on) to prove the abstraction without over-building for exchanges nobody uses yet.
- Symbol sync, credential storage, and settings all need to become exchange-aware (which exchange does this credential/symbol belong to) — this is a schema and UI change, not just a backend one.

**Complexity: HIGH.** This is the largest single piece of new engineering in the milestone. Even with CCXT doing exchange-specific protocol work, the app still needs: per-exchange credential storage and encryption, an adapter/normalization layer, exchange selection UX, per-exchange rate-limit awareness, and reconciling potentially different WebSocket connection lifecycles per exchange (reconnect/backoff logic multiplies per exchange, not per feature). Recommend its own phase.

## Deep Dive: Price Alerts

**How mature products implement it:** Portfolio trackers and trading platforms (Koinly, CoinStats-style tools, 3Commas) universally offer at minimum: price crosses above/below X, and often % change over a time window or volume spikes. Implementation pattern is consistent across the ecosystem:
1. User defines a rule (symbol, exchange, condition, threshold) stored in the DB.
2. A background evaluator subscribes to the same live ticker stream already being consumed for the dashboard (no separate polling needed since ticker data is already flowing) and checks active rules on each tick (or throttled interval, e.g., every 1-5s, not every tick, to avoid needless CPU/notification spam).
3. On trigger, rule is marked fired (with cooldown/re-arm logic to avoid repeat-notification spam) and a notification is dispatched (in-app + optionally email/push).

**Complexity: MEDIUM.** The hard part is not the threshold check itself (trivial) — it's (a) wiring a notification delivery mechanism (in-app is easiest; email requires an SMTP/transactional-email provider; push requires infra you may not want to build now), and (b) making the alert evaluator exchange-agnostic so it works against whichever adapter is streaming data for a given symbol. Recommend starting with in-app notifications only for v1 (simple threshold conditions), and treating multi-condition alerts + email/push delivery as a differentiator layered on afterward.

**Dependency:** Price alerts require the real-time ticker stream (existing) and, for multi-exchange alerts, the exchange abstraction layer to be in place first.

## Deep Dive: Backtesting

**How mature products implement it:** Ecosystem inspection shows a clear complexity spectrum:
- **Institutional/HFT-grade** (NautilusTrader, hftbacktest): Rust-native cores, full L2/L3 order book replay, latency/slippage modeling. Built for quant funds and market makers. (https://nautilustrader.io/, https://github.com/nkaz001/hftbacktest)
- **Retail-friendly, still substantial** (Jesse, OctoBot, Backtrader): Python-based, candle/OHLCV-driven backtesting with a unified strategy codebase shared between backtest and live modes. This is the realistic reference tier for a single-user tool. (https://jesse.trade/, https://github.com/drakkar-software/octobot)
- **Lightweight** (backtest-kit and similar): TypeScript-based, "the code you test is the code you ship" philosophy — smaller scope, good fit for a Node/TS backend.

**Recommended scope for this milestone:** Given there is no auto-execution (Out of Scope), backtesting here means "would this alert condition or simple rule have fired usefully against historical price data," not full strategy P&L simulation with order fills. Realistic v1: ingest historical OHLCV/kline data (available directly from exchange REST APIs, including Binance's existing `exchangeInfo`-adjacent endpoints), run user-defined simple rules (price thresholds, moving-average crossovers) against that data, and report where/when they would have triggered plus simple resulting metrics (hypothetical return if a manual trade had been made at each trigger). This avoids building a full order-matching/slippage simulator, which would be disproportionate scope for a monitoring bot with no auto-execution.

**Complexity: HIGH**, even at reduced scope — requires historical data ingestion/storage per exchange/symbol, a rule evaluation engine (that ideally shares logic with the live alert evaluator to avoid maintaining two copies of trigger conditions), and a results/reporting UI. Recommend treating "simple candle-based backtesting of alert rules" as the target, explicitly rejecting tick-level/order-book backtesting as anti-scope for this product.

**Dependency:** Backtesting benefits from (and should share code with) the price alert rule engine — build alerts first, then backtesting can replay the same rule definitions against historical data rather than inventing a second condition language.

## Deep Dive: Performance Reporting

**How mature products implement it:** Standard metrics across portfolio trackers and trading platforms: realized/unrealized PnL (per asset and aggregate), win rate, average trade size, max drawdown, and time-series equity/balance curve. These are computed from historical order/execution data pulled from exchange APIs (already partially available via `userDataStream`/execution callbacks in the existing Binance integration) plus stored balance snapshots over time for the equity curve.

**Complexity: MEDIUM-HIGH.** The metrics themselves are straightforward arithmetic; the complexity is in reliable data collection: normalizing trade/execution history across exchanges (different exchanges expose fills differently), snapshotting balances on a schedule to build a time series (since most exchanges don't provide historical portfolio-value APIs directly), and handling multi-currency valuation (converting all holdings to a common quote currency, e.g., USD, using price history). Recommend v1 scope: per-exchange realized PnL and a simple balance-over-time chart; defer cross-exchange aggregate performance and advanced metrics (Sharpe ratio, drawdown) to a later iteration.

**Dependency:** Performance reporting depends on multi-exchange support (to know what data model per exchange looks like) and benefits from a scheduled balance-snapshot job that should exist regardless (also useful for alerts/backtesting historical context).

## Deep Dive: 2FA

**How mature products implement it:** TOTP (Time-based One-Time Password, RFC 6238) via an authenticator app (Google Authenticator, Authy, 1Password) is the standard baseline for finance-adjacent apps in 2026, paired with backup/recovery codes to prevent lockout. SMS-based 2FA is now widely discouraged industry-wide due to SIM-swap risk and is not recommended here. WebAuthn/passkeys are an emerging step up but not yet universal table stakes for a single-user tool.

**Library recommendation:** `speakeasy` (last meaningfully updated ~7 years ago per npm/community sources) is legacy and no longer the recommended choice. **`otplib`** is the current recommended TypeScript-first library for HOTP/TOTP — actively maintained, RFC-compliant, zero-config sensible defaults, security-audited cryptographic plugins (`@noble/hashes`, `@scure/base`), multi-runtime (Node/Bun/Deno/Browser) support. (MEDIUM-HIGH confidence — WebSearch-sourced from npm and community comparison sources, consistent across multiple sources; verify current npm listing/version at implementation time.)

**Complexity: MEDIUM.** Implementation is well-trodden: generate a TOTP secret + QR code (`qrcode` npm package) on enrollment, verify a 6-digit code to confirm setup, require code on login (as a second step after password) or step-up for sensitive actions (e.g., changing exchange credentials), and issue one-time backup codes. Main design decisions: whether 2FA is mandatory or optional, whether it gates login only or also sensitive settings changes, and secure storage of the TOTP secret (must be encrypted at rest — reuse the credential-encryption overhaul already planned for exchange API keys).

**Dependency:** 2FA is independent of the other features but should reuse whatever encryption-at-rest mechanism is built to fix the exchange-credential storage vulnerabilities (shared secrets-management approach, not a one-off).

## Feature Dependencies

```
Exchange Abstraction Layer (CCXT-backed adapter interface)
    └──requires──> Multi-exchange-aware credential storage & schema
                       └──requires──> Encryption-at-rest fix (already an Active security requirement)

Multi-Exchange Support
    └──requires──> Exchange Abstraction Layer
    └──enables──> Multi-exchange Dashboard (differentiator)
    └──enables──> Multi-exchange Performance Reporting

Price Alerts (basic threshold)
    └──requires──> Real-time ticker stream (existing, made exchange-agnostic)
    └──enables──> Multi-condition Alerts (differentiator)
    └──shares-logic-with──> Backtesting (rule evaluation engine)

Backtesting
    └──requires──> Historical OHLCV data ingestion (new)
    └──benefits-from──> Price Alert rule engine (shared condition logic)

Performance Reporting
    └──requires──> Multi-exchange support (to normalize trade/execution data)
    └──requires──> Scheduled balance-snapshot job (new, also useful for backtesting context)

2FA (TOTP)
    └──requires──> Encryption-at-rest mechanism (shared with credential storage fix)
    └──independent-of──> multi-exchange/alerts/backtesting work

Audit Log (differentiator)
    └──enhances──> 2FA and credential-change security posture
```

### Dependency Notes

- **Multi-exchange support requires the exchange abstraction layer**, which itself requires fixing credential storage first (can't safely store N exchanges' credentials on top of a broken single-exchange encryption scheme) — this places "fix encryption" ahead of "add exchange #2" in phase ordering.
- **Price alerts and backtesting should share a rule/condition evaluation engine.** Building alerts first, then having backtesting replay the same rule definitions against historical data, avoids inventing and maintaining two separate condition languages.
- **Performance reporting depends on multi-exchange support** being functional, since it needs a normalized trade/execution/balance data model across exchanges — building it before multi-exchange support means redoing it once a second exchange is added.
- **2FA is independent** of the trading-feature work and can be built in parallel/early, but should reuse whatever secrets-management approach is chosen to fix the AES credential-storage vulnerabilities, rather than inventing a second encryption pattern.

## MVP Definition

### Launch With (v1)

Minimum to deliver functional parity + the explicitly requested improvements without overbuilding.

- [ ] Rewritten backend/frontend stack with all CONCERNS.md security fixes — foundational, non-negotiable
- [ ] Exchange abstraction layer (CCXT-backed) supporting Binance (parity) + 1 additional exchange — proves multi-exchange without over-scoping
- [ ] Multi-exchange-aware credential storage, symbol sync, and dashboard (ticker, order book, balance) — table stakes extended to 2 exchanges
- [ ] Basic price alerts: single-condition threshold (price above/below X), in-app notification only — table stakes
- [ ] Basic backtesting: candle/OHLCV replay of simple threshold/crossover rules against one exchange's historical data — differentiator, minimum viable scope
- [ ] Basic performance report: per-exchange realized PnL + balance-over-time chart — table stakes minimum
- [ ] 2FA via TOTP (otplib) with backup codes, gating login — table stakes
- [ ] Automated test coverage for auth, credentials, symbol sync, streaming (already an Active requirement)

### Add After Validation (v1.x)

- [ ] Multi-condition price alerts (% change, volume spikes) + email notification delivery — once basic alerts prove valuable
- [ ] Cross-exchange aggregate performance reporting (combined PnL, win rate) — once 2+ exchanges are stable in production
- [ ] Backtesting extended to more indicator types (moving averages, RSI) reusing the shared rule engine
- [ ] Third+ exchange support — once the abstraction layer is proven with 2 exchanges in production
- [ ] Credential health checks on save (permission/IP-restriction validation)
- [ ] Audit log of settings/credential changes

### Future Consideration (v2+)

- [ ] WebAuthn/passkey support alongside TOTP — defer until TOTP is stable and there's user demand
- [ ] Advanced performance metrics (Sharpe ratio, max drawdown, per-strategy attribution) — defer until basic PnL reporting is validated as useful
- [ ] Push notification delivery for alerts (mobile) — defer until in-app/email alerting is proven
- [ ] Multi-tenancy — explicitly Out of Scope per PROJECT.md; revisit only if a future milestone changes that

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Security fixes (CONCERNS.md) | HIGH | MEDIUM | P1 |
| Exchange abstraction layer (CCXT) | HIGH | HIGH | P1 |
| Multi-exchange dashboard (2 exchanges) | HIGH | HIGH | P1 |
| Basic price alerts (threshold, in-app) | HIGH | MEDIUM | P1 |
| 2FA (TOTP + backup codes) | HIGH | MEDIUM | P1 |
| Basic backtesting (candle-based, simple rules) | MEDIUM | HIGH | P1/P2 |
| Basic performance report (per-exchange PnL) | MEDIUM | MEDIUM-HIGH | P2 |
| Multi-condition alerts + email delivery | MEDIUM | MEDIUM | P2 |
| Cross-exchange aggregate performance reporting | MEDIUM | HIGH | P3 |
| Third+ exchange support | LOW-MEDIUM | MEDIUM (per exchange, once abstraction exists) | P3 |
| Credential health checks | MEDIUM | LOW-MEDIUM | P2 |
| Audit log | LOW-MEDIUM | LOW | P3 |
| WebAuthn/passkeys | LOW | MEDIUM | P3 |
| Advanced performance metrics (Sharpe, drawdown) | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (functional parity + explicitly requested core improvements)
- P2: Should have, add when possible within this milestone if time allows
- P3: Nice to have, defer to future milestone

## Competitor Feature Analysis

| Feature | 3Commas-style platforms (SmartTrade/DCA/Grid bots) | Koinly/CoinStats-style portfolio trackers | Our Approach |
|---------|------|------|--------------|
| Multi-exchange | 17+ exchange connections, unified account view | Read-only aggregation across many exchanges/wallets | 2 exchanges v1 via CCXT abstraction, expand later — depth over breadth |
| Price alerts | Threshold + trailing conditions, tied into bot triggers | Threshold + % change alerts, push/email | Threshold alerts v1 (in-app), multi-condition + email as v1.x |
| Backtesting | Strategy backtesting up to ~2 years historical data, tied to auto-trading bots | Largely absent (trackers don't execute strategies) | Candle-based backtesting of alert/rule logic only (no auto-execution to backtest against) |
| Performance reporting | Bot performance stats, tied to executed trades | Portfolio-wide PnL, tax reporting integrations | Per-exchange realized PnL + balance chart v1; no tax reporting (out of scope) |
| 2FA | Standard TOTP, sometimes hardware key support | Standard TOTP | TOTP via otplib + backup codes; WebAuthn deferred |

## Sources

- [10 Best Crypto Trading Bots September 2026 — Koinly](https://koinly.io/blog/best-crypto-trading-bots/)
- [Best Crypto Trading Bots in 2026 — altFINS](https://altfins.com/best/crypto-trading-and-investing/crypto-trading-bots/)
- [15 Crypto Trading Bots Reviewed for 2026 — VentureBurn](https://ventureburn.com/15-crypto-trading-bots-reviewed-for-2026-automation-ai-tools-and-risk-controls/)
- [12 Best AI Crypto Portfolio Management Tools in 2026 — Pionex](https://www.pionex.com/blog/12-best-ai-crypto-portfolio-management-tools-in-2026-automation-fees-custody-compared/)
- [Crypto Trading Dashboard — SimpleMarkets](https://simplemarkets.io/blog/post/crypto-trading-dashboard)
- [CCXT official docs](https://docs.ccxt.com/)
- [CCXT GitHub repository](https://github.com/ccxt/ccxt)
- [NautilusTrader](https://nautilustrader.io/)
- [hftbacktest GitHub](https://github.com/nkaz001/hftbacktest)
- [Jesse — open-source Python crypto trading bot](https://jesse.trade/)
- [OctoBot GitHub](https://github.com/drakkar-software/octobot)
- [otplib on npm](https://www.npmjs.com/package/otplib)
- [speakeasy vs authy vs otplib comparison — npm-compare](https://npm-compare.com/authy,otplib,speakeasy)
- Internal: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`

---
*Feature research for: Crypto multi-exchange trading bot / monitoring dashboard rewrite*
*Researched: 2026-09-12*
