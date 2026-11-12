output "bucket_name" {
  value = module.candy_website_frontend_prod.bucket_name
}

output "legacy_distribution_id" {
  value = module.candy_website_frontend_prod.legacy_distribution_id
}

output "one_domain_distribution_id" {
  value = module.candy_website_frontend_prod.one_domain_distribution_id
}

output "one_domain_distribution_domain_name" {
  value = module.candy_website_frontend_prod.one_domain_distribution_domain_name
}
