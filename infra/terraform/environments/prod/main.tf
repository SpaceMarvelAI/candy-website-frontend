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

  legacy_distribution = {
    enabled                    = false # confirmed live: disabled since the one-domain cutover
    aliases                    = ["app.candy.cx"]
    cert_arn                   = "arn:aws:acm:us-east-1:348881530370:certificate/4b40db55-643c-4ec8-bb7e-36816cd9ec56" # *.candy.cx (us-east-1)
    minimum_protocol_version   = "TLSv1.2_2021"
    default_root_object        = "" # confirmed live: EMPTY — no default root object set on this distribution
    origin_id                  = "candy-website-frontend.s3.ap-south-1.amazonaws.com-mp11o6j58qs"
    origin_ssl_protocols       = ["SSLv3", "TLSv1", "TLSv1.1", "TLSv1.2"] # confirmed live — includes SSLv3; describe, don't fix
    cache_mode                 = "managed"
    response_headers_policy_id = "664d73ce-680d-423c-aa96-52543b3e13bf"                                                                                 # confirmed live: candy-frontend-security-headers
    web_acl_arn                = "arn:aws:wafv2:us-east-1:348881530370:global/webacl/CreatedByCloudFront-bed1d5ac/b4f7196c-7502-4017-abb3-4fe94bb74338" # confirmed live; auto-created WAF, NOT managed here
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 10 },
      { error_code = 404, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 300 },
    ]
    comment = "Frontend for Candy website"
  }

  one_domain_distribution = {
    enabled                  = true # confirmed live
    aliases                  = ["candy.spacemarvel.ai"]
    cert_arn                 = "arn:aws:acm:us-east-1:348881530370:certificate/5be9014f-6142-43eb-b2ea-d824b0804485" # *.spacemarvel.ai (us-east-1)
    minimum_protocol_version = "TLSv1.2_2021"
    default_root_object      = "index.html"
    origin_id                = "S3-candy-website-frontend-prod"
    origin_ssl_protocols     = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    cache_mode               = "managed"
    # no response headers policy attached — confirmed live (unlike the legacy distribution)
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
      { error_code = 404, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
    ]
    comment = "candy.spacemarvel.ai prod — one-domain migration 2026-11-04"
  }
}
