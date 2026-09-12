# Requirements: Beholder — Refactoring para Stack Atual

**Defined:** 2026-09-12
**Core Value:** O sistema precisa continuar operando como um bot de trading confiável: autenticar o usuário, manter as credenciais de exchange protegidas, e entregar dados de mercado em tempo real sem interrupção — tudo isso migrado para uma base de código moderna, seguramente projetada e testável.

## v1 Requirements

Requisitos para o release inicial (reescrita completa). Cada um mapeia para fases do roadmap.

### Foundation (Stack & Infraestrutura)

- [ ] **FOUND-01**: Backend reescrito em Node.js LTS + TypeScript strict + Fastify (substituindo Express)
- [ ] **FOUND-02**: Persistência migrada para PostgreSQL + Drizzle ORM (substituindo Azure SQL/Sequelize)
- [ ] **FOUND-03**: Frontend reescrito em React + Vite + React Router atuais (substituindo React 18/Vite 2.9 legado)
- [ ] **FOUND-04**: Validação de entrada (schema validation) em todos os endpoints da API

### Segurança (correção de todo o CONCERNS.md)

- [ ] **SEC-01**: Credenciais de exchange armazenadas com envelope encryption (AES-256-GCM, nonce aleatório por registro) — sem chave hardcoded como fallback
- [ ] **SEC-02**: Autenticação JWT com refresh token e expiração deslizante
- [ ] **SEC-03**: Logout invalida efetivamente o token (blacklist persistente ou equivalente)
- [ ] **SEC-04**: Verificação de JWT com tratamento de erro (não derruba o servidor com token malformado)
- [ ] **SEC-05**: CORS configurado corretamente (whitelist explícita, REST e WebSocket)
- [ ] **SEC-06**: Autenticação de WebSocket via handshake/primeira mensagem (não via token na URL)
- [ ] **SEC-07**: Nenhum dado sensível (secretKey, senhas) retornado em respostas de API ou logado em texto plano
- [ ] **SEC-08**: Rate limiting nos endpoints da API (por exchange, respeitando limites específicos de cada uma)
- [ ] **SEC-09**: Dependências sem vulnerabilidades conhecidas de severidade alta/crítica (axios, babel, etc. atualizados)

### Exchange Integration

- [ ] **EXCH-01**: Camada de abstração de exchange (Exchange Adapter, baseada em CCXT) que isola a lógica de negócio de qualquer SDK concreto
- [ ] **EXCH-02**: Adapter da Binance implementado sobre a camada de abstração, com paridade funcional ao sistema legado (mini ticker, book de ofertas, saldo, execuções)
- [ ] **EXCH-03**: Sincronização de símbolos de mercado a partir da exchange configurada

### Realtime & Dashboard

- [ ] **RT-01**: Distribuição de dados em tempo real via pub/sub por tópico (não broadcast para todos os clientes)
- [ ] **RT-02**: Dashboard com dados em tempo real via WebSocket (mini ticker, book de ofertas, saldo) — paridade com o sistema legado
- [ ] **RT-03**: Widget de gráfico TradingView preservado no dashboard

### Autenticação de Usuário & Sessão

- [ ] **AUTH-01**: Usuário pode fazer login com email/senha
- [ ] **AUTH-02**: Usuário pode configurar credenciais de exchange (API key/secret) de forma segura
- [ ] **AUTH-03**: Usuário pode fazer logout, com invalidação efetiva de sessão

### 2FA

- [ ] **2FA-01**: Usuário pode habilitar 2FA via TOTP (autenticador), usando otplib
- [ ] **2FA-02**: Usuário recebe códigos de backup/recuperação ao habilitar 2FA
- [ ] **2FA-03**: 2FA é exigido no login quando habilitado

### Alertas de Preço

- [ ] **ALERT-01**: Usuário pode criar alertas de preço com condição simples (acima/abaixo de X)
- [ ] **ALERT-02**: Usuário recebe notificação in-app quando um alerta é disparado
- [ ] **ALERT-03**: Engine de avaliação de regras é um módulo puro e compartilhado (reaproveitado pelo backtesting)

### Backtesting

- [ ] **BT-01**: Usuário pode rodar backtesting de regras simples (threshold, cruzamento de médias) contra dados históricos de candle (OHLCV)
- [ ] **BT-02**: Backtesting reaproveita o mesmo engine de regras dos alertas (sem lógica duplicada)
- [ ] **BT-03**: Teste de regressão "no-lookahead" garante que o backtest não usa dados futuros na avaliação de uma barra

### Performance Reporting

- [ ] **REP-01**: Usuário pode visualizar PnL realizado por exchange
- [ ] **REP-02**: Usuário pode visualizar gráfico de saldo ao longo do tempo
- [ ] **REP-03**: Dados de relatório são reconciliados via REST (não derivados apenas do stream de WebSocket)

### Qualidade & Testes

- [ ] **TEST-01**: Cobertura de testes automatizados (unitários + integração) para autenticação, credenciais de exchange, sincronização de símbolos e streaming de dados
- [ ] **TEST-02**: Validação manual de UAT via navegador (Claude Browser) simulando a visão do usuário final, como etapa de verificação em fases com interface

## v2 Requirements

Reconhecidos, mas adiados. Não fazem parte do roadmap atual.

### Multi-Exchange (expansão)

- **EXCH-V2-01**: Segunda exchange (ex: Bybit ou Coinbase) implementada sobre a camada de abstração
- **EXCH-V2-02**: Dashboard e credenciais adaptados para múltiplas exchanges simultâneas
- **EXCH-V2-03**: Rate limiter e circuit-breaker ajustados por exchange adicional

### Alertas & Relatórios (expansão)

- **ALERT-V2-01**: Alertas multi-condição (variação percentual, picos de volume)
- **ALERT-V2-02**: Entrega de alertas por email
- **REP-V2-01**: Relatório de performance agregado entre múltiplas exchanges
- **REP-V2-02**: Métricas avançadas de performance (Sharpe ratio, max drawdown)

### Segurança & Qualidade (expansão)

- **SEC-V2-01**: Health check de credenciais de exchange ao salvar (validação de permissões/IP)
- **SEC-V2-02**: Audit log de mudanças em credenciais/configurações
- **2FA-V2-01**: Suporte a WebAuthn/passkeys além de TOTP

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| Execução automática de ordens (auto-trading) | Sistema é de monitoramento/configuração, não de execução; risco financeiro/regulatório desproporcional a um refactor de sistema single-user |
| Backtesting institucional (replay de order book tick-level, simulação de latência/slippage) | Complexidade de nível HFT, desproporcional para um bot de monitoramento sem execução automática |
| Multi-tenancy / múltiplos usuários | Não solicitado; sistema continua single-user |
| 2FA via SMS | Vulnerável a SIM-swapping; TOTP é o padrão recomendado em 2026 |
| Migração automatizada de dados do banco legado (Azure SQL) | Reescrita começa com schema novo; migração de dados históricos é decisão futura, se necessário |
| "Todas as exchanges" via cliente REST genérico | Cada exchange tem rate limits, auth e formatos de resposta diferentes; abordagem via CCXT + adapter é mais sustentável que suportar N exchanges de uma vez |

## Traceability

Preenchido durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | TBD | Pending |
| FOUND-02 | TBD | Pending |
| FOUND-03 | TBD | Pending |
| FOUND-04 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| SEC-05 | TBD | Pending |
| SEC-06 | TBD | Pending |
| SEC-07 | TBD | Pending |
| SEC-08 | TBD | Pending |
| SEC-09 | TBD | Pending |
| EXCH-01 | TBD | Pending |
| EXCH-02 | TBD | Pending |
| EXCH-03 | TBD | Pending |
| RT-01 | TBD | Pending |
| RT-02 | TBD | Pending |
| RT-03 | TBD | Pending |
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| 2FA-01 | TBD | Pending |
| 2FA-02 | TBD | Pending |
| 2FA-03 | TBD | Pending |
| ALERT-01 | TBD | Pending |
| ALERT-02 | TBD | Pending |
| ALERT-03 | TBD | Pending |
| BT-01 | TBD | Pending |
| BT-02 | TBD | Pending |
| BT-03 | TBD | Pending |
| REP-01 | TBD | Pending |
| REP-02 | TBD | Pending |
| REP-03 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 0 (a preencher pelo roadmapper)
- Unmapped: 35 ⚠️ (esperado antes da criação do roadmap)

---
*Requirements defined: 2026-09-12*
*Last updated: 2026-09-12 after initial definition*
