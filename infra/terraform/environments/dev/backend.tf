# Shared state backend (bootstrapped 2026-10-16) — one bucket, shared across
# products; each product/environment gets its own key so state files never
# collide. See docs/architecture/terraform/ (docs repo) for the account.
terraform {
  backend "s3" {
    bucket         = "finxi-terraform-state-ap-south-1"
    key            = "candy-website-frontend/dev.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "finxi-terraform-locks"
    encrypt        = true
  }
}
