<!-- TEMPLATE-UNADOPTED: review and edit this document, then delete this line. While this line exists the audit does NOT count the document as evidence. -->
# Third-Party / Processor Register

Derived from the actual code in this repo (`candy-website-frontend`) — hosts, SDKs and
env vars it talks to. TODO(owner): fill in Contract/DPA, Security evidence and Last
review; those need a human/legal check, not a code read, so they're left blank rather
than guessed.

| Vendor / service | Purpose | Data shared | Region | Contract / DPA | Security evidence (SOC 2 / ISO) | Owner | Last review |
|---|---|---|---|---|---|---|---|
| AWS S3 (`spacemarvel-content-scrum` bucket) | Report Issue ticket + attachment storage, direct from browser (`src/api/reportIssues.ts`) | ticket title/description, reporter email, page URL, user agent, file attachments | `ap-south-1` | | | | |
| PostHog | Product analytics, session replay, error tracking (`src/main.tsx`) | usage events, identified user id/email/name (session replay inputs masked; access/refresh/sso tokens stripped from captured URLs) | EU (`eu.i.posthog.com`) | | | | |
| Google Fonts | Web font delivery (`index.html`) | visitor IP (inherent to any Google Fonts request) | — | | | | |
| SpaceMarvel dashboard API | OIDC identity, plan/credits, cross-app SSO (`dashboard-api.spacemarvel.ai`) | auth tokens, user id/email, company/workspace id | — | internal sibling product, not third-party | | | |
| MetaSpace/Composio API | Cross-app actions (`meta-api.spacemarvel.ai`) | auth tokens, action payloads | — | internal sibling product, not third-party | | | |

Review annually and on any change in data shared. Candy's own backend API (`api.candy.cx`,
repo `Candy-Agents`) is the primary data processor for everything else (CRM, WhatsApp,
agent/LLM traffic) — that repo needs its own vendor register entry for whichever LLM
provider(s) it calls; out of scope for this frontend-only register.
