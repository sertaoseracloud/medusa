---
status: partial
phase: 01-foundation-adapter-auth-security
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md]
started: 2026-09-13T19:38:36Z
updated: 2026-09-13T19:48:02Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend/frontend dev servers, start both from scratch. Backend boots without errors (seed-user sync logged, listening on :3333); frontend boots and serves the login page at :5173.
result: pass

### 2. Step 1: Open the app
expected: Navigating to http://localhost:5173 shows the Beholder login screen (dark theme) with Email and Senha fields and an "Entrar" button. No dashboard content is visible yet.
result: pass

### 3. Step 2: Log in with valid credentials
expected: Entering the seeded operator's email/password and clicking "Entrar" redirects to the dashboard, which shows "Sessão ativa" and the logged-in email.
result: pass

### 4. Step 3: Session persists across reload
expected: Reloading the dashboard page keeps you logged in (still shows your email under "Sessão ativa") — you are NOT redirected back to the login screen.
result: pass

### 5. Step 4: Open Settings
expected: Clicking "Settings" in the header navigates to a "Configurações" page showing a "Credenciais da Binance" card, a "Trocar senha" card (with a red warning always visible), and a "Sincronização de símbolos" card.
result: pass

### 6. Step 5: Save invalid Binance credentials
expected: Entering any accessKey/secretKey values that are not real valid Binance keys and clicking "Salvar credenciais" shows the specific message "Chave ou segredo inválidos. Verifique as credenciais geradas no painel da Binance e tente novamente." — not a generic "something went wrong" message.
result: pass

### 7. Step 6: Symbols panel shows synced data
expected: The "Sincronização de símbolos" card shows a "Sincronizado" badge, a count of synced symbols (in the thousands), and a last-synced timestamp — without you clicking anything. Typing a quote currency (e.g. "USDT") and a search term (e.g. "BTC") into the two filter fields narrows the list to matching pairs (e.g. BTC/USDT, WBTC/USDT).
result: pass

### 8. Step 7: Outcome — safely start using the trading bot
expected: Taken together, you were able to log in, your session survived a reload, you could attempt to configure exchange credentials (with clear feedback on invalid ones), and market symbols are available for the bot to use — the full "foundation" the rest of the bot depends on works end-to-end.
result: pass

### 9. Logout invalidates the session server-side
expected: Clicking "Sair" returns you to the login screen. If you try to reuse the old session afterward (e.g. by manually replaying the old refresh token), the server rejects it — logout is a real revocation, not just clearing local storage.
result: pass

### 10. Invalid input is rejected with per-field errors
expected: Submitting the login form with a malformed email (e.g. "nope") shows an inline validation error under the Email field instead of a server crash or generic failure.
result: pass

### 11. Login rate limiting
expected: After 5 failed login attempts in a row with the wrong password, the 6th attempt shows "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." instead of continuing to accept attempts.
result: pass
note: Rate limit tripped slightly earlier than the "pure 6th attempt" framing because it counts ALL requests to /auth/login within the 15-min window (max 5), including earlier successful logins made during this same UAT session — not just consecutive failures. The 429 response and exact message matched expected.

### 12. Credentials are never exposed in plaintext
expected: After successfully saving real-shaped Binance credentials, reloading Settings shows the secret key masked (bullets + last few characters only) — never the full plaintext secret, in the UI or in the browser's Network tab response body.
result: blocked
blocked_by: third-party
reason: "Requires a real, valid Binance API key/secret pair to pass the live testConnection check before a save can succeed — none available in this dev environment. Covered by automated tests instead: backend/tests/settings/response-shape.test.ts and save-credentials.test.ts (mocked ccxt adapter simulating a successful connection), both passing in the 64/64 green suite."

### 13. Automated test suite coverage (symbol sync atomicity, transactional safety)
expected: This is hard to trigger manually (it covers a mid-sync database failure). Confirm you're satisfied relying on the automated test suite for this: `cd backend && npx vitest run` — all tests green (currently 64/64), including `tests/symbols/sync-atomicity.test.ts`.
result: pass

## Summary

total: 13
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

[none yet]
