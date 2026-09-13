---
phase: 02
slug: realtime-gateway-dashboard-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
updated: 2026-09-13
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (backend and frontend, both already configured in Phase 1) |
| **Config file** | `backend/vitest.config.ts` (include `tests/**/*.test.ts`), `frontend/vitest.config.ts` (include `tests/**/*.test.tsx`, jsdom) |
| **Quick run command** | `cd backend && npx vitest run <changed test file>` (frontend: `cd frontend && npx vitest run <file>`) |
| **Full suite command** | `cd backend && npx vitest run` then `cd frontend && npx vitest run` |
| **Estimated runtime** | ~30 seconds backend, ~10 seconds frontend (per Phase 1 baseline; grows with new realtime suites) |

**Path correction applied during planning:** both workspaces use a top-level `tests/` directory (not colocated `src/**/*.test.*`), per the `include` globs in their vitest configs. Frontend test paths below were rewritten accordingly.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run` (full suite, both workspaces)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T2 | 02-01 | 1 | SEC-06 | T-02-01, T-02-02, T-02-04 | WS connection rejects missing/invalid token as first message (close 4001); accepts valid token; malformed message closes 4400 without crashing; disallowed Origin rejected | integration | `cd backend && npx vitest run tests/realtime/ws-auth.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | SEC-06 | T-02-03 | Cross-user subscription to `account:{otherUserId}` is rejected with close 4003 and no registry insertion | integration | `cd backend && npx vitest run tests/realtime/subscription-authz.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-T1 | 02-01 | 1 | RT-01 | T-02-05 | Subscribing to `ticker:binance:BTCUSDT` receives only that topic's events; closed sockets skipped; `removeAll` cleans every topic | unit | `cd backend && npx vitest run tests/realtime/subscription-registry.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | RT-02 | T-02-06 | miniTicker normalization preserves string precision; malformed frame ignored; reconnect backoff grows 1s→2s and stops after dispose; supervisor refcounts one upstream stream per symbol | unit | `cd backend && npx vitest run tests/exchanges/binance-stream.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-T1, 02-02-T2 | 02-02 | 2 | RT-02 / D-04 | T-02-07, T-02-08, T-02-09 | Token sent only in the first WS frame (never in the URL); reconnect re-auths and re-subscribes; client realtime context keeps last-known ticker visible while `connectionStatus === 'reconnecting'` | component | `cd frontend && npx vitest run tests/realtime-reconnect.test.tsx` | ❌ W0 | ⬜ pending |
| 02-02-T3, 02-03-T2 | 02-02, 02-03 | 2, 3 | RT-02 | — | Ticker card renders skeleton before first frame, colors by tick direction, and re-subscribes on symbol change (unsubscribe old → subscribe new) | component | `cd frontend && npx vitest run tests/dashboard-ticker.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-T1 | 02-03 | 3 | RT-02 / D-07, D-08 | T-02-11 | Symbol combobox queries `GET /symbols?search=`, renders UI-SPEC copy, and persists the choice at `@Beholder:selectedSymbol` | component | `cd frontend && npx vitest run tests/symbol-combobox.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-T3 | 02-03 | 3 | RT-03 | T-02-12, T-02-13 | TradingViewChart constructs a fresh widget when `symbol` changes (no `setSymbol`), loads `tv.js` once, renders failure copy on script error | component | `cd frontend && npx vitest run tests/tradingview-chart.test.tsx` | ❌ W0 | ⬜ pending |
| 02-04-T1 | 02-04 | 4 | RT-02 / D-01, D-02 | T-02-14, T-02-15 | `depth10@100ms` payload normalizes to 10 bids/10 asks with strings preserved; no local aggregation; book stream refcounted independently of ticker | unit | `cd backend && npx vitest run tests/exchanges/binance-stream.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-T2 | 02-04 | 4 | RT-02 | T-02-17 | Order book renders 10x10 with bid/ask tokens, empty-state copy, symbol re-subscription, and survives disconnect without blanking | component | `cd frontend && npx vitest run tests/order-book.test.tsx` | ❌ W0 | ⬜ pending |
| 02-05-T1 | 02-05 | 5 | RT-02 | T-02-19, T-02-20 | listenKey keepalive PUT fires every 30 min independently of socket events, is cleared on close, and no credential is ever logged | unit | `cd backend && npx vitest run tests/exchanges/binance-user-data.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-T2 | 02-05 | 5 | RT-02 / SEC-06, D-03 | T-02-03b, T-02-18, T-02-21 | Cross-user account subscribe is refused before any credential lookup; own-topic subscribe publishes a full unfiltered balance snapshot (zeroed assets included) and merges deltas into the full list | integration | `cd backend && npx vitest run tests/realtime/subscription-authz.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-T3 | 02-05 | 5 | RT-02 / D-03 | — | Balance table renders every asset with no minimum-balance filter, subscribes only the authenticated user's account topic, and preserves rows on disconnect | component | `cd frontend && npx vitest run tests/balance-table.test.tsx` | ❌ W0 | ⬜ pending |
| 02-06-T1 | 02-06 | 6 | TEST-02 | T-02-SC | Full-suite regression, typechecks, production build and `npm audit --audit-level=high` all clean at phase close | integration | `cd backend && npx vitest run && npx tsc --noEmit && cd ../frontend && npx vitest run && npx tsc -b --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs use the `{plan}-T{task number}` convention, e.g. `02-01-T2` = Plan 02-01, Task 2.*

---

## Wave 0 Requirements

All realtime test files are net-new this phase and are created inside the plan task that produces the code they cover — never deferred to a trailing "add tests" task.

- [ ] `backend/tests/realtime/subscription-registry.test.ts` — Plan 02-01 Task 1 (RT-01 topic-scoped fan-out)
- [ ] `backend/tests/realtime/ws-auth.test.ts` — Plan 02-01 Task 2 (SEC-06 handshake accept/reject, origin, malformed message)
- [ ] `backend/tests/realtime/subscription-authz.test.ts` — Plan 02-01 Task 2, extended by Plan 02-05 Task 2 (private-topic authorization, Pitfall 4)
- [ ] `backend/tests/exchanges/binance-stream.test.ts` — Plan 02-01 Task 3, extended by Plan 02-04 Task 1 (ticker + depth normalization, backoff, supervisor refcount; `vi.mock('ws')`)
- [ ] `backend/tests/exchanges/binance-user-data.test.ts` — Plan 02-05 Task 1 (listenKey lifecycle/keepalive scheduling)
- [ ] `frontend/tests/realtime-reconnect.test.tsx` — Plan 02-02 Tasks 1-2 (D-04 frozen-state-on-disconnect, re-auth/re-subscribe)
- [ ] `frontend/tests/dashboard-ticker.test.tsx` — Plan 02-02 Task 3, extended by Plan 02-03 Task 2
- [ ] `frontend/tests/symbol-combobox.test.tsx` — Plan 02-03 Task 1
- [ ] `frontend/tests/tradingview-chart.test.tsx` — Plan 02-03 Task 3 (RT-03 remount-on-symbol-change)
- [ ] `frontend/tests/order-book.test.tsx` — Plan 02-04 Task 2
- [ ] `frontend/tests/balance-table.test.tsx` — Plan 02-05 Task 3
- [ ] Shared test doubles: `vi.mock('ws')` fake socket (backend) and a fake `globalThis.WebSocket` class (frontend) so no test ever reaches the real Binance endpoint or a real backend

---

## Manual-Only Verifications

| Behavior | Requirement | Plan / Task | Why Manual | Test Instructions |
|----------|-------------|-------------|------------|-------------------|
| Dashboard renders live ticker/book/balance/chart and updates in real time from an end-user's point of view | RT-02, RT-03, TEST-02 | 02-06 Task 2 | ROADMAP success criterion #4 explicitly requires manual UAT via Claude Browser — automated tests verify the wiring, not the live visual experience | Boot backend+frontend, log in, open dashboard, confirm ticker/book/balance panels update without reload, switch pairs, reload to confirm persistence, confirm chart renders, and inspect the WS URL in devtools for the absence of a token param |
| Client-side reconnection banner appears and last-known data stays visible when the connection actually drops | D-04, TEST-02 | 02-06 Task 3 | Requires physically interrupting the WS connection (kill/restart backend) while watching the browser — not practically simulated end-to-end | With dashboard open, stop the backend; observe the discreet banner + frozen data, then the hard-failure copy; restart the backend and confirm updates resume without reload or re-login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (set to approved by Plan 02-06 Task 1 once every row is green)
