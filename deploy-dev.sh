#!/bin/bash

# Candy Frontend - DEV Deployment Script
# Audit → fix if needed → build → deploy to the DEV S3 bucket → invalidate DEV CloudFront
# See deploy-prod.sh for the PROD path (different bucket/distribution) — keep BOTH working.

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

# ── Step 4: npm audit (scripts/check-audit.mjs — one scoped, documented exception) ──
echo ""
echo "Running npm audit..."
node scripts/check-audit.mjs --audit-level=moderate
if [ $? -ne 0 ]; then
    fail "npm audit found new vulnerabilities beyond the accepted exception — investigate before deploying"
fi

# ── Step 5: semgrep SAST scan ─────────────────────────────────────────────────
echo ""
echo "Running semgrep..."
if ! command -v semgrep &> /dev/null; then
    echo "⚠ semgrep not installed locally — skipping (CI enforces this gate; install semgrep to run it here too)."
else
    semgrep --config auto --error .
    if [ $? -ne 0 ]; then
        fail "semgrep found a blocking finding — investigate before deploying"
    fi
    echo "✓ No semgrep findings."
fi

# ── Step 6: gitleaks secrets scan (full git history) ──────────────────────────
echo ""
echo "Running gitleaks..."
if ! command -v gitleaks &> /dev/null; then
    echo "⚠ gitleaks not installed locally — skipping (CI enforces this gate; install gitleaks to run it here too)."
else
    gitleaks detect --source . --config .gitleaks.toml --exit-code 1
    if [ $? -ne 0 ]; then
        fail "gitleaks detected a secret — investigate before deploying"
    fi
    echo "✓ No secrets detected."
fi

# ── Step 7: Build ─────────────────────────────────────────────────────────────
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
echo "Uploading files to S3 (DEV bucket)..."
aws s3 sync $DIST_FOLDER "s3://$BUCKET_NAME" --delete --region $REGION
if [ $? -ne 0 ]; then
    fail "S3 upload failed — check AWS permissions"
fi
echo "✓ Upload complete."

# ── Step 11: Invalidate CloudFront cache ──────────────────────────────────────
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

# ── Post-deploy: alarms check + deployment scorecard ──────────────────────────
echo "Running post-deploy checks (alarms, scorecard)..."
ALARMS_RESULT="pass"
python3 scripts/check_alarms_ok.py candy-website-frontend-dev || ALARMS_RESULT="fail"

DEPLOY_TAG="candy-website-frontend-dev-$(date -u +%Y-%m-%d-%H%M)"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DEPLOYER="${USER:-unknown}"
python3 scripts/build_scorecard.py dev "$DEPLOY_TAG" "$GIT_SHA" "$DEPLOYER" "$ALARMS_RESULT" \
  || echo "  (scorecard build failed — non-fatal, the deploy above already succeeded)"
echo "Report saved to S3: s3://smai-deploy-scorecards/candy-website-frontend-dev/$(date -u +%Y)/$DEPLOY_TAG.json"

if [ "$ALARMS_RESULT" = "fail" ]; then
    echo "⚠ WARNING: an alarm is firing or suppressed — investigate."
fi
echo ""
