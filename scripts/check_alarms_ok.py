#!/usr/bin/env python3
"""
Stage 4.4 CloudWatch alarms-OK check (DEPLOYMENT_SCORECARD.md), adapted for a static
S3 + CloudFront site — confirms no relevant CloudFront alarm is currently in ALARM state and
none has active suppressions, post-deploy.

Copied from the ECS-based check_alarms_ok.py (ChatPlatform-backend etc.) with one real change:
CloudFront alarms only exist in us-east-1 regardless of the distribution's own region —
hardcoded here rather than reading AWS_DEFAULT_REGION, since that's ap-south-1 everywhere else
in this repo's scripts and would silently find zero alarms if reused as-is.

Usage:
    python3 scripts/check_alarms_ok.py <alarm-name-prefix>
    python3 scripts/check_alarms_ok.py candy-website-frontend-staging
"""
import subprocess
import sys
import json

ALARM_REGION = "us-east-1"  # CloudFront alarms only exist here


def _run_aws(args):
    out = subprocess.run(["aws"] + args, capture_output=True, text=True)
    if out.returncode != 0:
        print(f"aws {' '.join(args)} failed (exit {out.returncode}):")
        print(out.stderr)
        sys.exit(1)
    return out.stdout


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    prefix = sys.argv[1]

    stdout = _run_aws([
        "cloudwatch", "describe-alarms",
        "--alarm-name-prefix", prefix,
        "--region", ALARM_REGION,
        "--output", "json",
    ])
    alarms = json.loads(stdout).get("MetricAlarms", [])

    if not alarms:
        print(f"No alarms found with prefix {prefix!r} — nothing to check.")
        return

    problems = []
    for alarm in alarms:
        name = alarm["AlarmName"]
        state = alarm["StateValue"]
        actions_enabled = alarm.get("ActionsEnabled", True)

        print(f"{name}: state={state}, actions_enabled={actions_enabled}")

        if state == "ALARM":
            problems.append(f"{name} is currently in ALARM state")
        if not actions_enabled:
            problems.append(f"{name} has actions DISABLED (a suppression) — won't fire if it should")

    if problems:
        print("\nFAILED:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)

    print(f"\nAll {len(alarms)} alarm(s) OK — none firing, no suppressions active.")


if __name__ == "__main__":
    main()
