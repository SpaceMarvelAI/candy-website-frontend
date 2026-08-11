# Frontend Observability Audit

Read-only audit of the whole frontend (`pages/`, `components/`, `hooks/`, `context/`,
`layouts/`, `utils/`, `api/`, routing) for crash/reliability risks, produced before any
instrumentation was added. No code was changed to produce this document.

Findings are grouped by area. Severity: **Critical** (crashes the whole app / data
loss / security) · **High** (breaks one flow badly) · **Medium** (degraded UX,
recoverable) · **Low** (cosmetic/unlikely).

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 6 |
| Medium | 19 |
| Low | 8 |
| **Total** | **33** |

No Critical-severity findings (nothing that crashes the whole app or loses data
outright). The 6 High findings are all "a real user flow silently breaks or shows
wrong data" — three are a genuine shipped bug (double JSON-encoding), not just a
theoretical risk.

---

## Already-instrumented boundaries (reviewed directly, not by sub-agent)

These files already have logging built in from earlier work this session
(`client.ts`'s request/response/error logging, the 3-tier `ErrorBoundary`, the global
`window.onerror`/`unhandledrejection` listeners, `RouteLogger`). Findings here are
about gaps in the *app logic* those files touch, not gaps in instrumentation.

| File & Line | Risk Type | Crash Scenario | Severity | Recommended Fix |
|---|---|---|---|---|
| `src/context/AppContext.tsx:126` | Stale storage key (same class of bug found & fixed earlier this session in `devAuth.ts`) | `signOut()`'s fallback path (only reached if `fullLogout()` itself throws) does `localStorage.removeItem('candy.token')`, but the real token key is `'access_token'` (see `client.ts` `TOKEN_KEY`). If this fallback is ever actually reached, the real access token is NOT cleared — the user appears logged out in the UI but the token remains valid in storage. Currently near-unreachable (`fullLogout()` structurally shouldn't throw), so this is latent, not active. | Medium | Change `'candy.token'` → `'access_token'` in this fallback block, matching the fix already applied to `devAuth.ts`. |
| `src/context/AppContext.tsx:70` | Route-derived state doesn't match dynamic routes | `currentView = PATH_TO_VIEW[location.pathname] ?? 'dashboard'` only matches exact static paths. Dynamic routes like `/live/demo` or `/analytics/summary` aren't in the map (only `/live`/`/analytics` are), so `currentView` silently falls back to `'dashboard'` while actually on Live Calls or Analytics — likely causes the wrong sidebar item to highlight as active. | Low | Match by path prefix (`location.pathname.startsWith(...)`) instead of exact lookup for routes with sub-paths. |
| `src/context/AppContext.tsx:134-141` vs `150-232` | Race condition | The `candy:auth-expired` listener effect and the SSO-token-exchange effect both run on mount with no ordering guarantee. If a stale/expired token from a previous session triggers a 401 (→ `setUser(null)`) at the same moment a fresh SSO exchange is resolving (→ `setUser(u)`), the two can interleave, producing a brief flash of signed-out UI or, in the worst ordering, the auth-expired handler clearing the user state right after the SSO handler just set it. | Medium | Track "SSO exchange in flight" in a ref and have the auth-expired handler no-op while it's true. |
| `src/App.tsx:109-116` (`ProtectedRoute`) | Side effect during render | `if (!user) { redirectToOIDC(); return null; }` calls `redirectToOIDC()` (which does `sessionStorage.setItem` + eventually `window.location.href = ...`) directly in the render body, not in a `useEffect`. Under React 18 `StrictMode` (this app wraps its root in `<React.StrictMode>`), component bodies are invoked twice in development specifically to catch this pattern — meaning the redirect logic currently runs twice per unauthenticated render in dev. Not currently harmful (both calls are idempotent-ish), but it's undefined-behavior-adjacent and would misbehave if `redirectToOIDC()` ever grows a non-idempotent side effect. | Medium | Move the redirect into a `useEffect(() => { if (!user) redirectToOIDC(); }, [user])`. |

---

## `src/pages/*`

| File & Line | Risk Type | Crash Scenario | Severity | Recommended Fix |
|---|---|---|---|---|
| `src/pages/analytics/index.tsx:1046-1072` | Missing error/loading state | `refresh()` calls 7 analytics endpoints each with `.catch(() => null)`, so failures never reach the outer try/catch. A backend outage or expired token renders "0 sessions · 0 agents · 0 events" — indistinguishable from a genuinely empty account, no error banner or retry. | Medium | Track per-source failure and show a visible error/retry state instead of silently rendering empty data. |
| `src/pages/flows/index.tsx:217` | External-lib throw point | `onCanvasDrop` calls `JSON.parse(e.dataTransfer.getData('candy/node'))` with no try/catch. Malformed drag data (stale cached bundle, browser extension, manually crafted drag event) throws inside the drop handler. | Medium | Wrap in try/catch, no-op/toast on failure. |
| `src/pages/flows/index.tsx:170-190` | Missing error/loading state | Initial `listAgents()`/`listConnections()`/`listWorkflows()`/`getComposioApps()` all use `.catch(console.warn)` with no error state — failure looks identical to "empty workspace". | Medium | Add a load-error flag per source, render a retry banner. |
| `src/pages/flows/NodeEditDrawer.tsx:196` | Race condition | `EmbedGuide`'s `listEmbedInstalls(agentId).then(setInstalls)` effect has no cancellation flag; the drawer component instance persists across node selections, so clicking node A then quickly node B before A's request resolves lets A's stale response overwrite `installs` while the drawer now shows node B. | Medium | Guard with a `cancelled` flag or ignore the response if `agentId` has changed since the call was made. |
| `src/pages/flows/NodeEditDrawer.tsx:35,254` | Unhandled async rejection | `navigator.clipboard.writeText(...).then(...)` (in `CopyBox` and the snippet `copy()` helper) has no `.catch()` — denied clipboard permission/unfocused document leaves an unhandled rejection and "Copied!" never appears. | Low | Add `.catch()` with an error toast or selection fallback. |
| `src/pages/healthcare-domain/index.tsx:119-136,185` | External-lib throw point | `openAgent()`'s unguarded `sessionStorage.setItem('candy.select_agent', agentId)` throws in Safari private browsing/quota pressure. From the existing-agent button (line 185) this silently kills navigation; from `handleCreate` (line 136) it's caught by that function's own try/catch and reported as **"Could not create agent"** even though `createHealthcareAgent` already succeeded on the backend. | Medium | Wrap the `sessionStorage.setItem` in its own try/catch inside `openAgent()` so storage failures can't masquerade as agent-creation failures. |
| `src/pages/landing/index.tsx:23,109` | External-lib throw point | `redirectToOIDC()` is called unguarded from both the mount effect and the CTA button. If `VITE_API_BASE_URL` is unset/malformed or storage is blocked, both throw — leaving the app's only unauthenticated entry point with no working sign-in path, automatic or manual. | High | Wrap both call sites in try/catch, render a fallback manual link if redirect construction fails. |
| `src/pages/live/LiveStats.tsx:10` | Unvalidated response / divide-by-zero | `` `${Math.round(counts.completed / counts.total * 100)}%` `` has no zero-guard. `total` is `0` on the Chat/Agents sub-tabs (hard-coded) and on any fresh account — reliably renders **"NaN% success rate"**. | Medium | Only compute the percentage when `total > 0`, else render "—". |

## `src/components/agent/*` (and related shared components)

| File & Line | Risk Type | Crash Scenario | Severity | Recommended Fix |
|---|---|---|---|---|
| `TestPanel.tsx:557-581` vs `489-491` | Race condition / missing state reset | Switching agents mid-conversation (same mounted `TestPanel`, `agentId` prop changes) resets `sessionId` and stops TTS, but never clears `transcript`. New agent's panel shows the old agent's chat history; an in-flight `streamDemoTurn` for the old agent can keep appending sentences under the new agent's identity. | High | Clear `transcript` (and cancel any in-flight turn) in the same effect that resets `sessionId` on `agentId` change. |
| `TestPanel.tsx:584-609` vs `1384-1401`/`1420-1459` | Race condition / missing cleanup guard | Unmounting while a `MediaRecorder` is capturing: cleanup calls `.stop()`, but `rec.onstop` fires asynchronously after unmount, calling `setListening(false)` on an unmounted component and scheduling `finalizeSttAndSend` → `send()`, firing a new network turn after the page is gone. | Medium | Set a "sent"/`mountedRef` guard in the unmount cleanup before stopping the recorder so `onstop` can't re-trigger a turn. |
| `TestPanel.tsx:833-835` | Missing error state (swallowed) | SSE `{"error": ...}` mid-turn calls an `onError` that throws by design, but that throw lands inside `streamDemoTurn`'s own parse `try/catch` and is just `console.warn`'d — never reaches `send()`'s outer catch. Agent bubble stays stuck empty, `busy` clears, no error toast at all. | Medium | Have `streamDemoTurn` propagate `onError` invocations outside its inner parse catch instead of absorbing the throw. |
| `TestPanel.tsx:557-581` vs `625-640` | Race condition | Sending a message before the eager `startDemo` effect resolves lets `ensureSession()` fire a second, concurrent `startDemo` for the same agent — two sessions created, one silently discarded. | Medium | Track the in-flight `startDemo` promise in a ref so concurrent callers await the same request. |
| `ChatTestPanel.tsx:132-136,155` | Missing error state | If a `/demo` response has neither `demo_session_id` nor `session_id`, `sid` is `null` but the code still calls `setActive(true)` — UI shows "Online". User sends a message; `sendMessage()` silently `return`s since `sessionId` is falsy. Message vanishes, zero feedback. | High | Treat a falsy `sid` as a failed `startSession` (set an error state), don't `setActive(true)`. |
| `ChatTestPanel.tsx:113-119` vs `121-193` | Race condition | Clicking "Start conversation" then switching agents before `POST /demo` resolves: the reset effect clears state for the new agent, but the stale `startSession`/`sendMessage` promise still resolves and calls `setSessionId`/`setMessages` for the OLD agent — silently activating a chat pointed at the wrong agent. | High | Capture the `agentId` a request was issued for; ignore the response if it no longer matches current `agentId` (same pattern already used in `AgentPicker`/`ChatbotWorkspace`). |
| `ChatTestPanel.tsx:62-87` | Missing cleanup / race condition | `animateMessage`'s recursive `setTimeout(tick, DELAY)` has no cancel path. Clicking "New chat" or switching agents mid-animation leaves an orphaned `tick()` that keeps calling `setMessages`, potentially corrupting the new session's first (streaming) message with leftover text. | Medium | Return a cancel function from `animateMessage`; invoke on reset/agent-change/unmount. |
| `ChatbotWorkspace.tsx:359` | Unhandled async rejection | `navigator.clipboard.writeText(widgetUrl)` has no `.catch()`, but `addToast('URL copied!', 'success')` fires unconditionally right after — tells the user it worked even when the clipboard write failed. | Medium | Chain `.then(success toast).catch(error toast)`. |
| `EmbedModal.tsx:199-204` | Unhandled async rejection | Same clipboard pattern for the code-snippet "Copy" button — silent failure, no feedback. | Low | Add `.catch()` with a fallback/error state. |
| `EntryPointBanner.tsx:49-54` | Unhandled async rejection | Same clipboard pattern for copying the hosted chat URL/phone number. | Low | Add `.catch()` handling. |
| `EntryPointBanner.tsx:180-188` | Missing error state (swallowed) | `removeNumber`'s bare `catch {}` swallows every DELETE failure — button stops spinning, number stays assigned, zero feedback that removal failed. | Medium | Surface the error via `addToast`, matching this same file's other handlers. |
| `EntryPointBanner.tsx:129-136` | Race condition | No `cancelled` guard on the route-loading effect — fast agent switching can let an older `/inbound-routes` response overwrite `routes` with stale data for the wrong agent. | Medium | Add the same `cancelled` guard pattern used in `LanguagePicker`/`ChatbotWorkspace`. |
| `AutomationTab.tsx:79-96` | Race condition | `reload()` has no stale-response guard — quick agent switching can show a previous agent's automations as if they belonged to the current one. | Medium | Add a `cancelled` flag or compare against the `agentId` the request was made for. |
| `AutomationTab.tsx:143-144` | Missing error state (swallowed) | Malformed JSON body template is silently replaced with `{}` on parse failure, no warning that the user's template was dropped. | Low | Surface a toast/validation error, block save instead of silently substituting. |
| `SkillsPicker.tsx:98-121` | Race condition | Same pattern as `AutomationTab` — no cancellation guard, rapid agent switching can apply a stale attached-skills response to the wrong agent. | Medium | Add a `cancelled`/stale-request guard keyed on `agentId`. |
| `Toast.tsx:43` | Unsafe type assertion | `AppContext`'s `toasts` state is untyped (`useState([])` infers `never[]`), worked around with `(t as any).kind` — hides any future shape mismatch at compile time. | Low | Type `toasts` as `useState<Toast[]>([])` in `AppContext`, drop the cast. |

*No significant findings:* `AgentShell.tsx`, `AgentPicker.tsx`, `AgentWorkspace.tsx`,
`KnowledgeBase.tsx`, `LanguagePicker.tsx`, `PromptAgentPickerModal.tsx`,
`PromptEditor.tsx`, `AppLayout.tsx`, `useMediaQuery.ts`, `useTheme.ts`,
`AgentScaffold.tsx`, `SignupPopup.tsx`, `Topbar.tsx`, `PromptTicketHandler.tsx` — all
already have proper cancellation guards, try/catch + toasts, or are simple/static
enough to have nothing to flag. Also: `auth`, all 6 `chatbot-*` pages, `chatbots`,
`composio-callback`, `connects`, `dashboard` (+ its sub-components), `ecommerce`,
`financial`, `healthcare`, `hr`, `logistics`, `marketing`, `hrflow`, `sso`, `webhooks`
pages — reviewed, nothing notable.

## `src/api/*`

| File & Line | Risk Type | Crash Scenario | Severity | Recommended Fix |
|---|---|---|---|---|
| `automations.ts:62` (`createAutomation`) | **Shipped bug** — double JSON-encoding | Builds `body: JSON.stringify({...})`, but this string is then passed into the shared `api()` helper, which does `JSON.stringify(body)` again for any non-FormData body (`client.ts:87`). Verified: `JSON.stringify(JSON.stringify({a:1}))` → a JSON string *literal*, not an object. The backend receives a string where it expects an object — every automation creation likely 422s. | High | Pass the plain object as `body` — remove the redundant inner `JSON.stringify(...)`. |
| `automations.ts:68` (`updateAutomation`) | Same shipped bug | Every automation-config update fails the same way. | High | Same fix. |
| `automations.ts:77` (`testAutomation`) | Same shipped bug | The "test webhook" action's `{ dry_run }` is double-encoded — the test-fire endpoint never receives a usable flag. | High | Same fix. |
| `demo.ts:120-163` (`streamDemoTurn`), `if (done) break;` at 122 | Silently misleading success | If the SSE connection closes before a `{"done": true}` frame arrives (proxy timeout, backend crash mid-stream), the loop just `break`s and the function returns successfully — `onDone`/`onError` never fire. Caller sees a resolved promise with no signal the response was incomplete; UI shows a partial sentence forever. | Medium | After a stream closes without a `done` frame, invoke `onError` (or a synthetic truncated-`onDone`) so the caller can recover. |
| `composio.ts:5-40` (`getMetaToken` module-level cache) | Race condition in module-level caching | `pages/connects/index.tsx` calls `getComposioApps()` and `getComposioConnections()` concurrently on load; both see `_metaToken === null` and each independently runs the full SSO handshake instead of one awaiting the other's in-flight request — doubles auth-server load per page visit, and can intermittently fail one of the two calls if the backend enforces single-use SSO tickets. | Medium | Memoize the in-flight promise (not just the resolved token) so concurrent callers await the same request. |

*No significant findings:* `agents.ts`, `analytics.ts`, `chat-sessions.ts`,
`chatbots.ts`, `connections.ts`, `knowledge.ts`, `languages.ts`, `prompts.ts`,
`requirements.ts`, `skills.ts`, `webhooks.ts`, `workflows.ts`, `recordings.ts`,
`stt.ts`, `tts.ts`, `index.ts` — typed, defensively coded wrappers with no unguarded
access found. (`client.ts`, `auth.ts`, `healthcare.ts`, `reportIssues.ts` were
reviewed directly, not by sub-agent — see the "already-instrumented boundaries"
section above and this session's earlier work for those.)

---

## Priority for instrumentation (Phase 3)

Per the audit instructions, only Critical/High-flagged components get
`useDebugLifecycle` treatment (surgical, not blanket):

- **`TestPanel.tsx`** — 4 findings, 1 High, complex WebSocket/MediaRecorder state
- **`ChatTestPanel.tsx`** — 3 findings, 2 High, session/agent-identity races
- **`automations.ts`** — 3 High findings (real shipped bug), logged via the existing
  API interceptor already — no component to attach lifecycle logging to (it's a
  data-layer file, not a component), but its call sites in `AutomationTab.tsx`
  get the lifecycle hook since that's the flagged (Medium) component.
- **`pages/landing/index.tsx`** — 1 High finding, the app's only unauthenticated
  entry point

No fixes were applied for any of the above — this document is the record; Phase 3
only adds logging so these are visible when they occur.
