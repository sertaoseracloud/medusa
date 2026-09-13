---
phase: 02
slug: realtime-gateway-dashboard-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (backend and frontend, both already configured in Phase 1) |
| **Config file** | `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run <changed test file>` (frontend: `cd frontend && npx vitest run <file>`) |
| **Full suite command** | `cd backend && npx vitest run` then `cd frontend && npx vitest run` |
| **Estimated runtime** | ~30 seconds backend, ~10 seconds frontend (per Phase 1 baseline; grows with new realtime suites) |

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
| TBD | TBD | — | SEC-06 | T-02-WSAUTH | WS connection rejects missing/invalid token as first message; accepts valid token | integration | `npx vitest run tests/realtime/ws-auth.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | SEC-06 | T-02-XUSER | Cross-user subscription to `account:{otherUserId}` is rejected | integration | `npx vitest run tests/realtime/subscription-authz.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | RT-01 | T-02-TOPIC | Subscribing to `ticker:binance:BTCUSDT` receives only that topic's events, not other symbols' | unit/integration | `npx vitest run tests/realtime/subscription-registry.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | RT-02 | — | BinanceAdapter normalizes a raw `depth10@100ms` payload into the expected 10-bid/10-ask shape | unit | `npx vitest run tests/exchanges/binance-stream.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | RT-02 | — | listenKey keepalive is scheduled on stream start and cleared on stream close | unit | `npx vitest run tests/exchanges/binance-user-data.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | RT-03 | — | TradingViewChart component remounts (fresh widget init) when `symbol` prop changes | component | `npx vitest run src/components/TradingViewChart.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | — | RT-02 / D-04 | — | Client realtime context keeps last-known ticker/book/balance state visible while `connectionStatus === 'reconnecting'` | component | `npx vitest run src/contexts/realtime/reconnect-state.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task ID / Plan / Wave columns are TBD until `gsd-planner` produces PLAN.md files — the planner MUST update this table with real task IDs.*

---

## Wave 0 Requirements

- [ ] `backend/tests/realtime/ws-auth.test.ts` — covers SEC-06 handshake accept/reject
- [ ] `backend/tests/realtime/subscription-authz.test.ts` — covers private-topic authorization (Pitfall 4)
- [ ] `backend/tests/realtime/subscription-registry.test.ts` — covers RT-01 topic-scoped fan-out
- [ ] `backend/tests/exchanges/binance-stream.test.ts` — covers RT-02 ticker/depth normalization (mock `ws`, similar to Plan 01-04's `vi.mock('ccxt', ...)` pattern)
- [ ] `backend/tests/exchanges/binance-user-data.test.ts` — covers listenKey lifecycle/keepalive scheduling
- [ ] `frontend/src/contexts/realtime/*.test.tsx` — covers D-04 frozen-state-on-disconnect behavior
- [ ] `frontend/src/components/TradingViewChart.test.tsx` — covers RT-03 remount-on-symbol-change
- [ ] Shared test fixture: a fake/mock Binance WS server (or `vi.mock('ws')`) so integration-style tests never hit the real Binance endpoint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard renders live ticker/book/balance and updates in real time from an end-user's point of view | RT-02, TEST-02 | ROADMAP success criterion #4 explicitly requires manual UAT via Claude Browser — automated tests verify the wiring, not the live visual experience | Boot backend+frontend, log in, open dashboard, confirm ticker/book/balance panels update without reload, confirm TradingView chart renders |
| Client-side reconnection banner appears and last-known data stays visible when the connection actually drops | D-04 | Requires physically interrupting the WS connection (kill/restart backend) while watching the browser — not practically simulated in a unit test | With dashboard open, restart the backend process; observe banner + frozen data in browser, then confirm live updates resume on reconnect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
