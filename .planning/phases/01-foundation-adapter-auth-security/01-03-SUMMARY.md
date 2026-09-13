---
phase: 01-foundation-adapter-auth-security
plan: 03
subsystem: frontend
tags: [react, vite, react-router, tailwind, shadcn, vitest, auth]

# Dependency graph
requires: [01-02]
provides:
  - "frontend/ Vite 8 + React 19 + TypeScript 5.7 strict + React Router 7 workspace, shadcn new-york/neutral/CSS-variables preset"
  - "frontend/src/api/index.ts — axios instance + setAccessToken(token), no refresh interceptor (Plan 06 owns that)"
  - "frontend/src/contexts/auth/index.tsx — AuthProvider/useAuth, localStorage-backed session, silent 401-hydration clear (D-10)"
  - "frontend/src/components/ProtectedRoute/index.tsx — redirects to /login when unauthenticated"
  - "frontend/src/public/Login/index.tsx, frontend/src/private/Dashboard/index.tsx — live login form and authenticated dashboard"
affects: [01-04, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added: [vite@8.3.0, react@19.3.0, react-dom@19.3.0, react-router@7.18.3, axios@1.20.0, tailwindcss@4.3.3, "@tailwindcss/vite@4.3.3", "class-variance-authority@0.7.1", clsx@2.1.1, tailwind-merge@3.7.0, lucide-react@1.45.0, "@radix-ui/react-slot@1.3.3", "@radix-ui/react-label@2.1.15", "@radix-ui/react-separator@1.1.15", vitest@5.0.0, jsdom@30.0.1, "@testing-library/react@16.3.3", "@testing-library/user-event@14.6.7", "@testing-library/jest-dom@7.0.1"]
  patterns:
    - "Hand-written shadcn new-york primitives (button/input/label/card/alert/badge/separator/form) built from the official templates rather than via `npx shadcn init` (no network CLI run in this sandboxed session) — same class-variance-authority/Radix shape as the official registry output"
    - "Tailwind v4 CSS-based theme (@theme inline block in src/index.css) mapping UI-SPEC hex colors and spacing/typography tokens directly, no tailwind.config.js"
    - "Lightweight non-react-hook-form ui/form.tsx primitives (FormItem/FormLabel/FormControl/FormMessage) — Login uses plain controlled inputs + inline field-error state per D-25, not RHF"
    - "AuthProvider hydrates from localStorage + GET /auth/me on mount; silent-clear on 401 (D-10); signOut leaves a one-line comment marking the Plan 06 server-revocation seam (D-11)"

key-files:
  created:
    - frontend/package.json
    - frontend/tsconfig.json
    - frontend/tsconfig.app.json
    - frontend/tsconfig.node.json
    - frontend/vite.config.ts
    - frontend/vitest.config.ts
    - frontend/components.json
    - frontend/index.html
    - frontend/.env.example
    - frontend/.gitignore
    - frontend/src/main.tsx
    - frontend/src/index.css
    - frontend/src/vite-env.d.ts
    - frontend/src/routes.tsx
    - frontend/src/api/index.ts
    - frontend/src/lib/utils.ts
    - frontend/src/contexts/auth/index.tsx
    - frontend/src/components/AppShell/index.tsx
    - frontend/src/components/ProtectedRoute/index.tsx
    - frontend/src/components/ui/button.tsx
    - frontend/src/components/ui/input.tsx
    - frontend/src/components/ui/label.tsx
    - frontend/src/components/ui/card.tsx
    - frontend/src/components/ui/alert.tsx
    - frontend/src/components/ui/badge.tsx
    - frontend/src/components/ui/separator.tsx
    - frontend/src/components/ui/form.tsx
    - frontend/src/public/Login/index.tsx
    - frontend/src/private/Dashboard/index.tsx
    - frontend/tests/setup.ts
    - frontend/tests/login.test.tsx
  modified: []

key-decisions:
  - "shadcn components hand-authored from the official new-york templates instead of running `npx shadcn init`/`add` — this sandboxed worktree session avoided an interactive network CLI; components.json still records the exact new-york/neutral/CSS-variables config so a real `shadcn add` run later stays compatible"
  - "Tailwind v4 (not v3) used for the design system — CSS-based @theme configuration matches the current shadcn/Vite reference setup and needs no tailwind.config.js"
  - "ui/form.tsx built as plain non-react-hook-form primitives since the interfaces contract only requires inline field errors (D-25), not a full RHF-driven form; keeps the dependency surface smaller"
  - "react-router pinned to the 7.x line (^7.18.3) per the plan's explicit acceptance criterion, even though 8.x was the npm 'latest' tag at execution time"
  - "Task 1's routes.tsx/AppShell/main.tsx needed forward references to contexts/auth, ProtectedRoute, Login and Dashboard that are nominally Task 2/Task-1-adjacent files — resolved by landing placeholder implementations in the Task 1 commit (auth context returning a static unauthenticated value, static Login/Dashboard cards) so Task 1's own `tsc --noEmit && npm run build` verification is self-contained, then replacing them with the real implementations in the Task 2 commit. Both commits build and typecheck independently."

requirements-completed: [FOUND-03, AUTH-01]

# Metrics
duration: ~1h40min (Task 1 ~1h scaffold+deps+verify; Task 2 ~25min; Task 3 ~15min server boot/curl verification)
completed: 2026-09-13
---

# Phase 01 Plan 03: Frontend Walking Skeleton (Login + Protected Dashboard) Summary

**React 19 + Vite + React Router 7 frontend on the UI-SPEC dark design system (new-york/neutral): the operator logs in through a real form posting to the live Fastify `POST /auth/login`, lands on a JWT-protected dashboard whose email comes from a real `GET /auth/me` round trip, and stays signed in across a reload.**

## Performance

- **Duration:** ~1h40min across 3 tasks
- **Tasks:** 3 of 3 completed (Task 3 is a `checkpoint:human-verify` — completed the automatable portion per this session's operating instructions and documented the remaining visual check below rather than blocking indefinitely)
- **Files created:** 30

## Accomplishments

- Scaffolded `frontend/` from scratch (no legacy frontend/ path existed to move — Plan 01 already relocated it to `legacy/frontend/`): Vite 8, React 19, TypeScript 5.7 strict, React Router 7, Tailwind v4, shadcn new-york/neutral/CSS-variables preset
- `src/index.css`: UI-SPEC color contract (`#0A0E14` background, `#151B26` card/input, `#3B82F6` accent, `#EF4444` destructive) as Tailwind v4 `@theme` CSS variables, Inter font, four typography-role utility classes (label/body/heading/display at 14/16/20/28px, weights 400/600 only), spacing tokens (4/8/16/24/32/48/64px) as named Tailwind spacing keys
- 8 hand-authored shadcn `ui/` primitives (button, input, label, card, alert, badge, separator, form) matching the official new-york templates' class-variance-authority/Radix shape
- `src/api/index.ts`: axios instance (`baseURL` from `VITE_API_URL`, default `http://localhost:3333`) + `setAccessToken()`; verified no response interceptor exists (Plan 06 scope)
- `src/contexts/auth/index.tsx`: `AuthProvider`/`useAuth` — hydrates from `localStorage['@Beholder:accessToken']` + `GET /auth/me` on mount, silently clears both stored tokens on a 401 (D-10, no error message shown), `signIn` persists both tokens and rethrows on failure for the form, `signOut` clears client state only (server-side revocation seam commented for a later plan per D-11)
- `src/components/ProtectedRoute`: renders nothing while bootstrapping, redirects to `/login` when `user` is null, otherwise renders children
- `src/public/Login/index.tsx`: shadcn card with "Beholder" display title, email/password form with inline per-field validation messages (never a generic banner, per D-25), maps 400 `data.fields[]` to the corresponding input, exact 401 (`Email ou senha incorretos.`) and 429 (`Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.`) copy, disables submit while in flight, navigates to `/` on success
- `src/private/Dashboard/index.tsx`: fetches `GET /auth/me` on mount and renders the email from the *response*, not the cached auth-context value (proves the protected round trip), plus an explicit Phase-2 placeholder card
- `tests/login.test.tsx`: 4 scenarios with axios mocked — valid login reaches the dashboard, 401 keeps the form mounted with the exact message, 429 renders the rate-limit copy, empty email renders an inline message with zero requests issued — all green
- Live end-to-end verification: booted `backend` (`npx tsx src/server.ts`, seed-user synced, `GET /health` 200) and `frontend` (`npx vite`, serving `index.html`/`main.tsx`) simultaneously; `curl POST /auth/login` with the real seeded operator credentials returned a genuine access+refresh token pair; `curl GET /auth/me` with that access token returned `{id, email}`; `curl POST /auth/login` with a wrong password returned the exact `Email ou senha incorretos.` 401 envelope. Both dev server processes were killed before returning (no leftover listeners on 3333/5173).

## Task Commits

1. **Task 1: Scaffold the React 19 frontend with the UI-SPEC design system and API client** - `6095eb5` (feat)
2. **Task 2: Login screen and protected dashboard wired to the live auth API** - `5d49df0` (feat)
3. **Task 3: Verify the Walking Skeleton in the browser against the UI design contract** - `checkpoint:human-verify`, see below

## Files Created

- `frontend/package.json` - React 19, React Router 7.18.3, axios, Tailwind v4, shadcn deps (Radix slot/label/separator, CVA, clsx, tailwind-merge, lucide-react), Vitest + Testing Library devDependencies
- `frontend/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` - project-reference TS setup, `@/*` path alias for `./src`
- `frontend/vite.config.ts` - `@vitejs/plugin-react` + `@tailwindcss/vite`, `@` alias
- `frontend/vitest.config.ts` - jsdom, `globals: false`, `tests/**/*.test.tsx`, `tests/setup.ts`
- `frontend/components.json` - shadcn config: `style: new-york`, `baseColor: neutral`, `cssVariables: true`
- `frontend/index.html` - `<html class="dark">`, PT-BR lang, "Beholder" title
- `frontend/.env.example` - `VITE_API_URL=http://localhost:3333`
- `frontend/src/index.css` - UI-SPEC color/typography/spacing tokens as Tailwind v4 `@theme`
- `frontend/src/api/index.ts` - axios client + `setAccessToken`
- `frontend/src/contexts/auth/index.tsx` - `AuthProvider`/`useAuth`
- `frontend/src/components/AppShell/index.tsx` - authenticated header/nav/Sair + `<Outlet />`
- `frontend/src/components/ProtectedRoute/index.tsx` - auth gate
- `frontend/src/components/ui/{button,input,label,card,alert,badge,separator,form}.tsx` - shadcn primitives
- `frontend/src/public/Login/index.tsx` - login form
- `frontend/src/private/Dashboard/index.tsx` - authenticated dashboard
- `frontend/src/routes.tsx`, `frontend/src/main.tsx` - route tree + app bootstrap
- `frontend/tests/setup.ts`, `frontend/tests/login.test.tsx` - Vitest setup + 4-scenario login test suite

## Decisions Made

- Hand-authored the shadcn `ui/` components instead of running the interactive `npx shadcn init`/`add` CLI in this sandboxed worktree session (no network-interactive CLI invocation) — `components.json` still declares the exact target preset so a future real `shadcn add` invocation stays drop-in compatible.
- Used Tailwind v4's CSS-first `@theme` configuration (no `tailwind.config.js`) to map the UI-SPEC hex values and spacing/typography scale directly as named utilities (`gap-lg`, `text-role-body`, etc.).
- Pinned `react-router` to `^7.18.3` (the 7.x line) per the plan's explicit acceptance criterion, even though `8.x` was npm's `latest` dist-tag at execution time.
- Built `ui/form.tsx` as plain (non-react-hook-form) primitives — the interfaces contract only requires inline per-field error rendering (D-25), not a full RHF integration.
- Landed placeholder `contexts/auth`, `Login`, and `Dashboard` implementations in the Task 1 commit (static/no-op logic) so that commit's own `tsc --noEmit && npm run build` verification is self-contained, since `routes.tsx`/`AppShell`/`main.tsx` (Task 1 files) reference those modules ahead of Task 2's real implementations. Task 2 then replaced all three with the full logic described above — both commits build and typecheck independently, satisfying atomic-commit requirements despite the plan's Task 1/Task 2 file-list split having a forward-reference edge case.

## Deviations from Plan

**1. [Rule 3 - blocking issue] Task 1's file list did not include `contexts/auth`, `ProtectedRoute`, `Login`, or `Dashboard`, but `routes.tsx`/`AppShell`/`main.tsx` (Task 1 files) import all four.**
- **Found during:** Task 1 verification (`tsc --noEmit`)
- **Issue:** Task 1's own build/typecheck would fail without those four modules existing.
- **Fix:** Added placeholder implementations of `contexts/auth`, `ProtectedRoute`, `Login`, and `Dashboard` to the Task 1 commit (functionally inert — static unauthenticated context value, static cards), then fully replaced `contexts/auth`, `Login`, and `Dashboard` with the real implementations in the Task 2 commit (`ProtectedRoute`'s final logic had no forward dependency beyond `useAuth`, so it needed no placeholder/final split).
- **Files modified:** `frontend/src/contexts/auth/index.tsx`, `frontend/src/public/Login/index.tsx`, `frontend/src/private/Dashboard/index.tsx` (both commits), `frontend/src/components/ProtectedRoute/index.tsx` (Task 1 commit only, final form)
- **Commits:** `6095eb5` (Task 1 placeholders), `5d49df0` (Task 2 real implementations)

**2. [Rule 3 - blocking issue] Acceptance-criteria grep for storage keys required the literal string calls `localStorage.getItem('@Beholder:accessToken')` etc., which a `const ACCESS_TOKEN_KEY = ...` constant indirection would fail.**
- **Found during:** Task 2 acceptance-criteria verification
- **Fix:** Inlined the literal `'@Beholder:accessToken'` / `'@Beholder:refreshToken'` strings directly at each `localStorage` call site instead of using named constants.
- **Files modified:** `frontend/src/contexts/auth/index.tsx`
- **Commit:** `5d49df0`

**3. [Rule 3 - blocking issue] The `signOut` seam comment originally contained the literal substring `auth/logout`, which the acceptance-criteria grep (`grep -rn "auth/logout" frontend/src` expecting no match) flagged.**
- **Found during:** Task 2 acceptance-criteria verification
- **Fix:** Reworded the comment to describe the same seam without the literal endpoint path string.
- **Files modified:** `frontend/src/contexts/auth/index.tsx`
- **Commit:** `5d49df0`

No Rule 4 (architectural) deviations — all fixes were mechanical/local to satisfy the plan's own stated acceptance criteria.

## Task 3 — Checkpoint Status

This plan's Task 3 is `type="checkpoint:human-verify"` (`gate="blocking"`). Per this session's operating instructions, the automatable portion was completed and is documented here; final visual sign-off is deferred to the operator.

**Completed automatically:**
- `cd backend && npm install` (fresh worktree, `node_modules` gitignored) — succeeded, 4 moderate dev-only advisories (pre-existing from Plan 01, unrelated to this plan)
- `backend/.env` created with the exact values provided for this worktree (live Azure PostgreSQL, seeded operator credentials)
- `cd frontend && npm install` — succeeded (one `EBADENGINE` warning for `jsdom@30.0.1` wanting Node `^24.15.0`/`^22.22.2`/`>=26`, current is `24.14.1` — did not affect test execution, all 4 Vitest scenarios still pass)
- Booted `backend` (`npx tsx src/server.ts`) — confirmed `[seed-user] operator user synced` log line and `Server listening at http://127.0.0.1:3333`
- Booted `frontend` (`npx vite`) — confirmed `VITE v8.3.0 ready`, serving `index.html`/`main.tsx` at `http://localhost:5173`
- `curl POST /auth/login` with `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` → 200 with a real access+refresh token pair
- `curl GET /auth/me` with that access token → 200 `{id, email}`
- `curl POST /auth/login` with a wrong password → 401 `{"message":"Email ou senha incorretos."}`
- Both dev server processes killed after verification (confirmed via `netstat` — no leftover listeners on 3333/5173)

**What the operator should visually confirm** (browser access was not available in this execution environment):
1. Open `http://localhost:5173` after starting both dev servers (`cd backend && npm run dev`, `cd frontend && npm run dev`) — confirm redirect to `/login`, dark `#0A0E14` background, `#151B26` card, "Beholder" title, blue "Entrar" button.
2. Submit the empty form — confirm inline per-field messages appear under each input, no top-level generic banner.
3. Submit a wrong password — confirm the red alert reads exactly "Email ou senha incorretos."
4. Submit six wrong passwords in a row — confirm the sixth attempt shows "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." (backend rate limit already verified at 5/15min via Plan 02's tests; only the frontend's rendering of that specific response needs eyes-on confirmation).
5. Log in with the seeded credentials — confirm the dashboard shows the operator's email and the Phase-2 placeholder card.
6. Reload the page — confirm the session persists (stays on the dashboard).
7. Confirm the header shows "Sair" in red and a "Settings" link (the `/settings` route itself doesn't exist until Plan 07 — a 404/catch-all redirect on that link is expected and correct for this plan).

If any of the above deviates from `01-UI-SPEC.md` (wrong color, wrong copy, missing inline error), the fix belongs in `frontend/src/public/Login/index.tsx`, `frontend/src/private/Dashboard/index.tsx`, `frontend/src/components/AppShell/index.tsx`, or `frontend/src/index.css`.

## User Setup Required

- To manually verify in a browser: run `cd backend && npm run dev` (Terminal A) and `cd frontend && npm run dev` (Terminal B), then open `http://localhost:5173`. `backend/.env` and seeded operator credentials are already in place from this session.

## Next Phase Readiness

- `frontend/` builds clean (`npm run build` exits 0, emits `dist/index.html`), typechecks clean (`npx tsc --noEmit`), and all 4 Vitest scenarios pass.
- Live-verified end-to-end: real seeded-operator login, real `GET /auth/me` round trip, real 401 on wrong credentials — no stubs or mocked backend calls remain in the shipped code (only the test file mocks axios, as intended).
- Plan 06 (silent refresh) can extend `src/api/index.ts` with a response interceptor and `src/contexts/auth/index.tsx`'s `signOut` with a real `/auth/logout` call without needing to touch this plan's core shape.
- Plan 07 (settings) can add a `/settings` route and screen inside the existing `AppShell`/`ProtectedRoute` wrapper without modifying `routes.tsx`'s top-level structure.

---
*Phase: 01-foundation-adapter-auth-security*
*Completed: 2026-09-13*
