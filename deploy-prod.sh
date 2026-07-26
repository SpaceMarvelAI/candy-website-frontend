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
# GHSA-qwww-vcr4-c8h2 (react-router CSRF in RSC/Framework Mode action handling) is a known,
# accepted exception — this app uses HashRouter (Declarative Mode), which the advisory itself
# states is NOT affected. No fixed version exists yet in the 7.12.0-8.2.0 flagged range (checked
# 2026-07-26); downgrading to <7.12.0 to silence the scanner would reintroduce 14+ real, patched
# vulnerabilities, so that's not an option. Any OTHER high/critical finding still blocks the
# deploy — this only ignores this one specific, verified-non-applicable advisory ID.
echo ""
echo "Running npm audit..."
AUDIT_JSON=$(npm audit --audit-level=high --json 2>&1)
OTHER_ADVISORIES=$(echo "$AUDIT_JSON" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except json.JSONDecodeError:
    print('PARSE_ERROR')
    sys.exit(0)
ids = set()
for v in d.get('vulnerabilities', {}).values():
    for via in v.get('via', []):
        if isinstance(via, dict):
            url = via.get('url', '')
            if 'GHSA-qwww-vcr4-c8h2' not in url:
                ids.add(url or via.get('title', 'unknown'))
print('\n'.join(ids) if ids else 'NONE')
")

if [ "$OTHER_ADVISORIES" = "PARSE_ERROR" ]; then
    fail "npm audit output could not be parsed — investigate manually before deploying"
elif [ "$OTHER_ADVISORIES" != "NONE" ]; then
    echo "$OTHER_ADVISORIES"
    fail "New high/critical vulnerabilities found (beyond the accepted GHSA-qwww-vcr4-c8h2 exception) — investigate before deploying"
else
    echo "✓ No high/critical vulnerabilities found beyond the accepted GHSA-qwww-vcr4-c8h2 exception (non-applicable — this app uses HashRouter, not Framework Mode/RSC)."
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
