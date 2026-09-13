# Phase 2: Realtime Gateway & Dashboard Parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 2-Realtime Gateway & Dashboard Parity
**Areas discussed:** Profundidade dos dados ao vivo, UX de reconexão/queda de stream, ccxt.pro (pago) vs. WS manual da Binance, Seleção de símbolo no dashboard

---

## Profundidade dos dados ao vivo

**Q1: Book de ofertas — só melhor bid/ask ou profundidade com vários níveis?**

| Option | Description | Selected |
|--------|-------------|----------|
| Só melhor bid/ask | Paridade exata com o legado (bookTicker), sem trabalho extra | |
| Profundidade com vários níveis | Requer depth stream + componente mais elaborado, vai além da paridade legada | ✓ |

**User's choice:** Profundidade com vários níveis
**Notes:** Usuário optou explicitamente por ir além da paridade legada nesta dimensão.

**Q2: Quantos níveis de cada lado?**

| Option | Description | Selected |
|--------|-------------|----------|
| 10 níveis | depth10@100ms nativo da Binance, sem agregação manual | ✓ |
| 20 níveis | depth20@100ms, mais detalhe, lista mais longa | |
| 5 níveis | depth5@100ms, mais compacto | |

**User's choice:** 10 níveis

**Q3: Painel de saldo — todos os ativos ou só saldo > 0?**

| Option | Description | Selected |
|--------|-------------|----------|
| Só saldo > 0 | Evita lista de 300+ ativos majoritariamente zerados | |
| Todos os ativos | Lista completa, mais fiel ao dado bruto, visualmente mais pesado | ✓ |

**User's choice:** Todos os ativos
**Notes:** Contrário à recomendação padrão — decisão explícita do usuário.

---

## UX de reconexão/queda de stream

**Q1: O que o dashboard mostra enquanto o WS do cliente reconecta?**

| Option | Description | Selected |
|--------|-------------|----------|
| Banner discreto + dado congelado | Aviso pequeno, últimos valores continuam visíveis | ✓ |
| Tela de loading bloqueando | Overlay/spinner cobre os painéis até reconectar | |
| Sem indicação visual | Reconecta silenciosamente em background | |

**User's choice:** Banner discreto + dado congelado

**Q2: Se o stream servidor→Binance cair, reconecta sozinho ou espera restart manual?**

| Option | Description | Selected |
|--------|-------------|----------|
| Reconexão automática com backoff | Backend tenta reconectar sozinho, sem restart do processo | ✓ |
| Loga e pára até restart manual | Mais simples, mas deixa o dashboard sem dados até restart manual | |

**User's choice:** Reconexão automática com backoff

---

## ccxt.pro (pago) vs. WS manual da Binance

**Q1: Normalizar streams via ccxt.pro (pago) ou WS manual sobre a API nativa da Binance?**

| Option | Description | Selected |
|--------|-------------|----------|
| WS manual sobre a API nativa da Binance | Sem custo de licenciamento, estende o adapter já existente da Fase 1 | ✓ |
| ccxt.pro (assinatura paga) | API unificada multi-exchange, mas exige licença paga | |

**User's choice:** WS manual sobre a API nativa da Binance
**Notes:** Resolve o bloqueio pendente registrado em STATE.md desde a criação do roadmap.

---

## Seleção de símbolo no dashboard

**Q1: O usuário escolhe qual par acompanhar, ou é fixo/padrão?**

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown com busca, usando a lista da Fase 1 | Reaproveita `GET /symbols`, resubscreve tópicos ao trocar | ✓ |
| Par fixo | Mais simples, mas sem flexibilidade | |
| Lista de favoritos (múltiplos pares) | Vai além da paridade legada, capacidade nova | |

**User's choice:** Dropdown com busca, usando a lista sincronizada na Fase 1

**Q2: O par escolhido persiste entre sessões ou sempre volta ao padrão?**

| Option | Description | Selected |
|--------|-------------|----------|
| Persiste (localStorage) | Mesmo padrão dos tokens de auth da Fase 1 | ✓ |
| Sempre volta ao padrão | Mais previsível, mas exige reselecionar toda vez | |

**User's choice:** Persiste (localStorage)

---

## Claude's Discretion

- Estrutura exata do payload JSON de cada tópico (`ticker:{exchange}:{symbol}`, `book:{exchange}:{symbol}`, `account:{userId}`).
- Parâmetros exatos do backoff exponencial para reconexão servidor→Binance (delay inicial, fator, teto).
- Biblioteca cliente para o WebSocket do frontend (nativa vs. `reconnecting-websocket` ou similar).

## Deferred Ideas

- **Lista de favoritos / múltiplos pares simultâneos no dashboard** — considerado e explicitamente rejeitado como escopo desta fase (usuário escolheu seleção single-symbol). Candidato a fase futura se o produto evoluir para monitorar vários pares ao mesmo tempo.
