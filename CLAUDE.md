# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server — always port 3000 (strictPort: true, fails if taken)
npm run build     # production build → dist/
npm run preview   # serve dist/ locally on port 3000
```

There is no test runner, linter, or working `typecheck` script (`tsc` binary is broken in this environment — use `npm run build` to catch transpile errors instead).

`VITE_API_BASE_URL` is set per Vite mode: `.env` (base/fallback) → `https://api.candy.cx`, `.env.development` (used by `npm run dev`) → `https://dev-api.candy.cx`, `.env.staging` → `https://staging-api.candy.cx`, `.env.production` (used by `npm run build`) → `https://api.candy.cx`.

## Architecture

### Routing

React Router v6 (`BrowserRouter` in `main.tsx`). Two page categories:

- **AppLayout pages** (sidebar + topbar): `/dashboard`, `/chatbots`, `/live`, `/hrchat`
- **Full-screen pages** (no chrome): `/agents/{ecommerce,financial,logistics,healthcare,marketing,hr}` and `/chatbots/{cs,tech,health,bank,appt,hr}`

`AppContext` owns a `showView(name)` function that translates legacy view-name strings (e.g. `'dashboard'`, `'chatbot_cs'`) to React Router paths via a `VIEW_TO_PATH` map. `currentView` is derived from `useLocation().pathname` — it is not stored in state. All existing `showView()` call-sites keep working without modification.

### Global State — `AppContext`

`src/context/AppContext.tsx` is a single context that provides: auth (`user`, `signedIn`, `signOut`), navigation (`currentView`, `showView`), toasts (`addToast`), and legacy chat/call seed state. It also contains the auth guard (redirects to `/auth` when `user` is null) and handles `candy:auth-expired` events dispatched by the API client on 401 responses.

### API Client

`src/api/client.ts` exports a generic `api<T>(path, opts)` fetch wrapper that:
- Reads JWT from `localStorage` under key `candy.token` and attaches as `Authorization: Bearer`
- Throws `ApiError` (with `.status` and `.detail`) on non-2xx responses
- Dispatches a `candy:auth-expired` DOM event on 401 so AppContext can redirect

Auth tokens and user data are stored in `localStorage` (`candy.token`, `candy.user`).

### Voice Agent Pages

Each domain page (`/pages/ecommerce`, `/pages/financial`, etc.) renders `<AgentWorkspace>` from `src/components/agent/AgentWorkspace.tsx` with a `slug`, `category`, `defaultPrompt`, and `presets`. `AgentWorkspace` consumes the `useAgent(slug, defaultName)` hook (`src/hooks/useAgent.ts`) which handles: loading the agent list for the slug, auto-creating a starter agent if the list is empty, loading requirements (`/v1/agents/{id}/requirements`) and knowledge docs on selection change, and exposing setters for all editable fields.

### Chatbot Pages

Each chatbot page (`/pages/chatbot-cs`, etc.) renders `<ChatbotWorkspace>` from `src/components/agent/ChatbotWorkspace.tsx`. Unlike voice agents, chatbot workspaces manage their own agent loading state inline (no `useAgent` hook) and use `listAgents({ use_case: slug })` filtered by slug. Chat testing is done via `<ChatTestPanel>`.

### Styling

Dark-only design. All CSS variables are declared in `src/styles/globals.css` (e.g. `--bg-0`, `--text-1`, `--purple`, `--grad-brand`). Most component styles are inline JS objects rather than Tailwind classes. The design system uses these CSS variables exclusively — do not introduce hardcoded color values.

### Icons

All icons are in `src/assets/icons.tsx` and rendered via `<Icon name="..." size={n} />`. Use named imports only — do not `import * as Icons`.

## Known Issues (from FRONTEND_AUDIT.md)

- `useAgent` hook filters agents client-side (`a.use_case_slug === slug`) because the backend `?use_case=` filter is unreliable in the current build.
- Domain pages pass a hardcoded `defaultPrompt` string that is used as the initial prompt value until backend requirements load — this bypasses backend versioned prompts.
- Mock seed data (`src/utils/mockData.ts`) loads unconditionally in production via `AppContext`.
- No streaming/SSE for chat responses — all chat uses blocking `await api(...)` calls.
- JWT in `localStorage` is XSS-vulnerable; migration to `httpOnly` cookies is planned.
