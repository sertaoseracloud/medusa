# Pitfalls Research

**Domain:** Multi-exchange crypto trading bot (real-time dashboard, credential management, alerts, backtesting, reports, 2FA)
**Researched:** 2026-09-12
**Confidence:** MEDIUM-HIGH (verified against official exchange docs, ccxt maintainer guidance, and multiple independent backtesting/security sources; some points are HIGH confidence where corroborated by official API docs)

This file goes beyond `.planning/codebase/CONCERNS.md`. CONCERNS.md documents bugs already found in the legacy code (hardcoded AES key, fixed IV, broken blacklist, etc.) — those are known fixes, not research. This file covers **new pitfalls that emerge specifically from the rewrite's expanded scope**: multi-exchange support, backtesting, alerts, and hardening credential/WebSocket security beyond "just fixing the bug."

---

## Critical Pitfalls

### Pitfall 1: Treating AES-GCM as a Drop-in Fix Without Nonce/Key Discipline

**What goes wrong:**
Teams fixing the legacy fixed-IV AES-CTR bug often just switch to AES-256-GCM but still derive the nonce deterministically (e.g., from user ID or a counter that resets), or reuse a single application-wide key for all users' secrets. With GCM, nonce reuse under the same key is worse than CTR reuse — it leaks the authentication key and allows ciphertext forgery, not just plaintext XOR leakage.

**Why it happens:**
Developers treat "switch cipher mode" as the whole fix, without also addressing IV/nonce generation strategy, key hierarchy (single master key vs. per-user data keys), and key rotation. AES-GCM's security guarantee depends entirely on nonce uniqueness per key — this is easy to violate silently (no error is thrown; it just becomes insecure).

**How to avoid:**
- Use AES-256-GCM with a cryptographically random 96-bit nonce generated per encryption call, stored alongside the ciphertext (nonce is not secret).
- Adopt envelope encryption: a master key (from env var / KMS, never hardcoded, never with a fallback default) encrypts per-record or per-user data keys; data keys encrypt the actual exchange secrets. This makes key rotation possible without re-encrypting every secret.
- Store ciphertext format as `version || nonce || ciphertext || authTag` so future re-encryption/rotation is possible without breaking old records.
- Fail loudly (throw, refuse to start) if the master key env var is missing — never fall back to a default, exactly the mistake CONCERNS.md flags, but the risk resurfaces anytime someone "temporarily" adds a dev fallback.

**Warning signs:**
- Any code path where the same nonce/IV could be computed twice for the same key (e.g., IV derived from a monotonic counter that isn't durably persisted, or from `Date.now()` truncated to seconds).
- No versioning field in the stored ciphertext — makes future key rotation or algorithm migration impossible without a flag day.

**Phase to address:** Auth/credentials rewrite phase (the phase that replaces `crypto.ts` and the Settings/credential storage module).

---

### Pitfall 2: WebSocket Auth "Fixed" by Moving Token to a Cookie Without CSRF Protection

**What goes wrong:**
The obvious fix for "JWT in WebSocket URL" is to switch to a cookie-based session, since browsers can't set custom headers on the WebSocket handshake. But cookies are sent automatically cross-origin unless configured correctly, reintroducing CSRF-style risk for the WS upgrade request (an attacker's page could trigger a WS connection using the victim's cookie) if `SameSite`, `Secure`, and origin validation aren't all correctly set together.

**Why it happens:**
Teams fix one symptom (token in URL) without addressing the full authentication contract for WebSockets: browsers cannot set `Authorization` headers on the handshake, so the two realistic secure options are (a) HttpOnly+SameSite=Strict/Lax cookie plus strict origin check on upgrade, or (b) short-lived one-time ticket exchanged over HTTPS immediately before connecting, sent as the **first message** after the socket opens (not in the URL).

**How to avoid:**
- Prefer the "first message" pattern: client opens WS unauthenticated, immediately sends `{type: "auth", token: "<short-lived JWT>"}` as the first frame, server validates before accepting any further messages and closes the connection if auth doesn't arrive within a short timeout (e.g., 5s).
- If using cookies instead, set `HttpOnly`, `Secure`, `SameSite=Strict` (or `Lax` at minimum) and independently validate the `Origin` header on every WS upgrade request against an explicit allowlist (this is the exact check the legacy code has inverted — get this test-covered).
- Never accept a long-lived token for the WS session; mint a short-lived (30–120s) single-use WS ticket via an authenticated REST call, then exchange it during the WS handshake/first message.
- Re-validate auth/session state periodically on long-lived connections (e.g., every N minutes) since dashboards may stay open for hours; a revoked session (2FA disabled, logout, password change) should be able to kill live WS connections, not just block new ones.

**Warning signs:**
- WS server code with no explicit `Origin` check, or a check using `.startsWith()`/`.includes()` in the wrong direction (as already found in `app.ws.ts`).
- No mechanism to forcibly close existing WS connections when a session is revoked (logout, blacklist, password change) — connections just live until the JWT's natural expiry.

**Phase to address:** Auth rewrite phase should define the WS auth contract; realtime/dashboard phase implements and load-tests it (many concurrent long-lived connections + forced disconnect on revoke).

---

### Pitfall 3: Per-Exchange Rate Limits Treated as a Single Global Limiter

**What goes wrong:**
Binance rate limits (`REQUEST_WEIGHT`, `ORDERS`, `RAW_REQUESTS`) are enforced **per IP**, not per API key, and each exchange has its own distinct limit model (weight-based for Binance, request-count windows for others, different weights per endpoint). A naive multi-exchange rewrite implements one generic rate limiter (e.g., "100 req/min") applied uniformly, which either throttles Binance too conservatively or — worse — lets Binance calls blow past `X-MBX-USED-WEIGHT` and trigger a 429 → 418 IP ban (Binance temporarily bans the IP, with `Retry-After` header, escalating on repeat offenses).

**Why it happens:**
Exchange rate limit rules are extremely heterogeneous and not obvious until you read each exchange's docs closely: Binance weights per-endpoint and returns current usage in response headers (`X-MBX-USED-WEIGHT-*`); other exchanges use different windows/headers entirely. If multiple bot processes or the dev/staging environment share the same outbound IP as production, they silently share and exhaust the same IP-scoped budget — a single "runaway" background job (e.g., a symbol-sync loop polling too often) can get the whole server's IP banned from an exchange, taking down every user's data on that exchange simultaneously.

**How to avoid:**
- Adopt a per-exchange adapter pattern where each exchange connector owns its own rate limiter tuned to that exchange's actual documented model (weight-based, window-based, or token-bucket), not a single shared generic limiter.
- Read and respect `Retry-After` / `X-MBX-USED-WEIGHT-*` (or exchange-equivalent) response headers; back off proactively before hitting 429, since repeated 429s escalate to a 418 IP ban.
- If using ccxt: reuse a single exchange instance (don't spin up a new instance per request — each instance has its own limiter state that resets), and keep `enableRateLimit: true` rather than disabling it for "speed."
- Isolate outbound IPs per environment (dev/staging should never share production's egress IP for exchange calls) so a bug in a lower environment can't ban production.
- Design the multi-exchange architecture so one exchange's failure/ban/outage degrades gracefully (that exchange's data goes stale/unavailable) without cascading to unrelated exchanges or blocking the whole dashboard.

**Warning signs:**
- A single `rateLimiter` middleware/utility applied identically regardless of which exchange is being called.
- No logging/alerting on 429/418 responses from an exchange — the first sign of a problem is a support ticket ("all my Binance data stopped updating"), not an internal alert.
- Symbol sync or ticker polling jobs whose interval isn't derived from the actual per-exchange weight budget.

**Phase to address:** Multi-exchange architecture phase (the phase introducing the exchange abstraction layer) — this is a foundational architecture decision, not a bolt-on later.

---

### Pitfall 4: Backtesting Engine Silently Uses Future Data (Lookahead Bias)

**What goes wrong:**
Backtest code computes an indicator or signal using a candle's close price, then "executes" the trade at that same candle's close (or worse, uses same-candle high/low to decide whether a stop/take-profit was hit) — using information not actually available at decision time. This is the single most dangerous backtesting bug: it can silently turn a losing strategy into one that reports a Sharpe ratio above 3, because it's not an obvious crash, it's a subtly wrong number that looks great.

**Why it happens:**
It's the natural, easy way to write a backtest loop: iterate candles, compute signal on candle N, "buy" using candle N's own close/OHLC. Developers don't realize the bug until live/paper trading results diverge wildly from backtest results, often long after the feature ships.

**How to avoid:**
- Enforce a strict decision-then-execute-next-bar architecture: signals computed on bar N can only execute at bar N+1's open (or later), never using bar N's high/low/close as the fill price for a decision made from bar N's own data.
- When simulating stop-loss/take-profit fills intrabar, use conservative assumptions (e.g., assume the worst-case order of high/low within the bar) rather than "whichever hits" using full-bar knowledge.
- Write an automated regression test that runs the backtester on a synthetic dataset with a known, hand-computed correct outcome (a "golden" test case) so any future refactor that reintroduces lookahead is caught by CI, not discovered after a bad live-trading decision.
- Clearly separate "signal time" from "fill time" as distinct fields on every simulated trade record, so lookahead bugs are visible in code review (a trade whose signal timestamp equals its fill timestamp is a red flag).

**Warning signs:**
- Backtest results dramatically outperform any comparable live/paper-trading run of the same strategy.
- Code where signal computation and order execution happen using the same loop-index candle, with no `+1` bar offset.
- No test coverage asserting "signal at bar N cannot see bar N's close when close hasn't happened at decision time" for intrabar-generated signals.

**Phase to address:** Backtesting feature phase — this should be treated as a phase with mandatory correctness tests before any strategy-tuning UI is built on top of it, since bad numbers here directly mislead the user's real trading decisions (even though this system doesn't auto-execute trades per the Out of Scope note, it does inform user decisions and reports).

---

### Pitfall 5: Backtesting/Symbol Universe Excludes Delisted Pairs (Survivorship Bias)

**What goes wrong:**
The current symbol sync model (`sync-symbols.service.ts`) does a `deleteAll()` + `bulkInsert()` against the exchange's *current* symbol list. If this same "current universe" pattern is reused as the basis for backtesting historical strategies, any pair that existed historically but was later delisted (common in crypto — exchanges delist low-volume/failed tokens regularly) is invisible to the backtest. This overstates historical performance because only "survivors" (pairs that did well enough to stay listed) are testable.

**Why it happens:**
It's the path of least resistance to reuse the live "current symbols" table for backtesting, since it already exists from the dashboard feature. Nobody explicitly decides to exclude delisted pairs — it happens by omission because the schema/sync process was designed for "what can I trade right now," not "what existed at time T."

**How to avoid:**
- Backtesting needs its own point-in-time symbol/market universe model, separate from the live dashboard's "currently tradable symbols" table — one that retains delisted/inactive pairs with the date range they were active.
- When sourcing historical OHLCV data for backtests, explicitly include delisted assets in the candidate universe definition, not just what the exchange API currently returns from `exchangeInfo`.
- Document this limitation clearly in the backtesting UI if full delisted-asset history isn't feasible for v1 (data providers often charge extra for delisted-asset history) — an honest "results only reflect currently-listed pairs" disclaimer is better than a silent bias.

**Warning signs:**
- Backtest "available symbols" list is identical to the dashboard's live symbol list.
- No data model field representing a symbol's listed/delisted date range.

**Phase to address:** Backtesting feature phase (data model design step, before any strategy execution logic is built).

---

### Pitfall 6: Real-Time Market Data Treated as the System of Record for Reports/Financial History

**What goes wrong:**
WebSocket ticker/orderbook streams are inherently best-effort and can drop messages, reconnect with gaps, or deliver out-of-order updates. If the new "reports/performance history" feature derives historical P&L or balance history purely from in-memory WebSocket state (as the legacy dashboard implicitly does for live display), any disconnect/reconnect/missed message produces silent gaps or double-counted values in reports that the user may treat as authoritative financial records.

**Why it happens:**
It's tempting to reuse the same real-time data pipe that already exists for the live dashboard as the source for historical reporting, since "the data is already flowing through the system." But real-time streams optimize for latency, not durability/completeness — no exchange guarantees zero message loss over a long-lived WS connection, and reconnect logic typically just resumes from "now," silently skipping whatever happened during the gap.

**How to avoid:**
- Treat WebSocket streams as ephemeral/display-only for the live dashboard; back reports and financial history with REST-polled or explicitly reconciled data (e.g., periodic snapshot of account balance/trade history via authenticated REST calls, which exchanges guarantee to be complete, unlike streaming).
- On WS reconnect, always reconcile state via a REST snapshot (e.g., re-fetch current balance/open orders) rather than assuming the stream picks up where it left off with no gaps.
- Persist raw exchange responses (trade fills, balance snapshots) as an append-only audit log distinct from the "current state" tables, so reports can be recomputed/audited later — this also satisfies the "Audit Logging" gap already flagged in CONCERNS.md, extended to financial data specifically.
- Never derive a monetary total (realized P&L, balance-over-time) solely from summing WebSocket ticks; always reconcile against exchange-reported authoritative figures (order history, account snapshots) at rest.

**Warning signs:**
- Reports feature queries the same in-memory/live WS-fed state used for the dashboard, with no separate durable data pipeline.
- No reconciliation logic run on WS reconnect.
- No idempotency/dedup key on ingested trade/balance events (risk of double-counting on reconnect replay).

**Phase to address:** Reports/performance-history phase; the underlying "durable data ingestion" decision should be made when designing the multi-exchange architecture, since it affects every exchange adapter, not just reports.

---

### Pitfall 7: 2FA Implemented Without Recovery Path or WS/Session Interaction Defined

**What goes wrong:**
2FA (TOTP) gets added as a login-time-only check, but two related things are commonly missed: (1) no account recovery mechanism if the user loses their authenticator (leading to permanent lockout or an insecure support-driven bypass), and (2) no decision about whether enabling/disabling 2FA, or a failed 2FA challenge, should invalidate existing sessions/WebSocket connections — since this system already has a broken session/blacklist model being rebuilt, 2FA needs to be designed jointly with that rebuild, not bolted on after.

**Why it happens:**
2FA tutorials focus on the happy path (enroll, verify TOTP code, done) and rarely cover recovery codes, rate-limiting the TOTP verify endpoint (brute-forceable 6-digit codes without throttling), or the interaction with long-lived sessions/WS connections established before 2FA was enabled.

**How to avoid:**
- Generate one-time backup/recovery codes at 2FA enrollment, shown once, stored hashed (like passwords) — this is the standard mitigation for lockout.
- Rate-limit the TOTP verification endpoint aggressively (a 6-digit TOTP code has only ~1M possibilities; without throttling this is brute-forceable within a login session window).
- Decide explicitly: does enabling 2FA force re-authentication of all existing sessions? Does a password change or 2FA reset invalidate all active JWTs and WS connections? (This ties directly to the token blacklist/refresh mechanism being rebuilt — design them together.)
- Cover TOTP secret storage with the same encryption-at-rest requirements as exchange API secrets (Pitfall 1) — a leaked TOTP seed is as dangerous as a leaked exchange key.

**Warning signs:**
- No recovery code generation/download step during 2FA enrollment flow.
- TOTP verify endpoint has no rate limiting distinct from the general API rate limiter.
- 2FA and session/token-refresh mechanisms designed/implemented in separate, uncoordinated work.

**Phase to address:** Auth rewrite phase (2FA should be designed as part of the same phase as JWT refresh/blacklist, not a separate later phase).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Single generic rate limiter for all exchanges | Faster initial multi-exchange rollout | IP bans on one exchange cascade/confuse debugging; wrong throttling per exchange | Never for exchange calls — acceptable only for internal API-to-frontend endpoints |
| Reuse live dashboard symbol table for backtesting universe | Avoids building a second data model early | Survivorship bias silently corrupts all backtest results | Acceptable only as an explicitly-labeled "beta/approximate" backtest mode with disclaimer, never as the default |
| In-memory session/2FA rate-limit state (no Redis) | Simpler v1 deployment | Doesn't survive restarts/scale-out, same failure mode as the legacy blacklist bug | Acceptable for single-instance MVP only if documented as a known scaling limit, must be revisited before any horizontal scaling |
| WS auth via short-lived JWT in first message but no periodic re-validation | Simpler connection lifecycle code | Revoked sessions (logout, 2FA disable, password change) stay live on WS until natural token expiry | Only acceptable if token TTL is very short (minutes) and refresh forces reconnect |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Binance REST/WS | Assuming rate limits are per API key | Rate limits are per IP for Binance; design shared-IP awareness (dev/staging isolation, multi-instance coordination) |
| ccxt (if adopted for multi-exchange abstraction) | Creating a new exchange instance per request | Reuse one long-lived instance per exchange+credentials pair; each instance owns its own rate-limiter state |
| Exchange WebSocket streams | Assuming reconnect resumes with no data gaps | Always reconcile via REST snapshot after any WS reconnect; never trust WS-only continuity for financial totals |
| Historical OHLCV data providers | Only requesting data for currently-listed symbols | Explicitly source delisted/inactive symbol history for backtesting; document gaps if unavailable |
| TOTP/2FA libraries | Treating TOTP secret like a normal config value | Encrypt TOTP secrets at rest with the same key-management rigor as exchange API secrets |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Broadcasting all market data to all WS clients regardless of subscription (already flagged in CONCERNS.md) | Increasing bandwidth/CPU as user base or symbol count grows | Per-client subscription filtering at the WS fan-out layer | Noticeable beyond a handful of concurrent users watching different symbol sets |
| Backtest engine re-fetching/re-parsing full historical OHLCV on every run | Slow, expensive backtest iterations; discourages parameter tuning | Cache/persist historical candle data locally, incrementally update | Breaks down once users run repeated backtests or parameter sweeps |
| Polling multiple exchanges' REST endpoints on a fixed interval regardless of weight budget | Approaching/exceeding exchange rate limits as more exchanges/symbols are added | Adaptive polling intervals derived from each exchange's actual weight/window budget | Breaks as soon as 2+ exchanges or a growing symbol list share a naive fixed-interval poller |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Same encryption key/scheme reused across all users' exchange secrets with no per-user data key | One key compromise decrypts every user's exchange credentials at once | Envelope encryption: master key wraps per-user/per-record data keys |
| Exchange API keys requested/stored with trading permissions when only read/market-data access is needed | A credential leak enables real fund movement, not just data exposure | Document and, where the UI allows, warn/require read-only API key permissions from the exchange side; never request withdrawal permission |
| No detection/alerting when an exchange API key's permissions change or key is revoked exchange-side | Silent failures; user thinks data is live but it's stale/broken | Surface exchange auth errors distinctly in the dashboard, alert user to re-enter credentials |
| Alerts feature evaluates price conditions using potentially stale/gapped WS data | False or missed alerts on price thresholds users rely on for decisions | Reconcile alert-triggering data source against REST ticker periodically, not WS-only |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Backtest results shown without disclosing known biases/limitations (e.g., delisted pairs excluded, fees/slippage assumptions) | User over-trusts unrealistic backtest performance and makes real trading decisions on it | Explicit "assumptions & limitations" panel next to every backtest result (fees used, slippage model, universe used, date range data completeness) |
| 2FA enrollment with no recovery codes shown/downloadable | Permanent account lockout, forcing insecure support-driven bypass | Force recovery-code download/confirmation before enabling 2FA |
| Multi-exchange dashboard shows one exchange's data as if it's equally fresh as another during a rate-limit backoff | User makes decisions on silently stale data from one exchange | Per-exchange "last updated" / connection-health indicator in the UI |

## "Looks Done But Isn't" Checklist

- [ ] **Encrypted credential storage:** Often missing key rotation support and per-user key separation — verify the ciphertext format includes a key/algorithm version field, not just "AES is used somewhere."
- [ ] **WebSocket auth:** Often missing forced-disconnect on session revocation — verify that logout/password-change/2FA-disable actually closes live WS connections, not just blocks new ones.
- [ ] **Multi-exchange rate limiting:** Often missing per-exchange tuning — verify each exchange adapter has its own limiter respecting that exchange's actual documented weight/window model and `Retry-After`/ban-response handling.
- [ ] **Backtesting engine:** Often missing a "no lookahead" regression test — verify there's an automated test asserting signal-bar and fill-bar are never the same bar for intrabar-derived signals.
- [ ] **Reports/performance history:** Often missing reconciliation against exchange REST truth — verify numbers are not purely summed from WebSocket ticks with no periodic REST-based reconciliation.
- [ ] **2FA:** Often missing recovery codes and endpoint-specific rate limiting — verify both exist before considering 2FA "done."
- [ ] **Rate limiting (general, from CONCERNS.md, extended):** Often applied only to login/auth endpoints — verify exchange-proxying endpoints and alert-evaluation loops are also covered, since these can trigger exchange-side bans, not just abuse the app itself.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Nonce reuse discovered in AES-GCM after deployment | HIGH | Force re-encryption of all stored secrets under fresh keys/nonces; treat all previously encrypted secrets as potentially compromised; require all users to re-enter exchange API keys after rotating them exchange-side |
| Exchange IP ban triggered in production | MEDIUM | Implement exponential backoff immediately, request ban lift if exchange support allows, add per-exchange circuit breaker so future incidents degrade gracefully instead of banning the whole IP |
| Lookahead bias discovered in shipped backtesting feature | MEDIUM | Add "results may be inaccurate for backtests run before [date]" banner, fix engine, rerun affected historical backtests, notify users who acted on since-corrected results |
| Reports found to have double-counted trades from a WS reconnect gap | MEDIUM | Add idempotency keys retroactively, rebuild historical reports from durable REST-sourced trade history rather than the WS-derived log |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| AES-GCM nonce/key management | Auth/credentials rewrite phase | Code review confirms random nonce per encryption, envelope encryption in place, no hardcoded/default key path exists even in dev config |
| WebSocket auth (token exposure + revocation) | Auth rewrite + Realtime/dashboard phase | Test: logout closes existing WS connections within N seconds; test: WS handshake rejects unauthenticated/invalid-origin connections |
| Per-exchange rate limiting | Multi-exchange architecture phase | Load/integration test simulating exchange 429 responses confirms backoff behavior per exchange, independent of other exchanges |
| Lookahead bias in backtesting | Backtesting feature phase | Automated "golden dataset" regression test asserts no signal uses same-bar-or-future data |
| Survivorship bias in backtesting universe | Backtesting feature phase (data model design) | Backtest universe model includes delisted/inactive symbols with active-date ranges; documented if v1 defers full historical coverage |
| Financial data integrity for reports | Reports/performance-history phase | Reconciliation job/test compares WS-derived running totals against REST-sourced authoritative trade/balance history periodically |
| 2FA recovery + session interaction | Auth rewrite phase (jointly with token refresh/blacklist) | Test: recovery codes generated and usable; test: 2FA disable/reset invalidates existing sessions per the defined policy |

## Sources

- [Binance Spot API rate limits (official)](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits) — HIGH confidence, official docs
- [ccxt Manual](https://docs.ccxt.com/en/latest/manual.html) and [ccxt rate-limit issue discussion](https://github.com/ccxt/ccxt/issues/18878) — HIGH confidence, maintainer/official guidance
- [A Taxonomy of Backtest Lies: Survival Bias, Lookahead Bias](https://www.susanpotter.net/quant/backtest-bias-taxonomy/) — MEDIUM-HIGH confidence, detailed quant methodology source
- [CoinAPI: How to Eliminate Survivorship Bias in Crypto Backtesting](https://www.coinapi.io/blog/how-to-eliminate-survivorship-bias-in-crypto-backtesting) — MEDIUM confidence, industry source specific to crypto
- [Look-Ahead-Freedom as Temporal Non-Interference (arXiv)](https://arxiv.org/pdf/2607.04958) — MEDIUM confidence, formal treatment of lookahead-freedom in backtesting pipelines
- [WebSocket.org: WebSocket Authentication guide](https://websocket.org/guides/authentication/) — MEDIUM-HIGH confidence
- [Ably: Essential guide to WebSocket authentication](https://ably.com/blog/websocket-authentication) — MEDIUM confidence, corroborates first-message/cookie pattern
- [AES-256-GCM practical pattern for encrypting secrets at rest](https://dev.to/chu_minh_f513921733ff7d9/aes-256-gcm-in-go-a-practical-pattern-for-encrypting-secrets-at-rest-2dhc) — MEDIUM confidence, corroborates nonce-uniqueness requirement (well-established cryptographic principle, cross-checked against general AES-GCM specification knowledge)
- `.planning/codebase/CONCERNS.md` — legacy system baseline (not repeated here, used as contrast point)

---
*Pitfalls research for: multi-exchange crypto trading bot rewrite (Beholder)*
*Researched: 2026-09-12*
