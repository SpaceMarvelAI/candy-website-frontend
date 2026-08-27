# Security Policy

## Reporting a vulnerability

Please report security issues privately to **security@spacemarvel.ai**.

Do **not** open a public GitHub issue for a security report — issues in this
repository are readable by everyone with repo access, and a public report
discloses the vulnerability before it can be fixed.

If you do not receive an acknowledgement within **3 working days**, escalate to
**hello@spacemarvel.ai**.

### What to include

The more of this you can provide, the faster we can confirm and fix it:

- What you found, and the impact you believe it has
- Steps to reproduce — a URL, a request, or a short script
- The affected environment (`app.candy.cx`, `staging.candy.cx`, `dev.candy.cx`)
- Anything you noticed that limits or amplifies the issue

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | 3 working days |
| Initial assessment and severity | 5 working days |
| Fix or documented mitigation for high/critical | 30 days |
| Follow-up once resolved | we will tell you when it ships |

We will credit reporters who want it, and we will not pursue action against
anyone acting in good faith under this policy.

### Scope

In scope:

- `app.candy.cx`, `staging.candy.cx`, `dev.candy.cx` (this frontend)
- `api.candy.cx`, `staging-api.candy.cx`, `dev-api.candy.cx` (Candy API)

Out of scope — please don't test these:

- Denial of service, volumetric or stress testing
- Social engineering of staff or customers
- Automated scanner output with no demonstrated impact
- Findings that require a compromised device or a malicious browser extension

### Please avoid

- Accessing, modifying or exfiltrating data belonging to anyone but yourself
- Running tests against production data — use `dev.candy.cx` where possible
- Anything that degrades service for real users

## Supported versions

This is a continuously deployed web application. Only the currently deployed
version is supported; there are no maintained release branches.

## Known accepted risks

Tracked openly so reporters do not spend time re-finding them. Each is recorded
in `SECURITY_AUDIT_FRONTEND.md` (see the re-audit dated 2026-08-21) with an
owner and a remediation plan:

- Report Issue attachments are written to S3 directly from the browser, so the
  bundle carries AWS credentials. Being replaced with a backend endpoint.
- Production (`app.candy.cx`) does not yet serve security response headers;
  `dev` and `staging` do.
- The cross-product SpaceMarvel bearer is persisted in `localStorage`, pending a
  tested migration of the cross-app SSO handoff.

Reports about anything on this list are still welcome — particularly if you can
demonstrate greater impact than we have recorded.
