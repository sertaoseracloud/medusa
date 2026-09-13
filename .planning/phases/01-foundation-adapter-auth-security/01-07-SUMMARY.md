---
phase: 01-foundation-adapter-auth-security
plan: 07
subsystem: frontend-settings
tags: [react, shadcn, vitest, settings, credentials, password-change]

# Dependency graph
requires: [01-03, 01-05, 01-06]
provides:
  - "frontend/src/private/Settings/index.tsx — /settings page mounting Credentials + Change password cards, separated by a Separator"
  - "frontend/src/private/Settings/hooks.ts — useSettings() (GET/PUT /settings/credentials, error surfaced with backend code + fields intact)"
  - "frontend/src/private/Settings/Credentials/index.tsx — test-before-save Binance credentials form, masked display, per-code error messages"
  - "frontend/src/private/Settings/ChangePassword/index.tsx — password-change form with the permanent D-04 env-var-revert warning"
  - "backend/src/shared/http/error-handler.ts — DomainError responses now include { code } in the data field (fixes the settings interface contract)"
affects: [01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSettings() rethrows a structured SettingsSaveError ({ code, fields, message }) from the PUT call so the component branches on the backend's stable error code, never on message text"
    - "Split test file evolution across two commits (5 credenciais-only scenarios in Task 1, expanded to 7 with password scenarios in Task 2) mirroring Plan 03's precedent for forward-referenced shared files"

key-files:
  created:
    - frontend/src/private/Settings/index.tsx
    - frontend/src/private/Settings/hooks.ts
    - frontend/src/private/Settings/Credentials/index.tsx
    - frontend/src/private/Settings/ChangePassword/index.tsx
    - frontend/tests/settings.test.tsx
  modified:
    - frontend/src/routes.tsx
    - backend/src/shared/http/error-handler.ts
    - backend/tests/http/validation-envelope.test.ts
    - backend/tests/auth/login.test.ts

key-decisions:
  - "Fixed a blocking backend/frontend contract mismatch: the shared error handler discarded each DomainError's `code` field and always sent `data: null`, but this plan's own interfaces section requires the frontend to branch on EXCHANGE_AUTH/EXCHANGE_PERMISSION/EXCHANGE_UNAVAILABLE/EXCHANGE_UNKNOWN codes, not message text. Added `data: { code: err.code }` to the DomainError branch of error-handler.ts and updated the two existing tests that asserted `data` was strictly null for any DomainError (validation-envelope.test.ts, login.test.ts) — verified live against the real backend that PUT /settings/credentials with invalid keys now returns `{\"data\":{\"code\":\"EXCHANGE_AUTH\"},...}`."
  - "No 'add another exchange' affordance and no secret-reveal toggle — both explicitly out of scope per D-08 and the threat model's T-01-SEC07ui mitigation."

requirements-completed: [FOUND-03, AUTH-02, SEC-07]

# Metrics
duration: ~1h10min (Task 1 ~35min incl. the error-handler deviation; Task 2 ~25min; Task 3 automatable portion ~10min)
completed: 2026-09-13
---

# Phase 01 Plan 07: Settings Screen (Binance Credentials + Password Change) Summary

**The operator now reaches a real `/settings` screen: a Binance credentials card that validates against the live exchange before saving and renders the secret masked (never in full), and a password-change card carrying the mandatory, permanently-visible env-var revert warning — fixing the legacy screen that displayed the raw `secretKey` on every load.**

## Performance

- **Duration:** ~1h10min across 3 tasks (Task 3 is `checkpoint:human-verify`; the automatable portion was completed and is documented below)
- **Tasks:** 2 of 2 `auto` tasks completed; Task 3 reached and returned as a checkpoint
- **Files created/modified:** 9

## Accomplishments

- `frontend/src/routes.tsx`: added a protected `/settings` route rendering `private/Settings/index.tsx` inside the existing `ProtectedRoute`/`AppShell` subtree — no change to the route tree's top-level shape.
- `private/Settings/hooks.ts`: `useSettings()` fetches `GET /settings/credentials` on mount and exposes `save({ accessKey, secretKey })` which issues `PUT /settings/credentials`; on failure it rethrows a structured `{ code, fields, message }` object built from the backend's response so the component can branch on the stable `code`, never on message text. No client-side call to Binance exists anywhere in the frontend (verified by grep for `binance.com`/`api.binance`).
- `private/Settings/Credentials/index.tsx`: card titled "Credenciais da Binance"; when `configured` is true, renders the server-provided `accessKeyMasked`/`secretKeyMasked` verbatim as read-only text with no reveal toggle; form with `accessKey`/`secretKey` (`type="password"`) inputs and the exact "Salvar credenciais" CTA, disabled for the entire round trip (verified with a manually-controlled pending promise in the test suite) so a double click cannot fire two exchange calls; renders the three exact UI-SPEC error strings keyed off `EXCHANGE_AUTH`/`EXCHANGE_PERMISSION`/`EXCHANGE_UNAVAILABLE`, and per-field inline messages for a 400 Zod validation response.
- `private/Settings/ChangePassword/index.tsx`: card titled "Trocar senha" with the destructive-styled, permanently-visible (not conditional on submit) D-04 warning above the form; `currentPassword`/`newPassword` (`type="password"`) fields, exact "Atualizar senha" CTA; client-side 12-character minimum on the new password blocking submission with an inline message (mirroring the backend Zod rule) with zero request issued; 401 renders "Email ou senha incorretos."; success calls `useAuth().changePassword` and navigates to `/login` (that endpoint revokes every session server-side, so the client cannot pretend to keep it alive).
- `private/Settings/index.tsx`: mounts both cards, Credentials then Change password, separated by a `Separator`.
- `tests/settings.test.tsx`: 7 scenarios, all green — both card titles render; a configured settings response renders the masked secret with the full fixture secret never appearing anywhere in the DOM; a save issues exactly one `PUT` and the button stays disabled while the request is pending; a 400 `EXCHANGE_AUTH` and a 503 `EXCHANGE_UNAVAILABLE` response each render their own exact UI-SPEC string; the password warning is present on first render with zero interaction; an 8-character new password blocks submission with the inline message and issues no `PATCH` call.
- **Deviation (fix, backend):** discovered that the shared `error-handler.ts` dropped every `DomainError`'s `code` field and always sent `data: null` — which directly contradicted this plan's own interfaces contract requiring code-based branching. Fixed `error-handler.ts` to send `data: { code: err.code }`, updated the two pre-existing tests that asserted a strict `data: null` for any `DomainError` (`validation-envelope.test.ts`, `login.test.ts`), reran the full backend suite (51/51 green), and verified live against the real backend that `PUT /settings/credentials` with invalid Binance keys now returns `{"data":{"code":"EXCHANGE_AUTH"},...}`.
- Live sanity check (Task 3 automatable portion): booted the backend (`npx tsx src/server.ts`), logged in with the seeded operator credentials, confirmed `GET /settings/credentials` returns `configured: false` before any save, `PUT /settings/credentials` with intentionally invalid Binance keys returns the exact `EXCHANGE_AUTH` message and code with no plaintext leak in the response, and killed the backend process afterward (confirmed no leftover listener on port 3333).

## Task Commits

1. **Task 1: Settings route with the Binance credentials card** - `6ecb8f1` (feat), preceded by `fe00490` (fix — the error-handler `code` deviation, required for this task's interface contract to actually work)
2. **Task 2: Password-change card with the env-var revert warning** - `17880b7` (feat)
3. **Task 3: Verify the credentials and password screens against the design contract** - `checkpoint:human-verify`, reached and returned per this session's operating instructions (see below)

## Files Created/Modified

- `frontend/src/routes.tsx` - added the `/settings` route inside the protected subtree
- `frontend/src/private/Settings/index.tsx` - settings page, mounts both cards
- `frontend/src/private/Settings/hooks.ts` - `useSettings()` fetch/save against `/settings/credentials`
- `frontend/src/private/Settings/Credentials/index.tsx` - Binance credentials card
- `frontend/src/private/Settings/ChangePassword/index.tsx` - password-change card with the D-04 warning
- `frontend/tests/settings.test.tsx` - 7-scenario Vitest/RTL suite
- `backend/src/shared/http/error-handler.ts` - DomainError responses now include `{ code }`
- `backend/tests/http/validation-envelope.test.ts`, `backend/tests/auth/login.test.ts` - updated to expect `{ code }` instead of strict `null`

## Decisions Made

- Fixed the backend/frontend error-code contract gap (see Deviations) rather than having the frontend fall back to message-text matching, which the plan's own acceptance criteria and threat model (T-01-ERRCODE) explicitly forbid.
- No multi-exchange affordance and no secret-reveal toggle anywhere in the Credentials card, per D-08 and the threat model's T-01-SEC07ui mitigation.
- Split `tests/settings.test.tsx`'s evolution across the two task commits (credenciais-only in Task 1, full 7-scenario suite in Task 2) to keep each commit's own stated verify command passing independently, mirroring the precedent set in Plan 03 for files with a forward-reference split across tasks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] Backend error envelope discarded the DomainError `code` field required by this plan's interface contract**
- **Found during:** Task 1, before implementing the Credentials card's error branching
- **Issue:** `backend/src/shared/http/error-handler.ts` sent `data: null` for every `DomainError`, even though every exchange/auth error subclass already declares a `code` (`EXCHANGE_AUTH`, `EXCHANGE_PERMISSION`, etc.). The plan's `<interfaces>` block explicitly requires the frontend to branch on that code, which was structurally impossible without this fix.
- **Fix:** Changed the `DomainError` branch of `error-handler.ts` to `data: { code: err.code }`. Updated the two backend tests that asserted a strict `data: null` on a `DomainError` response (`validation-envelope.test.ts`'s generic `TestConflictError` case, `login.test.ts`'s wrong-password case) to expect `{ code: '...' }` instead. Verified no other backend test asserted the old strict-null shape.
- **Files modified:** `backend/src/shared/http/error-handler.ts`, `backend/tests/http/validation-envelope.test.ts`, `backend/tests/auth/login.test.ts`
- **Commit:** `fe00490`
- **Verification:** Full backend suite (`npx vitest run`) — 51/51 green after the fix; live `curl PUT /settings/credentials` with invalid keys confirmed the response now reads `{"data":{"code":"EXCHANGE_AUTH"},...}`.

No Rule 4 (architectural) deviations — the fix was a one-line change to an existing serialization path plus two test-assertion updates, not a new structure.

## Task 3 — Checkpoint Status

This plan's Task 3 is `type="checkpoint:human-verify"` (`gate="blocking"`). Per this session's operating instructions, the automatable portion was completed and is documented here; final visual/browser sign-off is deferred to the operator.

**Completed automatically:**
- `cd backend && npm install`, `cd frontend && npm install` (fresh worktree, `node_modules` gitignored) — both succeeded
- `backend/.env` created with the exact values provided for this worktree
- `cd frontend && npx vitest run tests/settings.test.tsx` — 7/7 green; `cd frontend && npx vitest run` (full suite) — 15/15 green; `npx tsc --noEmit` clean; `npm run build` exits 0
- `cd backend && npx vitest run` — 51/51 green (after the error-code fix)
- Booted the backend (`npx tsx src/server.ts`) — confirmed `[seed-user] operator user synced` and `Server listening at http://127.0.0.1:3333`
- Logged in via `curl POST /auth/login` with the seeded operator credentials → real access token
- `curl GET /settings/credentials` with that token → `configured: false` (no prior save)
- `curl PUT /settings/credentials` with intentionally invalid Binance keys → `400 {"data":{"code":"EXCHANGE_AUTH"},"message":"Chave ou segredo inválidos. ..."}`, no plaintext key/secret anywhere in the response
- Backend process killed after verification (confirmed via `netstat` — no leftover listener on port 3333)

**What the operator should visually confirm** (browser access was not available in this execution environment — steps below reproduce the plan's own Task 3 `<how-to-verify>` list):
1. Start both apps (`cd backend && npm run dev`, `cd frontend && npm run dev`), log in, and click the Settings link in the header.
2. Confirm the page shows "Configurações" with two cards and the dark UI-SPEC palette (`#0A0E14` background, `#151B26` cards).
3. Save an intentionally wrong API key/secret — expect "Chave ou segredo inválidos..." (confirmed programmatically above via curl) and confirm in the database that `select count(*) from settings` is still 0 for this operator.
4. Save a real Binance read-only API key without balance permission, if available, to see the permission-specific message — skip if no such key is available.
5. Save valid read-only Binance credentials — expect success, then confirm the screen shows the secret as twelve bullets plus its last four characters, and that reloading the page still shows only the masked form.
6. Open the browser devtools Network tab and inspect both the `PUT` and `GET` `/settings/credentials` responses — confirm neither payload contains the full secret anywhere (confirmed via curl above for the `PUT` failure path; the success-path payload should be spot-checked visually too).
7. In the password card, confirm the red warning is visible immediately with no interaction, then change the password and confirm you are returned to the login screen and the new password works.
8. Restart the backend and confirm the password reverts to `SEED_USER_PASSWORD` exactly as the warning states (D-03 behaviour).

If any of the above deviates from `01-UI-SPEC.md` (wrong color, wrong copy, missing masked value, a visible full secret), the fix belongs in `frontend/src/private/Settings/Credentials/index.tsx`, `frontend/src/private/Settings/ChangePassword/index.tsx`, or `backend/src/modules/settings/infrastructure/settings.dto.ts`.

## User Setup Required

- To manually verify in a browser: run `cd backend && npm run dev` (Terminal A) and `cd frontend && npm run dev` (Terminal B), then open `http://localhost:5173/settings` after logging in. `backend/.env` and seeded operator credentials are already in place from this session.

## Next Phase Readiness

- `frontend/` builds clean (`npm run build` exits 0), typechecks clean (`npx tsc --noEmit`), and all 15 Vitest scenarios pass (8 from Plans 03/06 + 7 new in this plan).
- `backend/` full suite (`npx vitest run`) — 51/51 green, including the two tests updated for the error-code fix.
- The settings screen has no stubs: the credentials form is wired to the real `GET`/`PUT /settings/credentials` endpoints (live-verified via curl), and the password-change form is wired to the real `changePassword()` from Plan 06.
- Plan 08 (balance/market-data) can rely on the settings slice being fully functional — no remaining gaps in the credentials-save flow.
- No leftover backend/frontend dev-server processes were left running.

---
*Phase: 01-foundation-adapter-auth-security*
*Completed: 2026-09-13*

## Self-Check: PASSED

All 7 key files verified present on disk (routes.tsx, Settings/index.tsx, Settings/hooks.ts, Credentials/index.tsx, ChangePassword/index.tsx, tests/settings.test.tsx, backend error-handler.ts); all 3 commits (`fe00490`, `6ecb8f1`, `17880b7`) verified present in `git log`.
