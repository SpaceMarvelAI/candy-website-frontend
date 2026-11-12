provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "candy-website-frontend"
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}
