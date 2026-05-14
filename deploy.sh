#!/bin/bash

# Candy Frontend - Deployment Script
# Deploys dist/ to S3 and invalidates CloudFront cache

BUCKET_NAME="candy-website-frontend"
REGION="ap-south-1"
CF_DISTRIBUTION_ID="E2Q1JGL4YRTTQE"
DIST_FOLDER="dist"

# Verify dist folder exists
if [ ! -d "$DIST_FOLDER" ]; then
    echo "Error: '$DIST_FOLDER' folder not found. Run 'npm run build' first."
    exit 1
fi

echo "Deploying Candy Frontend..."
echo "Using AWS credentials from environment/config"

# Step 1: Sync dist to S3
echo "Uploading files to S3..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    echo "Failed to upload files to S3."
    exit 1
fi
echo "Upload complete."

# Step 2: Invalidate CloudFront cache
echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*" > /dev/null
if [ $? -ne 0 ]; then
    echo "Failed to invalidate CloudFront cache."
    exit 1
fi
echo "Cache invalidated."

echo ""
echo "Deployment complete!"
echo "URL: https://app.candy.cx"
echo ""
echo "Note: CloudFront cache invalidation takes 1-5 minutes to propagate."
