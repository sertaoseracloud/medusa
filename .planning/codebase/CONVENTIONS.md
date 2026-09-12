# Coding Conventions

**Analysis Date:** 2026-09-12

## Naming Patterns

**Files:**
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

**Functions:**
- Service functions: camelCase arrow functions or async functions: `getById()`, `signIn()`, `updateUser()`, `exchangeInfo()`
- Controller actions: camelCase methods: `index()`, `create()`, `update()`
- Repository functions: camelCase functions: `getById()`, `getByEmail()`, `update()`, `getDefaultSettings()`
- Utility functions: camelCase: `encrypt()`, `decrypt()`, `balance()`
- Event handlers: camelCase with `handle` prefix: `handleErrorAuth()`, `handleSuccessSettings()`, `onChange()`
- Callbacks: Named with purpose: `callback`, `balanceCallback`, `executionCallback`, `listStatusCallback`

**Variables:**
- State variables: camelCase: `user`, `data`, `error`, `token`, `settings`
- Props interfaces: camelCase: `quote`, `onChange`, `email`, `password`, `newSettings`
- Constants from environment: UPPER_SNAKE_CASE: `AES_KEY`, `DATABASE_NAME`, `DATABASE_USER`, `JWT_SECRET`, `BINANCE_LOGS`
- Constants in code: UPPER_SNAKE_CASE or camelCase: `LOGS`, `quotes` (array constant uses camelCase)
- Database field names: camelCase: `apiUrl`, `streamUrl`, `accessKey`, `secretKey`, `createdAt`, `updatedAt`

**Types:**
- Interface names: PascalCase with "Data" suffix or descriptive suffix: `AuthContextData`, `ErrorContextData`, `AuthState`, `SignInCredentials`, `NewSettings`, `ExchangeResponse`, `SelectQuoteProps`, `User`
- Generic type parameters: Single uppercase letter or descriptive PascalCase: `Props`

## Code Style

**Formatting:**
- ESLint with Prettier integration enforces code style
- Backend `.eslintrc.json`: `C:\Repo\medusa\backend\.eslintrc.json`
  - Extends: `airbnb-base`, `plugin:@typescript-eslint/recommended`, `prettier/@typescript-eslint`, `plugin:prettier/recommended`
  - Rules: prettier/prettier: error
- Frontend `.eslintrc.json`: `C:\Repo\medusa\frontend\.eslintrc.json`
  - Extends: `plugin:react/recommended`, `airbnb`, `plugin:@typescript-eslint/recommended`, `prettier/@typescript-eslint`, `plugin:prettier/recommended`
  - Rules: 
    - `prettier/prettier: error`
    - `react-hooks/rules-of-hooks: error`
    - `react-hooks/exhaustive-deps: warn`
    - `react/jsx-filename-extension: [1, {extensions: [.tsx]}]`
    - `import/prefer-default-export: off`
    - `@typescript-eslint/explicit-function-return-type: [error, {allowExpressions: true}]`

**Linting:**
- ESLint with TypeScript parser and airbnb config
- Plugin: `@typescript-eslint`, `prettier`
- Import resolver uses TypeScript
- Filename extensions enforcement: `.ts` files have `never` import extension

**Quotes:**
- Single quotes for imports: `import express from 'express'`
- Double quotes sometimes used: `import { useSymbols } from "../../contexts/symbols"`
- Inconsistent — linter allows both

**Spacing:**
- 2-space indentation (observed in configuration and code)
- Space around operators and after keywords

## Import Organization

**Order:**
1. External modules: `import express from 'express'`, `import axios from 'axios'`, `import React from 'react'`
2. External third-party libraries: `import jwt from 'jsonwebtoken'`, `import bcrypt from 'bcrypt'`, `import Binance from 'node-binance-api'`
3. Internal modules/utilities: `import { ... } from '../services/...'`, `import db from '../database'`
4. Internal contexts/helpers: `import { useError } from '../error'`, `import { useAuth } from '../../contexts/auth'`

**Path Aliases:**
- No path aliases configured in `tsconfig.json` files
- Relative imports used throughout: `../../contexts/symbols`, `../middlewares/auth.middleware`, `../services/exchange.service`

**Example (Backend):**
```typescript
// C:\Repo\medusa\backend\src\modules\exchange\services\exchange.service.ts
import settingsRepository from '../../sessions/repositories/settings.repository';
import exchange from "../../../utils/exchange";
import crypto from "../../../utils/crypto";
```

**Example (Frontend):**
```typescript
// C:\Repo\medusa\frontend\src\contexts\auth\index.tsx
import { createContext, useCallback, useState, useContext, useEffect} from 'react';
import { Props } from '..';

import api from '../../api';
import { useError } from '../error';
```

## Error Handling

**Patterns:**
- **Try-catch in controllers:** Wrap service calls in try-catch blocks. Example in `C:\Repo\medusa\backend\src\modules\exchange\controllers\exchange.controller.ts`:
  ```typescript
  try {
    const { id } = res.locals.user;
    const data = await ExchangeService({ id });
    if(data.error) {
      return res.status(data.status).json({...});
    }
    res.status(data.status).json({...});
  } catch (error: any) {
    throw new Error(error);
  }
  ```

- **Error middleware pattern:** Global error handler in `C:\Repo\medusa\backend\src\middlewares\error.middleware.ts`:
  ```typescript
  export default async (error: any, _req: express.Request, res: express.Response) => {
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ 
      data: {},
      message,
      timestamp: new Date().toISOString(), 
    });
  }
  ```

- **Service response objects:** Services return typed response objects with error and status fields:
  ```typescript
  interface ExchangeResponse {
    error?: string;
    status: number;
    balance?: any;
  }
  ```

- **Standardized response format:** All responses follow structure: `{ data, message, timestamp }`
  - data: payload (empty object `{}` if error)
  - message: "Success" or error message
  - timestamp: ISO string from `new Date().toISOString()`

- **Authentication errors:** Return 401 with "Unauthorized" message. Example in `C:\Repo\medusa\backend\src\middlewares\auth.middleware.ts`

- **Type assertions:** `@ts-ignore` comments used to bypass type checking when needed. Heavy usage indicates type safety gaps. Examples:
  - `// @ts-ignore` in controllers and contexts
  - `//@ts-ignore` in services
  - `{/*@ts-ignore*/}` in JSX

## Logging

**Framework:** No dedicated logging framework. Uses:
- `console.log()` for database connection logging: `C:\Repo\medusa\backend\src\database\index.ts` (logging: console.log)
- `morgan` for HTTP request logging: `C:\Repo\medusa\backend\src\app.ts` (morgan("dev"))

**Patterns:**
- HTTP requests logged via morgan middleware
- Database queries optionally logged via Sequelize (logging: console.log in config)
- Application-level debug logging uses console.log (e.g., `console.log(\`userDataStream:subscribed ${subscribeData}\`)`)

## Comments

**When to Comment:**
- Rarely used in this codebase
- Only found in type-safe escape patterns: `// @ts-ignore`, `//@ts-ignore`, `{/*@ts-ignore*/}`
- No business logic comments observed
- No block comments or explanatory comments found

**JSDoc/TSDoc:**
- Not used in this codebase
- No function documentation found
- Interface definitions serve as inline documentation

**Example comment usage:**
```typescript
// C:\Repo\medusa\frontend\src\components\SelectQuote\index.tsx
{/*@ts-ignore*/}
<select id="selectQuote" className="form-select" value={quote} onChange={onChange}>
```

## Function Design

**Size:** 
- Small, focused functions (5-25 lines typical)
- Services break logic into separate functions
- Controllers call services rather than implementing logic directly

**Parameters:**
- Typed parameters required (TypeScript strict mode)
- Single parameter objects common for multiple values: `async ({id}:{id: string})`
- Props interfaces used for component parameters: `{onChange, quote}:SelectQuoteProps`
- Optional parameters using `?`: minimal usage observed

**Return Values:**
- Explicit return types in async functions/services
- Arrow functions with type annotations: `const ExchangeService = async ({id}:{id: string}): Promise<ExchangeResponse> => {...}`
- Functional components return `JSX.Element` implicitly (no explicit return type annotation in components)
- Services return typed objects with status, error, and data fields

**Example:**
```typescript
// C:\Repo\medusa\backend\src\modules\exchange\services\exchange.service.ts
const ExchangeService = async ({id}:{id: string}): Promise<ExchangeResponse> => {
  if(!id) {
    return { error: '401 Unauthorized', status: 401 };
  }
  // ...
  return {
    status: 200,
    balance: newBalance,
  };
}
```

## Module Design

**Exports:**
- Default exports primarily used: `export default app`, `export default ExchangeController`
- Named exports for hooks: `export function useAuth()`, `export function useError()`
- Object exports for utilities:
  ```typescript
  // C:\Repo\medusa\backend\src\utils\crypto.ts
  export default {
    encrypt,
    decrypt,
  }
  ```

- Provider exports: Default export for provider component + named export for hook

**Barrel Files:**
- Minimal barrel file pattern observed
- Component folders use `index.tsx` as entry point but not for re-exporting sibling components
- Contexts use `index.tsx` for context definition
- `frontend/src/contexts/index.tsx` appears to export all providers or types

**Module Organization Pattern:**
- Modular structure by feature: `modules/exchange/`, `modules/sessions/`, `modules/symbols/`
- Each module contains: `controllers/`, `services/`, `repositories/`
- Shared utilities in `utils/` directory
- Shared models in `models/` directory
- Shared middlewares in `middlewares/` directory

**Example module structure (Exchange):**
- `C:\Repo\medusa\backend\src\modules\exchange\controllers\exchange.controller.ts`
- `C:\Repo\medusa\backend\src\modules\exchange\services\exchange.service.ts`

## React Patterns

**Component Structure:**
- Functional components with hooks: `const Menu: React.FC = () => { ... }`
- Props typed with interfaces: `interface SelectQuoteProps { onChange: ...; quote: ... }`
- Components exported as default from `index.tsx`

**State Management:**
- Context API with Provider pattern for global state: `C:\Repo\medusa\frontend\src\contexts\auth\index.tsx`, `C:\Repo\medusa\frontend\src\contexts\error\index.tsx`
- `useState` for local component state
- `useCallback` for memoized callback functions
- `useEffect` for side effects

**Hook Usage:**
- Custom hooks for context consumption: `useAuth()`, `useError()`, `useSymbols()`
- Context hook returns interface typed data
- Error checks in hooks: `if (!context) { throw new Error(...) }`

**Context Pattern:**
```typescript
// C:\Repo\medusa\frontend\src\contexts\auth\index.tsx
export const AuthProvider = ({ children }: Props) => {
  // State and logic
  return (
    <AuthContext.Provider value={{ user, data, signIn, signOut, updateUser, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextData {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

**Component Composition:**
- Nesting components within feature folders: `components/Menu/NavBar/`, `components/Menu/SideBar/`
- Each component in its own folder with `index.tsx`
- Props passed down through component tree

**Fragments:**
- React.Fragment or shorthand `<>` used minimally
- Some use of explicit `<React.Fragment>`: `<React.Fragment>`

## TypeScript Patterns

**Type Safety:**
- Strict mode enabled: `"strict": true` in both `tsconfig.json` files
- Explicit function return types required by ESLint rule

**Any Type:**
- Heavy use of `any` type as escape hatch: `{values}:any`, `(error: any)`, `(settings: any)`
- @ts-ignore comments suppress type checking errors
- Indicates areas with weak type coverage

**Interfaces vs Types:**
- Interfaces used for object shapes and contracts: `interface SignInCredentials`, `interface AuthContextData`
- Types used for unions and complex types: not heavily observed

**Generic Types:**
- Minimal generic usage observed
- Context Provider generics: `createContext<AuthContextData>(...)`

---

*Convention analysis: 2026-09-12*
