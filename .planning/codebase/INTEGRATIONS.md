# External Integrations

**Analysis Date:** 2026-09-12

## APIs & External Services

**Cryptocurrency Exchange:**
- Binance - Multi-coin trading data and order execution
  - SDK/Client: `node-binance-api` 0.13.1 (`src/utils/exchange.ts`)
  - Auth: API key + secret stored encrypted in database (`settings.accessKey`, `settings.secretKey`)
  - Encryption: AES-256-CTR (`src/utils/crypto.ts` with `AES_KEY` env var)
  - WebSocket streams: miniTicker, bookTickers, userData (balance + execution updates)
  - Endpoints: REST API for exchange info, WebSocket for real-time streams
  - Configuration: `apiUrl` and `streamUrl` stored per user settings (supports custom endpoints)

**Charting & Analytics:**
- TradingView - Embedded chart widget
  - Integration: CDN script loaded in `frontend/index.html` line 57
  - Client: `https://s3.tradingview.com/tv.js`
  - Purpose: Price charts and technical analysis visualization

## Data Storage

**Databases:**
- Microsoft SQL Server (Azure SQL compatible)
  - Connection: Environment variables `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_PORT`
  - Client/ORM: Sequelize 6.19.0 (`src/database/index.ts`)
  - Dialect: `mssql` with Tedious driver
  - Pool: 5 max connections, 10s idle timeout
  - Encryption: TLS enabled (`options.encrypt: true`)
  - Models: `src/models/settings.model.ts`, `src/models/symbol.model.ts`
  - Migrations: `backend/migrations/` (4 migrations for settings, symbols, stream URL)

**File Storage:**
- Azure Blob Storage
  - CDN: `https://beholder.azureedge.net/cdn/`
  - Assets: Frontend resources (Bootstrap, vendor JS, CSS, images, favicons)
  - Used in: `frontend/index.html` for stylesheet, script, and image assets
  - No direct backend integration code (external CDN only)

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based implementation
  - Implementation: `src/modules/sessions/services/session.service.ts`
  - Token generation: jsonwebtoken 8.5.1 with `JWT_SECRET` and `JWT_EXPIRES_IN` env vars
  - Token verification: `src/middlewares/auth.middleware.ts`, `src/app.ws.ts` (for WebSocket)
  - Password storage: bcrypt 5.0.1 with salt rounds 10 (`src/modules/sessions/repositories/settings.repository.ts`)
  - Password verification: bcryptjs 2.4.3
  - Session endpoints: `POST /sessions` (login), `POST /logout` (blacklist)
  - User model: `settings` table with email + password + Binance API credentials

**Session Management:**
- JWT tokens passed in Authorization header for REST API
- JWT tokens passed in WebSocket URL query param: `token=<jwt>` (`src/app.ws.ts` line 27)
- Session repository handles user lookups by email (`settings.repository.ts`)

## Monitoring & Observability

**Error Tracking:**
- None detected - Custom error middleware (`src/middlewares/error.middleware.ts`)

**Logs:**
- Morgan 1.10.0 - HTTP request logging in "dev" format
- Console logging for database connection status (`src/server.ts`)
- Optional Binance logs via `BINANCE_LOGS` env var
- WebSocket logs for connection events

## CI/CD & Deployment

**Hosting:**
- Azure (implied by Azure SQL Server backend + Azure Blob Storage CDN)
- Backend hosted as Node.js application
- Frontend hosted as static assets (Vite SPA build)

**CI Pipeline:**
- None detected - No `.github/workflows/` or CI configuration found

## Environment Configuration

**Required env vars (Backend):**
- `PORT` - Server port (default 3333)
- `DATABASE_HOST` - SQL Server hostname
- `DATABASE_USER` - SQL Server username
- `DATABASE_PASSWORD` - SQL Server password
- `DATABASE_NAME` - Database name
- `DATABASE_PORT` - SQL Server port (default 1433)
- `DATABASE_TYPE` - Dialect for production (default "mssql")
- `JWT_SECRET` - Secret key for JWT signing
- `JWT_EXPIRES_IN` - JWT expiration in seconds
- `AES_KEY` - 32-byte encryption key for Binance credentials (default provided, must be exactly 32 bytes)
- `CORS_ORIGIN` - Allowed CORS origin for frontend
- `BINANCE_LOGS` - "true" to enable verbose Binance API logging (optional)

**Required env vars (Frontend):**
- `VITE_APP_API_URL` - Backend API base URL (e.g., `http://localhost:3333`)
- `VITE_APP_WS_URL` - WebSocket server URL (e.g., `ws://localhost:3333`)

**Secrets location:**
- Backend: `.env` file (NOT committed, listed in `.gitignore`)
- Frontend: `.env` or `.env.local` (Vite convention)
- Binance API keys: Encrypted in database `settings.accessKey` / `settings.secretKey` columns using AES encryption

## Webhooks & Callbacks

**Incoming:**
- None detected - API is REST + WebSocket polling/streaming

**Outgoing:**
- None detected - No webhook delivery system

## API Communication Patterns

**HTTP Client:**
- axios 0.26.1 - Used for REST calls in both frontend and backend
- Frontend: `src/api/index.ts` creates axios instance with `VITE_APP_API_URL` base
- Backend: axios used for external service calls (implicit from dependency)

**REST Endpoints:**
- `POST /sessions` - User login (returns JWT)
- `POST /logout` - User logout (auth required)
- `GET/POST /settings` - User settings management (auth required) - `src/routes/settings.routes.ts`
- `GET/POST /symbols` - Trading symbol management (auth required) - `src/routes/symbols.routes.ts`
- `GET /exchange` - Exchange data endpoints (auth required) - `src/routes/exchange.routes.ts`

**WebSocket:**
- Server: `ws://[host]:[port]` with JWT token in query param
- Verification: JWT decoded in `verifyClient` callback (`src/app.ws.ts`)
- CORS validation: origin must start with `CORS_ORIGIN` env var
- Message handlers: `onMessage`, `onError`, `onConnection` (`src/app.ws.ts`)
- Streams: Binance real-time data via miniTicker, bookTickers, userData WebSocket subscriptions

## Data Flow

**User Authentication:**
1. POST `/sessions` with email + password
2. Service validates against `settings` table with bcrypt
3. JWT token generated and returned
4. Token used in `Authorization: Bearer <token>` header for REST calls
5. Token used in WebSocket URL as query param for real-time connections

**Binance Integration:**
1. User stores Binance API credentials in `/settings` endpoint
2. Credentials encrypted with AES before database storage
3. On backend initialization, settings fetched and passed to exchange wrapper
4. Exchange wrapper subscribes to Binance WebSocket streams
5. WebSocket messages broadcast to connected clients via server WebSocket

---

*Integration audit: 2026-09-12*
