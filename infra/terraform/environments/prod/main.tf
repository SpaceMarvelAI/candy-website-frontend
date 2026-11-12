# Candy website frontend — PROD. Describes the REAL, already-running
# infrastructure confirmed live via AWS CLI on 2026-11-12. Deploys via
# deploy-prod.sh: s3 sync dist/ -> s3://candy-website-frontend -> invalidate
# BOTH distributions (old brand-domain alias + canonical one-domain).
#
# The OLD brand-domain distribution (app.candy.cx, E2Q1JGL4YRTTQE) is
# DISABLED since the one-domain cutover (2026-11-04) but still exists, is
# still attached to its auto-created WAF, has SSLv3/TLSv1.0/1.1 legacy
# origin TLS, a legacy error-cache TTL of 10/300s, and NO
# default_root_object — described honestly, not fixed, because fixing is a
# real change nobody asked for. The canonical one-domain distribution
# (candy.spacemarvel.ai, E22IMBW0SWNZ71) is enabled and normal.
#
# This is the only bucket of the six with BucketKeyEnabled=true.
#
# DO NOT `terraform apply` this against real AWS without importing the
# existing resources first — the state bucket starts empty; apply-without-
# import would try to recreate everything and fail (or worse).

module "candy_website_frontend_prod" {
  source = "../../modules/static_site"

  bucket_name            = "candy-website-frontend" # confirmed live
  sse_bucket_key_enabled = true                     # confirmed live — the ONLY bucket of the six

  one_domain_distribution = {
    enabled                    = true # confirmed live
    aliases                    = ["candy.spacemarvel.ai"]
    cert_arn                   = "arn:aws:acm:us-east-1:348881530370:certificate/5be9014f-6142-43eb-b2ea-d824b0804485" # *.spacemarvel.ai (us-east-1)
    minimum_protocol_version   = "TLSv1.2_2021"
    default_root_object        = "index.html"
    origin_id                  = "S3-candy-website-frontend-prod"
    origin_ssl_protocols       = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    cache_mode                 = "managed"
    response_headers_policy_id = "664d73ce-680d-423c-aa96-52543b3e13bf" # candy-frontend-security-headers (CSP/HSTS/DENY — same policy live on candy-dev)
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
      { error_code = 404, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
    ]
    comment = "candy.spacemarvel.ai prod — one-domain migration 2026-11-04"
  }
}
