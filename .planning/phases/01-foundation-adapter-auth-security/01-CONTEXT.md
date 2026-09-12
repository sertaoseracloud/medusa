# Phase 1: Foundation — Adapter, Auth & Security - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

User can log in securely, configure encrypted Binance credentials, and have market symbols synced automatically — all on the new, hardened stack (Fastify + PostgreSQL/Drizzle + React 19), with the Exchange Adapter abstraction as the foundation for future multi-exchange support (v2). This phase does not build the realtime dashboard (Phase 2), 2FA (Phase 3), or any trading feature (alerts/backtesting/reporting).

</domain>

<decisions>
## Implementation Decisions

### Criação da conta de usuário (single-user provisioning)
- **D-01:** Nenhuma tela pública de cadastro. O usuário único é provisionado via seed no boot do servidor, não por uma tela de registro nem por um comando CLI separado.
- **D-02:** Email/senha do seed vêm de variáveis de ambiente (ex: `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`).
- **D-03:** O seed faz upsert sempre — a cada boot, a senha no banco é sincronizada para bater com a env var atual (não é create-if-not-exists apenas).
- **D-04:** A UI deve ter uma tela de troca de senha, mas com aviso explícito de que a senha será revertida para o valor da env var no próximo restart do servidor caso as variáveis de ambiente não sejam atualizadas junto.

### UX de credenciais de exchange
- **D-05:** O `secretKey` da Binance é mascarado parcialmente na UI após salvo (ex: exibe só os últimos caracteres), nunca em texto pleno — a API nunca retorna o valor completo em nenhuma resposta.
- **D-06:** Antes de persistir novas credenciais, o backend faz uma chamada de teste real à Binance (via Exchange Adapter, ex: `getBalance`) para validar que a chave funciona. Se a chamada falhar, a gravação é rejeitada.
- **D-07:** Erros de validação de credenciais são específicos por tipo (chave/segredo inválidos vs. sem permissão de leitura de saldo vs. Binance indisponível/timeout) — não uma mensagem genérica. Justificativa: sistema é single-user (o próprio dono), então detalhar o erro ajuda a diagnosticar sem risco de vazar dados para terceiros.
- **D-08:** Modelo de dados mantém um único conjunto de credenciais por usuário (como no legado) — não modelar múltiplos "perfis de exchange" nesta fase. Multi-exchange simultâneo é v2 (EXCH-V2-* em REQUIREMENTS.md).

### Sessão e expiração de token
- **D-09:** Refresh de access token é silencioso em background (o frontend renova antes de expirar, sem interromper o usuário) — não espera um 401 para disparar o refresh.
- **D-10:** Quando o refresh token também expira, o logout é silencioso: tokens limpos, sem mensagem explícita de "sessão expirada" — o usuário simplesmente vê a tela de login ao tentar navegar.
- **D-11:** Logout explícito (botão "Sair") revoga o refresh token no servidor (blacklist persistente), além de limpar o estado no frontend — corrige o bug do CONCERNS.md em que o logout legado não invalida nada de fato.
- **D-12:** Vida útil dos tokens: access token curto (~15 min), refresh token longo (~7–30 dias) — valor exato fica a critério do planner/executor dentro dessa faixa, alinhado à recomendação de `research/STACK.md`.

### Sincronização de símbolos
- **D-13:** Sincronização automática de símbolos roda na inicialização do servidor, além do botão manual (mantido da UI legada) para forçar refresh depois.
- **D-14:** O sync automático na inicialização só dispara quando a tabela de símbolos está vazia (primeira execução) — reinicializações subsequentes não re-sincronizam automaticamente; sync depois disso é sempre manual via botão.
- **D-15:** A sincronização (manual ou automática) deve rodar dentro de uma transação atômica — se o bulk insert falhar no meio, os símbolos antigos permanecem intactos (corrige o `deleteAll()` + `bulkInsert()` sem transação apontado em CONCERNS.md).
- **D-16:** Se a sincronização automática na inicialização falhar (ex: Binance fora do ar durante o boot), o servidor deve continuar subindo normalmente — loga o erro e segue com os símbolos já existentes (ou vazio, na primeira vez); não deve bloquear o boot.

### Claude's Discretion
- Valores exatos de expiração de access/refresh token dentro da faixa acordada (~15min / 7–30 dias).
- Mecanismo exato de revogação de refresh token no servidor (tabela de blacklist, coluna `revoked_at`, ou equivalente) — desde que persistente, não em memória.
- Formato exato do mascaramento do secretKey (quantos caracteres finais exibir).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Architecture (research)
- `.planning/research/STACK.md` — stack recomendada: Node 24 LTS + TypeScript 5.7, Fastify 5.x, PostgreSQL 17 + Drizzle ORM 0.44+, ws 8.18+, ccxt 4.5+, Zod, argon2, AES-256-GCM (Node `crypto`), Pino. Inclui tabela de instalação de dependências.
- `.planning/research/ARCHITECTURE.md` — Exchange Adapter Layer (`IExchangeAdapter`), estrutura de projeto recomendada (`backend/src/exchanges/`, `security/`, `persistence/`), padrão de credential vault (decrypt-on-demand, nunca logado/persistido em texto plano), ordem de build sugerida.

### Legacy system analysis (o que corrigir)
- `.planning/codebase/CONCERNS.md` — lista completa dos 15+ problemas críticos/altos que esta fase deve corrigir: chave AES hardcoded, IV fixo, blacklist de logout nunca verificada, JWT sem try/catch, CORS aberto, secretKey exposto em respostas/logs, dependências vulneráveis (axios), sync sem transação.
- `.planning/codebase/ARCHITECTURE.md` — arquitetura legada (para entender o que está sendo substituído) e anti-patterns documentados (chamadas diretas de API em componentes, response objects com `error?` opcional, `@ts-ignore`, credenciais não-vault).
- `.planning/codebase/INTEGRATIONS.md` — endpoints REST legados, formato de env vars, fluxo de autenticação atual (para mapear paridade funcional).
- `.planning/codebase/STACK.md` — dependências e versões legadas (para saber o que está sendo substituído).

### Project-level
- `.planning/PROJECT.md` — core value, constraints (segurança, testes obrigatórios, abertura a trocar infraestrutura).
- `.planning/REQUIREMENTS.md` — requisitos v1 mapeados à Fase 1: FOUND-01 a FOUND-04, SEC-01 a SEC-09 (exceto SEC-06, que é Fase 2), EXCH-01 a EXCH-03, AUTH-01 a AUTH-03, TEST-01.
- `.planning/ROADMAP.md` §Phase 1 — goal e success criteria desta fase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum código do backend/frontend legado é reaproveitado diretamente (reescrita completa) — mas os **modelos de domínio** (Settings, Symbol) e os **fluxos de dados** documentados em `codebase/ARCHITECTURE.md` (Login Flow, Settings Update Path, Symbols Sync Path) servem de referência de paridade funcional.

### Established Patterns (a evitar, não seguir)
- Response objects com campo `error?` opcional — legado usa esse padrão; pesquisa recomenda union types ou exceptions tipadas.
- `@ts-ignore` espalhado pelo código legado — nova stack usa TypeScript strict sem escape hatches.
- Factory function encapsulando SDK de exchange (`backend/src/utils/exchange.ts`) — o padrão evolui para `IExchangeAdapter` (Adapter/Strategy pattern) por trás de um registry.

### Integration Points
- Nova estrutura de módulos segue `research/ARCHITECTURE.md`: `modules/auth/`, `modules/settings/`, `modules/symbols/`, `exchanges/core/` + `exchanges/binance/`, `security/credential-vault.ts`.

</code_context>

<specifics>
## Specific Ideas

- O usuário confirmou que o sistema é e continua sendo single-user nesta fase — decisões de UX (troca de senha, credenciais) foram simplificadas assumindo que o único usuário é o próprio operador do bot, não um público externo.
- Mensagens de erro podem ser mais específicas/técnicas do que seria recomendado num sistema multi-tenant, exatamente por essa razão.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia de escopo novo surgiu durante a discussão — todas as perguntas ficaram dentro do domínio desta fase (auth, credenciais, sync de símbolos, adapter). Múltiplos perfis de exchange e multi-exchange simultâneo já estavam corretamente identificados como v2 em REQUIREMENTS.md e foram reafirmados como fora de escopo aqui (D-08).

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Foundation — Adapter, Auth & Security*
*Context gathered: 2026-09-12*
