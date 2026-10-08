<!-- TEMPLATE-UNADOPTED: review and edit this document, then delete this line. While this line exists the audit does NOT count the document as evidence. -->
# Incident Response Plan

## 1. Roles
| Role | Person | Backup | Contact |
|---|---|---|---|
| Incident commander | | | |
| Technical lead | | | |
| Communications lead | | | |
| Legal / privacy | | | |

## 2. Severity levels
| Level | Definition | Response target |
|---|---|---|
| SEV1 | Confirmed data breach, production compromise, or full outage | Start within 15 min, 24x7 |
| SEV2 | Suspected compromise, partial outage, exposed secret | Within 1 hour |
| SEV3 | Vulnerability with no known exploitation | Next business day |

## 3. Response steps
1. **Detect & triage** — record time, reporter, affected systems, severity.
2. **Contain** — isolate hosts, revoke/rotate credentials, disable accounts, block IPs. Preserve evidence (logs, images) before wiping.
3. **Eradicate** — remove malware/backdoors, patch the root cause.
4. **Recover** — restore from known-good state, monitor closely.
5. **Notify** — see section 4.
6. **Review** — blameless post-incident review within 5 business days; track actions to closure.

## 4. Notification obligations (confirm with legal counsel)
| Law / contract | Trigger | Deadline | Who notifies |
|---|---|---|---|
| GDPR (if EU data subjects) | Personal-data breach likely to risk individuals | 72 hours to supervisory authority | |
| India: CERT-In directions | Specified cyber incidents | 6 hours | |
| India: DPDP Act | Personal data breach | Per Act and Rules | |
| Customer contracts / DPAs | | | |

## 5. Communication templates
- Internal alert, customer notice, regulator notice, public statement: <link or paste drafts>

## 6. Evidence log
Keep a timeline of actions with timestamps and owners (store in security/evidence/).
