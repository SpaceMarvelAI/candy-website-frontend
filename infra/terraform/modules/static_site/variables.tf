# Reusable module: "a static site on S3 (website endpoint), fronted by two
# CloudFront distributions — the old separate-domain alias and the canonical
# one-domain .spacemarvel.ai hostname — serving the same bucket."
#
# Written to DESCRIBE real, already-running infrastructure (confirmed live
# via AWS CLI on 2026-11-12), not to design a from-scratch setup. DNS is NOT
# managed here or anywhere in this repo — Route53 has ZERO hosted zones in
# this account (checked live 2026-11-12); DNS lives outside AWS (Hostinger).
# Every resource below genuinely exists today; this module's job is to
# describe it honestly, including the parts that are NOT best practice
# (public-read bucket + website origin over HTTP), so a future `terraform
# plan` can see drift instead of hiding it.
#
# The one deliberate exception to "everything is code": the shared state
# bucket + lock table (finxi-terraform-state-ap-south-1 / finxi-terraform-locks)
# were bootstrapped by hand (2026-10-16) — see the environments' backend.tf.

variable "bucket_name" {
  description = "Real S3 bucket name, confirmed live. Serves the build output via the S3 website endpoint."
  type        = string
}

variable "sse_bucket_key_enabled" {
  description = <<-EOT
    Live value is NOT uniform: only the candy prod bucket
    (candy-website-frontend) has BucketKeyEnabled=true; every other bucket
    in both products has it false. Pass it per environment.
  EOT
  type        = bool
  default     = false
}

# ── Distributions ───────────────────────────────────────────────────────────
# Two near-identical distributions per environment: `legacy` (old
# separate-domain hostname, kept live during the one-domain transition —
# DISABLED for the two old prod distributions, still enabled for dev and
# staging) and `one_domain` (canonical .spacemarvel.ai hostname, enabled
# everywhere). Same origin, same bucket, same behavior — only the alias /
# cert / response-headers-policy / WAF / enabled flag / error-cache TTLs
# differ. Passing them as explicit objects keeps every real difference
# visible in the calling environment instead of hidden in defaults.

variable "legacy_distribution" {
  description = "Config for the OLD separate-domain distribution. NOT the canonical one — see one_domain_distribution."
  type = object({
    enabled                    = bool
    aliases                    = list(string)
    cert_arn                   = string
    minimum_protocol_version   = string
    default_root_object        = string
    origin_id                  = string
    origin_ssl_protocols       = list(string)
    cache_mode                 = string           # "managed" (cache_policy_id) or "legacy" (ForwardedValues + TTLs)
    response_headers_policy_id = optional(string) # absent on distros with no policy attached (live)
    web_acl_arn                = optional(string) # absent where no WAF is attached (live)
    custom_error_responses = list(object({
      error_code            = number
      response_page_path    = string
      response_code         = string
      error_caching_min_ttl = number
    }))
    comment = string
  })
}

variable "one_domain_distribution" {
  description = "Config for the canonical one-domain .spacemarvel.ai distribution."
  type = object({
    enabled                    = bool
    aliases                    = list(string)
    cert_arn                   = string
    minimum_protocol_version   = string
    default_root_object        = string
    origin_id                  = string
    origin_ssl_protocols       = list(string)
    cache_mode                 = string           # "managed" (cache_policy_id) or "legacy" (ForwardedValues + TTLs)
    response_headers_policy_id = optional(string) # absent on distros with no policy attached (live)
    web_acl_arn                = optional(string) # absent where no WAF is attached (live)
    custom_error_responses = list(object({
      error_code            = number
      response_page_path    = string
      response_code         = string
      error_caching_min_ttl = number
    }))
    comment = string
  })
}

variable "cache_policy_id" {
  description = <<-EOT
    AWS managed "CachingOptimized" cache policy (658327ea-f89d-4fab-a63d-7e88639e58f6),
    used by every distribution whose live cache_mode is "managed". Legacy-mode
    distributions instead carry min_ttl=0 / default_ttl=86400 / max_ttl=31536000
    with no CachePolicyId, confirmed live on the two finixy/candy staging
    aliases. NOT overridable inline — keep this in sync with the live ID.
  EOT
  type        = string
  default     = "658327ea-f89d-4fab-a63d-7e88639e58f6"
}

variable "tags" {
  type    = map(string)
  default = {}
}
