#!/bin/bash

# Candy Frontend - DEV Deployment Script
# Audit → fix if needed → build → deploy to the DEV S3 bucket → invalidate DEV CloudFront
# See deploy.sh for the PROD path (different bucket/distribution) — keep BOTH working.

BUCKET_NAME="candy-website-frontend-dev"
REGION="ap-south-1"
CF_DISTRIBUTION_ID="EVLANPTONCWM9"
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
# NOTE (dev only): audit-fix failures don't block dev deploys — the one remaining
# high-severity finding needs `--force` (a breaking react-router-dom downgrade),
# which is a deliberate call to make separately, not something to force through
# on a routine deploy. Prod's deploy.sh still enforces this gate — don't remove
# it there without the same review.
echo ""
echo "Running npm audit..."
npm audit --audit-level=high 2>&1

if [ $? -ne 0 ]; then
    echo ""
    echo "Vulnerabilities found — running npm audit fix..."
    npm audit fix
    if [ $? -ne 0 ]; then
        echo "⚠ npm audit fix couldn't clear everything (likely needs --force / a breaking change)."
        echo "⚠ Continuing anyway — this is a DEV deploy. Do not skip this gate for prod."
    else
        echo "✓ Audit fix applied."
    fi
else
    echo "✓ No high/critical vulnerabilities found."
fi

# ── Step 3: Build ─────────────────────────────────────────────────────────────
# --mode development picks up .env.development (dev-subdomain backend URLs) instead
# of the base .env (prod URLs) — without this flag the dev site was silently built
# against production backends. Fixed 2026-07-25.
echo ""
echo "Building (mode=development)..."
npm run build -- --mode development
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
echo "Uploading files to S3 (DEV bucket)..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    fail "S3 upload failed — check AWS permissions"
fi
echo "✓ Upload complete."

# ── Step 6: Invalidate CloudFront cache ───────────────────────────────────────
echo ""
echo "Invalidating CloudFront cache (DEV distribution)..."
aws cloudfront create-invalidation --distribution-id $CF_DISTRIBUTION_ID --paths "/*" > /dev/null
if [ $? -ne 0 ]; then
    fail "CloudFront invalidation failed — check IAM permissions"
fi
echo "✓ Cache invalidated."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      DEV DEPLOYMENT SUCCESSFUL ✓                 ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  URL   : https://dev.candy.cx                    ║"
echo "║  Bucket: s3://candy-website-frontend-dev         ║"
echo "║  Region: ap-south-1                              ║"
echo "║  CDN   : CloudFront cache cleared                ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Live in ~1-5 mins after cache propagation.      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
