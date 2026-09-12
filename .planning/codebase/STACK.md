# Technology Stack

**Analysis Date:** 2026-09-12

## Languages

**Primary:**
- TypeScript 4.6.3 - Backend and frontend application code with strict type checking enabled
- JavaScript - Build configuration and migration scripts

**Target Runtime:**
- ES2017 (Backend transpilation target via tsc)
- Modern browser with ES6+ module support (Frontend via Vite)

## Runtime

**Environment:**
- Node.js (version not pinned, inferred from .nvmrc or system)
- Browser runtime (React 18 frontend)

**Package Manager:**
- Yarn and npm (dual support with yarn.lock and package-lock.json)
- Backend: package.json with 19 dependencies, 13 devDependencies
- Frontend: package.json with 6 dependencies, 17 devDependencies

## Frameworks

**Core:**
- Express 4.17.3 - HTTP/REST API framework (`src/app.ts`, `src/routes/`)
- React 18.0.0 - UI framework with functional components
- React Router DOM 6 - Client-side routing (`src/routes.tsx`)

**Real-time Communication:**
- ws 8.5.0 - WebSocket server implementation (`src/app.ws.ts`)
- react-use-websocket 3.0.0 - Client-side WebSocket hook integration

**Build/Development:**
- Vite 2.9.2 - Frontend build tool and dev server with React plugin
- TypeScript 4.6.3 - Type system and transpilation
- ts-node-dev 1.1.8 - Development server with hot reload
- ESLint 8.13.0 - Code linting (airbnb-base backend, airbnb frontend)
- Prettier 2.6.2 - Code formatting (integrated via eslint-plugin-prettier)

**Testing:**
- Not detected - No test framework found

## Key Dependencies

**Critical:**
- node-binance-api 0.13.1 - Binance exchange API client with WebSocket support (`src/utils/exchange.ts`)
- sequelize 6.19.0 - SQL ORM for database operations (`src/database/index.ts`)
- sequelize-cli 6.4.1 - Database migration and seed management (`sequelize`, `migration:generate`, `seed:*` scripts)
- jsonwebtoken 8.5.1 - JWT token generation and verification (`src/modules/sessions/services/session.service.ts`, `src/app.ws.ts`)

**Infrastructure:**
- mssql 8.1.0 - Microsoft SQL Server driver
- tedious 14.4.0 - TDS protocol implementation for MSSQL connections
- axios 0.26.1 - HTTP client (backend + frontend) for API calls
- bcrypt 5.0.1 - Password hashing and verification
- bcryptjs 2.4.3 - Alternative bcrypt implementation (dual dependency)

**Security & Middleware:**
- helmet 5.0.2 - Security headers middleware
- cors 2.8.5 - CORS handling
- express-async-errors 3.1.1 - Async error handling wrapper
- morgan 1.10.0 - HTTP request logging

**Encryption:**
- aes-js 3.1.2 - AES encryption for storing Binance API credentials (`src/utils/crypto.ts`)

**Frontend-specific:**
- formik 2.2.9 - Form state management
- yup 0.32.11 - Schema validation for forms

**Utilities:**
- dotenv 16.0.0 - Environment variable loading
- reflect-metadata 0.1.13 - Decorator metadata support for TypeScript

## Configuration

**Environment:**
- Backend: `.env` file (not committed, see `config/index.js`)
  - Required: `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `DATABASE_HOST`, `DATABASE_PORT`
  - Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, `AES_KEY`
  - Server: `PORT`, `CORS_ORIGIN`
  - Exchange: `BINANCE_LOGS` (boolean flag)
- Frontend: Vite `.env` variables
  - Required: `VITE_APP_API_URL`, `VITE_APP_WS_URL`

**Build:**
- `backend/tsconfig.json` - TypeScript compilation with decorators enabled, CommonJS output, source maps
- `backend/.sequelizerc` - Sequelize CLI configuration pointing to `config/index.js`
- `frontend/vite.config.ts` - Vite with React plugin, no custom resolvers
- `.eslintrc.json` - Shared ESLint config (backend + frontend)
- `.prettierrc` files in both backend and frontend

## Platform Requirements

**Development:**
- Node.js 16+ (TypeScript 4.6.3 compatibility)
- npm or Yarn
- PowerShell or Bash shell
- Port 3333 (default backend) + configurable frontend dev port (Vite default 5173)

**Production:**
- Node.js 16+ runtime
- Microsoft SQL Server database (Azure SQL compatible - logs show "Database connected on Azure SQL")
- WebSocket support required for real-time features
- Azure Blob Storage CDN for static assets (`beholder.azureedge.net`)

**Database:**
- Microsoft SQL Server (MSSQL dialect in Sequelize)
- Connection pooling: max 5, min 0, idle 10000ms
- Encryption: TLS enabled in connection options
- Migrations managed via `sequelize-cli` in `backend/migrations/`

---

*Stack analysis: 2026-09-12*
