#!/usr/bin/env python3
"""
Performance & Scalability Health Checklist — DEV environment only.

Thin per-environment entry point (mirroring deploy-dev-github.sh being its own
file, not a --env flag on one script). All real check logic, scoring rules,
and the HONESTY NOTE on habit/manual items live in _perf_scalability_lib.py.

Usage:
    python3 scripts/perf_scalability_checklist_dev.py
    python3 scripts/perf_scalability_checklist_dev.py --no-upload
    python3 scripts/perf_scalability_checklist_dev.py --manual-scores manual_scores.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _perf_scalability_lib import run_one  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="ap-south-1")
    ap.add_argument("--manual-scores", default=None)
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--no-interactive", action="store_true",
                     help="don't prompt for habit/manual items (e.g. cron/CI runs); "
                          "by default, from a real terminal, unscored items are asked "
                          "interactively (y/N) and score a flat 3 on yes")
    args = ap.parse_args()

    manual = {}
    if args.manual_scores:
        manual = json.loads(Path(args.manual_scores).read_text())

    run_one("dev", region=args.region, manual=manual, no_upload=args.no_upload,
             interactive=not args.no_interactive)


if __name__ == "__main__":
    main()
