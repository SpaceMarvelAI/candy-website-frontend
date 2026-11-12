output "bucket_name" {
  value = module.candy_website_frontend_staging.bucket_name
}

output "legacy_distribution_id" {
  value = module.candy_website_frontend_staging.legacy_distribution_id
}

output "one_domain_distribution_id" {
  value = module.candy_website_frontend_staging.one_domain_distribution_id
}

output "one_domain_distribution_domain_name" {
  value = module.candy_website_frontend_staging.one_domain_distribution_domain_name
}
