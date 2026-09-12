# Beholder — Refactoring para Stack Atual

## What This Is

Beholder é um bot de trading multi-moeda (atualmente integrado à Binance) com backend Node.js/Express/Sequelize sobre Azure SQL e frontend React/Vite, permitindo login, configuração de credenciais de exchange, sincronização de símbolos de mercado e um dashboard com dados em tempo real via WebSocket (mini ticker, book de ofertas, saldo). Este projeto é uma reescrita completa do sistema existente (clonado de https://github.com/engcfraposo/beholder.git) para uma stack tecnológica atual, corrigindo problemas críticos de segurança e débito técnico identificados no código legado, mantendo paridade funcional e adicionando melhorias típicas de bots de trading.

## Core Value

O sistema precisa continuar operando como um bot de trading confiável: autenticar o usuário, manter as credenciais de exchange protegidas, e entregar dados de mercado em tempo real sem interrupção — tudo isso migrado para uma base de código moderna, seguramente projetada e testável.

## Requirements

### Validated

<!-- Inferido do código existente (backend/frontend legado) — comportamento que já funciona e deve ser preservado na reescrita. -->

- ✓ Login com email/senha e emissão de JWT — existing
- ✓ Logout (ainda que hoje inefetivo — blacklist não verificada) — existing
- ✓ Gestão de configurações do usuário (credenciais de exchange, apiUrl/streamUrl customizáveis) — existing
- ✓ Armazenamento de credenciais de exchange criptografadas (AES) — existing
- ✓ Sincronização de símbolos de mercado a partir da Binance (exchange info) — existing
- ✓ Dashboard com dados em tempo real via WebSocket (mini ticker, book de ofertas, saldo, execuções) — existing
- ✓ Autenticação de conexões WebSocket via JWT — existing
- ✓ Persistência em banco relacional (Azure SQL via Sequelize) — existing
- ✓ Gráficos de preço via widget embutido do TradingView — existing

### Active

<!-- Escopo desta reescrita. Hipóteses até serem entregues e validadas. -->

- [ ] Pesquisar e recomendar stack atual (linguagens, frameworks, banco de dados, infraestrutura) adequada para um trading bot em tempo real
- [ ] Reescrever o backend com a stack recomendada, preservando as capacidades validadas acima
- [ ] Reescrever o frontend com a stack recomendada, preservando as capacidades validadas acima
- [ ] Corrigir todos os problemas críticos de segurança mapeados em CONCERNS.md (chave AES hardcoded, IV de criptografia fixo, blacklist de token não verificada, JWT sem tratamento de erro, CORS aberto/invertido, dados sensíveis expostos em respostas/logs, token JWT na URL do WebSocket, dependências vulneráveis)
- [ ] Cobertura de testes automatizados obrigatória na v1 (unitários + integração) para paths críticos: autenticação, credenciais de exchange, sincronização de símbolos, streaming de dados
- [ ] Validação de entrada em todos os endpoints da API
- [ ] Tratamento de erro consistente e centralizado (sem @ts-ignore, sem exceptions engolidas)
- [ ] Mecanismo de refresh de token (sliding expiration)
- [ ] Rate limiting nos endpoints da API
- [ ] Suporte a múltiplas exchanges além da Binance (arquitetura extensível)
- [ ] Alertas de preço configuráveis pelo usuário
- [ ] Backtesting de estratégias
- [ ] Relatórios de performance/histórico de operações
- [ ] Autenticação de dois fatores (2FA)
- [ ] Decisão sobre infraestrutura (manter Azure SQL/Storage/CDN ou migrar para outro provedor/banco) a ser tomada com base na pesquisa de stack

### Out of Scope

- Migração automatizada de dados do banco legado (Azure SQL atual) — reescrita começa com schema novo; migração de dados históricos fica para decisão futura, se necessário
- Suporte a múltiplos usuários/times (multi-tenancy) — não foi solicitado; sistema continua single-user por enquanto
- Execução automática de ordens de compra/venda (trading algorítmico automatizado) — sistema atual e este refactoring cobrem apenas monitoramento e configuração, não execução automática de trades

## Context

**Sistema legado (mapeado em `.planning/codebase/`):**
- Backend: Node.js + Express 4.17.3 + Sequelize 6.19 (ORM) sobre Microsoft SQL Server/Azure SQL via Tedious; TypeScript 4.6.3; WebSocket via `ws` 8.5; JWT (jsonwebtoken 8.5.1) + bcrypt; integração com Binance via `node-binance-api` 0.13.1; credenciais de exchange criptografadas com AES (aes-js).
- Frontend: React 18 + Vite 2.9.2 + React Router 6; Formik/Yup para formulários; `react-use-websocket` para tempo real; TradingView widget embutido via CDN.
- Infraestrutura: Azure SQL Server, Azure Blob Storage/CDN para assets estáticos. Sem CI/CD configurado.
- Zero cobertura de testes automatizados em todo o projeto.
- 15+ problemas críticos/altos documentados em `.planning/codebase/CONCERNS.md`, incluindo: chave de criptografia AES hardcoded como fallback, IV fixo em modo CTR, blacklist de token JWT nunca verificada (logout inefetivo), CORS aberto no REST e lógica invertida no WebSocket, dados sensíveis (secretKey) retornados em respostas de API e logados no console, dependência `axios` 0.26.1 com múltiplas CVEs de alta severidade (CSRF, SSRF, bypass de autenticação), token JWT exposto na URL do WebSocket.

**Motivação do refactoring:** stack de 2022 desatualizada (TypeScript 4.6, React 18 lançado na época, Vite 2.9, axios 0.26 vulnerável), acompanhada de débito técnico de segurança significativo. Decisão do usuário: reescrita completa (não migração incremental), pesquisando e recomendando a stack mais adequada atualmente para este domínio.

**Módulos/entidades de domínio existentes:** Settings (usuário + credenciais de exchange), Symbol (pares de moedas negociáveis com metadados de filtros MIN_NOTIONAL/LOT_SIZE).

## Constraints

- **Domínio**: Sistema é um bot de trading financeiro — decisões de arquitetura devem priorizar confiabilidade dos dados em tempo real e segurança das credenciais de exchange sobre velocidade de desenvolvimento
- **Integração externa**: Deve continuar suportando integração com a Binance (API + WebSocket streams); extensibilidade para outras exchanges é requisito ativo, não apenas nice-to-have
- **Segurança**: Toda a superfície de segurança identificada em CONCERNS.md deve ser corrigida como parte do escopo — não é aceitável apenas trocar tecnologia mantendo as mesmas falhas
- **Testes**: Cobertura de testes automatizados é requisito obrigatório da v1, não pode ser adiada para uma versão futura
- **Infraestrutura**: Aberto a migrar de provedor/banco de dados (não preso a Azure SQL) — decisão será informada pela pesquisa de stack

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Reescrita completa em vez de modernização incremental (strangler fig) | Escolha explícita do usuário; código legado tem débito técnico e de segurança extenso o suficiente para justificar recomeço | — Pending |
| Escopo cobre backend e frontend | Ambas as camadas usam dependências desatualizadas/vulneráveis; refactoring parcial deixaria metade do sistema legado | — Pending |
| Corrigir todos os problemas de segurança do CONCERNS.md como parte do escopo | Vulnerabilidades críticas (chave AES hardcoded, bypass de token, CORS aberto) não podem esperar uma fase separada | — Pending |
| Testes automatizados obrigatórios na v1 | Sistema legado tem zero cobertura, o que já foi identificado como bloqueador para refactorings seguros futuros | — Pending |
| Aberto a trocar banco de dados/infraestrutura | Usuário não está preso ao Azure SQL; decisão será tomada com base em pesquisa de stack atual | — Pending |
| Paridade funcional + melhorias (multi-exchange, alertas, backtesting, relatórios, 2FA) | Usuário quer aproveitar a reescrita para evoluir o produto, não apenas portar o código existente | — Pending |
| Stack-alvo será definida por pesquisa, não por preferência prévia do usuário | Usuário optou por deixar a pesquisa de mercado guiar a escolha de tecnologias | — Pending |

## Evolution

Este documento evolui em transições de fase e marcos do projeto.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requisitos invalidados? → Mover para Out of Scope com motivo
2. Requisitos validados? → Mover para Validated com referência de fase
3. Novos requisitos surgiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda está preciso? → Atualizar se desatualizado

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Checagem do Core Value — ainda é a prioridade certa?
3. Auditoria do Out of Scope — motivos ainda válidos?
4. Atualizar Context com o estado atual

---
*Last updated: 2026-09-12 after initialization*
