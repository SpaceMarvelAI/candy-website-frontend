#!/bin/bash

# Candy Frontend - Deployment Script
# Audit → fix if needed → build → deploy to S3 → invalidate CloudFront

BUCKET_NAME="candy-website-frontend"
REGION="ap-south-1"
CF_DISTRIBUTION_ID="E2Q1JGL4YRTTQE"
DIST_FOLDER="dist"

function fail() {
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║           DEPLOYMENT FAILED ✗                    ║"
    echo "╠══════════════════════════════════════════════════╣"
    printf  "║  Reason : %-38s ║\n" "$1"
    echo "╠══════════════════════════════════════════════════╣"
    echo "║  Nothing was deployed. Fix the issue and retry.  ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""
    exit 1
}

# ── Step 1: Check AWS credentials ─────────────────────────────────────────────
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    fail "AWS credentials not configured (run: aws configure)"
fi
echo "✓ AWS credentials verified."

# ── Step 2: npm audit ─────────────────────────────────────────────────────────
echo ""
echo "Running npm audit..."
npm audit --audit-level=high 2>&1

if [ $? -ne 0 ]; then
    echo ""
    echo "Vulnerabilities found — running npm audit fix..."
    npm audit fix
    if [ $? -ne 0 ]; then
        fail "npm audit fix failed — run 'npm audit fix --force' manually"
    fi
    echo "✓ Audit fix applied."
else
    echo "✓ No high/critical vulnerabilities found."
fi

# ── Step 3: Build ─────────────────────────────────────────────────────────────
echo ""
echo "Building..."
npm run build
if [ $? -ne 0 ]; then
    fail "Build failed — fix TypeScript/Vite errors and retry"
fi
echo "✓ Build complete."

# ── Step 4: Verify dist exists ────────────────────────────────────────────────
if [ ! -d "$DIST_FOLDER" ]; then
    fail "dist/ folder missing after build"
fi

# ── Step 5: Sync dist to S3 ───────────────────────────────────────────────────
echo ""
echo "Uploading files to S3..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    fail "S3 upload failed — check AWS permissions"
fi
echo "✓ Upload complete."

# ── Step 6: Invalidate CloudFront cache ───────────────────────────────────────
echo ""
echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*" > /dev/null
if [ $? -ne 0 ]; then
    fail "CloudFront invalidation failed — check IAM permissions"
fi
echo "✓ Cache invalidated."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║         DEPLOYMENT SUCCESSFUL ✓                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  URL   : https://app.candy.cx                    ║"
echo "║  Bucket: s3://candy-website-frontend             ║"
echo "║  Region: ap-south-1                              ║"
echo "║  CDN   : CloudFront cache cleared                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Live in ~1-5 mins after cache propagation.      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
