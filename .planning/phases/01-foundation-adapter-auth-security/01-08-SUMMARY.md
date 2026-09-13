---
phase: 01-foundation-adapter-auth-security
plan: 08
subsystem: symbols-sync
tags: [drizzle, transactions, fastify-onlisten, ccxt, symbols, vitest]

# Dependency graph
requires: [01-04, 01-07]
provides:
  - "backend/src/persistence/schema/symbols.ts — symbols table pushed live to both dev and test Postgres databases"
  - "backend/src/modules/symbols/* — domain/application/infrastructure layers: atomic sync-symbols use case, list-symbols use case, symbols repository"
  - "backend/src/modules/symbols/infrastructure/boot-sync.ts — registerBootSymbolSync(app, deps), onListen-gated, empty-table-only, non-blocking"
  - "GET /symbols, POST /symbols/sync — authenticated HTTP endpoints"
  - "frontend/src/private/Settings/Symbols/index.tsx — symbol sync panel, mounted as the third settings card"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fetch-then-transact: adapter.getSymbols() runs outside db.transaction so a slow/failing network call never holds a Postgres transaction open; only a successful fetch enters the transaction that atomically replaces the symbols table"
    - "Boot sync registered on Fastify's onListen hook (not the earlier ready-lifecycle hook), gated by an empty-table check, wrapped in try/catch — a Binance outage at boot is logged and never blocks the server from listening"
    - "ccxt TICK_SIZE-mode precision (fractional step, e.g. 1e-8) converted to an integer decimal-place count before insertion into an `integer` schema column"

key-files:
  created:
    - backend/src/persistence/schema/symbols.ts
    - backend/src/modules/symbols/domain/symbol.entity.ts
    - backend/src/modules/symbols/domain/ports.ts
    - backend/src/modules/symbols/infrastructure/symbols.repository.ts
    - backend/src/modules/symbols/application/sync-symbols.use-case.ts
    - backend/src/modules/symbols/application/list-symbols.use-case.ts
    - backend/src/modules/symbols/infrastructure/symbols.schemas.ts
    - backend/src/modules/symbols/infrastructure/symbols.routes.ts
    - backend/src/modules/symbols/infrastructure/boot-sync.ts
    - backend/tests/symbols/sync-atomicity.test.ts
    - backend/tests/symbols/sync-trigger.test.ts
    - frontend/src/private/Settings/Symbols/index.tsx
    - frontend/tests/symbols.test.tsx
  modified:
    - backend/src/persistence/schema/index.ts
    - backend/src/app.ts
    - backend/src/server.ts
    - backend/src/exchanges/binance/binance.adapter.ts
    - frontend/src/private/Settings/index.tsx

key-decisions:
  - "Fixed a Rule-1 bug discovered during the Task 4 live fresh-boot verification: ccxt's Binance markets report precision in TICK_SIZE mode (a fractional step like 1e-8), not as a plain decimal-place integer. The existing (Plan 04) normalizeMarket() passed this straight through into the new integer schema columns, and Postgres rejected the insert (\"invalid input syntax for type integer: 1e-8\"), silently breaking the entire live sync. Added toDecimalPlaces() to binance.adapter.ts to convert either representation to the integer this schema expects — verified live with 1365 real Binance spot symbols synced successfully afterward."
  - "The `POST /symbols/sync` route deliberately carries no empty-table gate — the manual button always forces a refresh (D-13); only the automatic boot trigger in boot-sync.ts is gated on an empty table (D-14)."
  - "Boot-sync tests use a fake Fastify-shaped app object that captures the `onListen` handler and invokes it directly, rather than depending on whether Fastify's real `app.listen()` promise resolution order includes `onListen` completion — this made the empty-gate/populated-skip/failing-exchange-swallowed assertions deterministic instead of racy. A separate real end-to-end test still boots the actual server with a failing adapter and confirms `GET /health` returns 200, covering the wiring itself."
  - "Symbol list quote/search filtering is implemented client-side over the already-fetched list rather than triggering a new GET per keystroke — the dataset size (~1300 symbols) makes this a reasonable simplification; the backend querystring filter (`quote`/`search`) is still fully implemented and exercised directly by `sync-trigger.test.ts`."

requirements-completed: [EXCH-03, FOUND-04, TEST-01]

# Metrics
duration: ~2h20min (including the Task 4 live-boot deviation investigation and fix)
completed: 2026-09-13
---

# Phase 01 Plan 08: Automatic + Manual Symbol Sync (Symbols Module) Summary

**Market symbols now sync from Binance through the Exchange Adapter automatically on a fresh install (gated to run only once, on `onListen`, never blocking boot) and on demand from a new settings panel, with the delete-then-insert wrapped in one Drizzle transaction so a mid-flight failure can never leave the symbol table empty — closing the phase's last CONCERNS.md defect (the legacy unguarded `deleteAll()` + `bulkInsert()`).**

## Performance

- **Duration:** ~2h20min across 3 `auto` tasks plus the Task 4 checkpoint's automatable verification (including diagnosing and fixing a real integration bug discovered only when exercising the live Binance API)
- **Tasks:** 3 of 3 `auto` tasks completed; Task 4 (`checkpoint:human-verify`, gate="blocking") reached — automated portion completed, documented below, awaiting operator browser sign-off
- **Files created/modified:** 18

## Accomplishments

- `persistence/schema/symbols.ts`: `symbols` table (`symbol` text primary key, `base`/`quote` not-null text, integer `base_precision`/`quote_precision`, nullable text `min_notional`/`min_lot_size`, `is_favorite` boolean default false, `synced_at` timestamp default now, indexed on `quote`) — pushed live via `drizzle-kit push` to **both** the dev and test Postgres databases; confirmed via `information_schema.tables` that `users`, `refresh_tokens`, and `settings` remained untouched.
- `modules/symbols/{domain,application,infrastructure}`: hexagonal module (D-17/D-18) — `SymbolsRepositoryPort` (`count`, `list`, `lastSyncedAt`, `replaceAll(tx, rows)`), a Drizzle repository chunking inserts at 500 rows, and `sync-symbols.use-case.ts` which calls `adapter.getSymbols()` **outside** any transaction and only then opens `db.transaction(async tx => symbols.replaceAll(tx, normalized))` — the fetch-then-transact ordering is asserted directly in `sync-atomicity.test.ts` (line-number check that `getSymbols` precedes `transaction`). An adapter returning zero symbols throws `ExchangeUnknownError` instead of committing an empty replace.
- `boot-sync.ts`: `registerBootSymbolSync(app, { symbols, syncSymbols })` attaches an `onListen` hook (never the earlier ready-lifecycle hook that would block startup) that runs the sync only when `symbols.count() === 0`, wrapped in try/catch so a Binance outage at boot is logged and the server keeps serving.
- `symbols.routes.ts`: `GET /symbols` (Zod querystring `{quote?, search?}`, `authenticate` preHandler) and `POST /symbols/sync` (`authenticate` + `rateLimit: {max: 5, timeWindow: '1 minute'}`, **no** empty-table gate — the manual button always forces a refresh per D-13). Both registered in `app.ts`; boot sync wired into `server.ts`.
- `sync-atomicity.test.ts` (3 tests, live test-DB integration, no ccxt/network involved — a hand-written fake adapter satisfies `IExchangeAdapter`): rollback-on-mid-flight-failure (a 501-row batch with a NOT-NULL-violating row in the second 500-row insert chunk leaves the original 3 seeded symbols untouched), full replace on success, and empty-adapter-result rejected with prior rows intact.
- `sync-trigger.test.ts` (8 tests): deterministic boot-sync unit tests using a fake Fastify-shaped app that captures the `onListen` handler directly (empty-table run-once, populated-table skip with adapter never called, failing-exchange swallowed-and-logged with the table staying empty); one real-server test confirming `app.listen()` + a failing adapter still yields a 200 `GET /health`; and the full `symbols` HTTP surface (401 without auth, quote-filtered `GET /symbols`, manual sync always calling the adapter even on a populated table, 503 on `ExchangeUnavailableError` via a mocked `ccxt.NetworkError`).
- `frontend/src/private/Settings/Symbols/index.tsx`: third settings card ("Sincronização de símbolos"), loads `GET /symbols` on mount, renders count/last-synced-at/filterable list, the exact UI-SPEC empty state ("Nenhum símbolo sincronizado ainda" + verbatim body), the three status badges ("Sincronizado" / "Sincronizando…" / the destructive retry-affordance string), and on a 503 renders the UI-SPEC exchange-unavailable copy. Mounted in `Settings/index.tsx` after Credentials and Change password, separated by `Separator`.
- `frontend/tests/symbols.test.tsx` (4 tests): empty-state copy verbatim, sync click → exactly one POST + disabled button + "Sincronizando…" → resolved count + "Sincronizado" badge, 503 → unavailable message + retry badge, and quote-filter narrowing.
- **Live verification (Task 4 automatable portion):** booted the real backend against the live dev Postgres/Binance with an empty `symbols` table — boot sync fired, logged `boot symbol sync completed`, and populated **1365 real Binance spot symbols**; a second boot logged no sync line at all (D-14 confirmed live, not just in tests); `POST /auth/login` + `GET /symbols?quote=USDT&search=BTC` returned the correctly filtered `BTC/USDT`/`WBTC/USDT` rows; both backend server processes were killed after verification (no leftover listeners).

## Task Commits

1. **Task 1: Symbols table, atomic sync use case, and the [BLOCKING] schema push** - `9520989` (feat)
2. **Task 2: Boot-gated non-blocking sync and the symbols endpoints** - `cf07388` (feat)
3. **Task 3: Symbol panel on the settings screen** - `6e08bc9` (feat)
4. **Deviation fix (discovered during Task 4 live verification): ccxt TICK_SIZE precision normalization** - `f42ee00` (fix)
5. **Task 4: End-of-phase verification** - `checkpoint:human-verify` (`gate="blocking"`), reached — automated portion completed, documented below

## Files Created/Modified

- `backend/src/persistence/schema/symbols.ts`, `schema/index.ts` — symbols table definition and export
- `backend/src/modules/symbols/domain/symbol.entity.ts`, `domain/ports.ts` — `SymbolRecord`, `SymbolsRepositoryPort`
- `backend/src/modules/symbols/infrastructure/symbols.repository.ts` — Drizzle repository, chunked `replaceAll`
- `backend/src/modules/symbols/application/sync-symbols.use-case.ts` — fetch-then-transact atomic sync
- `backend/src/modules/symbols/application/list-symbols.use-case.ts` — filtered list + count + lastSyncedAt
- `backend/src/modules/symbols/infrastructure/symbols.schemas.ts` — Zod querystring schema
- `backend/src/modules/symbols/infrastructure/symbols.routes.ts` — `GET /symbols`, `POST /symbols/sync`
- `backend/src/modules/symbols/infrastructure/boot-sync.ts` — `registerBootSymbolSync`, `onListen`-gated
- `backend/src/app.ts` — registers `symbolsRoutes`
- `backend/src/server.ts` — wires `registerBootSymbolSync`
- `backend/src/exchanges/binance/binance.adapter.ts` — `toDecimalPlaces()` fix (deviation)
- `backend/tests/symbols/sync-atomicity.test.ts`, `sync-trigger.test.ts` — 3 + 8 tests
- `frontend/src/private/Settings/Symbols/index.tsx` — symbol sync panel
- `frontend/src/private/Settings/index.tsx` — mounts `SymbolsCard`
- `frontend/tests/symbols.test.tsx` — 4 tests

## Decisions Made

- See `key-decisions` in the frontmatter — the ccxt precision bug fix, the manual-sync-never-gated route design, the deterministic fake-app boot-sync tests, and the client-side filter simplification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ccxt TICK_SIZE precision floats broke the live symbol insert**
- **Found during:** Task 4's live fresh-boot verification (not caught by any unit test, since all mocked fixtures used clean integer precision values)
- **Issue:** `binance.adapter.ts`'s `normalizeMarket()` (written in Plan 04) passed `market.precision.base`/`.quote` straight through. Binance markets via ccxt report precision in TICK_SIZE mode (e.g., `1e-8`), not as a decimal-place integer. Inserting this into the new `integer` schema columns failed with `PostgresError: invalid input syntax for type integer: "1e-8"`, silently breaking the entire boot sync against the real exchange.
- **Fix:** Added `toDecimalPlaces()` — converts a tick-size float to its decimal-place count (`round(-log10(value))`) while leaving an already-integer decimal-place count unchanged, preserving backward compatibility with Plan 04's existing mocked unit tests (which use integer fixtures like `8`, `2`).
- **Files modified:** `backend/src/exchanges/binance/binance.adapter.ts`
- **Commit:** `f42ee00`
- **Verification:** Full backend suite (62/62) green after the fix; live re-verification synced 1365 real Binance spot symbols successfully; a second live boot correctly skipped the sync (D-14).

No Rule 4 (architectural) deviations.

## Task 4 — Checkpoint Status

This plan's Task 4 is `type="checkpoint:human-verify"` (`gate="blocking"`). Per this session's operating instructions, the automatable portion was completed and is documented here; final browser/UI sign-off is deferred to the operator.

**Completed automatically:**
- `cd backend && npx drizzle-kit push` against **both** `DATABASE_URL` and `TEST_DATABASE_URL` — `symbols` table live in both, `users`/`refresh_tokens`/`settings` intact
- `cd backend && npx vitest run` — 62/62 green (51 pre-existing + 3 atomicity + 8 sync-trigger)
- `cd frontend && npx vitest run` — 19/19 green (15 pre-existing + 4 symbols); `npx tsc --noEmit` clean; `npm run build` exits 0
- `grep -rn "\.only(" backend/tests frontend/tests` — no matches
- `grep -rn "onReady" backend/src` — no matches; `onListen` used exclusively for the boot hook
- Live fresh-boot test against the real dev Postgres + real Binance API (empty `symbols` table): boot sync fired, logged completion, populated 1365 real Binance spot symbols
- Live second-boot test: no sync log line at all — table already populated (D-14 confirmed against the real database, not just mocks)
- Live HTTP verification: `POST /auth/login` with the seeded operator credentials → real access token; `GET /symbols?quote=USDT&search=BTC` with that token → correctly filtered `BTC/USDT`/`WBTC/USDT` rows
- Both backend server processes launched for verification were killed afterward (confirmed via `tasklist` — no leftover listeners)

**What the operator should visually confirm** (browser access was not available in this execution environment — steps below mirror the plan's own Task 4 `<how-to-verify>` list; steps 2 and 6 are already confirmed above via live log/API inspection, restated here for the operator's own visual confidence):
1. `cd backend && npm run dev`, `cd frontend && npm run dev`, log in with the seeded credentials.
2. Go to Settings, save valid Binance read-only credentials, confirm the masked display (covered functionally in Plan 07; re-verify visually here).
3. Confirm the "Sincronização de símbolos" card shows the symbol count and last-synced timestamp already populated (from the automatic boot sync).
4. Click "Sincronizar agora", confirm the count updates and the "Sincronizado" badge appears.
5. Restart the backend and confirm the log shows **no** automatic sync line this time (D-14 — already confirmed via this session's live log inspection, but worth an operator glance).
6. Click "Sair", then in devtools confirm the stored tokens are gone; try to reach `/settings` directly and confirm you land on `/login` (Plan 06 behavior, re-verify in the context of this final phase state).
7. Confirm `cd backend && npx vitest run` and `cd frontend && npx vitest run` both stay green in your own environment (already 62/62 and 19/19 in this session).

If any of the above deviates from `01-UI-SPEC.md` (wrong color, wrong copy, missing badge state, incorrect filter behavior), the fix belongs in `frontend/src/private/Settings/Symbols/index.tsx`.

## User Setup Required

- To manually verify in a browser: run `cd backend && npm run dev` (Terminal A) and `cd frontend && npm run dev` (Terminal B), then open `http://localhost:5173/settings` after logging in. `backend/.env` and seeded operator credentials are already in place from this session; the dev database currently has 1365 real Binance symbols synced from this session's live verification.

## Next Phase Readiness

- `backend/` full suite (62/62) and `frontend/` full suite (19/19) both green; `tsc --noEmit` clean on both; `frontend/npm run build` exits 0.
- The symbols module has no stubs: `GET /symbols` and `POST /symbols/sync` are both live-verified against the real Binance API and the real Postgres database, not just mocked tests.
- Phase 1's full walking-skeleton slice (login → settings credentials → symbol sync) is now functionally complete end-to-end; only the operator's own browser/UI sign-off on Task 4's checklist remains before the phase can be marked done.
- No leftover backend/frontend dev-server processes were left running at the end of this session.

---
*Phase: 01-foundation-adapter-auth-security*
*Completed: 2026-09-13*

## Self-Check: PASSED

All 13 created files verified present on disk (symbols.ts, symbol.entity.ts, ports.ts, symbols.repository.ts, sync-symbols.use-case.ts, list-symbols.use-case.ts, symbols.schemas.ts, symbols.routes.ts, boot-sync.ts, sync-atomicity.test.ts, sync-trigger.test.ts, frontend Symbols/index.tsx, frontend symbols.test.tsx); all 4 commits (`9520989`, `cf07388`, `6e08bc9`, `f42ee00`) verified present in `git log`.
