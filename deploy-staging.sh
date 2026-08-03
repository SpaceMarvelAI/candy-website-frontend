#!/bin/bash

# Candy Frontend - STAGING Deployment Script
# Audit → fix if needed → build → deploy to the STAGING S3 bucket → invalidate STAGING CloudFront
# See deploy-prod.sh for the PROD path (different bucket/distribution) — keep BOTH working.

BUCKET_NAME="candy-website-frontend-staging"
REGION="ap-south-1"
CF_DISTRIBUTION_ID="E3BS248I02OW2P"
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
# NOTE (staging only, same as dev): audit-fix failures don't block staging deploys —
# see deploy-dev.sh's note on the one remaining high-severity finding. Prod's
# deploy-prod.sh still enforces this gate — don't remove it there without the same review.
echo ""
echo "Running npm audit..."
npm audit --audit-level=high 2>&1

if [ $? -ne 0 ]; then
    echo ""
    echo "Vulnerabilities found — running npm audit fix..."
    npm audit fix
    if [ $? -ne 0 ]; then
        echo "⚠ npm audit fix couldn't clear everything (likely needs --force / a breaking change)."
        echo "⚠ Continuing anyway — this is a STAGING deploy. Do not skip this gate for prod."
    else
        echo "✓ Audit fix applied."
    fi
else
    echo "✓ No high/critical vulnerabilities found."
fi

# ── Step 3: Build ─────────────────────────────────────────────────────────────
# --mode staging picks up .env.staging (staging-subdomain backend URLs) instead
# of the base .env (prod URLs) or .env.development (dev URLs).
echo ""
echo "Building (mode=staging)..."
npm run build -- --mode staging
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
echo "Uploading files to S3 (STAGING bucket)..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    fail "S3 upload failed — check AWS permissions"
fi
echo "✓ Upload complete."

# ── Step 6: Invalidate CloudFront cache ───────────────────────────────────────
echo ""
echo "Invalidating CloudFront cache (STAGING distribution)..."
aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*" > /dev/null
if [ $? -ne 0 ]; then
    fail "CloudFront invalidation failed — check IAM permissions"
fi
echo "✓ Cache invalidated."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      STAGING DEPLOYMENT SUCCESSFUL ✓             ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  URL   : https://staging.candy.cx                ║"
echo "║  Bucket: s3://candy-website-frontend-staging     ║"
echo "║  Region: ap-south-1                              ║"
echo "║  CDN   : CloudFront cache cleared                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Live in ~1-5 mins after cache propagation.      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
