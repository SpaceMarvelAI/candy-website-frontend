output "bucket_name" {
  value = aws_s3_bucket.this.id
}

output "website_endpoint" {
  value = aws_s3_bucket_website_configuration.this.website_endpoint
}

output "legacy_distribution_id" {
  value = try(aws_cloudfront_distribution.legacy[0].id, null)
}

output "legacy_distribution_domain_name" {
  value = try(aws_cloudfront_distribution.legacy[0].domain_name, null)
}

output "one_domain_distribution_id" {
  value = aws_cloudfront_distribution.one_domain.id
}

output "one_domain_distribution_domain_name" {
  value = aws_cloudfront_distribution.one_domain.domain_name
}
