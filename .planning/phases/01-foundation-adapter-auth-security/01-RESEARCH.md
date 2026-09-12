# Phase 1: Foundation — Adapter, Auth & Security - Research

**Researched:** 2026-09-12
**Domain:** Fastify + Drizzle/PostgreSQL auth (JWT access/refresh + revocation), AES-256-GCM envelope encryption for exchange credentials, ccxt-based Exchange Adapter, Zod validation with a centralized error envelope, idempotent/atomic symbol sync, and Vitest-based test strategy
**Confidence:** MEDIUM-HIGH (library APIs and versions verified against npm registry and official repos; specific architectural wiring patterns are MEDIUM — cross-checked against official docs/GitHub issues, not framework-native "one blessed way")

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Criação da conta de usuário (single-user provisioning)**
- **D-01:** Nenhuma tela pública de cadastro. O usuário único é provisionado via seed no boot do servidor, não por uma tela de registro nem por um comando CLI separado.
- **D-02:** Email/senha do seed vêm de variáveis de ambiente (ex: `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`).
- **D-03:** O seed faz upsert sempre — a cada boot, a senha no banco é sincronizada para bater com a env var atual (não é create-if-not-exists apenas).
- **D-04:** A UI deve ter uma tela de troca de senha, mas com aviso explícito de que a senha será revertida para o valor da env var no próximo restart do servidor caso as variáveis de ambiente não sejam atualizadas junto.

**UX de credenciais de exchange**
- **D-05:** O `secretKey` da Binance é mascarado parcialmente na UI após salvo (ex: exibe só os últimos caracteres), nunca em texto pleno — a API nunca retorna o valor completo em nenhuma resposta.
- **D-06:** Antes de persistir novas credenciais, o backend faz uma chamada de teste real à Binance (via Exchange Adapter, ex: `getBalance`) para validar que a chave funciona. Se a chamada falhar, a gravação é rejeitada.
- **D-07:** Erros de validação de credenciais são específicos por tipo (chave/segredo inválidos vs. sem permissão de leitura de saldo vs. Binance indisponível/timeout) — não uma mensagem genérica.
- **D-08:** Modelo de dados mantém um único conjunto de credenciais por usuário (como no legado) — não modelar múltiplos "perfis de exchange" nesta fase. Multi-exchange simultâneo é v2 (EXCH-V2-*).

**Sessão e expiração de token**
- **D-09:** Refresh de access token é silencioso em background (o frontend renova antes de expirar, sem interromper o usuário) — não espera um 401 para disparar o refresh.
- **D-10:** Quando o refresh token também expira, o logout é silencioso: tokens limpos, sem mensagem explícita de "sessão expirada".
- **D-11:** Logout explícito ("Sair") revoga o refresh token no servidor (blacklist persistente), além de limpar o estado no frontend — corrige o no-op de logout do CONCERNS.md.
- **D-12:** Vida útil dos tokens: access token curto (~15 min), refresh token longo (~7–30 dias) — valor exato a critério do planner/executor dentro dessa faixa.

**Sincronização de símbolos**
- **D-13:** Sincronização automática de símbolos roda na inicialização do servidor, além do botão manual.
- **D-14:** O sync automático na inicialização só dispara quando a tabela de símbolos está vazia (primeira execução).
- **D-15:** A sincronização (manual ou automática) deve rodar dentro de uma transação atômica.
- **D-16:** Se a sincronização automática na inicialização falhar, o servidor deve continuar subindo normalmente — não deve bloquear o boot.

**Arquitetura hexagonal / Clean Architecture no backend**
- **D-17:** Cada módulo (auth, settings, symbols) segue portas e adaptadores internamente: `domain/`, `application/`, `infrastructure/` — hexagonal aplicada dentro de cada módulo, não como camadas globais no topo.
- **D-18:** Portas (interfaces) são definidas por dependência externa e por módulo, implementadas na `infrastructure/` daquele módulo — não centralizadas em `shared/ports/` genérico.
- **D-19:** Use cases lançam exceptions de domínio tipadas em vez de retornar response objects com campo `error?` opcional. Um error handler central do Fastify mapeia cada tipo de exception (incluindo `ZodError`) para o status HTTP e envelope de resposta corretos.

**Rate limiting**
- **D-20:** Login tem rate limit de 5 tentativas falhas por 15 minutos.
- **D-21:** Rate limit de login é aplicado por IP (não por email).
- **D-22:** Rate limiting é aplicado globalmente na API via `@fastify/rate-limit` (ex: 100 req/min), com regra mais restrita apenas na rota de login (D-20).

**Validação de secrets no startup**
- **D-23:** Em produção, o servidor falha o boot (fail-fast) se `JWT_SECRET`, `AES_KEY` ou outra variável obrigatória estiver ausente — nenhum valor padrão inseguro é usado.
- **D-24:** Em desenvolvimento, se essas variáveis faltarem, o servidor gera uma chave temporária em memória e sobe mesmo assim, logando um aviso claro uma vez no boot.

**Formato de erro de validação e envelope de erro**
- **D-25:** Erros de validação de input (Zod) retornam um array/objeto detalhando cada campo com problema, não uma mensagem genérica.
- **D-26:** A resposta de erro usa o mesmo envelope padrão do resto da API (`{ data, message, timestamp }`), com os detalhes dos campos inválidos dentro de `data`.
- **D-27:** Um error handler central único no Fastify (`setErrorHandler`) traduz todos os tipos de erro para esse mesmo envelope: `ZodError` → 400 com campos, exceptions de domínio → 401/403/404/409 conforme o tipo, erro não tratado → 500.

### Claude's Discretion
- Valores exatos de expiração de access/refresh token dentro da faixa acordada (~15min / 7–30 dias).
- Mecanismo exato de revogação de refresh token no servidor (tabela de blacklist, coluna `revoked_at`, ou equivalente) — desde que persistente, não em memória.
- Formato exato do mascaramento do secretKey (quantos caracteres finais exibir).

### Deferred Ideas (OUT OF SCOPE)
Nenhuma ideia de escopo novo surgiu durante a discussão — todas as perguntas ficaram dentro do domínio desta fase. Múltiplos perfis de exchange e multi-exchange simultâneo já estavam corretamente identificados como v2 em REQUIREMENTS.md e foram reafirmados como fora de escopo aqui (D-08).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Backend reescrito em Node.js LTS + TypeScript strict + Fastify | Standard Stack (fastify 5.12.4), Architecture Patterns Pattern 4 (Zod + type-provider + central error handler) |
| FOUND-02 | Persistência migrada para PostgreSQL + Drizzle ORM | Standard Stack (drizzle-orm 0.45.2, drizzle-kit, postgres driver), Code Examples (Drizzle schema shapes) |
| FOUND-03 | Frontend reescrito em React + Vite + React Router atuais | Out of deep scope for this backend-focused research; see project-level `.planning/research/STACK.md` for frontend versions (React 19, Vite 6/7, React Router 7) |
| FOUND-04 | Validação de entrada (schema validation) em todos os endpoints | Architecture Patterns Pattern 4 (Zod + fastify-type-provider-zod), Validation Architecture (FOUND-04 test row) |
| SEC-01 | Credenciais armazenadas com envelope encryption (AES-256-GCM, nonce aleatório por registro) | Architecture Patterns Pattern 2, Pitfall 1, Code Examples (Drizzle settings schema) |
| SEC-02 | Autenticação JWT com refresh token e expiração deslizante | Primary recommendation, Architecture Patterns Pattern 1, Validation Architecture (SEC-02 test row) |
| SEC-03 | Logout invalida efetivamente o token (blacklist persistente) | Architecture Patterns Pattern 1, Pitfall 2, Validation Architecture (SEC-03 test row) |
| SEC-04 | Verificação de JWT com tratamento de erro | Standard Stack (@fastify/jwt), Don't Hand-Roll, Validation Architecture (SEC-04 test row) |
| SEC-05 | CORS configurado corretamente (whitelist explícita) | Standard Stack (@fastify/cors), Security Domain threat table |
| SEC-07 | Nenhum dado sensível retornado em respostas ou logado em texto plano | Architectural Responsibility Map, Don't Hand-Roll, Security Domain, Validation Architecture (SEC-07 test row) |
| SEC-08 | Rate limiting nos endpoints da API | Standard Stack (@fastify/rate-limit), Pitfall 3, Validation Architecture (SEC-08 test row) |
| SEC-09 | Dependências sem vulnerabilidades conhecidas | Package Legitimacy Audit (all packages verified OK/approved against npm registry) |
| EXCH-01 | Camada de abstração de exchange (Exchange Adapter, baseada em CCXT) | Architecture Patterns Pattern 3, Recommended Project Structure (`exchanges/core/`) |
| EXCH-02 | Adapter da Binance implementado sobre a camada de abstração | Architecture Patterns Pattern 3 (BinanceAdapter code example), Pitfall 4 |
| EXCH-03 | Sincronização de símbolos de mercado a partir da exchange configurada | Architecture Patterns Pattern 5, Pitfall 5, Validation Architecture (EXCH-03 test rows) |
| AUTH-01 | Usuário pode fazer login com email/senha | Primary recommendation, Validation Architecture (AUTH-01 test rows) |
| AUTH-02 | Usuário pode configurar credenciais de exchange de forma segura | Architecture Patterns Pattern 2 & 3, Validation Architecture (AUTH-02 test row) |
| AUTH-03 | Usuário pode fazer logout, com invalidação efetiva de sessão | Architecture Patterns Pattern 1, Pitfall 2 |
| TEST-01 | Cobertura de testes automatizados para auth, credenciais, sync de símbolos | Validation Architecture (full section), Standard Stack (vitest 5.0.0) |
</phase_requirements>


## Summary

This phase is the security- and architecture-critical foundation of the rewrite: every CONCERNS.md critical finding (hardcoded AES key/IV, no-op logout blacklist, JWT crashes, exposed secretKey, missing validation, missing rate limiting) must be fixed here, on a stack (Fastify 5, Drizzle 0.45, PostgreSQL, ccxt) that has no existing implementation to build on — this is a from-scratch build, not a refactor of legacy backend code (the legacy `backend/` directory is being fully replaced per PROJECT.md).

Four implementation areas carry the most risk and need the most precision: (1) JWT access+refresh with **persistent, checked** revocation — the legacy blacklist bug was specifically that it was never checked, so the new implementation must wire the revocation check into the auth path itself, not just create a table; (2) AES-256-GCM envelope encryption where the nonce-generation discipline matters more than the cipher choice — GCM nonce reuse is worse than the legacy CTR bug it replaces; (3) an `IExchangeAdapter` interface thin enough to implement today with ccxt but strict enough that Settings' "test connection before save" flow (D-06) can call one method (`getBalance`/`fetchBalance`) and get back a typed, specific error (D-07) rather than a generic failure; (4) Zod + Fastify's official type-provider package feeding one central `setErrorHandler`, per the standardized `{data, message, timestamp}` envelope already locked in CONTEXT.md.

**Primary recommendation:** Build auth as a `refresh_tokens` table (not a separate blacklist table) storing a hash of each issued refresh token with `revoked_at`/`expires_at` columns — this single table serves both "is this refresh token still valid" (silent background refresh, D-09) and "has this token been explicitly revoked" (explicit logout, D-11) without needing two data models. Pair short-lived (15 min) stateless access tokens (verified via `@fastify/jwt`, never touching the DB on every request) with this stateful refresh table (checked only on the less-frequent refresh call) — this is the standard access/refresh split and keeps the hot path (every API request) DB-free while making revocation actually effective, unlike the legacy no-op.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Login (email/password → JWT) | API / Backend | Database / Storage | Credential check against `settings`/`users` table, JWT issuance is pure backend logic; DB only for password hash lookup |
| Access token verification | API / Backend | — | Stateless — verified in-process via `@fastify/jwt` on every request, no DB round-trip (this is what keeps 15-min access tokens cheap) |
| Refresh token issuance/rotation/revocation | API / Backend | Database / Storage | Refresh state must be persistent (D-11 requires surviving restarts) — owned by a `refresh_tokens` table, checked only on `/refresh` and `/logout` calls |
| Silent background refresh / silent logout | Browser / Client | API / Backend | Frontend timer decides *when* to call `/refresh`; backend decides *if* the refresh token is still valid |
| Exchange credential storage (encryption) | API / Backend | Database / Storage | Encrypt/decrypt happens in backend `security/credential-vault.ts`; DB only stores opaque ciphertext + nonce, never touches plaintext |
| Exchange credential validation ("test connection") | API / Backend | External Exchange (Binance via ccxt) | Backend calls out to Binance synchronously during the save flow; DB write only happens after the external call succeeds |
| Exchange Adapter abstraction | API / Backend | External Exchange | `IExchangeAdapter` is a backend-only interface; concrete `BinanceAdapter` wraps ccxt and is the only thing touching the network |
| Symbol sync (boot + manual) | API / Backend | Database / Storage | Backend fetches from Binance via the adapter, backend wraps the atomic write in a Drizzle transaction; DB is the persistence target, not the actor |
| Input validation (Zod) | API / Backend | — | Every Fastify route validates via Zod schema before the handler runs; not delegated to frontend-only validation |
| Rate limiting | API / Backend | — | `@fastify/rate-limit` operates at the Fastify plugin/route level, in front of all handlers |
| Central error handling / response envelope | API / Backend | — | Single Fastify `setErrorHandler`, not per-controller try/catch-and-format |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.12.4 [VERIFIED: npm registry] | HTTP server/framework | Locked by FOUND-01 and `.planning/research/STACK.md`; current npm-published version as of research date |
| @fastify/jwt | 10.2.2 [VERIFIED: npm registry] | Access token sign/verify as a Fastify decorator (`request.jwtVerify()`, `reply.jwtSign()`) | Official Fastify org plugin (github.com/fastify/fastify-jwt); wraps `jsonwebtoken`/`fast-jwt` with try/catch built in, directly fixing the legacy "JWT verify crashes server" bug (SEC-04) |
| @fastify/rate-limit | 11.2.0 [VERIFIED: npm registry] | Global + per-route rate limiting | Official Fastify org plugin; supports a global config plus `config: { rateLimit: {...} }` override per-route — exactly the global-100/min + login-5/15min shape locked in D-20–D-22 |
| @fastify/cors | 11.3.0 [VERIFIED: npm registry] | CORS with explicit origin allowlist | Official Fastify org plugin; fixes SEC-05 (legacy `cors()` called with no options = open CORS) |
| @fastify/helmet | 13.1.1 [VERIFIED: npm registry] | Security headers (HSTS, etc.) | Official Fastify org plugin; addresses CONCERNS.md "No HTTPS enforcement" gap |
| drizzle-orm | 0.45.2 [VERIFIED: npm registry] | Data access layer (Postgres) | Locked by FOUND-02 and `.planning/research/STACK.md`; STATE.md blocker flags "confirm 0.x stable, not 1.0 beta" — 0.45.2 is the current stable 0.x line, no 1.0 GA on npm as of research date |
| drizzle-kit | 0.31.10 [VERIFIED: npm registry] | Migration generation/push CLI | Companion CLI to drizzle-orm, same maintainer (drizzle-team), required for schema migrations |
| postgres | 3.4.9 [VERIFIED: npm registry] | Postgres driver (`postgres.js`) | Drizzle's own docs/tutorials pair `drizzle-orm` with the `postgres` npm package for the PostgreSQL dialect; lighter and more actively benchmarked than `pg` for this pairing |
| zod | 4.6.3 [VERIFIED: npm registry] | Schema validation (request bodies, env vars) | Locked by FOUND-04 and CONTEXT.md D-25; single source of truth for validation shapes |
| fastify-type-provider-zod | 7.0.0 [VERIFIED: npm registry] | Wires Zod schemas into Fastify's route `schema` option + type inference | Official Fastify-maintained package (github.com/fastify/fastify-type-provider-zod, formerly turkerdev/*, now transferred to the Fastify org); exposes `hasZodFastifySchemaValidationErrors()` helper used in the central error handler |
| argon2 | 0.45.1 [VERIFIED: npm registry] | Password hashing | Recommended in `.planning/research/STACK.md` over bcrypt/bcryptjs (removes the legacy redundant dual-dependency flagged in CONCERNS.md); OWASP-recommended default for new systems |
| ccxt | 4.5.78 [VERIFIED: npm registry] | Unified exchange REST client (Binance today, others later) | Locked by EXCH-01; version confirmed actively published (4.5.x line, matches `.planning/research/STACK.md`) |
| pino | 10.3.1 [VERIFIED: npm registry] | Structured logging, ships with Fastify | Fastify's default logger; supports `redact` option — required to guarantee SEC-07 (never log secrets) |
| pino-pretty | 13.1.3 [VERIFIED: npm registry] | Human-readable dev log formatting | Standard pairing with pino for local development only (not used in production output) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 5.0.0 [VERIFIED: npm registry] | Test runner (TEST-01) | No test framework exists today (legacy has zero tests) — Vitest is Vite-native, fast, TS/ESM-first; use for unit + integration tests across auth, credential vault, symbol sync |
| tsx | 4.23.13 [VERIFIED: npm registry] | TS execution for dev/scripts (replaces `ts-node-dev`) | Use for `npm run dev` equivalent and any one-off seed/migration scripts that need direct TS execution |
| dotenv | current [ASSUMED — not independently re-verified this session, but present in legacy stack and `.planning/research/STACK.md`] | `.env` loading | Only for local dev; production should rely on real environment variables/secrets manager per D-23 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `refresh_tokens` table for revocation | Redis-backed blacklist | Redis is faster and has native TTL, but adds an operational dependency (a second datastore) for a single-user app; Postgres table with an indexed `expires_at`/`revoked_at` and a scheduled cleanup job is sufficient at this scale and keeps "one database" simplicity from `.planning/research/STACK.md`. Revisit if horizontal scaling or very high login volume is ever needed (neither applies here — single user) |
| ccxt wrapping Binance REST | `node-binance-api` (legacy) or hand-rolled Binance REST client | Legacy library is Binance-only; EXCH-01 explicitly requires an abstraction that isn't hardcoded to one exchange, so ccxt's unified interface is required, not optional, for this phase |
| `@fastify/jwt` | Raw `jsonwebtoken` + custom Fastify decorators | `@fastify/jwt` already wraps verify in try/catch (fixing SEC-04 directly) and integrates with Fastify's request/reply lifecycle; rolling this by hand reintroduces the exact bug class being fixed |
| Envelope encryption via Node's built-in `crypto` | A KMS/Vault-backed encryption service (Azure Key Vault, AWS KMS, HashiCorp Vault, Infisical) | `.planning/research/ARCHITECTURE.md` and `.planning/research/PITFALLS.md` both note self-hosted single-user apps don't need a full KMS; envelope encryption using Node `crypto` with a master key from env var (fail-fast in prod per D-23) is proportionate for v1 — an external secrets manager is a legitimate v2 hardening step, not a v1 blocker |

**Installation:**
```bash
# Backend
npm install fastify @fastify/jwt @fastify/rate-limit @fastify/cors @fastify/helmet \
  drizzle-orm postgres zod fastify-type-provider-zod argon2 ccxt pino

npm install -D drizzle-kit typescript tsx vitest @types/node pino-pretty
```

**Version verification:** All versions above were checked via `npm view <package> version` against the live npm registry on 2026-09-12 (see Package Legitimacy Audit below for the full verification trail, including registry creation dates and repository links).

## Package Legitimacy Audit

Ran `slopcheck scan --pkg npm <name>` against every package this phase installs, cross-referenced with `npm view <name> time.created repository.url`.

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| fastify | npm | ~10 yrs (created 2016) | github.com/fastify/fastify | OK | Approved |
| @fastify/jwt | npm | ~4 yrs (created 2022) | github.com/fastify/fastify-jwt | OK | Approved |
| @fastify/rate-limit | npm | ~4 yrs (created 2022) | github.com/fastify/fastify-rate-limit | OK | Approved |
| @fastify/cors | npm | ~4 yrs (created 2022) | github.com/fastify/fastify-cors | OK | Approved |
| @fastify/helmet | npm | ~4 yrs (created 2022) | github.com/fastify/fastify-helmet | OK | Approved |
| drizzle-orm | npm | ~5 yrs (created 2021) | github.com/drizzle-team/drizzle-orm | OK | Approved |
| drizzle-kit | npm | ~5 yrs (created 2021) | github.com/drizzle-team/drizzle-orm | OK | Approved |
| postgres | npm | ~11 yrs (created 2015) | github.com/porsager/postgres | OK | Approved |
| zod | npm | ~6 yrs (created 2020) | github.com/colinhacks/zod | OK | Approved |
| fastify-type-provider-zod | npm | ~4 yrs (created 2022) | github.com/turkerdev/fastify-type-provider-zod (now Fastify-org maintained) | OK | Approved |
| argon2 | npm | ~10 yrs (created 2015) | github.com/ranisalt/node-argon2 | OK | Approved (uses `node-gyp-build` native-binding postinstall — standard for a crypto library with native bindings, not a network-calling script; not a risk signal) |
| ccxt | npm | ~9 yrs (created 2017) | github.com/ccxt/ccxt | **SUS** (flagged "suspiciously close to 'next'") | Approved — false-positive string-similarity heuristic. Cross-verified: official repo, 100+ exchange integrations, 30k+ GitHub stars, matches project-level `.planning/research/STACK.md` recommendation and `.planning/research/ARCHITECTURE.md` build order. No real typosquat risk. |
| pino | npm | ~10 yrs (created 2016) | github.com/pinojs/pino | OK | Approved |
| pino-pretty | npm | ~8 yrs (created 2018) | github.com/pinojs/pino-pretty | OK | Approved |
| vitest | npm | ~5 yrs (created 2021) | github.com/vitest-dev/vitest | **SUS** (flagged "suspiciously close to 'vite'") | Approved — false-positive string-similarity heuristic. Vitest is the Vite team's own official test runner (same GitHub org), not a typosquat of `vite`; already the explicit recommendation in `.planning/research/STACK.md`. |
| tsx | npm | ~11 yrs registry age (name reused/long-standing) | github.com/privatenumber/tsx | OK | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none (the earlier `pypi`-ecosystem run incorrectly flagged `@fastify/*`, `drizzle-orm`, `drizzle-kit`, `fastify-type-provider-zod`, `pino-pretty` as SLOP only because slopcheck auto-detected the wrong ecosystem/registry (pypi) for npm-scoped package names; re-running with `--ecosystem npm` / `--pkg npm` resolved all of them to OK against the correct registry — this is a documented cross-ecosystem confusion trap, not a real hallucination signal).

**Packages flagged as suspicious [SUS]:** `ccxt`, `vitest` — both are false positives from a naive string-similarity typosquat heuristic (`ccxt` ~ `next`, `vitest` ~ `vite`). Both are independently confirmed via official GitHub repositories, registry age (5–9 years), and prior project-level research (`.planning/research/STACK.md`) as the correct, intended packages. No `checkpoint:human-verify` is warranted for these two specifically, but the planner may still choose to add a lightweight `npm view <pkg> repository.url` sanity check as part of the initial `npm install` task for defense in depth.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────────────────────┐
                         │      Frontend (React)       │
                         │  Login form · Settings form │
                         │  Silent refresh timer        │
                         └───────────┬──────────────────┘
                                     │ HTTPS (REST)
                                     ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          Fastify HTTP Server                          │
│                                                                         │
│  [Global] @fastify/rate-limit (100/min) ── [Route] login: 5/15min      │
│  [Global] @fastify/cors (allowlist) · @fastify/helmet                  │
│                                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────────┐               │
│  │ modules/auth │   │modules/settings│  │modules/symbols │              │
│  │ domain/      │   │ domain/        │  │ domain/        │              │
│  │ application/ │   │ application/   │  │ application/   │              │
│  │ infrastructure│  │ infrastructure │  │ infrastructure │              │
│  └──────┬───────┘   └──────┬─────────┘  └──────┬─────────┘              │
│         │ verifies/issues   │ encrypts/         │ calls adapter,        │
│         │ JWT, checks       │ decrypts via       │ writes tx            │
│         │ refresh_tokens    │ credential-vault   │                      │
│         ▼                   ▼                    ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │              Zod request validation (every route)             │      │
│  └─────────────────────────────────────────────────────────────┘       │
│                                     │                                   │
│                        thrown DomainError / ZodError                    │
│                                     ▼                                   │
│              Central setErrorHandler → {data, message, timestamp}       │
└───────────────────────┬─────────────────────────────┬───────────────────┘
                         │                              │
                         ▼                              ▼
        ┌────────────────────────────┐    ┌────────────────────────────┐
        │   exchanges/ (Adapter Layer) │    │  security/credential-vault  │
        │   IExchangeAdapter           │    │  AES-256-GCM encrypt/decrypt │
        │   └─ BinanceAdapter (ccxt)   │    │  (never logs plaintext)     │
        └───────────────┬───────────────┘    └───────────────┬────────────┘
                        │ fetchBalance() / fetchMarkets()      │
                        ▼                                      ▼
              ┌─────────────────┐                  ┌──────────────────────┐
              │  Binance (REST)  │                  │  PostgreSQL (Drizzle) │
              └─────────────────┘                  │ users · settings      │
                                                     │ refresh_tokens · symbols│
                                                     └──────────────────────┘
```

Primary use-case trace: **login** → frontend POST `/auth/login` → Zod validates body → auth `application` use case looks up user, verifies argon2 hash → issues short-lived access JWT (`@fastify/jwt`) + inserts a row into `refresh_tokens` (hashed token, `expires_at`) → both tokens returned → frontend stores access token in memory and refresh token per its storage strategy → subsequent requests carry the access token → background timer calls `/auth/refresh` before 15-min expiry → handler checks `refresh_tokens.revoked_at IS NULL AND expires_at > now()` → issues new access token (and, if rotating, a new refresh row + revokes the old one) → explicit logout sets `revoked_at = now()` on that refresh token row, and the next `/auth/refresh` call for it is rejected.

### Recommended Project Structure
```
backend/src/
├── modules/
│   ├── auth/
│   │   ├── domain/            # User entity, DomainError subclasses (InvalidCredentialsError, TokenRevokedError)
│   │   ├── application/       # LoginUseCase, RefreshUseCase, LogoutUseCase
│   │   └── infrastructure/    # Drizzle UserRepository, Fastify auth routes/controllers, AuthPort implementations
│   ├── settings/
│   │   ├── domain/            # ExchangeCredentials entity, InvalidCredentialsFormatError, ExchangeUnreachableError, ExchangePermissionError
│   │   ├── application/       # SaveCredentialsUseCase (calls ExchangePort.testConnection before persisting)
│   │   └── infrastructure/     # SettingsRepositoryPort impl, controllers
│   └── symbols/
│       ├── domain/            # Symbol entity
│       ├── application/       # SyncSymbolsUseCase (wraps adapter fetch + atomic write)
│       └── infrastructure/     # SymbolsRepositoryPort impl, controllers, boot-time trigger
├── exchanges/
│   ├── core/
│   │   ├── exchange-adapter.interface.ts   # IExchangeAdapter (getSymbols, getBalance, ping/testConnection)
│   │   ├── types.ts                        # NormalizedSymbol, NormalizedBalance
│   │   └── exchange-registry.ts
│   └── binance/
│       └── binance.adapter.ts              # wraps ccxt.binance
├── security/
│   ├── credential-vault.ts    # encrypt(plaintext) / decrypt(ciphertext) using AES-256-GCM
│   ├── crypto.ts               # low-level cipher/nonce helpers
│   └── secrets.ts              # startup validation (fail-fast prod / temp-key dev, per D-23/D-24)
├── persistence/
│   ├── schema/                 # Drizzle table definitions (users, refresh_tokens, settings, symbols)
│   └── db.ts                   # postgres.js client + drizzle() instance
└── shared/
    ├── errors/                 # DomainError base class
    ├── http/                   # setErrorHandler, response envelope helper
    └── logging.ts              # pino instance with redact config
```

### Pattern 1: Refresh-Token Table Doubles as the Revocation Store

**What:** A single `refresh_tokens` table (columns: `id`, `user_id`, `token_hash`, `issued_at`, `expires_at`, `revoked_at nullable`) is both the source of truth for "is this refresh token still good" and the revocation mechanism — there is no separate blacklist. Store a hash of the refresh token (e.g., SHA-256), never the raw token, so a DB read/leak doesn't hand out usable tokens.

**When to use:** Every refresh and logout call.

**Example:**
```typescript
// modules/auth/infrastructure/refresh-token.repository.ts
export async function isRefreshTokenValid(db: DrizzleDB, tokenHash: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);
  return !!row && row.expiresAt > new Date();
}

export async function revokeRefreshToken(db: DrizzleDB, tokenHash: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
}
```
This directly fixes the legacy bug in CONCERNS.md ("Blacklist array created but never checked") by making the check load-bearing: `RefreshUseCase` and `LogoutUseCase` both call through this repository, and there is no code path that issues a new access token without it.

### Pattern 2: Envelope Encryption for Exchange Credentials (AES-256-GCM)

**What:** Encrypt with a random 96-bit (12-byte) nonce per call, store `nonce || ciphertext || authTag` (or as separate columns) alongside a version tag. Master key comes from `AES_KEY`/similar env var, validated at boot (D-23/D-24).

**When to use:** Every write and read of `settings.accessKey` / `settings.secretKey`.

**Example:**
```typescript
// security/crypto.ts
// Source: Node.js crypto docs pattern, cross-checked against PITFALLS.md Pitfall 1
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encrypt(plaintext: string, masterKey: Buffer): { nonce: Buffer; ciphertext: Buffer; authTag: Buffer } {
  const nonce = randomBytes(12); // random per call — never derive deterministically (Pitfall 1)
  const cipher = createCipheriv(ALGO, masterKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { nonce, ciphertext, authTag };
}

export function decrypt(nonce: Buffer, ciphertext: Buffer, authTag: Buffer, masterKey: Buffer): string {
  const decipher = createDecipheriv(ALGO, masterKey, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```
**Critical:** never derive the nonce from a counter, timestamp, or user ID — must be `randomBytes(12)` per encryption call. This is the exact mistake `.planning/research/PITFALLS.md` Pitfall 1 warns is "worse than the legacy bug it replaces" if done wrong.

### Pattern 3: Exchange Adapter with a "Test Connection" Seam

**What:** `IExchangeAdapter` exposes a narrow contract; `BinanceAdapter` wraps a single long-lived `ccxt.binance` instance (not a new instance per call — reusing the instance preserves ccxt's internal rate-limiter state, per `.planning/research/PITFALLS.md` Integration Gotchas). The settings save flow calls `adapter.testConnection(credentials)` — implemented as `exchange.fetchBalance()` — before any DB write.

**Example:**
```typescript
// exchanges/core/exchange-adapter.interface.ts
export interface IExchangeAdapter {
  id: string;
  testConnection(creds: DecryptedCredentials): Promise<void>; // throws typed errors on failure
  getSymbols(): Promise<NormalizedSymbol[]>;
  getBalance(creds: DecryptedCredentials): Promise<NormalizedBalance[]>;
}

// exchanges/binance/binance.adapter.ts
import ccxt from 'ccxt';

export class BinanceAdapter implements IExchangeAdapter {
  id = 'binance';

  async testConnection(creds: DecryptedCredentials): Promise<void> {
    const exchange = new ccxt.binance({ apiKey: creds.accessKey, secret: creds.secretKey, enableRateLimit: true });
    try {
      await exchange.fetchBalance();
    } catch (err) {
      if (err instanceof ccxt.AuthenticationError) throw new InvalidCredentialsError();
      if (err instanceof ccxt.PermissionDenied) throw new InsufficientPermissionsError();
      if (err instanceof ccxt.NetworkError) throw new ExchangeUnavailableError();
      throw new ExchangeAdapterUnknownError(err);
    }
  }

  async getSymbols(): Promise<NormalizedSymbol[]> {
    const exchange = new ccxt.binance({ enableRateLimit: true });
    const markets = await exchange.fetchMarkets();
    return markets.map(normalizeMarket);
  }
}
```
ccxt's documented error hierarchy (`BaseError → ExchangeError → AuthenticationError/PermissionDenied/...`, `BaseError → NetworkError → ExchangeNotAvailable/RequestTimeout/...`) is exactly what D-07's "specific error types per failure" needs — map each ccxt error class to a typed domain exception rather than a generic catch.

### Pattern 4: Zod + fastify-type-provider-zod + Central Error Handler → Standard Envelope

**What:** Register the Zod type provider once at app setup; every route declares its `body`/`params`/`querystring` schema with Zod; one `setErrorHandler` translates `ZodError`-shaped validation failures, domain exceptions, and unknown errors into the locked `{data, message, timestamp}` envelope.

**Example:**
```typescript
// app.ts
import { serializerCompiler, validatorCompiler, hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.setErrorHandler((err, req, reply) => {
  const timestamp = new Date().toISOString();

  if (hasZodFastifySchemaValidationErrors(err)) {
    return reply.status(400).send({
      data: { fields: err.validation.map(v => ({ field: v.instancePath.replace(/^\//, ''), message: v.message })) },
      message: 'Validation failed',
      timestamp,
    });
  }
  if (err instanceof DomainError) {
    return reply.status(err.statusCode).send({ data: null, message: err.message, timestamp });
  }
  req.log.error(err); // pino, with redact config active — never logs req.body raw (fixes SEC-07)
  return reply.status(500).send({ data: null, message: 'Internal server error', timestamp });
});
```
This satisfies D-25 (per-field detail), D-26 (same envelope, details inside `data`), and D-27 (one central handler, `ZodError` → 400, domain exceptions → their specific status, unhandled → 500) in one place.

### Pattern 5: Idempotent, Non-Blocking Boot Symbol Sync

**What:** On boot, check if the `symbols` table is empty (D-14); if so, run the sync inside a Drizzle transaction (delete+insert, or insert-with-conflict-handling, atomically) using the `onListen` hook so a sync failure **cannot** block the server from accepting requests (D-16).

**Example:**
```typescript
// server.ts
app.addHook('onListen', async () => {
  // onListen runs after the server is already listening — a throw here does not
  // prevent startup (Fastify v4.23+ / v5.x behavior, confirmed against official docs)
  try {
    const count = await db.select({ c: sql<number>`count(*)` }).from(symbols);
    if (count[0].c === 0) {
      await syncSymbolsUseCase.execute(); // wraps its own db.transaction internally
    }
  } catch (err) {
    app.log.error({ err }, 'boot symbol sync failed — continuing with existing/empty symbol table');
  }
});

// modules/symbols/application/sync-symbols.use-case.ts
async function execute() {
  const normalized = await adapter.getSymbols();
  await db.transaction(async (tx) => {
    await tx.delete(symbols);
    await tx.insert(symbols).values(normalized);
    // if insert throws mid-way, the whole transaction (including the delete) rolls back —
    // fixes CONCERNS.md "Sync Without Transaction" (old symbols intact on failure)
  });
}
```

### Anti-Patterns to Avoid
- **Checking the refresh token's validity only at issuance, not at every `/refresh` call:** the legacy bug was exactly this class of "exists but not enforced" logic — every refresh/logout path must query `refresh_tokens` fresh, not trust a JWT claim alone.
- **Deriving the AES-GCM nonce from anything deterministic** (user ID, counter, truncated timestamp) — always `crypto.randomBytes(12)` per call.
- **Creating a new ccxt exchange instance per request inside a hot loop** — reuse one instance per exchange+credential pair so its internal rate-limiter state persists (per `.planning/research/PITFALLS.md`).
- **Returning `secretKey`/`accessKey` in any API response, even partially, without going through the explicit masking function** (D-05) — apply masking at the DTO/serialization boundary, not ad hoc in each controller.
- **Running the boot symbol sync inside `onReady` instead of `onListen`** — `onReady` hooks block startup until they resolve; a slow or failing Binance call in `onReady` would violate D-16's "must not block boot" requirement. Use `onListen`, which runs after the server is already accepting connections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification with error handling | Custom `jsonwebtoken` wrapper with manual try/catch | `@fastify/jwt` | Already wraps verify failures into a typed Fastify error; hand-rolling reintroduces exactly the SEC-04 crash bug being fixed |
| Per-route + global rate limiting | Custom in-memory counter middleware | `@fastify/rate-limit` | Handles sliding windows, per-route override config, and `Retry-After` headers correctly; a hand-rolled counter is also what caused the legacy system to have *no* working rate limiting at all |
| Multi-exchange REST client / symbol normalization | A bespoke Binance-only HTTP client (what the legacy `node-binance-api` wrapper effectively was) | ccxt | EXCH-01 requires an abstraction; ccxt already normalizes 100+ exchanges' market/balance/symbol shapes and has built-in rate-limit awareness per exchange |
| Password hashing | Custom scrypt/PBKDF2 wrapper | argon2 | Argon2id is the current OWASP-recommended default; a hand-rolled KDF wrapper is a well-known source of subtle security bugs (salt reuse, insufficient work factor) |
| Request schema validation | Manual `if (!body.email) throw ...` checks per route | Zod + fastify-type-provider-zod | FOUND-04 requires this everywhere; manual checks are exactly the "Missing Input Validation" gap CONCERNS.md flags, and don't produce the structured per-field errors D-25 requires |
| AES-GCM encryption primitives | A custom cipher-mode implementation | Node's built-in `crypto` module (`createCipheriv('aes-256-gcm', ...)`) | Node's `crypto` is a thin, correct binding to OpenSSL; there is no legitimate reason to reimplement AES-GCM framing, and doing so is how the legacy fixed-IV bug happened in the first place |

**Key insight:** Every item in this table maps to a specific bug already documented in CONCERNS.md. The unifying theme is that the legacy system's critical flaws were all "rolled by hand, then rolled incorrectly" — the fix in this phase is not just "use a different crypto mode" or "add a rate limiter," it's "stop hand-rolling infrastructure that has a mature, narrowly-scoped library already solving it correctly."

## Common Pitfalls

### Pitfall 1: AES-GCM Nonce Reuse (treated as drop-in fix for the legacy fixed-IV bug)
**What goes wrong:** Switching CTR→GCM without also fixing nonce generation discipline (e.g., deriving nonce from user ID) — GCM nonce reuse under the same key leaks the authentication key, which is worse than the original CTR bug.
**Why it happens:** Teams treat "switch cipher mode" as the entire fix.
**How to avoid:** `crypto.randomBytes(12)` per encryption call, stored alongside ciphertext; envelope encryption (master key wraps per-record data, or at minimum one master key validated at boot per D-23/D-24); include a version byte in the stored format for future rotation.
**Warning signs:** Nonce computed from any deterministic input; no version field in stored ciphertext.
*(Source: `.planning/research/PITFALLS.md` Pitfall 1 — carried forward here because it is squarely in this phase's scope.)*

### Pitfall 2: Revocation Table Exists But Isn't Checked on the Hot Path
**What goes wrong:** A `refresh_tokens`/blacklist table is built, but the `/refresh` or WS-auth code path doesn't actually query it — this is the exact legacy bug (CONCERNS.md: "Blacklist array created but never checked").
**Why it happens:** The table and the enforcement are built in separate steps/PRs, and the enforcement step is silently skipped or stubbed with a TODO that never gets closed.
**How to avoid:** Write the integration test *first* (TEST-01): "logout, then attempt refresh with the same token → expect rejection." A plan/task that creates the table without a corresponding test asserting the check happens should be treated as incomplete.
**Warning signs:** Table exists in the schema but no repository function that queries it is called from `RefreshUseCase`/`LogoutUseCase`.

### Pitfall 3: Rate Limiting Applied Only Globally, Not Specifically to Login
**What goes wrong:** `@fastify/rate-limit` registered once with a lenient global config (100/min) is assumed to also cover brute-force login protection — but 100/min is far too permissive for password guessing (D-20 requires 5/15min specifically on login).
**Why it happens:** Global registration feels like "rate limiting is done"; the per-route override (`config: { rateLimit: {...} }`) is a separate, easy-to-forget step.
**How to avoid:** Explicitly add the per-route override on the login route; write a test asserting the 6th failed login attempt within 15 minutes is rejected with 429, independent of the global limit.
**Warning signs:** Only one `@fastify/rate-limit` registration in the codebase, with no `config.rateLimit` override anywhere in the auth routes.

### Pitfall 4: ccxt Errors Caught Generically Instead of Mapped to Specific Domain Exceptions
**What goes wrong:** Settings save flow wraps `adapter.testConnection()` in a single `catch (err) { throw new CredentialTestFailedError() }`, losing the distinction D-07 requires (invalid key/secret vs. no balance-read permission vs. Binance unreachable).
**Why it happens:** ccxt throws a hierarchy of typed errors (`AuthenticationError`, `PermissionDenied`, `NetworkError`, etc.) that's easy to flatten into one catch block if not deliberately mapped.
**How to avoid:** Explicit `instanceof` checks against ccxt's exported error classes (see Pattern 3 code example), each mapped to a distinct domain exception with its own message and HTTP status via the central error handler.
**Warning signs:** Only one error type/message shown to the user regardless of why the Binance call failed.

### Pitfall 5: Boot Sync Registered in `onReady` Instead of `onListen`, Silently Reintroducing a Blocking Boot Path
**What goes wrong:** `onReady` hooks must all resolve before Fastify starts listening — if the boot symbol sync throws or hangs (e.g., Binance timeout) inside `onReady`, the server never starts, directly violating D-16.
**Why it happens:** `onReady` is the more commonly documented/older hook; `onListen` (Fastify 4.23+) is newer and less discussed in older tutorials/StackOverflow answers.
**How to avoid:** Use `onListen` specifically for the boot sync trigger; write an integration test that starts the server with a mocked-to-fail exchange adapter and asserts the server still responds to `GET /health` (or equivalent) immediately.
**Warning signs:** Sync logic registered via `addHook('onReady', ...)` anywhere in `server.ts`.

## Code Examples

### Startup secrets validation (D-23/D-24)
```typescript
// security/secrets.ts
// Source: pattern synthesized from `.planning/research/STACK.md` "mandatory startup validation" recommendation
// and CONTEXT.md D-23/D-24 (fail-fast prod, temp-key dev)
import { randomBytes } from 'node:crypto';

interface RequiredSecrets {
  JWT_SECRET: string;
  AES_KEY: Buffer; // must resolve to exactly 32 bytes
}

export function loadSecrets(env: NodeJS.ProcessEnv): RequiredSecrets {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET;
  const aesKeyRaw = env.AES_KEY;

  if (!jwtSecret || !aesKeyRaw) {
    if (isProd) {
      throw new Error('JWT_SECRET and AES_KEY are required in production — refusing to start.');
    }
    // dev-only fallback: generate and warn once, never reused as a "default" in code
    const tempKey = randomBytes(32);
    // eslint-disable-next-line no-console
    console.warn(
      '[secrets] AES_KEY/JWT_SECRET not set — using a temporary in-memory key for this run only. ' +
      'Set AES_KEY and JWT_SECRET in .env for persistence across restarts.'
    );
    return { JWT_SECRET: jwtSecret ?? tempKey.toString('hex'), AES_KEY: tempKey };
  }

  const aesKey = Buffer.from(aesKeyRaw, 'utf8');
  if (aesKey.length !== 32) {
    throw new Error(`AES_KEY must be exactly 32 bytes, got ${aesKey.length}.`);
  }
  return { JWT_SECRET: jwtSecret, AES_KEY: aesKey };
}
```
This is deliberately NOT a hardcoded fallback constant (the exact CONCERNS.md bug) — the dev fallback is generated fresh in memory on every boot and never committed/shared.

### Drizzle schema shape for refresh tokens + encrypted credentials
```typescript
// persistence/schema/auth.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(), // SHA-256 hex of the raw refresh token — never store raw
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'), // null = active; set on explicit logout
});

// persistence/schema/settings.ts
export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  encryptedAccessKey: text('encrypted_access_key').notNull(), // base64(nonce || ciphertext || authTag)
  encryptedSecretKey: text('encrypted_secret_key').notNull(),
  keyVersion: text('key_version').notNull().default('v1'), // supports future key rotation
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Express + manual middleware validation | Fastify + JSON-schema/Zod-driven validation compiled at route registration | Ongoing since Fastify's inception, but the Zod type-provider path (`fastify-type-provider-zod`) is now maintained under the official `fastify` GitHub org, not a third-party fork | End-to-end type inference from Zod schema to route handler, plus a documented `hasZodFastifySchemaValidationErrors()` helper for exactly this phase's central error handler |
| AES-CBC/CTR with app-wide static key | AES-256-GCM with per-record random nonce + envelope key hierarchy | Long-standing cryptographic best practice, not new in 2026, but still the single most-violated pattern per `.planning/research/PITFALLS.md` | Authenticated encryption (tamper detection) instead of just confidentiality; makes the legacy vulnerability class structurally harder to reintroduce |
| bcrypt/bcryptjs dual dependency | argon2 (argon2id) as the OWASP-recommended default | bcrypt remains acceptable but is no longer the recommended default for new systems | Memory-hard, GPU-resistant hashing; also removes the legacy redundant-dependency tech debt item |
| `onReady` as the only startup hook available for "run something before serving traffic" | `onListen` (Fastify 4.23+, carried into 5.x) for non-blocking post-listen initialization | Added per Fastify GitHub issue #4542 | Enables exactly the D-16 requirement (boot sync must not block server startup) without a custom `setImmediate`/`process.nextTick` workaround |

**Deprecated/outdated:**
- `node-binance-api` as the sole exchange client: superseded by ccxt for this project once multi-exchange support (even just the *abstraction*, per EXCH-01) is required.
- Manual `jwt.verify()` calls without a Fastify plugin: superseded by `@fastify/jwt`, which is now the standard, officially maintained approach in the Fastify ecosystem.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `dotenv` current version and its continued role as the dev-only env loader | Standard Stack / Supporting | Low — dotenv is a simple, stable utility; even if a newer alternative exists, swapping it has no architectural impact |
| A2 | `fastify-type-provider-zod`'s `hasZodFastifySchemaValidationErrors()` helper name/signature is stable across the 7.0.0 release used here | Architecture Patterns / Pattern 4 | Medium — if the exact helper name changed in a recent major, the central error handler code example would need a one-line adjustment; verify against the installed version's README during implementation |
| A3 | Reusing one long-lived `ccxt.binance` instance per credential set (rather than per-request) is safe for this app's single-user, low-request-volume profile | Architecture Patterns / Pattern 3, Don't Hand-Roll | Low — this is ccxt's own documented recommendation (per `.planning/research/PITFALLS.md`), not a novel claim, but instance lifecycle management (when to dispose/recreate on credential change) should be explicitly designed in the plan |
| A4 | `postgres` (porsager/postgres.js) rather than `pg`/`node-postgres` is the correct Drizzle-recommended Postgres driver for this project | Standard Stack / Core | Low — both are valid Drizzle dialect drivers; if the team prefers `pg` for familiarity, this is a straightforward swap with no architectural consequence, already flagged as MEDIUM confidence in `.planning/research/STACK.md` |

**If this table is empty:** N/A — see entries above. All Standard Stack package *names and versions* are `[VERIFIED: npm registry]`; the items above are secondary implementation-detail assumptions, not package-existence claims.

## Open Questions

1. **Refresh token rotation: rotate-on-every-refresh, or reuse the same refresh token until its own expiry?**
   - What we know: CONTEXT.md D-12 locks the *lifetime* ranges (~15min access / 7-30 day refresh) and leaves the exact revocation mechanism to Claude's discretion (D- "Claude's Discretion" section).
   - What's unclear: Whether each `/refresh` call should issue a brand-new refresh token (rotation, more secure, invalidates the old one immediately) or keep reusing the same refresh token until its own natural expiry (simpler, one row per login session).
   - Recommendation: Implement rotation (new refresh row + revoke old on every `/refresh` call) — it's a small additional write, closes the window where a leaked-but-unused-yet refresh token remains valid, and is the current industry-standard pattern per the JWT revocation sources reviewed. Planner should size this as part of the `RefreshUseCase` task, not a separate follow-up.

2. **Where exactly does the single-user "seed on boot" (D-01–D-04) intersect with the `users`/`settings` schema — one table or two?**
   - What we know: Legacy system has a single `settings` table holding both login credentials (email/password) and Binance API keys (per `.planning/codebase/INTEGRATIONS.md`). CONTEXT.md's hexagonal-architecture decision (D-17/D-18) implies `auth` and `settings` are separate modules with separate ports.
   - What's unclear: Whether the new schema should split into a `users` table (auth module) and a `settings`/`exchange_credentials` table (settings module) referencing it by `user_id`, or keep them merged as legacy does.
   - Recommendation: Split into `users` (auth) and `settings`/`exchange_credentials` (settings module, FK to `users.id`) — this aligns with the locked hexagonal module boundaries (D-17/D-18: each module owns its own port/table) and makes the "one credential set per user" constraint (D-08) a natural FK relationship rather than an ad hoc rule. Planner should confirm this table split explicitly in the plan's schema design task.

3. **Exact TOTP/2FA touchpoints deferred to Phase 3 — does anything in this phase's auth schema need a forward-compatible column now?**
   - What we know: 2FA is explicitly Phase 3 scope (2FA-01–03), and `.planning/research/PITFALLS.md` Pitfall 7 recommends designing 2FA jointly with the token refresh/blacklist rebuild, not bolted on later.
   - What's unclear: Whether Phase 1's `users` table should reserve a nullable `totp_secret_encrypted`/`totp_enabled` column now (cheap, avoids a Phase 3 migration touching the same table this phase just built) or whether that's premature schema coupling.
   - Recommendation: Do not add 2FA columns in Phase 1 — CONTEXT.md's Phase Boundary explicitly excludes 2FA from this phase, and Drizzle migrations make adding columns later low-cost. Flag this as a note for Phase 3 planning instead of pre-building it now, to avoid scope creep into this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime (all of Phase 1) | Not independently probed this session — repo `.nvmrc`/engines not confirmed | — | Planner should verify Node 24 LTS is installed before Wave 0 tasks run; if unavailable, Node 22 LTS is an acceptable fallback (both support all packages listed above) |
| PostgreSQL | FOUND-02, all persistence in this phase | Not independently probed this session (no local instance check performed) | — | If no local Postgres is available, use a Dockerized `postgres:17` container for dev — no code-level fallback exists since PostgreSQL is a locked decision (STACK.md), not optional |
| npm registry access | Package installation (this phase's very first task) | Confirmed reachable — `npm view` calls against 16 packages succeeded during this research session | — | — |

**Missing dependencies with no fallback:**
- None confirmed missing — Node.js and PostgreSQL availability were not directly probed in this research session (no shell access to check `node --version`/`pg_isready` was exercised); the planner should add a Wave 0 environment-check task rather than assume either from this research alone.

**Missing dependencies with fallback:**
- PostgreSQL: use Docker (`postgres:17`) if no local instance exists — zero code impact, standard local-dev pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: npm registry] — no existing test framework in the legacy or current repo (`.planning/codebase/TESTING.md` / CONCERNS.md confirm zero test coverage) |
| Config file | none yet — `vitest.config.ts` must be created in Wave 0 |
| Quick run command | `npx vitest run --project backend <changed-file-pattern>` (or `npm run test -- <pattern>` once script is wired) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Login with valid email/password returns access+refresh tokens | integration (Fastify `.inject()`) | `npx vitest run tests/auth/login.test.ts` | ❌ Wave 0 |
| AUTH-01 | Login with invalid password returns 401, no tokens | integration | `npx vitest run tests/auth/login.test.ts` | ❌ Wave 0 |
| SEC-02 | Access token expires after ~15min; refresh issues a new one while refresh token is valid | integration | `npx vitest run tests/auth/refresh.test.ts` | ❌ Wave 0 |
| SEC-03 / AUTH-03 | Explicit logout revokes refresh token; subsequent `/refresh` with same token → rejected | integration | `npx vitest run tests/auth/logout.test.ts` | ❌ Wave 0 |
| SEC-04 | Malformed/expired JWT on a protected route returns 401, not a 500/crash | integration | `npx vitest run tests/auth/jwt-verification.test.ts` | ❌ Wave 0 |
| SEC-01 | Encrypting the same plaintext twice produces different ciphertext (nonce uniqueness); decrypt round-trips correctly | unit | `npx vitest run tests/security/credential-vault.test.ts` | ❌ Wave 0 |
| SEC-07 | Settings API response never includes raw `secretKey`/`accessKey`; logger redaction config verified | unit + integration | `npx vitest run tests/settings/response-shape.test.ts` | ❌ Wave 0 |
| AUTH-02 | Saving credentials calls `testConnection` first; save is rejected if the exchange call fails | integration (mocked ccxt adapter) | `npx vitest run tests/settings/save-credentials.test.ts` | ❌ Wave 0 |
| EXCH-01/02 | `BinanceAdapter.testConnection` maps ccxt `AuthenticationError`/`PermissionDenied`/`NetworkError` to distinct domain exceptions | unit (mocked ccxt) | `npx vitest run tests/exchanges/binance-adapter.test.ts` | ❌ Wave 0 |
| EXCH-03 | Symbol sync boot logic only runs when table is empty; manual sync always runs | integration | `npx vitest run tests/symbols/sync-trigger.test.ts` | ❌ Wave 0 |
| EXCH-03 | Symbol sync failure mid-transaction leaves old symbols intact (atomicity) | integration (DB transaction rollback) | `npx vitest run tests/symbols/sync-atomicity.test.ts` | ❌ Wave 0 |
| SEC-08 | 6th failed login attempt within 15 minutes from same IP returns 429 | integration | `npx vitest run tests/auth/rate-limit.test.ts` | ❌ Wave 0 |
| FOUND-04 | Invalid request body on any route returns 400 with per-field Zod error detail in the standard envelope | integration | `npx vitest run tests/http/validation-envelope.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed test file>`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — framework config, none exists yet
- [ ] `tests/setup/db.ts` — test database setup/teardown helper (transactional test isolation or a dedicated test schema)
- [ ] `tests/setup/mock-ccxt.ts` — shared mock for `ccxt.binance` so exchange-dependent tests don't hit real Binance
- [ ] All test files listed in the map above — none exist yet (repo has zero test files per CONCERNS.md/TESTING.md)
- [ ] `npm run test` script wiring in `backend/package.json`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `@fastify/jwt` for access tokens, argon2id for password hashing, `refresh_tokens` table for stateful revocation |
| V3 Session Management | yes | Short-lived (15min) access token + persistent, revocable refresh token; explicit logout revokes server-side (SEC-03) |
| V4 Access Control | yes | All protected routes require valid access token via `@fastify/jwt` decorator/`preHandler`; single-user system so authorization is binary (authenticated vs. not), no roles/permissions matrix needed in this phase |
| V5 Input Validation | yes | Zod schemas on every route body/params/querystring via `fastify-type-provider-zod` |
| V6 Cryptography | yes | AES-256-GCM (Node built-in `crypto`) for exchange credentials at rest, random 96-bit nonce per record, master key fail-fast validated at boot (never hand-rolled cipher logic) |
| V7 Error Handling and Logging | yes | Central `setErrorHandler`; pino with `redact` config ensures secrets/passwords never appear in logs (SEC-07) |
| V9 Communications | partial | HTTPS enforcement via `@fastify/helmet` HSTS header; actual TLS termination is a deployment/infra concern outside this phase's code |
| V13 API and Web Service | yes | `@fastify/cors` explicit origin allowlist (SEC-05); `@fastify/rate-limit` global + per-route (SEC-08) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute-force login (credential stuffing against the single known email) | Denial of Service / Elevation of Privilege | `@fastify/rate-limit` per-route override on login: 5 attempts/15min per IP (D-20/D-21) |
| JWT tampering/forgery | Tampering | `@fastify/jwt` verifies signature using `JWT_SECRET`; malformed/invalid tokens caught and rejected with 401, not a crash (SEC-04) |
| Refresh token replay after logout | Spoofing / Repudiation | `refresh_tokens.revoked_at` checked on every `/refresh` call — the legacy no-op-blacklist bug's direct fix (SEC-03) |
| Exchange credential exfiltration via API response or logs | Information Disclosure | Never serialize `secretKey`/`accessKey` in DTOs (D-05 masking at the boundary); pino `redact` config; encryption at rest means even a DB dump doesn't yield plaintext without the master key |
| AES-GCM nonce reuse leaking the authentication key | Tampering / Information Disclosure | `crypto.randomBytes(12)` per encryption call, never deterministic (Pitfall 1) |
| SQL injection via unvalidated input reaching Drizzle queries | Tampering | Drizzle's query builder uses parameterized queries by default; Zod validation additionally rejects malformed input before it reaches the repository layer |
| CORS misconfiguration allowing cross-origin credential theft | Information Disclosure / Spoofing | `@fastify/cors` with an explicit origin allowlist from env config, not `cors()` called bare (the exact legacy bug, SEC-05) |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version`, `time.created`, `repository.url`) — HIGH confidence, direct registry queries performed this session for all 16 phase-relevant packages
- [fastify/fastify-jwt GitHub](https://github.com/fastify/fastify-jwt) — official repo, referenced for decorator API shape
- [fastify/fastify-rate-limit GitHub](https://github.com/fastify/fastify-rate-limit) — official repo, per-route `config.rateLimit` override confirmed
- [fastify/fastify-type-provider-zod GitHub](https://github.com/fastify/fastify-type-provider-zod) — official repo (transferred from turkerdev), `hasZodFastifySchemaValidationErrors()` helper confirmed
- [Fastify Hooks reference (fastify.dev)](https://fastify.dev/docs/latest/Reference/Hooks/) — official docs, `onListen` vs `onReady` blocking behavior confirmed
- [ccxt GitHub repository](https://github.com/ccxt/ccxt) — official repo, error hierarchy (`BaseError`/`ExchangeError`/`NetworkError` and subclasses) confirmed
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` — project-level research, HIGH confidence as internally-produced, already-verified prior research this phase builds on
- `.planning/codebase/CONCERNS.md`, `.planning/codebase/INTEGRATIONS.md` — direct legacy codebase analysis, HIGH confidence for "what bug is being fixed"

### Secondary (MEDIUM confidence)
- [Fastify Introduces the New onListen Hook (Nearform)](https://nearform.com/insights/fastify-introduces-the-new-onlisten-hook/) — MEDIUM confidence, vendor/community blog corroborating official docs
- [fastify-rate-limit README via npm/GitHub search excerpts] — MEDIUM confidence, WebSearch-surfaced code examples cross-checked against the official repo's documented config shape
- [WebSocket/JWT revocation general pattern discussions (SuperTokens, OneUptime blogs)] — MEDIUM confidence, general JWT revocation pattern guidance, not Fastify-specific; used only to confirm the "hash the token, check on refresh" pattern is industry-standard, not to source any code verbatim
- [Drizzle transaction rollback behavior discussion (drizzle-team GitHub Discussion #3039, wanago.io NestJS+Drizzle tutorial)] — MEDIUM confidence, corroborates automatic rollback-on-throw semantics used in Pattern 5

### Tertiary (LOW confidence)
- None used without corroboration — all WebSearch findings above were cross-checked against at least one official source (GitHub repo, official docs) before being included as anything more than an illustrative example.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package name/version independently verified against the live npm registry this session, all have long-standing official repos
- Architecture: MEDIUM-HIGH — the refresh-token-table-as-revocation-store, ccxt-adapter, and Zod-error-handler patterns are each corroborated by at least one official source, but the exact wiring (e.g., rotation policy, table split) involved reasoned synthesis rather than a single "canonical Fastify+Drizzle+ccxt auth tutorial" — flagged explicitly in Open Questions
- Pitfalls: HIGH for security-critical items (nonce reuse, blacklist-never-checked, boot-blocking) — these are directly sourced from `.planning/research/PITFALLS.md` (already-verified project research) plus this session's confirmation of `onListen` semantics against official Fastify docs

**Research date:** 2026-09-12
**Valid until:** 30 days (stable library versions; re-verify npm versions if planning is delayed past mid-October 2026, especially for `fastify-type-provider-zod` and `drizzle-kit` which iterate faster than the core frameworks)
