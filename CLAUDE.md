<!-- GSD:project-start source:PROJECT.md -->
## Project

**Beholder — Refactoring para Stack Atual**

Beholder é um bot de trading multi-moeda (atualmente integrado à Binance) com backend Node.js/Express/Sequelize sobre Azure SQL e frontend React/Vite, permitindo login, configuração de credenciais de exchange, sincronização de símbolos de mercado e um dashboard com dados em tempo real via WebSocket (mini ticker, book de ofertas, saldo). Este projeto é uma reescrita completa do sistema existente (clonado de https://github.com/engcfraposo/beholder.git) para uma stack tecnológica atual, corrigindo problemas críticos de segurança e débito técnico identificados no código legado, mantendo paridade funcional e adicionando melhorias típicas de bots de trading.

**Core Value:** O sistema precisa continuar operando como um bot de trading confiável: autenticar o usuário, manter as credenciais de exchange protegidas, e entregar dados de mercado em tempo real sem interrupção — tudo isso migrado para uma base de código moderna, seguramente projetada e testável.

### Constraints

- **Domínio**: Sistema é um bot de trading financeiro — decisões de arquitetura devem priorizar confiabilidade dos dados em tempo real e segurança das credenciais de exchange sobre velocidade de desenvolvimento
- **Integração externa**: Deve continuar suportando integração com a Binance (API + WebSocket streams); extensibilidade para outras exchanges é requisito ativo, não apenas nice-to-have
- **Segurança**: Toda a superfície de segurança identificada em CONCERNS.md deve ser corrigida como parte do escopo — não é aceitável apenas trocar tecnologia mantendo as mesmas falhas
- **Testes**: Cobertura de testes automatizados é requisito obrigatório da v1, não pode ser adiada para uma versão futura
- **Infraestrutura**: Aberto a migrar de provedor/banco de dados (não preso a Azure SQL) — decisão será informada pela pesquisa de stack
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 4.6.3 - Backend and frontend application code with strict type checking enabled
- JavaScript - Build configuration and migration scripts
- ES2017 (Backend transpilation target via tsc)
- Modern browser with ES6+ module support (Frontend via Vite)
## Runtime
- Node.js (version not pinned, inferred from .nvmrc or system)
- Browser runtime (React 18 frontend)
- Yarn and npm (dual support with yarn.lock and package-lock.json)
- Backend: package.json with 19 dependencies, 13 devDependencies
- Frontend: package.json with 6 dependencies, 17 devDependencies
## Frameworks
- Express 4.17.3 - HTTP/REST API framework (`src/app.ts`, `src/routes/`)
- React 18.0.0 - UI framework with functional components
- React Router DOM 6 - Client-side routing (`src/routes.tsx`)
- ws 8.5.0 - WebSocket server implementation (`src/app.ws.ts`)
- react-use-websocket 3.0.0 - Client-side WebSocket hook integration
- Vite 2.9.2 - Frontend build tool and dev server with React plugin
- TypeScript 4.6.3 - Type system and transpilation
- ts-node-dev 1.1.8 - Development server with hot reload
- ESLint 8.13.0 - Code linting (airbnb-base backend, airbnb frontend)
- Prettier 2.6.2 - Code formatting (integrated via eslint-plugin-prettier)
- Not detected - No test framework found
## Key Dependencies
- node-binance-api 0.13.1 - Binance exchange API client with WebSocket support (`src/utils/exchange.ts`)
- sequelize 6.19.0 - SQL ORM for database operations (`src/database/index.ts`)
- sequelize-cli 6.4.1 - Database migration and seed management (`sequelize`, `migration:generate`, `seed:*` scripts)
- jsonwebtoken 8.5.1 - JWT token generation and verification (`src/modules/sessions/services/session.service.ts`, `src/app.ws.ts`)
- mssql 8.1.0 - Microsoft SQL Server driver
- tedious 14.4.0 - TDS protocol implementation for MSSQL connections
- axios 0.26.1 - HTTP client (backend + frontend) for API calls
- bcrypt 5.0.1 - Password hashing and verification
- bcryptjs 2.4.3 - Alternative bcrypt implementation (dual dependency)
- helmet 5.0.2 - Security headers middleware
- cors 2.8.5 - CORS handling
- express-async-errors 3.1.1 - Async error handling wrapper
- morgan 1.10.0 - HTTP request logging
- aes-js 3.1.2 - AES encryption for storing Binance API credentials (`src/utils/crypto.ts`)
- formik 2.2.9 - Form state management
- yup 0.32.11 - Schema validation for forms
- dotenv 16.0.0 - Environment variable loading
- reflect-metadata 0.1.13 - Decorator metadata support for TypeScript
## Configuration
- Backend: `.env` file (not committed, see `config/index.js`)
- Frontend: Vite `.env` variables
- `backend/tsconfig.json` - TypeScript compilation with decorators enabled, CommonJS output, source maps
- `backend/.sequelizerc` - Sequelize CLI configuration pointing to `config/index.js`
- `frontend/vite.config.ts` - Vite with React plugin, no custom resolvers
- `.eslintrc.json` - Shared ESLint config (backend + frontend)
- `.prettierrc` files in both backend and frontend
## Platform Requirements
- Node.js 16+ (TypeScript 4.6.3 compatibility)
- npm or Yarn
- PowerShell or Bash shell
- Port 3333 (default backend) + configurable frontend dev port (Vite default 5173)
- Node.js 16+ runtime
- Microsoft SQL Server database (Azure SQL compatible - logs show "Database connected on Azure SQL")
- WebSocket support required for real-time features
- Azure Blob Storage CDN for static assets (`beholder.azureedge.net`)
- Microsoft SQL Server (MSSQL dialect in Sequelize)
- Connection pooling: max 5, min 0, idle 10000ms
- Encryption: TLS enabled in connection options
- Migrations managed via `sequelize-cli` in `backend/migrations/`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Route files: kebab-case with domain suffix: `exchange.routes.ts`, `settings.routes.ts`, `symbols.routes.ts`
- Middleware files: kebab-case with `.middleware` suffix: `auth.middleware.ts`, `error.middleware.ts`
- Controller files: kebab-case with `.controller` suffix: `exchange.controller.ts`, `session.controller.ts`
- Service files: kebab-case with `.service` suffix: `exchange.service.ts`, `sync-symbols.service.ts`
- Repository files: kebab-case with `.repository` suffix: `settings.repository.ts`
- Model files: kebab-case with `.model` suffix: `settings.model.ts`, `symbol.model.ts`
- Components: PascalCase: `Menu.tsx`, `SelectQuote.tsx`, `AuthProvider.tsx`
- Hooks: camelCase with `hooks.ts` suffix: `hooks.ts` (in `BookRow/hooks.ts`, `CandleChart/hooks.ts`)
- API files: `index.ts` or domain-specific: `api/index.ts`
- Context/Provider files: `index.tsx` within domain folders: `contexts/auth/index.tsx`, `contexts/error/index.tsx`
- Service functions: camelCase arrow functions or async functions: `getById()`, `signIn()`, `updateUser()`, `exchangeInfo()`
- Controller actions: camelCase methods: `index()`, `create()`, `update()`
- Repository functions: camelCase functions: `getById()`, `getByEmail()`, `update()`, `getDefaultSettings()`
- Utility functions: camelCase: `encrypt()`, `decrypt()`, `balance()`
- Event handlers: camelCase with `handle` prefix: `handleErrorAuth()`, `handleSuccessSettings()`, `onChange()`
- Callbacks: Named with purpose: `callback`, `balanceCallback`, `executionCallback`, `listStatusCallback`
- State variables: camelCase: `user`, `data`, `error`, `token`, `settings`
- Props interfaces: camelCase: `quote`, `onChange`, `email`, `password`, `newSettings`
- Constants from environment: UPPER_SNAKE_CASE: `AES_KEY`, `DATABASE_NAME`, `DATABASE_USER`, `JWT_SECRET`, `BINANCE_LOGS`
- Constants in code: UPPER_SNAKE_CASE or camelCase: `LOGS`, `quotes` (array constant uses camelCase)
- Database field names: camelCase: `apiUrl`, `streamUrl`, `accessKey`, `secretKey`, `createdAt`, `updatedAt`
- Interface names: PascalCase with "Data" suffix or descriptive suffix: `AuthContextData`, `ErrorContextData`, `AuthState`, `SignInCredentials`, `NewSettings`, `ExchangeResponse`, `SelectQuoteProps`, `User`
- Generic type parameters: Single uppercase letter or descriptive PascalCase: `Props`
## Code Style
- ESLint with Prettier integration enforces code style
- Backend `.eslintrc.json`: `C:\Repo\medusa\backend\.eslintrc.json`
- Frontend `.eslintrc.json`: `C:\Repo\medusa\frontend\.eslintrc.json`
- ESLint with TypeScript parser and airbnb config
- Plugin: `@typescript-eslint`, `prettier`
- Import resolver uses TypeScript
- Filename extensions enforcement: `.ts` files have `never` import extension
- Single quotes for imports: `import express from 'express'`
- Double quotes sometimes used: `import { useSymbols } from "../../contexts/symbols"`
- Inconsistent — linter allows both
- 2-space indentation (observed in configuration and code)
- Space around operators and after keywords
## Import Organization
- No path aliases configured in `tsconfig.json` files
- Relative imports used throughout: `../../contexts/symbols`, `../middlewares/auth.middleware`, `../services/exchange.service`
## Error Handling
- **Try-catch in controllers:** Wrap service calls in try-catch blocks. Example in `C:\Repo\medusa\backend\src\modules\exchange\controllers\exchange.controller.ts`:
- **Error middleware pattern:** Global error handler in `C:\Repo\medusa\backend\src\middlewares\error.middleware.ts`:
- **Service response objects:** Services return typed response objects with error and status fields:
- **Standardized response format:** All responses follow structure: `{ data, message, timestamp }`
- **Authentication errors:** Return 401 with "Unauthorized" message. Example in `C:\Repo\medusa\backend\src\middlewares\auth.middleware.ts`
- **Type assertions:** `@ts-ignore` comments used to bypass type checking when needed. Heavy usage indicates type safety gaps. Examples:
## Logging
- `console.log()` for database connection logging: `C:\Repo\medusa\backend\src\database\index.ts` (logging: console.log)
- `morgan` for HTTP request logging: `C:\Repo\medusa\backend\src\app.ts` (morgan("dev"))
- HTTP requests logged via morgan middleware
- Database queries optionally logged via Sequelize (logging: console.log in config)
- Application-level debug logging uses console.log (e.g., `console.log(\`userDataStream:subscribed ${subscribeData}\`)`)
## Comments
- Rarely used in this codebase
- Only found in type-safe escape patterns: `// @ts-ignore`, `//@ts-ignore`, `{/*@ts-ignore*/}`
- No business logic comments observed
- No block comments or explanatory comments found
- Not used in this codebase
- No function documentation found
- Interface definitions serve as inline documentation
## Function Design
- Small, focused functions (5-25 lines typical)
- Services break logic into separate functions
- Controllers call services rather than implementing logic directly
- Typed parameters required (TypeScript strict mode)
- Single parameter objects common for multiple values: `async ({id}:{id: string})`
- Props interfaces used for component parameters: `{onChange, quote}:SelectQuoteProps`
- Optional parameters using `?`: minimal usage observed
- Explicit return types in async functions/services
- Arrow functions with type annotations: `const ExchangeService = async ({id}:{id: string}): Promise<ExchangeResponse> => {...}`
- Functional components return `JSX.Element` implicitly (no explicit return type annotation in components)
- Services return typed objects with status, error, and data fields
## Module Design
- Default exports primarily used: `export default app`, `export default ExchangeController`
- Named exports for hooks: `export function useAuth()`, `export function useError()`
- Object exports for utilities:
- Provider exports: Default export for provider component + named export for hook
- Minimal barrel file pattern observed
- Component folders use `index.tsx` as entry point but not for re-exporting sibling components
- Contexts use `index.tsx` for context definition
- `frontend/src/contexts/index.tsx` appears to export all providers or types
- Modular structure by feature: `modules/exchange/`, `modules/sessions/`, `modules/symbols/`
- Each module contains: `controllers/`, `services/`, `repositories/`
- Shared utilities in `utils/` directory
- Shared models in `models/` directory
- Shared middlewares in `middlewares/` directory
- `C:\Repo\medusa\backend\src\modules\exchange\controllers\exchange.controller.ts`
- `C:\Repo\medusa\backend\src\modules\exchange\services\exchange.service.ts`
## React Patterns
- Functional components with hooks: `const Menu: React.FC = () => { ... }`
- Props typed with interfaces: `interface SelectQuoteProps { onChange: ...; quote: ... }`
- Components exported as default from `index.tsx`
- Context API with Provider pattern for global state: `C:\Repo\medusa\frontend\src\contexts\auth\index.tsx`, `C:\Repo\medusa\frontend\src\contexts\error\index.tsx`
- `useState` for local component state
- `useCallback` for memoized callback functions
- `useEffect` for side effects
- Custom hooks for context consumption: `useAuth()`, `useError()`, `useSymbols()`
- Context hook returns interface typed data
- Error checks in hooks: `if (!context) { throw new Error(...) }`
- Nesting components within feature folders: `components/Menu/NavBar/`, `components/Menu/SideBar/`
- Each component in its own folder with `index.tsx`
- Props passed down through component tree
- React.Fragment or shorthand `<>` used minimally
- Some use of explicit `<React.Fragment>`: `<React.Fragment>`
## TypeScript Patterns
- Strict mode enabled: `"strict": true` in both `tsconfig.json` files
- Explicit function return types required by ESLint rule
- Heavy use of `any` type as escape hatch: `{values}:any`, `(error: any)`, `(settings: any)`
- @ts-ignore comments suppress type checking errors
- Indicates areas with weak type coverage
- Interfaces used for object shapes and contracts: `interface SignInCredentials`, `interface AuthContextData`
- Types used for unions and complex types: not heavily observed
- Minimal generic usage observed
- Context Provider generics: `createContext<AuthContextData>(...)`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| REST API | HTTP endpoints for auth, settings, symbols, exchange | `backend/src/app.ts` |
| WebSocket Server | Real-time client connections with JWT auth | `backend/src/app.ws.ts` |
| Exchange Monitor | Connects to Binance, broadcasts live data | `backend/src/app.em.ts` |
| Controllers | Parse HTTP requests, validate input, call services | `backend/src/modules/*/controllers` |
| Services | Business logic, exchange interaction, data processing | `backend/src/modules/*/services` |
| Repositories | Direct database access via Sequelize models | `backend/src/modules/*/repositories` |
| Models | Sequelize ORM entity definitions | `backend/src/models` |
| Middlewares | Auth verification, error handling, logging | `backend/src/middlewares` |
| Frontend Contexts | Global state management (Auth, Balances, Symbols) | `frontend/src/contexts` |
| Frontend Pages | Login, Dashboard, Settings UI | `frontend/src/public`, `frontend/src/private` |
## Pattern Overview
- **Authentication**: JWT tokens issued on login, verified on both REST and WebSocket connections
- **Real-Time**: Exchange data continuously streamed via WebSocket (no polling)
- **Modular Backend**: Feature-based modules (sessions, symbols, exchange) with consistent layers
- **Context State Management**: Frontend uses React Context API for global state (user, balances, symbols)
- **Encryption**: Sensitive exchange credentials (API keys) encrypted at rest in database
## Layers
- Purpose: User interface for login, dashboard viewing, and settings management
- Location: `frontend/src`
- Contains: React components, pages, hooks, context providers
- Depends on: Axios API client, React Router, WebSocket
- Used by: End users via browser
- Purpose: HTTP endpoints for authentication and data CRUD operations
- Location: `backend/src/app.ts`, `backend/src/routes`
- Contains: Express app, route definitions, middleware chain
- Depends on: Controllers, Services, Middlewares
- Used by: Frontend for login, settings updates, balance/symbol queries
- Purpose: Real-time bidirectional connection for live market data
- Location: `backend/src/app.ws.ts`
- Contains: WebSocket server, client connection management, JWT verification
- Depends on: App.em (Exchange Monitor), JWT verification
- Used by: Dashboard for live ticker and order book updates
- Purpose: Core application logic separate from HTTP/WebSocket protocol
- Location: `backend/src/modules/*/services`
- Contains: SessionService, SettingsService, ExchangeService, SymbolsService
- Depends on: Repositories, Utils (exchange, crypto)
- Used by: Controllers and Exchange Monitor
- Purpose: Abstraction over database queries
- Location: `backend/src/modules/*/repositories`
- Contains: SettingsRepository, SymbolsRepository
- Depends on: Sequelize Models
- Used by: Services
- Purpose: Encapsulate Binance API interaction
- Location: `backend/src/utils/exchange.ts`
- Contains: Exchange function factory returning miniTickerStream, bookStream, userDataStream, balance, exchangeInfo
- Depends on: node-binance-api package
- Used by: ExchangeService, Exchange Monitor (app.em.ts)
- Purpose: Data persistence
- Location: `backend/src/database/index.ts`, `backend/src/models`
- Contains: Sequelize instance, Settings model, Symbol model
- Depends on: MSSQL via Tedious driver
- Used by: Repositories
## Data Flow
### Primary Request Path (Login Flow)
### Real-Time Data Path (Dashboard Updates)
### Settings Update Path
### Symbols Sync Path
- **Backend Session State**: JWT tokens validated on each request (stateless)
- **Frontend Auth State**: Token stored in localStorage and React Context
- **Frontend Market Data State**: Real-time state from WebSocket in component useState hooks
- **Frontend Global State**: Auth, Balances, Symbols, Error, Modal stored in Context API providers
## Key Abstractions
- Purpose: Encapsulates all Binance API interactions, returns callback functions
- Examples: `backend/src/utils/exchange.ts`
- Pattern: Factory function that takes settings object, returns object with methods (miniTickerStream, bookStream, userDataStream, balance, exchangeInfo)
- Why: Allows flexible Binance configuration (custom API URL, stream URL) and centralized credential handling
- Purpose: Abstract away database query implementation, provide simple CRUD interface to services
- Examples: `backend/src/modules/sessions/repositories/settings.repository.ts`, `backend/src/modules/symbols/repositories/symbols.repository.ts`
- Pattern: Object with named functions (getByEmail, getById, update, deleteAll, bulkInsert)
- Why: Makes services database-agnostic, easier to test and swap implementations
- Purpose: Contain business logic, orchestrate repositories and utils
- Examples: `backend/src/modules/sessions/services/session.service.ts`, `backend/src/modules/exchange/services/exchange.service.ts`
- Pattern: Pure functions that accept input object, return response object with status and optional error
- Why: Separates business logic from HTTP concerns, promotes code reusability
- Purpose: Global state management without prop drilling
- Examples: `frontend/src/contexts/auth/index.tsx`, `frontend/src/contexts/balances/index.tsx`, `frontend/src/contexts/symbols/index.tsx`
- Pattern: Context + Provider + Hook (useAuth, useBalances, useSymbols)
- Why: Provides consistent API for consuming components, encapsulates state update logic
## Entry Points
- Location: `backend/src/server.ts`
- Triggers: `npm run dev` or `npm run start`
- Responsibilities:
- Location: `frontend/src/main.tsx`
- Triggers: `npm run dev`
- Responsibilities:
- Location: `frontend/src/routes.tsx`
- Triggers: Automatic routing based on URL
- Responsibilities:
## Architectural Constraints
- **Threading:** Single-threaded Node.js event loop. Exchange streams are async callbacks, WebSocket broadcasts are synchronous forEach loops. No worker threads used.
- **Global state:** Exchange Monitor instance created once in server.ts, holds reference to all WebSocket clients. No module-level singletons for database or API clients - Sequelize instance created once in `backend/src/database/index.ts`.
- **Circular imports:** None detected. Module import tree is acyclic (models ← repositories ← services ← controllers ← routes ← app).
- **Database pool:** Sequelize connection pool limited to 5 max connections, 0 min, 10-second idle timeout
- **WebSocket broadcast latency:** All connected clients receive same data within single broadcast loop iteration (O(n) where n = connected clients)
- **Encryption:** Sensitive keys (exchange secretKey, accessKey) encrypted using AES-256 in `backend/src/utils/crypto.ts`, decrypted only in memory during session
## Anti-Patterns
### Direct API Calls in Components
```typescript
```
### Service Response Objects with Optional Error Field
```typescript
```
### Type Safety with @ts-ignore Comments
```typescript
```
### Unencrypted Credentials in Settings Model
## Error Handling
- Controllers return JSON with structure: `{ data: {...}, message: string, timestamp: ISO8601 }`
- HTTP status codes: 200 (success), 201 (created), 401 (unauthorized), 500 (server error)
- Services return object with `{ error?: string, status: number, ...data }` - callers check error field
- Middleware catches async errors with `express-async-errors` package
- Error middleware (`backend/src/middlewares/error.middleware.ts`) catches all unhandled errors and returns 500 with message
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
