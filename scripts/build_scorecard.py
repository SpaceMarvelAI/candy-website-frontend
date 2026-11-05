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

# Lighthouse's real-world (--throttling-method=provided) score vs its default simulated-4G
# score was deliberately compared live on 2026-11-05 (same investigation as Finixy_workflow,
# same real root cause confirmed there: default run scored low, disabling throttling scored
# ~98/100 on the same CDN/edge). CDN/CloudFront/caching/compression were already independently
# verified correct (cache hits, Brotli, ~200ms TTFB) before concluding this. The real cause:
# this is a client-side-rendered SPA (blank until all JS downloads AND executes), so
# Lighthouse's default mobile-network simulation punishes the initial JS bundle hard. A low
# score here is a CODE issue (bundle size / CSR architecture), not an infrastructure problem --
# flagged explicitly so it isn't mistakenly routed to infra.
LIGHTHOUSE_LOW_SCORE_THRESHOLD = 85  # matches checklist item 1.7's own "target >= 85"


def _lighthouse_reason(perf_score):
    if perf_score is None or perf_score >= LIGHTHOUSE_LOW_SCORE_THRESHOLD:
        return None
    return (
        "REASON: CODE issue, not infra. Confirmed live 2026-11-05 (same investigation as "
        "Finixy_workflow, same real cause) — scores dramatically better with Lighthouse's "
        "network throttling disabled (--throttling-method=provided) vs this score under "
        "Lighthouse's default simulated-4G throttling. CDN/CloudFront/caching/compression were "
        "independently verified correct beforehand (real cache hits, Brotli compression, "
        "~200ms TTFB). Root cause: this is a client-side-rendered SPA — the page stays blank "
        "until all JS downloads AND executes — so the default throttling simulation punishes "
        "the initial JS bundle size hard. Fix is code-level (shrink the bundle and/or change "
        "the rendering strategy), not infrastructure."
    )

# S3 layout standardized 2026-08-19: {product}/{component}/deployment/{env}/...
# instead of the old flat {service}-{env}/... scheme. Old data stays at its old paths
# (no migration) — only new uploads go here.
S3_PRODUCT = "candy"
S3_COMPONENT = "frontend"
CLOUDFRONT_REGION = "us-east-1"  # metrics only exist here, not the distribution's own region

ENV_CONFIG = {
    "dev": {"distribution_id": "E1V0ZANKSQP44S", "base_url": "https://candy-dev.spacemarvel.ai"},
    "staging": {"distribution_id": "E27WO5RRQ1KOOG", "base_url": "https://candy-staging.spacemarvel.ai"},
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


def build_stages(env, deploy_id, git_sha, deployer, lcp_ms=None, cls=None, inp_ms=None, perf_score=None):
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
            # Real Lighthouse run against the just-deployed URL, added 2026-11-05 — see
            # scripts/run-lighthouse.mjs. None fields mean that run failed/was skipped for
            # this deploy (non-fatal — never fabricated).
            "lighthouse": {
                "lcp_ms": lcp_ms,
                "cls": cls,
                "inp_ms": inp_ms,
                "performance_score": {"current": perf_score, "baseline": None, "delta_pct": None},
                "reason_if_low": _lighthouse_reason(perf_score),
            },
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
    # Real Lighthouse numbers, added 2026-11-05 — wired in from scripts/run-lighthouse.mjs's
    # LIGHTHOUSE_RESULT line by each deploy script, post-deploy. None if that run
    # failed/was skipped for this deploy — never a guessed/fabricated number.
    lcp_ms = None
    cls = None
    inp_ms = None
    perf_score = None

    def _parse_num(raw):
        if raw is None or raw == "":
            return None
        try:
            return float(raw) if "." in raw else int(raw)
        except ValueError:
            return None

    args = []
    for a in sys.argv[1:]:
        if a.startswith("--version="):
            version = a.split("=", 1)[1]
        elif a.startswith("--lcp-ms="):
            lcp_ms = _parse_num(a.split("=", 1)[1])
        elif a.startswith("--cls="):
            cls = _parse_num(a.split("=", 1)[1])
        elif a.startswith("--inp-ms="):
            inp_ms = _parse_num(a.split("=", 1)[1])
        elif a.startswith("--perf-score="):
            perf_score = _parse_num(a.split("=", 1)[1])
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
    stages = build_stages(env, deploy_id, git_sha, deployer, lcp_ms, cls, inp_ms, perf_score)
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
        print(f"Updated s3://{S3_BUCKET}/{S3_PRODUCT}/{S3_COMPONENT}/deployment/{env}/latest-pass.json (verdict=PASS)")

    os.remove(local_path)


if __name__ == "__main__":
    main()
