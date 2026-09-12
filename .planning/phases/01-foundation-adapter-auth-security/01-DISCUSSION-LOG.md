# Phase 1: Foundation — Adapter, Auth & Security - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 1-Foundation — Adapter, Auth & Security
**Areas discussed:** Criação da conta de usuário, UX de credenciais de exchange, Sessão e expiração de token, Sincronização de símbolos

---

## Criação da conta de usuário

| Question | Options | Selected |
|---|---|---|
| Como o usuário (único) é criado no novo sistema? | Seed/script no deploy / Tela de registro (primeira execução) / CLI/comando admin | Seed/script no deploy |
| A senha/email do seed vêm de onde? | Variáveis de ambiente / Comando de migration/seed dedicado | Variáveis de ambiente |
| Se as env vars mudarem depois com usuário já existindo, o que acontece? | Ignorar (usuário já existe) / Sincronizar sempre (upsert) | Sincronizar sempre (upsert) |
| Reação a troca de senha manual pela UI, sabendo do upsert? | Não expor troca de senha na UI / Permitir, mas avisar | Permitir, mas avisar |

**Notes:** Sistema é single-user; a conta é provisionada por infraestrutura (env vars), não por cadastro público.

---

## UX de credenciais de exchange

| Question | Options | Selected |
|---|---|---|
| Como o secretKey aparece após salvo? | Nunca reexibida (write-only) / Mascarada parcialmente | Mascarada parcialmente |
| Validar credenciais antes de salvar? | Sim, testar antes de salvar / Não validar, só salvar | Sim, testar antes de salvar |
| Mensagem de erro na falha de validação? | Mensagem genérica / Mensagem específica por tipo de erro | Mensagem específica por tipo de erro |
| Modelo de credenciais: um conjunto ou múltiplos perfis? | Um conjunto por usuário (como hoje) / Já modelar múltiplos perfis | Um conjunto de credenciais por usuário (como hoje) |

**Notes:** Multi-exchange simultâneo permanece v2 (REQUIREMENTS.md); esta fase não antecipa o schema para isso.

---

## Sessão e expiração de token

| Question | Options | Selected |
|---|---|---|
| Renovação de token perto da expiração? | Refresh silencioso em background / Refresh sob demanda (na próxima requisição) | Refresh silencioso em background |
| Quando o refresh token também expira? | Logout forçado + redirect / Logout silencioso | Logout silencioso |
| Logout explícito revoga no servidor? | Sim, revogar no servidor / Só limpar no cliente | Sim, revogar no servidor |
| Tempo de vida de access/refresh token? | Access curto (~15min) + refresh longo (~7-30 dias) / Você decide | Access curto (~15min) + refresh longo (~7-30 dias) |

**Notes:** Corrige diretamente o bug do CONCERNS.md em que o logout legado não invalida nada de fato (blacklist nunca verificada).

---

## Sincronização de símbolos

| Question | Options | Selected |
|---|---|---|
| Sync automático além do botão manual? | Manual apenas (como legado) / Automático na inicialização + botão manual | Automático na inicialização + botão manual |
| Transação atômica no sync? | Rodar dentro de uma transação atômica / Você decide | Rodar dentro de uma transação atômica |
| Falha no sync automático no boot? | Continuar subindo normalmente / Impedir o boot do servidor | Continuar subindo normalmente |
| Sync automático sempre no boot ou só quando vazio? | Só quando vazia (primeira vez) / Sempre no boot | Só quando vazia (primeira vez) |

**Notes:** Corrige o `deleteAll()` + `bulkInsert()` sem transação apontado em CONCERNS.md.

---

## Arquitetura hexagonal / Clean Architecture no backend

> Área adicionada pelo usuário via "Other" numa atualização posterior do context (não fazia parte da análise inicial de gray areas).

| Question | Options | Selected |
|---|---|---|
| Como hexagonal se encaixa na estrutura por módulos da pesquisa? | Hexagonal dentro de cada módulo / Hexagonal global (camadas no topo) | Hexagonal dentro de cada módulo |
| Como definir portas para dependências externas? | Porta por dependência externa / Portas compartilhadas no core | Porta por dependência externa |
| O que use cases retornam para controllers? | Result/Either type explícito / Exceptions tipadas (throw) | Exceptions tipadas (throw) |

**Notes:** Corrige o anti-pattern de response objects com `error?` opcional documentado em `codebase/ARCHITECTURE.md`.

---

## Rate limiting no login

| Question | Options | Selected |
|---|---|---|
| Quantas tentativas antes de bloquear? | 5 tentativas / 15 min / Você decide | 5 tentativas / 15 min |
| Rate limit por IP, email, ou ambos? | Ambos (IP + email) / Só por IP | Só por IP |
| Aplicar rate limit a outros endpoints (SEC-08)? | Sim, global + limite restrito no login / Só no login por enquanto | Sim, global + limite mais restrito no login |

---

## Validação de secrets no startup

| Question | Options | Selected |
|---|---|---|
| Comportamento se JWT_SECRET/AES_KEY faltar? | Falhar no boot (fail-fast) / Gerar valor temporário e avisar | Gerar valor temporário e avisar |
| Follow-up: risco de dados irrecuperáveis após restart + conflito com PROJECT.md/CONCERNS.md — isso muda a resposta? | Só em dev, nunca em produção / Manter: gerar e avisar sempre / Na verdade, fail-fast sempre | Só em desenvolvimento, nunca em produção |
| Conteúdo do aviso de log em dev? | Aviso simples + lembrete de .env / Você decide | Aviso simples + lembrete de .env |

**Notes:** Primeira resposta do usuário ("gerar e avisar sempre") entraria em conflito direto com o constraint de PROJECT.md de corrigir toda a superfície do CONCERNS.md (fallback inseguro de chave). Question de follow-up expôs o trade-off explicitamente antes de fechar a decisão; usuário ajustou para diferenciar dev de produção.

---

## Formato de erro de validação (Zod)

| Question | Options | Selected |
|---|---|---|
| Listar campos com problema ou mensagem genérica? | Listar cada campo com problema / Mensagem genérica única | Listar cada campo com problema |
| Envelope de erro: padrão da API ou dedicado? | Mesmo envelope padrão, com detalhes em `data` / Envelope dedicado de erro | Mesmo envelope padrão, com detalhes em `data` |
| Vale também para exceptions de domínio (hexagonal)? | Sim, um error handler central para tudo / Handlers separados por tipo | Sim, um error handler central para tudo |

---

## Claude's Discretion

- Valores exatos de expiração de access/refresh token dentro da faixa acordada.
- Mecanismo exato de revogação de refresh token no servidor (tabela dedicada vs. coluna `revoked_at`).
- Formato exato do mascaramento do secretKey.

## Deferred Ideas

Nenhuma — a discussão permaneceu dentro do escopo da Fase 1. Múltiplos perfis de exchange/multi-exchange simultâneo reafirmados como v2.
