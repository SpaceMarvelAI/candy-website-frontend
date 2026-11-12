# Candy website frontend — DEV. Same layout as prod/ and staging/.
# Deploys via deploy-dev.sh: s3 sync dist/ -> s3://candy-website-frontend-dev
# -> invalidate BOTH distributions.
#
# The legacy dev distribution (dev.candy.cx, EVLANPTONCWM9) is still
# ENABLED and carries an auto-created WAF AND the
# candy-frontend-security-headers policy (confirmed live 2026-11-12). The
# canonical one-domain distribution (candy-dev.spacemarvel.ai,
# E1V0ZANKSQP44S) has neither the WAF nor the headers policy — described
# as it really is.
#
# DO NOT `terraform apply` without importing first — see prod/main.tf.

module "candy_website_frontend_dev" {
  source = "../../modules/static_site"

  bucket_name = "candy-website-frontend-dev" # confirmed live

  legacy_distribution = {
    enabled                    = true # confirmed live
    aliases                    = ["dev.candy.cx"]
    cert_arn                   = "arn:aws:acm:us-east-1:348881530370:certificate/4b40db55-643c-4ec8-bb7e-36816cd9ec56" # *.candy.cx (us-east-1)
    minimum_protocol_version   = "TLSv1.2_2021"
    default_root_object        = "index.html"
    origin_id                  = "S3-candy-website-frontend-dev"
    origin_ssl_protocols       = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    cache_mode                 = "managed"
    response_headers_policy_id = "664d73ce-680d-423c-aa96-52543b3e13bf"                                                                                 # confirmed live: candy-frontend-security-headers
    web_acl_arn                = "arn:aws:wafv2:us-east-1:348881530370:global/webacl/CreatedByCloudFront-e42fda9c/3fcb107a-2bd1-45df-af47-56883064da5f" # confirmed live; auto-created WAF, NOT managed here
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
      { error_code = 404, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
    ]
    comment = "Old separate-domain alias for candy-website-frontend-dev"
  }

  one_domain_distribution = {
    enabled                  = true # confirmed live
    aliases                  = ["candy-dev.spacemarvel.ai"]
    cert_arn                 = "arn:aws:acm:us-east-1:348881530370:certificate/5be9014f-6142-43eb-b2ea-d824b0804485" # *.spacemarvel.ai (us-east-1)
    minimum_protocol_version = "TLSv1.2_2021"
    default_root_object      = "index.html"
    origin_id                = "candy-s3-dev"
    origin_ssl_protocols     = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    cache_mode               = "managed"
    # no response headers policy attached — confirmed live
    custom_error_responses = [
      { error_code = 403, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
      { error_code = 404, response_page_path = "/index.html", response_code = "200", error_caching_min_ttl = 0 },
    ]
    comment = "Canonical one-domain distribution for candy-website-frontend-dev (candy-dev.spacemarvel.ai)"
  }

  tags = {
    Product = "candy-website-frontend"
  }
}
