#!/usr/bin/env python3
"""
Stage 3 + 5 scorecard builder (DEPLOYMENT_SCORECARD.md §3.1/3.2), adapted for a static
S3 + CloudFront site (candy-website-frontend) — no ALB/ECS here, so this reads CloudFront's own
metrics instead. Run 15-30 min after a deploy so CloudFront's 5-minute-granularity metrics have
real post-deploy data. Writes the result to S3 (same shared bucket as every other repo's
scorecard, smai-deploy-scorecards).

Adapted directly from Finixy_workflow's build_scorecard.py (same repo shape: static Vite/React
site, S3+CloudFront, no CodeBuild). See that file's docstring for the full rationale on what's
`null` here and why (no canary concept, no per-request latency metric for CloudFront, no DB/
backend metrics — this repo has none of those).

**IMPORTANT: CloudFront metrics only exist in us-east-1, regardless of which region the
distribution itself serves from or where its S3 origin lives.** Confirmed directly.

Usage:
    python3 scripts/build_scorecard.py <environment> <deploy_id> [git_sha] [deployer] [alarms_result] [--version=X.Y]
    python3 scripts/build_scorecard.py staging candy-website-frontend-staging-2026-08-11-1400 abc1234 raju
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

S3_BUCKET = "smai-reports"  # renamed from smai-deploy-scorecards 2026-08-19 — bucket now holds more than deployment scorecards (perf/scalability + strix too)
SERVICE_NAME = "candy-website-frontend"

# S3 layout standardized 2026-08-19: {product}/{component}/deployment/{env}/...
# instead of the old flat {service}-{env}/... scheme. Old data stays at its old paths
# (no migration) — only new uploads go here.
S3_PRODUCT = "candy"
S3_COMPONENT = "frontend"
CLOUDFRONT_REGION = "us-east-1"  # metrics only exist here, not the distribution's own region

ENV_CONFIG = {
    "dev": {"distribution_id": "EVLANPTONCWM9", "base_url": "https://dev.candy.cx"},
    "staging": {"distribution_id": "E3BS248I02OW2P", "base_url": "https://staging.candy.cx"},
    "prod": {"distribution_id": "E2Q1JGL4YRTTQE", "base_url": "https://app.candy.cx"},
}


def _run_aws(args):
    out = subprocess.run(["aws"] + args, capture_output=True, text=True)
    if out.returncode != 0:
        print(f"aws {' '.join(args)} failed (exit {out.returncode}):")
        print(out.stderr)
        sys.exit(1)
    return out.stdout


def get_metric_stat(metric_name, distribution_id, stat, start, end):
    dims_json = json.dumps([
        {"Name": "DistributionId", "Value": distribution_id},
        {"Name": "Region", "Value": "Global"},
    ])
    stdout = _run_aws([
        "cloudwatch", "get-metric-statistics",
        "--namespace", "AWS/CloudFront",
        "--metric-name", metric_name,
        "--dimensions", dims_json,
        "--start-time", start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--end-time", end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "--period", str(int((end - start).total_seconds())),
        "--statistics", stat,
        "--region", CLOUDFRONT_REGION,
        "--output", "json",
    ])
    datapoints = json.loads(stdout).get("Datapoints", [])
    if not datapoints:
        return None
    return datapoints[0].get(stat)


def build_stages(env, deploy_id, git_sha, deployer):
    cfg = ENV_CONFIG[env]
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=30)

    error_rate_5xx_pct = get_metric_stat("5xxErrorRate", cfg["distribution_id"], "Average", window_start, now)
    error_rate_4xx_pct = get_metric_stat("4xxErrorRate", cfg["distribution_id"], "Average", window_start, now)
    request_count = get_metric_stat("Requests", cfg["distribution_id"], "Sum", window_start, now)

    return {
        "pre_deploy": {
            "tests": "pass",  # this script only runs after a build that already passed all gates
            "vuln_scan": "pass",  # npm audit + semgrep + gitleaks, all gates in deploy-{env}.sh
            "migration": "not applicable",  # static site, no database
        },
        "canary": {
            "duration_min": None,
            "traffic_pct": None,
            "auto_rollback_fired": None,
        },
        "post_deploy": {
            "p95_ms": {"current": None, "baseline": None, "delta_pct": None},
            "p99_ms": {"current": None, "baseline": None, "delta_pct": None},
            "error_rate_5xx_pct": round(error_rate_5xx_pct, 3) if error_rate_5xx_pct is not None else None,
            "error_rate_4xx_pct": round(error_rate_4xx_pct, 3) if error_rate_4xx_pct is not None else None,
            "request_count_30min": int(request_count) if request_count is not None else None,
            "pool_utilization_pct": None,
            "provider_latency_p95_ms": None,
            "task_boot_time_seconds": None,
        },
        "health_checklist": {
            "ready_all_tasks": _site_responds(cfg["base_url"]),
            "smoke": "not run",
            "new_error_signatures": None,
            "alarms_ok": None,  # filled in by the caller
        },
    }


def _site_responds(base_url):
    out = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "10", base_url],
        capture_output=True, text=True,
    )
    return out.stdout.strip() == "200"


def get_baseline(env):
    out = subprocess.run(
        ["aws", "s3", "cp", f"s3://{S3_BUCKET}/{S3_PRODUCT}/{S3_COMPONENT}/deployment/{env}/latest-pass.json", "-"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def main():
    # --version=X.Y is an optional flag (not a positional arg) so it doesn't disturb any
    # existing positional call sites across the different repos' deploy scripts. Deploy
    # scripts compute the next version from the repo's VERSION file but deliberately do NOT
    # commit it themselves (kept as a manual step) — this just records whatever they pass.
    version = "unknown"
    args = []
    for a in sys.argv[1:]:
        if a.startswith("--version="):
            version = a.split("=", 1)[1]
        else:
            args.append(a)

    if len(args) < 2:
        print(__doc__)
        sys.exit(1)

    env = args[0]
    if env not in ENV_CONFIG:
        print(f"Unknown environment {env!r} — expected one of {list(ENV_CONFIG)}")
        sys.exit(1)

    deploy_id = args[1]
    git_sha = args[2] if len(args) > 2 else "unknown"
    deployer = args[3] if len(args) > 3 else "unknown"
    alarms_result = args[4] if len(args) > 4 else "not run"

    baseline = get_baseline(env)
    stages = build_stages(env, deploy_id, git_sha, deployer)
    stages["health_checklist"]["alarms_ok"] = (
        alarms_result == "pass" if alarms_result in ("pass", "fail") else alarms_result
    )

    verdict = "PASS" if stages["health_checklist"]["ready_all_tasks"] else "FAIL"

    scorecard = {
        "schema_version": "1.0",
        "deploy_id": deploy_id,
        "version": version,
        "service": f"{SERVICE_NAME}-{env}",
        "surface": "frontend-static",
        "git_sha": git_sha,
        "deployer": deployer,
        "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baseline_deploy_id": baseline.get("deploy_id") if baseline else None,
        "verdict": verdict,
        "stages": stages,
        "regressions": [],
        "notes": "",
    }

    print(json.dumps(scorecard, indent=2))

    key = f"{S3_PRODUCT}/{S3_COMPONENT}/deployment/{env}/{datetime.now(timezone.utc).year}/{deploy_id}.json"
    local_path = f"/tmp/{deploy_id}.json"
    with open(local_path, "w") as f:
        json.dump(scorecard, f, indent=2)

    _run_aws(["s3", "cp", local_path, f"s3://{S3_BUCKET}/{key}"])
    print(f"\nUploaded to s3://{S3_BUCKET}/{key}")

    if verdict == "PASS":
        _run_aws(["s3", "cp", local_path, f"s3://{S3_BUCKET}/{S3_PRODUCT}/{S3_COMPONENT}/deployment/{env}/latest-pass.json"])
        print(f"Updated s3://{S3_BUCKET}/{SERVICE_NAME}-{env}/latest-pass.json (verdict=PASS)")

    os.remove(local_path)


if __name__ == "__main__":
    main()
