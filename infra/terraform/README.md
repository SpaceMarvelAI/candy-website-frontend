# Candy website frontend — Terraform

Describes the **real, already-running** Candy website frontend
infrastructure, confirmed live via `aws s3api` / `aws cloudfront
get-distribution` on 2026-11-12. This is NOT a greenfield design and
applying it raw would be wrong — read this first.

## What exists (all of it, in both environments)

Per environment there is ONE public-read S3 bucket (website endpoint,
`index.html` / `index.html` error document, SSE-S3, `BucketOwnerEnforced`,
no versioning, no CORS — HTTP origin to CloudFront) and TWO CloudFront
distributions serving it:

| Environment | Bucket | Old separate-domain (alias) distribution | Canonical one-domain distribution |
|---|---|---|---|
| prod | `candy-website-frontend` | `E2Q1JGL4YRTTQE` — `app.candy.cx` — **disabled** since 2026-11-04 | `E22IMBW0SWNZ71` — `candy.spacemarvel.ai` |
| staging | `candy-website-frontend-staging` | `E3BS248I02OW2P` — `staging.candy.cx` (legacy cache TTLs) | `E27WO5RRQ1KOOG` — `candy-staging.spacemarvel.ai` |
| dev | `candy-website-frontend-dev` | `EVLANPTONCWM9` — `dev.candy.cx` (+ auto-created WAF) | `E1V0ZANKSQP44S` — `candy-dev.spacemarvel.ai` |

Deploys (`deploy-dev.sh` / `deploy-staging.sh` / `deploy-prod.sh`)
`s3 sync` the build into the bucket and invalidate **both** distributions
per environment. Terraform does not manage the app's static assets — only
the infra.

Real oddities, kept honestly in the code:

- the **old prod distribution is DISABLED** (kept, not deleted — cutover
  2026-11-04) and still has SSLv3/TLSv1.0/1.1 origin TLS, NO
  `default_root_object`, and error-cache TTLs of 10s/300s;
- the **candy prod bucket** has `BucketKeyEnabled=true`; every other
  bucket in either product has it false;
- the **staging environment uses legacy cache TTLs** on BOTH distributions
  (no `CachePolicyId`), unlike everything else (AWS managed
  CachingOptimized `658327ea-f89d-4fab-a63d-7e88639e58f6`);
- the **new candy one-domain distributions carry NO response headers
  policy and no WAF**; the **legacy prod and dev distributions carry both**
  (`candy-frontend-security-headers` + auto-created `CreatedByCloudFront-*`
  WAFs on `E2Q1JGL4YRTTQE` / `EVLANPTONCWM9`), and the legacy staging
  distribution carries only the headers policy,

Deliberately NOT managed here (all confirmed live, all out of scope):

- **WAF web ACLs** (auto-created `CreatedByCloudFront-*` — referenced
  only by ARN; not created or owned here).
- **ACM certificates** (us-east-1; referenced by ARN only).
- **DNS** — Route53 in this account is **empty** (checked 2026-11-12);
  DNS lives outside AWS (Hostinger).
- **Response-headers policies** — referenced by ID
  (`candy-frontend-security-headers`); created manually, not managed here.

## Backend

State lives in the shared S3 bucket `finxi-terraform-state-ap-south-1`
(lock table `finxi-terraform-locks`), one key per environment —
`candy-website-frontend/<env>.tfstate`. Same bucket the ECS-product
terraforms use.

## Using it

```bash
cd infra/terraform/environments/prod
terraform init        # reads the shared state bucket; needs AWS creds
terraform validate
terraform plan        # only meaningful after import; expect errors until then
```

Before any real apply, every resource must be imported (`terraform import`)
into its environment's state — the state keys start empty. `terraform
import` order: bucket → website configuration → ownership controls →
public access block → encryption → bucket policy → both distributions.
