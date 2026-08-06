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

# ── Step 2: Type check ────────────────────────────────────────────────────────
echo ""
echo "Type-checking..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    fail "Type errors found — fix them and retry"
fi
echo "✓ No type errors."

# ── Step 3: Tests + coverage ──────────────────────────────────────────────────
echo ""
echo "Running tests..."
npx vitest run --coverage
if [ $? -ne 0 ]; then
    fail "Tests failed — fix them and retry"
fi
echo "✓ All tests passed."

# ── Step 4: npm audit ─────────────────────────────────────────────────────────
# GHSA-qwww-vcr4-c8h2 (react-router CSRF in RSC/Framework Mode action handling) is a known,
# accepted exception — this app uses HashRouter (Declarative Mode), which the advisory itself
# states is NOT affected. No fixed version exists yet in the 7.12.0-8.2.0 flagged range (checked
# 2026-07-26); downgrading to <7.12.0 to silence the scanner would reintroduce 14+ real, patched
# vulnerabilities, so that's not an option. Any OTHER finding at/above the configured level still
# blocks the deploy — see scripts/check-audit.mjs for the shared implementation (also used by
# buildspec.yml and deploy-dev.sh/deploy-staging.sh, so this logic lives in exactly one place).
echo ""
echo "Running npm audit..."
node scripts/check-audit.mjs --audit-level=moderate
if [ $? -ne 0 ]; then
    fail "npm audit found new vulnerabilities beyond the accepted GHSA-qwww-vcr4-c8h2 exception — investigate before deploying"
fi

# ── Step 5: semgrep SAST scan ─────────────────────────────────────────────────
echo ""
echo "Running semgrep..."
if ! command -v semgrep &> /dev/null; then
    fail "semgrep not installed — required for a prod deploy (install it, or run via buildspec.yml/CI instead)"
fi
semgrep --config auto --error .
if [ $? -ne 0 ]; then
    fail "semgrep found a blocking finding — investigate before deploying"
fi
echo "✓ No semgrep findings."

# ── Step 6: gitleaks secrets scan (full git history) ──────────────────────────
echo ""
echo "Running gitleaks..."
if ! command -v gitleaks &> /dev/null; then
    fail "gitleaks not installed — required for a prod deploy (install it, or run via buildspec.yml/CI instead)"
fi
gitleaks detect --source . --config .gitleaks.toml --exit-code 1
if [ $? -ne 0 ]; then
    fail "gitleaks detected a secret — investigate before deploying"
fi
echo "✓ No secrets detected."

# ── Step 7: Build ─────────────────────────────────────────────────────────────
echo ""
echo "Building..."
npm run build
if [ $? -ne 0 ]; then
    fail "Build failed — fix TypeScript/Vite errors and retry"
fi
echo "✓ Build complete."

# ── Step 8: Bundle size budget ────────────────────────────────────────────────
echo ""
echo "Checking bundle size..."
node -e "
  import('./scripts/lib/bundle-size.mjs').then(({checkBundleSize}) => {
    const r = checkBundleSize(process.cwd());
    console.log(r.detail);
    if (r.status === 'fail') process.exit(1);
  });
"
if [ $? -ne 0 ]; then
    fail "Bundle size budget exceeded — investigate before deploying"
fi

# ── Step 9: Verify dist exists ────────────────────────────────────────────────
if [ ! -d "$DIST_FOLDER" ]; then
    fail "dist/ folder missing after build"
fi

# ── Step 10: Sync dist to S3 ──────────────────────────────────────────────────
echo ""
echo "Uploading files to S3..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    fail "S3 upload failed — check AWS permissions"
fi
echo "✓ Upload complete."

# ── Step 11: Invalidate CloudFront cache ──────────────────────────────────────
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
