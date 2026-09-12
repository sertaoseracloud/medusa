# Roadmap: Beholder — Refactoring para Stack Atual

## Overview

Beholder is a complete rewrite of a single-user Binance monitoring/configuration trading bot onto a modern, secure stack (Fastify + PostgreSQL/Drizzle + React 19). The build order follows a strict dependency chain surfaced by research: the Exchange Adapter layer and hardened auth/security must exist before anything else touches them (Phase 1); the real-time WebSocket path must be rebuilt correctly, with dashboard parity restored, before new feature surface is added (Phase 2); 2FA layers onto the now-stable auth/session model (Phase 3); a shared, pure rule-evaluation engine is built once and driven first by live price alerts (Phase 4) so it can be reused unmodified by backtesting (Phase 5) without inventing two condition languages; and performance reporting is built last (Phase 6) on top of a durable, REST-reconciled data pipeline informed by lessons from the realtime and alerts phases. Multi-exchange support is explicitly deferred to v2 — all v1 work targets Binance only.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation — Adapter, Auth & Security** - New Fastify/PostgreSQL backend and React frontend with a Binance Exchange Adapter, hardened JWT auth, and encrypted credential storage
- [ ] **Phase 2: Realtime Gateway & Dashboard Parity** - Topic-based WebSocket pub/sub restores live ticker/order-book/balance dashboard with TradingView charts
- [ ] **Phase 3: Two-Factor Authentication** - TOTP-based 2FA with backup codes, enforced at login
- [ ] **Phase 4: Shared Rule Engine & Price Alerts** - Pure rule-evaluation module drives user-configurable price alerts with in-app notifications
- [ ] **Phase 5: Backtesting** - Historical candle-based backtesting reuses the alert rule engine, with a no-lookahead regression test
- [ ] **Phase 6: Performance Reporting** - Realized PnL and balance-over-time reporting reconciled against REST truth

## Phase Details

### Phase 1: Foundation — Adapter, Auth & Security
**Goal**: User can log in securely, configure encrypted Binance credentials, and have market symbols synced automatically — all on the new, hardened stack.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-07, SEC-08, SEC-09, EXCH-01, EXCH-02, EXCH-03, AUTH-01, AUTH-02, AUTH-03, TEST-01
**Success Criteria** (what must be TRUE):
  1. User can log in with email/password, receive a JWT, and stay authenticated across a session via sliding-expiration refresh without re-entering credentials.
  2. User can log out and the invalidated token is rejected by the server on any subsequent request (persistent blacklist, not the legacy no-op logout).
  3. User can save Binance API key/secret through the settings UI; credentials are stored with envelope encryption (AES-256-GCM, random nonce per record) and are never returned in plaintext via any API response or written to logs.
  4. Market symbols sync automatically from Binance through the new Exchange Adapter abstraction (not a hardcoded Binance-only client).
  5. Every API endpoint rejects invalid input (schema validation) and malformed/expired JWTs gracefully without crashing the server; automated unit/integration tests cover auth, credential storage, and symbol sync.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Realtime Gateway & Dashboard Parity
**Goal**: User sees live market data (ticker, order book, balance) on the dashboard through a secure, topic-scoped WebSocket connection, with charting preserved.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SEC-06, RT-01, RT-02, RT-03, TEST-02
**Success Criteria** (what must be TRUE):
  1. User's dashboard displays live mini ticker, order book, and balance updates delivered via topic-based pub/sub — each client only receives data for topics it subscribed to, not a broadcast of all data.
  2. WebSocket connections authenticate via a first-message token exchange handshake, never via a token embedded in the connection URL.
  3. The TradingView chart widget renders on the dashboard alongside live data, matching legacy functional parity.
  4. Manual UAT via Claude Browser confirms the dashboard renders correctly and updates in real time from an end user's point of view.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Two-Factor Authentication
**Goal**: User can protect their account with TOTP-based two-factor authentication and recover access if the authenticator is lost.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: 2FA-01, 2FA-02, 2FA-03
**Success Criteria** (what must be TRUE):
  1. User can enable 2FA by scanning a TOTP QR code with an authenticator app and confirming a generated code.
  2. User is shown backup/recovery codes when enabling 2FA and can use one in place of a TOTP code.
  3. Login requires a valid TOTP or backup code whenever 2FA is enabled for the account; login is rejected without one.
**Plans**: TBD

### Phase 4: Shared Rule Engine & Price Alerts
**Goal**: User can create price alerts that notify them in-app when triggered, backed by a pure rule-evaluation module built for reuse by backtesting.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ALERT-01, ALERT-02, ALERT-03
**Success Criteria** (what must be TRUE):
  1. User can create a price alert with a simple threshold condition (price above/below X) for a symbol.
  2. User receives an in-app notification when a live tick satisfies an active alert's condition.
  3. The rule-evaluation logic used to trigger alerts lives in a pure, side-effect-free, standalone module with no dependency on the alerts feature's plumbing (verifiably reusable, not embedded inline).
**Plans**: TBD

### Phase 5: Backtesting
**Goal**: User can validate rule logic against historical candle data before trusting it live, without any duplicated evaluation logic.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: BT-01, BT-02, BT-03
**Success Criteria** (what must be TRUE):
  1. User can run a backtest of a simple rule (threshold or moving-average crossover) against historical OHLCV candle data for a symbol and see the results.
  2. The backtest evaluates rules using the exact same rule-evaluation module built in Phase 4 for live alerts — no second, parallel implementation of the condition logic.
  3. An automated no-lookahead regression test proves the backtest never uses a candle's own future/close data to evaluate a decision at that same bar.
**Plans**: TBD

### Phase 6: Performance Reporting
**Goal**: User can review realistic trading performance built from durable, reconciled records rather than transient stream data.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: REP-01, REP-02, REP-03
**Success Criteria** (what must be TRUE):
  1. User can view realized PnL for their Binance account.
  2. User can view a balance-over-time chart reflecting historical account balance.
  3. Reported PnL and balance figures are reconciled through periodic REST calls against Binance (system of record), not derived solely by summing WebSocket ticks.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Adapter, Auth & Security | 0/TBD | Not started | - |
| 2. Realtime Gateway & Dashboard Parity | 0/TBD | Not started | - |
| 3. Two-Factor Authentication | 0/TBD | Not started | - |
| 4. Shared Rule Engine & Price Alerts | 0/TBD | Not started | - |
| 5. Backtesting | 0/TBD | Not started | - |
| 6. Performance Reporting | 0/TBD | Not started | - |
</content>
