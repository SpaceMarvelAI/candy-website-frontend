# Real resources — all confirmed live 2026-11-12 via aws s3api / aws cloudfront.
# NOT creating anything that doesn't already exist; NOT deleting the things
# that already do. If this is ever applied, imports are required first
# (see ../../README.md) — the state bucket starts empty.

# ── S3 bucket (website-hosted static site) ────────────────────────────────
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_website_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  index_document {
    suffix = "index.html"
  }

  # Real, confirmed live: error document is index.html (SPA fallback) —
  # CloudFront custom error responses additionally map 403/404 -> /index.html.
  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# REAL, confirmed live 2026-11-12: all four "Block Public Access" toggles are
# FALSE — public access is allowed, which is exactly what the
# S3-website-endpoint-behind-CloudFront pattern needs, and what the
# bucket policy below (public s3:GetObject) makes effective. Flagging
# honestly: this is NOT the modern OAC pattern — every distribution's
# origin is the plain website HTTP endpoint, so the bucket is genuinely
# public-read. Hardening (OAC + private bucket + no website endpoint) is a
# real follow-up, deliberately NOT done here.
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    bucket_key_enabled = var.sse_bucket_key_enabled

    apply_server_side_encryption_by_default {
      # Real, confirmed live on all six buckets (this repo's three and
      # Candy's): SSE-S3 (AES256), never SSE-KMS or SSE-C.
      sse_algorithm = "AES256"
    }

    # NOTE: the live config ALSO blocks SSE-C (BlockedEncryptionTypes:
    # ["SSE-C"], confirmed on all six buckets) — the aws_s3_bucket_server_side_
    # encryption_configuration resource has NO argument for it in this
    # provider version, so it cannot be represented here. Documented
    # honestly; do not expect the plan to show or manage that bit.
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id

  # Real, confirmed live: identical PublicReadGetObject statement
  # (Sid, Effect, Principal *, Action s3:GetObject) on all six buckets
  # in both products. No other statements exist.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "arn:aws:s3:::${var.bucket_name}/*"
    }]
  })
}

# NOTE: bucket VERSIONING is disabled on every live bucket (get-bucket-versioning
# returns no Status) and CORS is not configured anywhere — described honestly by
# absence, not by creating or managing anything.

# ── CloudFront distributions ───────────────────────────────────────────────
# Two per environment: the OLD separate-domain alias and the canonical
# one-domain hostname. Same bucket origin over the plain website HTTP
# endpoint — origin_protocol_policy = "http-only", which is REAL,
# confirmed live (the website endpoint has no HTTPS port) — do not "fix"
# this to https-only; that would break every site.

locals {
  # AWS managed "CachingOptimized" — see variables.tf for why this is a
  # constant, not derived from AWS at plan time.
  managed_cache_policy_id = var.cache_policy_id
}

resource "aws_cloudfront_distribution" "legacy" {
  enabled             = var.legacy_distribution.enabled
  is_ipv6_enabled     = true
  http_version        = "http2"
  price_class         = "PriceClass_All"
  comment             = var.legacy_distribution.comment
  default_root_object = var.legacy_distribution.default_root_object != "" ? var.legacy_distribution.default_root_object : null
  web_acl_id          = try(var.legacy_distribution.web_acl_arn, null)
  tags                = merge(var.tags, var.legacy_tags)

  aliases = var.legacy_distribution.aliases

  origin {
    origin_id   = var.legacy_distribution.origin_id
    domain_name = "${var.bucket_name}.s3-website.ap-south-1.amazonaws.com"

    custom_origin_config {
      http_port                = 80
      https_port               = 443 # unused (http-only) but part of the schema
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = var.legacy_distribution.origin_ssl_protocols
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }

    connection_attempts = 3
    connection_timeout  = 10
  }

  default_cache_behavior {
    target_origin_id       = var.legacy_distribution.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["HEAD", "GET"]
    cached_methods         = ["HEAD", "GET"]
    compress               = true

    # cache_mode = "managed" → AWS managed CachingOptimized;
    # cache_mode = "legacy"  → legacy TTLs + ForwardedValues, as confirmed live
    # on the two staging aliases (min 0 / default 86400 / max 31536000).
    dynamic "forwarded_values" {
      for_each = var.legacy_distribution.cache_mode == "legacy" ? [1] : []
      content {
        query_string = false
        cookies {
          forward = "none"
        }
      }
    }

    cache_policy_id            = var.legacy_distribution.cache_mode == "managed" ? local.managed_cache_policy_id : null
    min_ttl                    = var.legacy_distribution.cache_mode == "legacy" ? 0 : null
    default_ttl                = var.legacy_distribution.cache_mode == "legacy" ? 86400 : null
    max_ttl                    = var.legacy_distribution.cache_mode == "legacy" ? 31536000 : null
    response_headers_policy_id = try(var.legacy_distribution.response_headers_policy_id, null)
  }

  dynamic "custom_error_response" {
    for_each = var.legacy_distribution.custom_error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_page_path    = custom_error_response.value.response_page_path
      response_code         = custom_error_response.value.response_code
      error_caching_min_ttl = custom_error_response.value.error_caching_min_ttl
    }
  }

  viewer_certificate {
    # Real ACM cert ARNs (us-east-1 — CloudFront requires it; Route53 in
    # this account is empty, certs were requested manually).
    acm_certificate_arn      = var.legacy_distribution.cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = var.legacy_distribution.minimum_protocol_version
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
      locations        = []
    }
  }
}

resource "aws_cloudfront_distribution" "one_domain" {
  enabled             = var.one_domain_distribution.enabled
  is_ipv6_enabled     = true
  http_version        = "http2"
  price_class         = "PriceClass_All"
  comment             = var.one_domain_distribution.comment
  default_root_object = var.one_domain_distribution.default_root_object != "" ? var.one_domain_distribution.default_root_object : null
  web_acl_id          = try(var.one_domain_distribution.web_acl_arn, null)
  tags                = merge(var.tags, var.one_domain_tags)

  aliases = var.one_domain_distribution.aliases

  origin {
    origin_id   = var.one_domain_distribution.origin_id
    domain_name = "${var.bucket_name}.s3-website.ap-south-1.amazonaws.com"

    custom_origin_config {
      http_port                = 80
      https_port               = 443 # unused (http-only) but part of the schema
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = var.one_domain_distribution.origin_ssl_protocols
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }

    connection_attempts = 3
    connection_timeout  = 10
  }

  default_cache_behavior {
    target_origin_id       = var.one_domain_distribution.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["HEAD", "GET"]
    cached_methods         = ["HEAD", "GET"]
    compress               = true

    dynamic "forwarded_values" {
      for_each = var.one_domain_distribution.cache_mode == "legacy" ? [1] : []
      content {
        query_string = false
        cookies {
          forward = "none"
        }
      }
    }

    cache_policy_id            = var.one_domain_distribution.cache_mode == "managed" ? local.managed_cache_policy_id : null
    min_ttl                    = var.one_domain_distribution.cache_mode == "legacy" ? 0 : null
    default_ttl                = var.one_domain_distribution.cache_mode == "legacy" ? 86400 : null
    max_ttl                    = var.one_domain_distribution.cache_mode == "legacy" ? 31536000 : null
    response_headers_policy_id = try(var.one_domain_distribution.response_headers_policy_id, null)
  }

  dynamic "custom_error_response" {
    for_each = var.one_domain_distribution.custom_error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_page_path    = custom_error_response.value.response_page_path
      response_code         = custom_error_response.value.response_code
      error_caching_min_ttl = custom_error_response.value.error_caching_min_ttl
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.one_domain_distribution.cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = var.one_domain_distribution.minimum_protocol_version
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
      locations        = []
    }
  }
}
