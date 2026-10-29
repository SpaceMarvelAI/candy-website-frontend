# Architecture & data flow

## What this is

`candy-website-frontend` is the Vite/React single-page app served at
`app.candy.cx` (and `staging.candy.cx` / `dev.candy.cx`). It is a static
bundle behind CloudFront + S3 — no server-side rendering, no backend code in
this repo.

## Components this app talks to

| Component | Where | Protocol | Data sent |
|---|---|---|---|
| Candy API | `api.candy.cx` (prod) / `staging-api` / `dev-api` | HTTPS + WSS | Auth tokens, agent config, chat/voice session data, CRM data |
| SpaceMarvel dashboard API | `dashboard-api.spacemarvel.ai` | HTTPS | OIDC identity, plan/credits |
| MetaSpace/Composio API | `meta-api.spacemarvel.ai` | HTTPS | Cross-app actions |
| PostHog | `eu.i.posthog.com` | HTTPS | Product analytics events |
| Shared S3 bucket (`spacemarvel-content-scrum`) | AWS `ap-south-1` | HTTPS (direct from browser) | Report-issue tickets + attachments (see `src/api/reportIssues.ts`) — known accepted-risk area, tracked in `SECURITY.md` |
| Google Fonts | `fonts.googleapis.com` / `fonts.gstatic.com` | HTTPS | Font requests only |

## Trust boundaries

```
Browser (untrusted)
  |
  |-- HTTPS/WSS --> Candy API (api.candy.cx)        [primary trust boundary: auth, session, CRM data]
  |-- HTTPS ------> SpaceMarvel dashboard API         [OIDC identity]
  |-- HTTPS ------> MetaSpace API                     [cross-app calls]
  |-- HTTPS ------> PostHog                           [analytics, no PII by design -- see RS-PRI-04 review]
  `-- HTTPS ------> Shared S3 bucket (direct)         [report-issue uploads -- embeds a scoped IAM key
                                                        in the client bundle; see SECURITY.md "Known
                                                        accepted risks" and security/checklists/03-cry-*]
```

## Sensitive data handled in this repo

- Auth/session tokens (dashboard OIDC bearer, Candy JWT) — see `src/api/auth.ts`, `src/api/client.ts`.
- CRM/contact data surfaced to agents — `src/api/crmTypes.ts`, `src/api/connections.ts`.
- WhatsApp contact data — `src/api/whatsapp.ts`.
- User profile data — `src/api/profile.ts`.
- Report-issue tickets (email, org, page URL, user agent) — `src/api/reportIssues.ts`.

Full inventory: `security/policies/data-retention-and-privacy.md`.

## Known deviations from a typical trust model

Tracked explicitly in `SECURITY.md` -> "Known accepted risks":
1. Report Issue writes directly to S3 from the browser (long-lived IAM key ships in the bundle).
2. `app.candy.cx` (prod) does not yet serve the CSP/HSTS/frame-protection headers that `dev`/`staging` do (tracked in `CLOUDFRONT_SECURITY_HEADERS.md` at the repo root one level up).
3. The cross-product SpaceMarvel bearer token is persisted in `localStorage`.
