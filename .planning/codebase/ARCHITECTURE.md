<!-- refreshed: 2026-09-12 -->
# Architecture

**Analysis Date:** 2026-09-12

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                              │
│  - Login, Dashboard, Settings                                               │
│  - Real-time UI with WebSocket                                              │
│  `frontend/src`                                                              │
└────────────────┬──────────────────────────────────────────────────────────┬──┘
                 │ HTTP (REST API)                      WebSocket         │
                 │                                                        │
┌────────────────▼──────────────────────────────────────────────────────▼──┐
│                          Backend Server (Express)                         │
│                        `backend/src/server.ts`                            │
├──────────────────────┬──────────────────────────────┬────────────────────┤
│  REST API Layer      │   WebSocket Server           │  Exchange Monitor  │
│  `backend/src/app`   │   `backend/src/app.ws`       │  `backend/src/..em`│
│  HTTP Endpoints      │   JWT Token Verification     │  Binance Stream    │
│  (Sessions, Settings,│   Connection Management      │  Handler           │
│   Symbols, Exchange) │                              │                    │
└──────────┬───────────┴──────────────────────────────┴──────────┬─────────┘
           │                                                    │
           ▼                                                    │
┌─────────────────────────────────────────────────────────────┐│
│               Business Logic Layer (Services)                 ││
│  - SessionService: Authentication & JWT                       ││
│  - SettingsService: User exchange credentials                 ││
│  - ExchangeService: Balance retrieval                          ││
│  - SymbolsService: Market symbol management                   ││
│  `backend/src/modules/*/services`                             ││
└──────────────┬────────────────────────────────────────────────┘│
               │                                                  │
               ▼                                                  │
┌──────────────────────────────────────────────────────────────┐ │
│            Data Access Layer (Repositories)                  │ │
│  - SettingsRepository: User/credentials                      │ │
│  - SymbolsRepository: Market symbols                         │ │
│  `backend/src/modules/*/repositories`                        │ │
└────────────┬────────────────────────────────────────────────┘ │
             │                                                   │
             ▼                                                   │
┌──────────────────────────────────────────────────────────────┐ │
│        Data Models (Sequelize ORM)                           │ │
│  - Settings: User email, exchange credentials                │ │
│  - Symbol: Trading pairs with metadata                       │ │
│  `backend/src/models`                                        │ │
└────────────┬────────────────────────────────────────────────┘ │
             │                                                   │
             ▼                                                   │
┌──────────────────────────────────────────────────────────────┐ │
│          Database (Azure SQL Server)                         │ │
│  MSSQL via Sequelize                                         │ │
└──────────────────────────────────────────────────────────────┘ │
                                                                  │
                    ┌───────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Binance API         │
         │  - Exchange Info     │
         │  - Mini Ticker       │
         │  - Book Tickers      │
         │  - User Data Stream  │
         │  - Balance           │
         └──────────────────────┘
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

**Overall:** Client-Server with Real-Time WebSocket Data Streaming

**Key Characteristics:**
- **Authentication**: JWT tokens issued on login, verified on both REST and WebSocket connections
- **Real-Time**: Exchange data continuously streamed via WebSocket (no polling)
- **Modular Backend**: Feature-based modules (sessions, symbols, exchange) with consistent layers
- **Context State Management**: Frontend uses React Context API for global state (user, balances, symbols)
- **Encryption**: Sensitive exchange credentials (API keys) encrypted at rest in database

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface for login, dashboard viewing, and settings management
- Location: `frontend/src`
- Contains: React components, pages, hooks, context providers
- Depends on: Axios API client, React Router, WebSocket
- Used by: End users via browser

**API Layer (REST):**
- Purpose: HTTP endpoints for authentication and data CRUD operations
- Location: `backend/src/app.ts`, `backend/src/routes`
- Contains: Express app, route definitions, middleware chain
- Depends on: Controllers, Services, Middlewares
- Used by: Frontend for login, settings updates, balance/symbol queries

**WebSocket Layer:**
- Purpose: Real-time bidirectional connection for live market data
- Location: `backend/src/app.ws.ts`
- Contains: WebSocket server, client connection management, JWT verification
- Depends on: App.em (Exchange Monitor), JWT verification
- Used by: Dashboard for live ticker and order book updates

**Business Logic Layer (Services):**
- Purpose: Core application logic separate from HTTP/WebSocket protocol
- Location: `backend/src/modules/*/services`
- Contains: SessionService, SettingsService, ExchangeService, SymbolsService
- Depends on: Repositories, Utils (exchange, crypto)
- Used by: Controllers and Exchange Monitor

**Data Access Layer (Repositories):**
- Purpose: Abstraction over database queries
- Location: `backend/src/modules/*/repositories`
- Contains: SettingsRepository, SymbolsRepository
- Depends on: Sequelize Models
- Used by: Services

**Exchange Integration Layer:**
- Purpose: Encapsulate Binance API interaction
- Location: `backend/src/utils/exchange.ts`
- Contains: Exchange function factory returning miniTickerStream, bookStream, userDataStream, balance, exchangeInfo
- Depends on: node-binance-api package
- Used by: ExchangeService, Exchange Monitor (app.em.ts)

**Database Layer:**
- Purpose: Data persistence
- Location: `backend/src/database/index.ts`, `backend/src/models`
- Contains: Sequelize instance, Settings model, Symbol model
- Depends on: MSSQL via Tedious driver
- Used by: Repositories

## Data Flow

### Primary Request Path (Login Flow)

1. Frontend calls `POST /sessions` with email/password (`frontend/src/contexts/auth/index.tsx:58`)
2. SessionController receives request (`backend/src/modules/sessions/controllers/session.controller.ts:5`)
3. SessionController calls SessionService (`backend/src/modules/sessions/services/session.service.ts:18`)
4. SessionService queries SettingsRepository for user (`backend/src/modules/sessions/repositories/settings.repository.ts:23`)
5. SessionService verifies password with bcrypt
6. SessionService generates JWT token
7. SessionService returns token to controller
8. SessionController returns token to frontend
9. Frontend stores token in localStorage (`frontend/src/contexts/auth/index.tsx:67`)
10. Frontend sets Authorization header for all subsequent requests

### Real-Time Data Path (Dashboard Updates)

1. Frontend establishes WebSocket connection with token query param (`frontend/src/private/Dashboard/hooks.ts:11`)
2. WebSocket server verifies JWT token (`backend/src/app.ws.ts:23-43`)
3. Exchange Monitor streams Binance data continuously:
   - Decrypts user's exchange credentials (`backend/src/app.em.ts:13`)
   - Subscribes to Binance mini ticker stream
   - Subscribes to Binance book ticker stream
   - Subscribes to Binance user data stream (balance updates, executions)
4. Exchange Monitor broadcasts received data to all connected WebSocket clients (`backend/src/app.em.ts:16-23`)
5. Frontend receives WebSocket message (`frontend/src/private/Dashboard/hooks.ts:13-17`)
6. Frontend extracts miniTicker/book/balance data and updates React state
7. Components re-render with latest data

### Settings Update Path

1. Frontend submits settings form to `PATCH /settings` (`frontend/src/contexts/auth/index.tsx:77`)
2. Auth middleware verifies JWT, extracts user ID (`backend/src/middlewares/auth.middleware.ts:8`)
3. SettingsController receives request and calls UpdateSettingsService
4. UpdateSettingsService validates data and encrypts sensitive fields (secretKey) (`backend/src/utils/crypto.ts`)
5. UpdateSettingsService calls SettingsRepository to update database
6. Repository updates Settings model in MSSQL
7. Service returns updated user data to controller
8. Controller returns response to frontend
9. Frontend updates Auth context with new user data

### Symbols Sync Path

1. Frontend calls `POST /symbols/sync` (`frontend/src/contexts/symbols/index.tsx:104`)
2. SymbolsController receives request
3. SymbolsController calls SyncSymbolsService
4. SyncSymbolsService calls ExchangeService to get exchange info from Binance
5. SyncSymbolsService transforms Binance symbols into app format
6. SyncSymbolsService truncates old symbols table and inserts new symbols
7. Response returned with updated symbol list to frontend
8. Frontend updates SymbolsContext with new symbols

**State Management:**

- **Backend Session State**: JWT tokens validated on each request (stateless)
- **Frontend Auth State**: Token stored in localStorage and React Context
- **Frontend Market Data State**: Real-time state from WebSocket in component useState hooks
- **Frontend Global State**: Auth, Balances, Symbols, Error, Modal stored in Context API providers

## Key Abstractions

**Exchange Function Factory:**
- Purpose: Encapsulates all Binance API interactions, returns callback functions
- Examples: `backend/src/utils/exchange.ts`
- Pattern: Factory function that takes settings object, returns object with methods (miniTickerStream, bookStream, userDataStream, balance, exchangeInfo)
- Why: Allows flexible Binance configuration (custom API URL, stream URL) and centralized credential handling

**Repositories:**
- Purpose: Abstract away database query implementation, provide simple CRUD interface to services
- Examples: `backend/src/modules/sessions/repositories/settings.repository.ts`, `backend/src/modules/symbols/repositories/symbols.repository.ts`
- Pattern: Object with named functions (getByEmail, getById, update, deleteAll, bulkInsert)
- Why: Makes services database-agnostic, easier to test and swap implementations

**Services:**
- Purpose: Contain business logic, orchestrate repositories and utils
- Examples: `backend/src/modules/sessions/services/session.service.ts`, `backend/src/modules/exchange/services/exchange.service.ts`
- Pattern: Pure functions that accept input object, return response object with status and optional error
- Why: Separates business logic from HTTP concerns, promotes code reusability

**React Context Providers:**
- Purpose: Global state management without prop drilling
- Examples: `frontend/src/contexts/auth/index.tsx`, `frontend/src/contexts/balances/index.tsx`, `frontend/src/contexts/symbols/index.tsx`
- Pattern: Context + Provider + Hook (useAuth, useBalances, useSymbols)
- Why: Provides consistent API for consuming components, encapsulates state update logic

## Entry Points

**Backend Server:**
- Location: `backend/src/server.ts`
- Triggers: `npm run dev` or `npm run start`
- Responsibilities:
  1. Loads environment variables (dotenv)
  2. Authenticates database connection
  3. Loads default user settings from database
  4. Starts Express HTTP server on PORT (default 3333)
  5. Starts WebSocket server on same HTTP server
  6. Starts Exchange Monitor with settings and WebSocket server reference

**Frontend App:**
- Location: `frontend/src/main.tsx`
- Triggers: `npm run dev`
- Responsibilities:
  1. Renders React DOM into #root element
  2. Wraps app with BrowserRouter for routing
  3. Wraps app with AppProvider (Context providers)
  4. Renders Routes component

**Frontend Routes:**
- Location: `frontend/src/routes.tsx`
- Triggers: Automatic routing based on URL
- Responsibilities:
  1. `/` - Login page (public)
  2. `/dashboard` - Dashboard with real-time data (protected)
  3. `/settings` - User settings page (protected)

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. Exchange streams are async callbacks, WebSocket broadcasts are synchronous forEach loops. No worker threads used.
- **Global state:** Exchange Monitor instance created once in server.ts, holds reference to all WebSocket clients. No module-level singletons for database or API clients - Sequelize instance created once in `backend/src/database/index.ts`.
- **Circular imports:** None detected. Module import tree is acyclic (models ← repositories ← services ← controllers ← routes ← app).
- **Database pool:** Sequelize connection pool limited to 5 max connections, 0 min, 10-second idle timeout
- **WebSocket broadcast latency:** All connected clients receive same data within single broadcast loop iteration (O(n) where n = connected clients)
- **Encryption:** Sensitive keys (exchange secretKey, accessKey) encrypted using AES-256 in `backend/src/utils/crypto.ts`, decrypted only in memory during session

## Anti-Patterns

### Direct API Calls in Components

**What happens:** Frontend components directly call `api.get()` or `api.post()` in useEffect hooks without abstraction (e.g., `frontend/src/contexts/symbols/index.tsx:52`, `frontend/src/contexts/balances/index.tsx:32`)

**Why it's wrong:** Violates separation of concerns - API logic mixed with state management. Makes components tightly coupled to backend API structure. Hard to test and refactor.

**Do this instead:** Create custom hooks that encapsulate API calls and return simple interfaces. Example:
```typescript
// Good
const useGetSymbols = () => {
  const [symbols, setSymbols] = useState([]);
  const getSymbols = useCallback(async (quote: string) => {
    const response = await api.get('/symbols');
    // ... transform response
    setSymbols(filtered);
  }, []);
  return { symbols, getSymbols };
};
```

### Service Response Objects with Optional Error Field

**What happens:** Services return objects with both `error?: string` and other fields (e.g., `backend/src/modules/sessions/services/session.service.ts:18-46`). Callers must check `if(data.error)` pattern.

**Why it's wrong:** TypeScript doesn't distinguish between error and success cases. Callers can forget error check. Mixes error path with success path in same object.

**Do this instead:** Use TypeScript union types or throw exceptions:
```typescript
// Good - Union type
type SessionResult = 
  | { success: true; status: 201; token: string }
  | { success: false; status: 401; error: string };

// Or throw exceptions
if (!user) {
  throw new UnauthorizedError('Invalid credentials');
}
```

### Type Safety with @ts-ignore Comments

**What happens:** Code uses `@ts-ignore` in multiple places (e.g., `backend/src/app.em.ts:38-43`, `backend/src/modules/exchange/services/exchange.service.ts:21`)

**Why it's wrong:** Bypasses TypeScript safety, hides real type issues, makes code fragile and hard to maintain.

**Do this instead:** Properly type Binance stream callbacks:
```typescript
// Good
interface BalanceData {
  balances: Array<{ asset: string; free: string; locked: string }>;
}

const userDataStream = (
  balanceCallback: (data: BalanceData) => void,
  executionCallback: (data: ExecutionData) => void,
  listStatusCallback: (data: ListStatusData) => void,
) => { ... }
```

### Unencrypted Credentials in Settings Model

**What happens:** Exchange API credentials (accessKey, secretKey) stored in database. Code encrypts/decrypts on every use (`backend/src/app.em.ts:13`, `backend/src/modules/exchange/services/exchange.service.ts:22`)

**Why it's wrong:** Decrypted values in process memory during operation. No key rotation. Encryption keys stored in .env file (not in vault). If process crashes with credentials in memory, they could leak.

**Do this instead:** Use external secrets management (Azure Key Vault, HashiCorp Vault). Store only encryption key reference in database.

## Error Handling

**Strategy:** Consistent response envelope with status codes and error messages

**Patterns:**
- Controllers return JSON with structure: `{ data: {...}, message: string, timestamp: ISO8601 }`
- HTTP status codes: 200 (success), 201 (created), 401 (unauthorized), 500 (server error)
- Services return object with `{ error?: string, status: number, ...data }` - callers check error field
- Middleware catches async errors with `express-async-errors` package
- Error middleware (`backend/src/middlewares/error.middleware.ts`) catches all unhandled errors and returns 500 with message

**Missing:** No custom exception classes, no typed error responses, no validation error details beyond generic message

## Cross-Cutting Concerns

**Logging:** Morgan HTTP request logger logs all requests to console in dev mode. No persistent logging. Binance API errors logged to console only.

**Validation:** Input validation minimal - Formik for frontend forms (required fields), backend has password length checks in login. No JSON schema validation. No input sanitization.

**Authentication:** JWT tokens with configurable expiration (JWT_EXPIRES_IN env var). Verified via auth middleware on protected routes. WebSocket verification via query param token extraction and JWT.verify(). Token stored in localStorage on frontend, no httpOnly cookie used (vulnerable to XSS).

**Rate Limiting:** Not implemented - Binance API has built-in rate limits, no app-level rate limiting.

**Monitoring:** No monitoring - no observability, no error tracking service, no application metrics.

---

*Architecture analysis: 2026-09-12*
