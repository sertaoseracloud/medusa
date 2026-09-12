# Codebase Structure

**Analysis Date:** 2026-09-12

## Directory Layout

```
medusa/
├── backend/                            # Express.js backend server
│   ├── config/                         # Database configuration
│   ├── migrations/                     # Sequelize migrations (empty)
│   ├── seeders/                        # Sequelize seeders (empty)
│   ├── src/
│   │   ├── server.ts                   # Entry point - starts HTTP, WS, Exchange Monitor
│   │   ├── app.ts                      # Express app with middleware chain
│   │   ├── app.ws.ts                   # WebSocket server factory
│   │   ├── app.em.ts                   # Exchange Monitor - Binance stream handler
│   │   ├── database/
│   │   │   └── index.ts                # Sequelize connection instance
│   │   ├── models/
│   │   │   ├── settings.model.ts       # User: email, password, exchange creds
│   │   │   └── symbol.model.ts         # Trading pair: BTCUSDT, ETHUSDT, etc.
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts      # JWT token verification
│   │   │   └── error.middleware.ts     # Global error handler
│   │   ├── modules/
│   │   │   ├── sessions/               # Authentication & user management
│   │   │   │   ├── controllers/
│   │   │   │   │   ├── session.controller.ts      # POST /sessions (login)
│   │   │   │   │   ├── settings.controller.ts     # GET/PATCH /settings
│   │   │   │   │   └── blacklist.controller.ts    # POST /logout
│   │   │   │   ├── services/
│   │   │   │   │   ├── session.service.ts         # Login logic with JWT
│   │   │   │   │   ├── settings.service.ts        # Fetch user settings
│   │   │   │   │   ├── update-settings.service.ts # Update user settings
│   │   │   │   │   └── blacklist.service.ts       # Logout logic
│   │   │   │   └── repositories/
│   │   │   │       └── settings.repository.ts    # Database queries: getById, getByEmail, update
│   │   │   ├── symbols/                 # Trading pair management
│   │   │   │   ├── controllers/
│   │   │   │   │   └── symbols.controller.ts     # GET/PATCH /symbols, POST /symbols/sync
│   │   │   │   ├── services/
│   │   │   │   │   ├── get-symbols.service.ts    # Fetch from database
│   │   │   │   │   ├── sync-symbols.service.ts   # Fetch from Binance, update DB
│   │   │   │   │   └── update-symbols.service.ts # Update favorite/settings
│   │   │   │   └── repositories/
│   │   │   │       └── symbols.repository.ts    # Database queries: findAll, update, bulkInsert
│   │   │   └── exchange/                 # Binance balance & trade info
│   │   │       ├── controllers/
│   │   │       │   └── exchange.controller.ts    # GET /exchange/balance
│   │   │       └── services/
│   │   │           └── exchange.service.ts       # Query Binance balance via exchange util
│   │   ├── routes/
│   │   │   ├── index.ts                 # Main routes: POST /sessions, POST /logout, etc.
│   │   │   ├── exchange.routes.ts       # GET /exchange/balance
│   │   │   ├── settings.routes.ts       # GET/PATCH /settings
│   │   │   └── symbols.routes.ts        # GET/PATCH/POST /symbols
│   │   └── utils/
│   │       ├── exchange.ts              # Binance API wrapper (node-binance-api)
│   │       └── crypto.ts                # AES-256 encrypt/decrypt for API keys
│   ├── .eslintrc                        # ESLint config
│   ├── .prettierrc                      # Prettier config
│   ├── tsconfig.json                   # TypeScript config
│   └── package.json                    # Dependencies: express, sequelize, mssql, ws
│
├── frontend/                            # React + Vite frontend
│   ├── src/
│   │   ├── main.tsx                     # Entry point - React 18 root render
│   │   ├── routes.tsx                   # React Router: /, /dashboard, /settings
│   │   ├── api/
│   │   │   └── index.ts                 # Axios instance with baseURL
│   │   ├── contexts/
│   │   │   ├── index.tsx                # AppProvider - nests all context providers
│   │   │   ├── auth/
│   │   │   │   └── index.tsx            # Auth context - login, logout, user data
│   │   │   ├── balances/
│   │   │   │   └── index.tsx            # Balances context - fetches from /exchange/balance
│   │   │   ├── symbols/
│   │   │   │   └── index.tsx            # Symbols context - favorite, filtering by quote
│   │   │   ├── error/
│   │   │   │   └── index.tsx            # Error notifications context
│   │   │   └── modal/
│   │   │       └── index.tsx            # Modal state context (symbol editor)
│   │   ├── components/
│   │   │   ├── Menu/
│   │   │   │   ├── index.tsx            # Menu wrapper
│   │   │   │   ├── NavBar/index.tsx     # Top navigation bar
│   │   │   │   ├── SideBar/index.tsx    # Sidebar navigation
│   │   │   │   └── SideBarItem/index.tsx # Sidebar menu item
│   │   │   └── SelectQuote/index.tsx    # Dropdown selector (USD, BTC, FAVORITES)
│   │   ├── public/
│   │   │   └── Login/index.tsx          # Login page - POST /sessions
│   │   └── private/
│   │       ├── Dashboard/
│   │       │   ├── index.tsx            # Main dashboard layout
│   │       │   ├── hooks.ts             # WebSocket connection hook
│   │       │   ├── CandleChart/
│   │       │   │   ├── index.tsx        # Placeholder for candle chart
│   │       │   │   └── hooks.ts         # Chart data hook (empty)
│   │       │   ├── MiniTicker/
│   │       │   │   ├── index.tsx        # List of trading pairs with prices
│   │       │   │   └── TickerRow/
│   │       │   │       ├── index.tsx    # Single pair row (symbol, price, change)
│   │       │   │       └── hooks.ts     # Price update hook
│   │       │   ├── BookTicker/
│   │       │   │   ├── index.tsx        # Order book display
│   │       │   │   └── BookRow/
│   │       │   │       ├── index.tsx    # Bid/ask row
│   │       │   │       └── hooks.ts     # Bid/ask state hook
│   │       │   └── Wallet/index.tsx     # Balance display
│   │       └── Settings/
│   │           ├── index.tsx            # Settings page layout
│   │           ├── Symbols/index.tsx    # Symbol list with sync button
│   │           ├── SymbolRow/index.tsx  # Single symbol row with edit button
│   │           └── SymbolModal/index.tsx # Modal for editing symbol settings
│   ├── .eslintrc                        # ESLint config
│   ├── .prettierrc                      # Prettier config
│   ├── tsconfig.json                    # TypeScript config
│   ├── vite.config.ts                   # Vite config
│   └── package.json                    # Dependencies: react, axios, formik, react-router-dom
│
├── .github/
│   └── workflows/                       # CI/CD workflows (if any)
├── .planning/
│   └── codebase/                        # Architecture documentation
└── README.md
```

## Directory Purposes

**backend/src:**
- Purpose: Backend business logic, API layer, database models
- Contains: TypeScript server code, Express routes, Sequelize models, services, controllers
- Key files: `server.ts` (entry), `app.ts` (HTTP), `app.ws.ts` (WebSocket), `app.em.ts` (Exchange Monitor)

**backend/src/modules:**
- Purpose: Feature modules with clear separation (sessions, symbols, exchange)
- Contains: Controllers (HTTP handlers), Services (business logic), Repositories (database queries)
- Pattern: Each module is self-contained with its own subdirectories

**backend/src/modules/sessions:**
- Purpose: User authentication and settings management
- Contains: Login endpoint, user settings CRUD, token generation/verification
- Key files: `session.controller.ts`, `session.service.ts`, `settings.repository.ts`

**backend/src/modules/symbols:**
- Purpose: Trading pair (symbol) management
- Contains: Symbol listing, filtering by quote currency, sync from Binance, marking favorites
- Key files: `symbols.controller.ts`, `sync-symbols.service.ts`, `symbols.repository.ts`

**backend/src/modules/exchange:**
- Purpose: Real-time Binance account data
- Contains: Balance retrieval via Binance API
- Key files: `exchange.controller.ts`, `exchange.service.ts`

**backend/src/utils:**
- Purpose: Cross-module utilities
- Contains: Binance API wrapper, encryption/decryption for sensitive data
- Key files: `exchange.ts` (Binance API factory), `crypto.ts` (AES-256)

**backend/src/middlewares:**
- Purpose: HTTP middleware for auth, logging, error handling
- Contains: JWT verification, error handling
- Key files: `auth.middleware.ts`, `error.middleware.ts`

**frontend/src/contexts:**
- Purpose: Global state management
- Contains: Auth (user/token), Balances (wallet data), Symbols (trading pairs), Error (notifications), Modal (UI state)
- Pattern: Each context has provider component and custom hook (useAuth, useBalances, etc.)

**frontend/src/private:**
- Purpose: Protected pages (require authentication)
- Contains: Dashboard (real-time data), Settings (symbol management)
- Key files: `Dashboard/index.tsx` (layout), `Dashboard/hooks.ts` (WebSocket), `Settings/index.tsx`

**frontend/src/public:**
- Purpose: Public pages (no auth required)
- Contains: Login page
- Key files: `Login/index.tsx`

**frontend/src/components:**
- Purpose: Reusable UI components
- Contains: Menu navigation, SelectQuote dropdown
- Key files: `Menu/index.tsx`, `SelectQuote/index.tsx`

## Key File Locations

**Entry Points:**

- `backend/src/server.ts`: Server startup - initializes database, HTTP server, WebSocket server, Exchange Monitor
- `frontend/src/main.tsx`: React app root - renders into #root element
- `frontend/src/routes.tsx`: Route definitions - maps URL to components

**Configuration:**

- `backend/.env`: Environment variables (DATABASE_HOST, DATABASE_PORT, JWT_SECRET, BINANCE_LOGS, etc.)
- `backend/tsconfig.json`: TypeScript compilation settings
- `frontend/vite.config.ts`: Vite build and dev server config
- `frontend/.env.local`: Frontend env vars (VITE_APP_API_URL, VITE_APP_WS_URL)

**Core Logic:**

- `backend/src/modules/sessions/services/session.service.ts`: Login with email/password, JWT generation
- `backend/src/modules/exchange/services/exchange.service.ts`: Query Binance balance
- `backend/src/modules/symbols/services/sync-symbols.service.ts`: Fetch symbols from Binance, update database
- `backend/src/utils/exchange.ts`: Binance API wrapper with stream handlers
- `frontend/src/contexts/auth/index.tsx`: Auth state, login, token storage
- `frontend/src/private/Dashboard/hooks.ts`: WebSocket connection, real-time data subscription

**Testing:**

- No test files found in repository

**Database:**

- `backend/src/models/settings.model.ts`: User credentials, exchange API keys
- `backend/src/models/symbol.model.ts`: Trading pairs from Binance
- `backend/config/config.json`: Sequelize CLI config (database connection settings)

## Naming Conventions

**Files:**

- Controllers: `{feature}.controller.ts` (e.g., `session.controller.ts`, `settings.controller.ts`)
- Services: `{action}-{feature}.service.ts` (e.g., `session.service.ts`, `update-settings.service.ts`, `sync-symbols.service.ts`)
- Repositories: `{feature}.repository.ts` (e.g., `settings.repository.ts`, `symbols.repository.ts`)
- Models: `{Entity}.model.ts` (PascalCase, e.g., `settings.model.ts`, `symbol.model.ts`)
- Routes: `{feature}.routes.ts` (e.g., `exchange.routes.ts`, `symbols.routes.ts`)
- Middleware: `{type}.middleware.ts` (e.g., `auth.middleware.ts`, `error.middleware.ts`)
- Utils: `{utility}.ts` (e.g., `exchange.ts`, `crypto.ts`)
- React Components: `index.tsx` in component directory with matching `hooks.ts` if needed
- React Contexts: `index.tsx` with custom hook exported (e.g., `useAuth`, `useBalances`)

**Directories:**

- Feature modules: lowercase (e.g., `sessions`, `symbols`, `exchange`)
- Component directories: PascalCase (e.g., `Dashboard`, `Settings`, `Menu`, `NavBar`)
- Grouped components: Match feature name (e.g., `Dashboard/MiniTicker`, `Dashboard/BookTicker`)

**TypeScript Interfaces:**

- Response types: `{Feature}Response` (e.g., `SessionResponse`, `ExchangeResponse`)
- Data types: `{Entity}` (e.g., `Settings`, `Symbol`, `Balances`)
- Context data: `{Feature}ContextData` (e.g., `AuthContextData`, `BalancesContextData`)

## Where to Add New Code

**New Feature (e.g., Orders Management):**

1. Create module directory: `backend/src/modules/orders/`
2. Create controller: `backend/src/modules/orders/controllers/orders.controller.ts`
3. Create service: `backend/src/modules/orders/services/{action}-orders.service.ts`
4. Create repository: `backend/src/modules/orders/repositories/orders.repository.ts`
5. Create model: `backend/src/models/order.model.ts`
6. Create routes: `backend/src/routes/orders.routes.ts`
7. Add routes to main routes: `backend/src/routes/index.ts`
8. Tests: `backend/src/modules/orders/*.test.ts` (create tests directory)

**New Component/Page:**

1. For page: `frontend/src/private/{PageName}/index.tsx`
2. Add route in `frontend/src/routes.tsx`
3. Create hooks if needed: `frontend/src/private/{PageName}/hooks.ts`
4. Create sub-components: `frontend/src/private/{PageName}/{ComponentName}/index.tsx`
5. Add navigation link in Menu component

**Utilities:**

- Shared backend utilities: `backend/src/utils/{utility}.ts`
- Shared frontend utilities: Create `frontend/src/utils/` directory (doesn't exist yet)

**Contexts (Frontend):**

- New global state: `frontend/src/contexts/{feature}/index.tsx`
- Pattern: Create context, provider component, custom hook
- Add provider to `AppProvider` in `frontend/src/contexts/index.tsx`

## Special Directories

**backend/migrations:**
- Purpose: Sequelize schema versioning (currently empty)
- Generated: Yes (by sequelize-cli db:migrate)
- Committed: Yes (to version control)
- Usage: Run with `npm run migration:run`, undo with `npm run migration:revert`

**backend/seeders:**
- Purpose: Sequelize initial data (currently empty)
- Generated: Yes (by sequelize-cli db:seed:generate)
- Committed: Yes (to version control)
- Usage: Run with `npm run seed:run`, undo with `npm run seed:revert`

**backend/config:**
- Purpose: Sequelize CLI configuration
- Generated: No
- Committed: Yes (contains `config.json`)
- Usage: Defines database connection per environment (development, test, production)

**backend/node_modules:**
- Purpose: Installed dependencies
- Generated: Yes (by npm/yarn install)
- Committed: No (.gitignore)
- Usage: npm packages for Express, Sequelize, TypeScript, etc.

**frontend/node_modules:**
- Purpose: Installed dependencies
- Generated: Yes (by npm/yarn install)
- Committed: No (.gitignore)
- Usage: npm packages for React, Vite, Axios, etc.

**frontend/dist:**
- Purpose: Production build output
- Generated: Yes (by `npm run build`)
- Committed: No (.gitignore)
- Usage: Optimized bundles for deployment

**backend/dist:**
- Purpose: Compiled JavaScript from TypeScript
- Generated: Yes (by `tsc --build`)
- Committed: No (.gitignore)
- Usage: Production code to run with `node dist/server.js`

---

*Structure analysis: 2026-09-12*
