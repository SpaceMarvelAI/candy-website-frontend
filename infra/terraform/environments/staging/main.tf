# Candy website frontend — STAGING. Same layout as prod/.
# Deploys via deploy-staging.sh: s3 sync dist/ -> s3://candy-website-frontend-staging
# -> invalidate BOTH distributions.
#
# Staging is the one environment where both distributions GENUINELY use
# LEGACY cache settings (confirmed live 2026-11-12): min TTL 0 / default
# 86400 / max 31536000, ForwardedValues, NO CachePolicyId — and where the
# one-domain distribution has no response headers policy while the legacy
# one carries candy-frontend-security-headers. The one-domain distribution
# also offers TLSv1.2-only back to the origin.
#
# DO NOT `terraform apply` without importing first — see prod/main.tf.

module "candy_website_frontend_staging" {
  source = "../../modules/static_site"

  bucket_name = "candy-website-frontend-staging" # confirmed live

  one_domain_distribution = {
    enabled                    = true # confirmed live
    aliases                    = ["candy-staging.spacemarvel.ai"]
    cert_arn                   = "arn:aws:acm:us-east-1:348881530370:certificate/5be9014f-6142-43eb-b2ea-d824b0804485" # *.spacemarvel.ai (us-east-1)
    minimum_protocol_version   = "TLSv1.2_2021"
    default_root_object        = "index.html"
    origin_id                  = "S3-candy-website-frontend-staging"
    origin_ssl_protocols       = ["TLSv1.2"]                            # confirmed live: TLSv1.2-only to the origin
    cache_mode                 = "legacy"                               # confirmed live: same legacy TTLs + ForwardedValues
    response_headers_policy_id = "664d73ce-680d-423c-aa96-52543b3e13bf" # candy-frontend-security-headers (CSP/HSTS/DENY — same policy live on candy-dev)
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
      # NOTE: no 404 entry — confirmed live
    ]
    comment = "candy-staging.spacemarvel.ai (one-domain staging)"
  }
}
