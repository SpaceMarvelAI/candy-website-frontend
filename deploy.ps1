# Candy Frontend - Deployment Script
# Deploys dist/ to S3 and invalidates CloudFront cache

$BUCKET_NAME = "candy-website-frontend"
$REGION = "ap-south-1"
$CF_DISTRIBUTION_ID = "E2Q1JGL4YRTTQE"
$DIST_FOLDER = "dist"

# Verify dist folder exists
if (-not (Test-Path $DIST_FOLDER)) {
    Write-Host "Error: '$DIST_FOLDER' folder not found. Run 'npm run build' first." -ForegroundColor Red
    exit 1
}

Write-Host "Deploying Candy Frontend..." -ForegroundColor Cyan
Write-Host "Using AWS credentials from environment/config" -ForegroundColor Yellow

# Step 1: Sync dist to S3
Write-Host "Uploading files to S3..." -ForegroundColor Yellow
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload files to S3." -ForegroundColor Red
    exit 1
}
Write-Host "Upload complete." -ForegroundColor Green

# Step 2: Invalidate CloudFront cache
Write-Host "Invalidating CloudFront cache..." -ForegroundColor Yellow
aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to invalidate CloudFront cache." -ForegroundColor Red
    exit 1
}
Write-Host "Cache invalidated." -ForegroundColor Green

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host "URL: https://app.candy.cx" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: CloudFront cache invalidation takes 1-5 minutes to propagate." -ForegroundColor Gray
