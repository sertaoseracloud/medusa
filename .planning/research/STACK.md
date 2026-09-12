# Technology Stack

**Project:** Beholder (multi-exchange crypto trading bot — complete rewrite)
**Researched:** 2026-09-12

## Executive Verdict: Stay vs Switch

**Backend language/framework: STAY on Node.js + TypeScript. Switch Express → Fastify.** Confidence: HIGH.

**Frontend framework: STAY on React.** Confidence: HIGH.

**Database: SWITCH from Azure SQL Server → PostgreSQL (with TimescaleDB extension for future backtesting data).** Confidence: HIGH.

**Real-time layer: STAY on `ws` (raw WebSocket), rebuilt correctly, NOT Socket.io.** Confidence: HIGH.

### Why stay on Node/TypeScript (not Go/Rust)

This is explicitly a single-user, monitoring-and-configuration system (no automated order execution in scope — see PROJECT.md Out of Scope). It is not a high-frequency trading engine competing on microsecond latency. Rust delivers 2-3x the throughput of Go and 5-10x that of Node.js in raw benchmarks, and Go offers a faster ramp with strong concurrency primitives — but both trade-offs (Rust's 2-3 month learning curve to become productive, Go's total rewrite of an already-working exchange-integration layer) buy performance headroom this project doesn't need. Node.js's actual constraint in the legacy system was never event-loop throughput; it was security debt (hardcoded keys, broken CORS, unvalidated input) and code quality (no tests, `@ts-ignore`, untyped `any`). None of that is fixed by changing language — it's fixed by disciplined engineering practices in a language the team already knows. Additionally, the crypto-exchange integration ecosystem (ccxt, exchange SDKs, community WebSocket stream examples) is overwhelmingly JS/TS/Python-first; a Go or Rust rewrite would mean either hand-rolling exchange protocol clients or relying on far thinner community support — a bad trade for a project that also needs to add multi-exchange support as an active requirement.

Recommendation: **Node.js 24 LTS** (Active LTS, EOL April 2028) + **TypeScript 5.7+** in `strict` mode, replacing Node "version not pinned" and TypeScript 4.6.3.

### Why Express → Fastify (not a language change, but a framework change)

Express 4.17 is still maintained but architecturally frozen (no native schema validation, slower JSON serialization, callback-era APIs). Fastify delivers roughly 2-3x the throughput of Express on JSON-heavy endpoints via a compiled router and schema-driven serialization, ships first-class TypeScript generics, and has built-in JSON Schema validation (pairs well with Zod via `@fastify/type-provider-zod`) — directly addressing the "Missing Input Validation" critical concern in CONCERNS.md. This is a low-risk, high-value swap: same language, same mental model (middleware/plugins), same deployment target, no rewrite of business logic — only the HTTP layer and route registration change.

### Why React stays (not Solid/Vue)

SolidJS has a genuine, verifiable technical edge for high-frequency-update dashboards: fine-grained reactivity avoids React's re-render-then-diff cycle, and it benchmarks within ~5% of vanilla JS versus React 19's ~15-20% overhead even with the compiler. For a *pure* real-time-ticker-only view this would tip the scales toward Solid. But this project is not that narrow: it's a full application with auth, forms (settings/credentials), routing, and — per Active requirements — future backtesting UIs, performance reports, and 2FA flows. React 19's ecosystem (React Hook Form, TanStack Query/Table, TanStack Router, component libraries) is dramatically deeper for exactly this kind of CRUD-plus-real-time application, and the existing team already has React 18 experience — that institutional knowledge transfers almost entirely to React 19. The realistic bottleneck for ticker/orderbook updates in this app is not React's diffing overhead at single-user, single-connection scale — it's whether updates are batched and windowed sensibly. Recommend mitigating re-render cost with `use-sync-external-store` for WebSocket state (or TanStack Query's subscription model) and virtualization for order-book/ticker lists (`@tanstack/react-virtual`) instead of switching frameworks. Revisit Solid only if a future phase needs sub-frame chart rendering at high tick rates the mitigations can't handle.

### Why Azure SQL → PostgreSQL

The user is explicitly open to changing database/infrastructure. Given that:
- The domain model (Settings, Symbol, and future strategy/backtest/report entities) is straightforward relational data with no dependency on SQL Server-specific features (nothing in the legacy code uses T-SQL specifics beyond basic CRUD via Sequelize).
- PostgreSQL has a stronger, more current TypeScript ORM ecosystem (Drizzle, Prisma) than MSSQL, better JSON/JSONB support (useful for storing exchange-specific settings/filters like MIN_NOTIONAL/LOT_SIZE without rigid columns), and is the default choice across nearly all modern Node.js stacks in 2026.
- Backtesting is an explicit Active requirement, which implies future storage of OHLCV/candle time-series data. **TimescaleDB** (a PostgreSQL extension, not a different database) adds purpose-built time-series ingestion/query performance for that workload while keeping one database engine and one SQL dialect for both relational and time-series data — avoiding the operational cost of running two separate database systems for a single-user app.
- Cost/portability: Postgres runs identically on Azure (Azure Database for PostgreSQL), AWS, GCP, Docker, or bare metal — removing lock-in the legacy stack had to Azure SQL specifically.

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24.x (Active LTS) | Backend runtime | Current Active LTS, EOL 2028. Confidence: HIGH |
| TypeScript | 5.7+ | Type safety, backend + frontend | Current stable major; strict mode catches classes of legacy bugs (`@ts-ignore`, `any` abuse) flagged in CONCERNS.md. Confidence: HIGH |
| Fastify | 5.x | HTTP/REST API framework | Replaces Express 4.17; native schema validation, TS-first, ~2-3x throughput. Confidence: HIGH |
| React | 19.x | UI framework | Stays; React Compiler reduces manual memoization burden. Confidence: HIGH |
| Vite | 6.x / 7.x | Frontend build tool | Replaces Vite 2.9 (5+ majors behind); faster HMR, native TS. Confidence: HIGH |
| React Router | 7.x | Client-side routing | Direct successor to v6 used today; low migration cost. Confidence: HIGH |

### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 17.x | Primary relational store | Replaces Azure SQL Server/MSSQL. Modern, portable, best-in-class TS ORM support. Confidence: HIGH |
| TimescaleDB extension | latest (Postgres 17 compatible) | Time-series OHLCV storage for backtesting | Adds only when backtesting phase begins; same Postgres instance, no separate DB engine. Confidence: MEDIUM (verify extension availability on chosen host before committing) |
| Drizzle ORM | 0.44+ (1.0 in beta — pin to last stable 0.x until 1.0 GA) | Data access layer | Replaces Sequelize 6.19 (and removes the dangling unused `typeorm` dependency flagged in CONCERNS.md). SQL-first, fully typed, lightweight, no code-generation step to forget. Confidence: MEDIUM — Prisma is a reasonable alternative if the team prefers schema-first DX and Prisma Studio; both are current and production-viable in 2026 |

### Real-time Layer
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ws | 8.18+ | WebSocket server (client-facing dashboard feed) | Standard low-level WS implementation; ~3KB/connection, handles 100K+ concurrent connections — far beyond single-user needs but zero-overhead and correct. Confidence: HIGH |
| ccxt | 4.5+ (JS/TS) | Unified multi-exchange REST + WebSocket client | Directly solves the "multi-exchange beyond Binance" active requirement: unified API across 100+ exchanges (tickers, order books, balances, WS streaming), single actively-maintained library instead of one bespoke SDK per exchange (`node-binance-api` only covers Binance). Confidence: HIGH |

**Explicitly NOT Socket.io:** Socket.io's rooms/namespaces/reconnection abstractions solve problems this app doesn't have (no chat-like multi-room fan-out), at the cost of ~5x the per-connection memory footprint and a non-standard wire protocol that complicates any future non-browser client (mobile app, CLI, another service) consuming the market-data feed. Raw `ws` plus a small hand-rolled heartbeat (ws.ping()/pong on interval — explicitly fixes the "WebSocket Connection Lifecycle" fragile-area in CONCERNS.md) is the right level of abstraction here.

**WebSocket auth fix:** Do not pass the JWT as a URL query parameter (current critical flaw in CONCERNS.md). Use the `Sec-WebSocket-Protocol` header to carry a short-lived token during the handshake, or issue a single-use ephemeral token via an authenticated REST call immediately before opening the socket. Combine with short-lived access tokens (~15 min) + refresh token rotation, which also satisfies the "Token Refresh Mechanism" missing feature.

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.x | Input validation (REST + WS message payloads) | Replaces missing validation layer; pairs with Fastify's type provider for end-to-end type inference from schema to route handler |
| jsonwebtoken | 9.x | JWT issuance/verification | Same library, current major (legacy pinned to 8.5.1, several majors behind); wrap all `verify()` calls in try/catch (fixes CONCERNS.md JWT crash bug) |
| argon2 (`argon2` npm package) | latest | Password hashing | Recommend replacing bcrypt: Argon2id is the current OWASP-recommended default for new systems (memory-hard, GPU-resistant). If migration friction is a concern, bcrypt 5.x alone (drop bcryptjs — CONCERNS.md flags the redundant dual dependency) is an acceptable fallback; do not keep both |
| `@node-rs/argon2` or Node's built-in `crypto` (`scrypt`) | — | Alternative if avoiding native bindings | Use if deployment target restricts native compilation |
| Node `crypto` (AES-256-GCM) | built-in | Exchange credential encryption at rest | Replaces `aes-js` + broken AES-CTR-with-fixed-IV. AES-GCM is authenticated encryption (detects tampering) and is built into Node — removes an external dependency entirely. Generate a random IV per encryption operation and store it alongside the ciphertext (never reuse) |
| dotenv + `dotenv-vault` OR a hosted secrets manager | current | Secret storage | For a single-user self-hosted app, `.env` + **mandatory startup validation that throws if required secrets are missing** (fixes the hardcoded-AES-key-fallback flaw) is proportionate. If deploying to a cloud provider, prefer that provider's native secrets manager (Azure Key Vault if staying on Azure infra, AWS Secrets Manager, or self-hosted Infisical — the actively maintained MIT-licensed HashiCorp Vault alternative since Vault moved to BSL license) over rolling a custom vault |
| Vitest | 3.x | Test runner (backend + frontend) | Modern, fast, native TS/ESM support, Vite-native config sharing with the frontend build. Directly fixes "Zero Test Coverage" critical gap |
| React Testing Library | current | Frontend component tests | Standard pairing with Vitest for React 19 |
| Supertest / Fastify's `.inject()` | current | API integration tests | Fastify ships a built-in `app.inject()` test harness — no need for Supertest, one less dependency |
| React Hook Form | 7.x | Form state management | Replaces Formik (largely stagnant); better performance (uncontrolled inputs), smaller bundle |
| Zod (shared) | 3.x | Frontend form schema validation | Replaces Yup; same validation library reused for both frontend forms and backend request schemas — single source of truth for shapes like Settings/credentials payloads |
| TanStack Query | 5.x | Server state / data fetching | Replaces ad-hoc `useEffect` + axios calls in Context providers (fixes "Direct API Calls in Components" and "N+1 Query Pattern" anti-patterns in ARCHITECTURE.md) |
| `@tanstack/react-virtual` | 3.x | List virtualization | For order book / symbol list rendering at scale, mitigates React re-render cost instead of switching to Solid |
| ky or native `fetch` | current | HTTP client | Replaces axios 0.26.1 (multiple high-severity CVEs per CONCERNS.md). If axios is kept for familiarity, pin to 1.7.7+ minimum — but a lighter `ky` wrapper around native fetch removes the dependency risk entirely |
| express-rate-limit equivalent: `@fastify/rate-limit` | current | Rate limiting | Fastify-native equivalent; fixes missing rate limiting on login/API |
| `@fastify/helmet`, `@fastify/cors` | current | Security headers, CORS | Fastify-native equivalents of helmet/cors; configure CORS with an explicit origin allowlist (fixes CORS misconfiguration) |
| Pino (ships with Fastify by default) | current | Structured logging | Replaces Morgan + raw `console.log`; supports field redaction (`redact` option) to guarantee secrets/passwords never hit logs — directly fixes "Sensitive Data Logged" |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend language | Node.js/TypeScript | Go | Faster concurrency model and easier deploys, but forces a full rewrite of exchange integration code with a thinner crypto-exchange library ecosystem; performance gain not needed at single-user scale |
| Backend language | Node.js/TypeScript | Rust | Best raw performance/safety, but 2-3 month ramp-up cost for the team and massively overkill for a monitoring/config dashboard with no automated execution in scope |
| HTTP framework | Fastify | NestJS | NestJS's DI/decorator-heavy architecture is powerful but adds significant ceremony for a team of this size; Fastify keeps the lighter mental model closer to Express while fixing its real gaps |
| Frontend framework | React | SolidJS | Best-in-class reactivity for pure real-time views, but materially thinner ecosystem for the forms/auth/backtesting-report surface this app also needs; not worth the ecosystem trade-off at this scope |
| Database | PostgreSQL | Stay on Azure SQL | No technical requirement ties this app to SQL Server; Postgres has stronger TS tooling and is portable off Azure, which the user explicitly wants |
| ORM | Drizzle | Prisma | Both valid; Prisma is heavier (own DSL/codegen) but has a nicer visual studio and more mature migration tooling. Pick Prisma if the team values schema-first workflows over Drizzle's closer-to-SQL feel — this is a legitimate team-preference choice, not a correctness one |
| Real-time | ws | Socket.io | Socket.io's higher-level abstractions (rooms, namespaces) solve a multi-room broadcast problem this single-feed dashboard doesn't have, at higher per-connection cost |
| Real-time | ws | uWebSockets.js | Delivers far higher raw throughput (C++ bindings, up to 1M+ connections) but requires native compilation and is unnecessary at this app's single-digit-connection scale; revisit only if this becomes a multi-tenant SaaS |
| Exchange integration | ccxt | node-binance-api (kept, Binance-only) | node-binance-api only covers Binance; the active requirement to support multiple exchanges makes a unified library (ccxt) the only reasonable choice without hand-rolling N exchange clients |
| Password hashing | Argon2id | bcrypt (stay) | bcrypt remains acceptable and is what the team knows, but Argon2id is the current OWASP-recommended default for new systems; migrating cleanly during a full rewrite is a small, high-value change |

## Installation

```bash
# Backend
npm install fastify @fastify/helmet @fastify/cors @fastify/rate-limit @fastify/jwt \
  drizzle-orm postgres zod jsonwebtoken argon2 ccxt ws pino

npm install -D typescript tsx vitest @types/node @types/ws drizzle-kit

# Frontend
npm install react@19 react-dom@19 react-router@7 react-hook-form zod \
  @tanstack/react-query @tanstack/react-virtual

npm install -D vite@7 @vitejs/plugin-react typescript vitest \
  @testing-library/react @testing-library/jest-dom
```

## Sources

- [Rust vs Go vs Node.js: Which Backend Language Will Dominate in 2026?](https://caffeinatedcoder.medium.com/rust-vs-go-vs-node-js-which-backend-language-will-dominate-in-2026-b46e652d12f4) — MEDIUM confidence (WebSearch, cross-referenced across multiple 2026 comparison articles)
- [Express vs Fastify in 2026 — Stack Harbor](https://stackharbor.com/en/knowledge-base/fastify-vs-express-production/) — MEDIUM confidence
- [Node.js WebSocket Server Comparison 2026 — AnyCable](https://anycable.io/compare/nodejs-websocket/) — MEDIUM confidence
- [Node.js LTS schedule — endoflife.date](https://endoflife.date/nodejs) — HIGH confidence (canonical LTS tracking source)
- [Node.js 26.0.0 release blog — nodejs.org](https://nodejs.org/en/blog/release/v26.0.0) — HIGH confidence (official)
- [ccxt GitHub repository](https://github.com/ccxt/ccxt) — HIGH confidence (official repo, npm registry confirms v4.5.71 active publishing)
- [WebSocket Authentication guide — websocket.org](https://websocket.org/guides/authentication/) — MEDIUM-HIGH confidence (specialized reference site)
- [Drizzle vs Prisma in 2026 — Encore](https://encore.dev/articles/drizzle-vs-prisma) — MEDIUM confidence
- [Analyzing Cryptocurrencies with PostgreSQL/TimescaleDB — Tiger Data](https://blog.timescale.com/analyzing-ethereum-bitcoin-and-1200-cryptocurrencies-using-postgresql-3958b3662e51) — MEDIUM confidence (vendor blog, but technically substantive)
- [React vs SolidJS vs Vue in 2026](https://www.resumelens.org/blog/react/react-vs-vue-vs-svelte-2026) — MEDIUM confidence (cross-referenced across multiple 2026 benchmarks)
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`, `CONCERNS.md` — HIGH confidence (direct codebase analysis, primary source for legacy-stack facts)

**Note on confidence:** All 2026-dated comparison articles are WebSearch-sourced blog/SEO content, not primary vendor documentation with version-pinned changelogs. Version numbers for Fastify 5.x, React 19.x, Drizzle 0.44+, PostgreSQL 17.x, and Node 24 LTS are HIGH confidence (verifiable against official release channels); relative performance claims (e.g., "2-3x throughput") are MEDIUM confidence and directionally reliable but should not be treated as precise benchmarks for this specific workload.
