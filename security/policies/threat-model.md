<!-- TEMPLATE-UNADOPTED: review and edit this document, then delete this line. While this line exists the audit does NOT count the document as evidence. -->
# Threat Model

## 1. System summary
What the system does, who uses it, where it runs.

## 2. Assets
| Asset | Why it matters | Classification |
|---|---|---|
| User credentials | account takeover | Restricted |
| Personal data | privacy/regulatory | Confidential |
| Payment tokens | fraud | Restricted |

## 3. Trust boundaries & entry points
Diagram or list: browser ↔ API, API ↔ database, API ↔ third parties, CI/CD ↔ cloud, admin ↔ production.

## 4. Threats (STRIDE or abuse cases)
| # | Threat | Boundary | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|---|
| 1 | Stolen session token reused | browser↔API | M | H | short TTL, HttpOnly, rotation | |
| 2 | Injection via API input | API | M | H | validation, parameterised queries | |
| 3 | Leaked cloud keys in CI | CI↔cloud | M | H | OIDC, no static keys | |

## 5. Residual risks accepted
List with owner and review date.
