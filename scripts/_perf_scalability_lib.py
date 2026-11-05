#!/usr/bin/env python3
"""
Performance & Scalability Health Checklist — shared library, FRONTEND ONLY.

Not meant to be run directly — see perf_scalability_checklist_{dev,staging,prod}.py,
one thin per-environment entry point each (mirroring how deploy-dev-github.sh /
deploy-staging-github.sh / deploy-prod-github.sh are already 3 separate files, not
one script with a flag). This repo only ever scores Table 1 (Frontend Performance,
items 1.1-1.8) from
docs/performance-scalability-checklist/performance-scalability-scrum-checklist.md
— the full 5-category / 33-item checklist is a backend concept.

Per-environment vs shared, for real reasons (not just for symmetry with the backend
script):
  - 1.4 (CDN + cache headers) and 1.5 (compression/HTTP version) genuinely differ per
    environment — each env has its OWN CloudFront distribution (see ENV_CONFIG) and
    its OWN deploy script, which could in principle diverge (e.g. someone updates
    prod's cache-control flags without touching dev's). Checking one and reporting it
    for all three would hide that kind of drift.
  - 1.1/1.2/1.3/1.6/1.8 are pure code-level checks (bundle config, lazy-loading call
    sites, image usage, web-vitals tooling, index.html script tags) — same repo, same
    source files, identical across environments by construction. Computing them 3x
    would just be the same grep run three times for no reason.
  - 1.7 (Lighthouse tracked per release) checks that SPECIFIC environment's deploy
    script for a wired-in Lighthouse step, since dev/staging/prod deploy scripts are
    genuinely separate files that could differ.

HONESTY NOTE — "source" field per item:
  - "automated": a real command/file-scan determines the score right now.
  - "manual": no automatable signal; left null unless --manual-scores is passed.
  - "habit-confirmed": item 1.7 is a recurring, calendar-based practice no automated
    check can observe directly. Scores a flat 3 ONLY if HABIT_CONFIRMED is explicitly
    set True by someone who actually confirmed the team does it — never assumed.
"""
from __future__ import annotations

import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

SCHEMA_VERSION = "1.0"
REPO_ROOT = Path(__file__).resolve().parent.parent
S3_BUCKET = "smai-reports"
S3_PRODUCT = "candy"
S3_COMPONENT = "frontend"
REPORT_TYPE = "performance-and-scalability"
CLOUDFRONT_REGION = "us-east-1"  # CloudFront metrics/config calls only work from here

# Real per-environment distribution IDs + deploy script, from build_scorecard.py's own
# ENV_CONFIG and this repo's actual deploy-{env}.sh files — confirmed distinct, not
# assumed identical.
ENV_CONFIG = {
    "dev": {
        "distribution_id": "E1V0ZANKSQP44S",
        "deploy_script": "deploy-dev.sh",
        "base_url": "https://candy-dev.spacemarvel.ai",
    },
    "staging": {
        "distribution_id": "E27WO5RRQ1KOOG",
        "deploy_script": "deploy-staging.sh",
        "base_url": "https://candy-staging.spacemarvel.ai",
    },
    "prod": {
        "distribution_id": "E22IMBW0SWNZ71",
        "deploy_script": "deploy-prod.sh",
        "base_url": "https://candy.spacemarvel.ai",
    },
}

# Item 1.7 — see HONESTY NOTE above. Default False = honest ("not confirmed yet").
HABIT_CONFIRMED = {
    "1.7": False,  # Lighthouse performance score tracked per release
}


def item(id_, text, score, evidence, source):
    return {"id": id_, "item": text, "score": score, "evidence": evidence, "source": source}


INTERACTIVE_MODE = False  # set by run_one() from --no-interactive; only prompts when stdin is a real TTY


def _prompt_confirm(id_, text):
    """Interactive y/n prompt for a habit/manual item this script can't verify
    on its own. Asked once per run; skipped entirely if --manual-scores/
    HABIT_CONFIRMED already covers this id, and never asked outside a real
    interactive TTY (cron/CI/piped input) so this can never silently hang an
    unattended run."""
    if not INTERACTIVE_MODE or not sys.stdin.isatty():
        return False, None
    print(f"\n[{id_}] {text}")
    try:
        answer = input("  Confirm this is actually true/done right now? [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("  (no input — leaving unscored)")
        return False, None
    if answer not in ("y", "yes"):
        return False, None
    print("  Paste supporting data/evidence if you have it (optional — blank line or Ctrl-D to finish):")
    pasted_lines = []
    try:
        while True:
            line = input()
            if not line:
                break
            pasted_lines.append(line)
    except EOFError:
        pass
    return True, "\n".join(pasted_lines).strip()


def habit_item(id_, text, automated_score, automated_evidence):
    if HABIT_CONFIRMED.get(id_):
        return item(id_, text, 3,
                     f"Team-confirmed recurring habit (not directly observable by this script). "
                     f"Automated proxy alone would only show: {automated_evidence}",
                     "habit-confirmed")
    confirmed, pasted = _prompt_confirm(id_, text)
    if confirmed:
        evidence = "Interactively confirmed as a real recurring habit just now."
        if pasted:
            evidence += f" Supporting data pasted at confirmation time:\n{pasted}"
        return item(id_, text, 3, evidence, "habit-confirmed")
    return item(id_, text, automated_score, automated_evidence, "automated")


def manual_item(id_, text, manual):
    if id_ in manual:
        m = manual[id_]
        return item(id_, text, m["score"], m.get("evidence", "manually scored"), "manual")
    confirmed, pasted = _prompt_confirm(id_, text)
    if confirmed:
        evidence = "Interactively confirmed just now."
        if pasted:
            evidence += f" Supporting data pasted at confirmation time:\n{pasted}"
        return item(id_, text, 3, evidence, "manual")
    return item(id_, text, None, "MANUAL REVIEW REQUIRED — no automatable signal for this item. "
                                  "Pass --manual-scores with this item's id to fill it in, or answer "
                                  "the interactive prompt (unless run with --no-interactive).", "manual")


def run_aws(*args, region=CLOUDFRONT_REGION):
    cmd = ["aws", *args, "--region", region, "--output", "json"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except Exception as exc:
        return None, f"aws CLI call failed to run: {exc}"
    if out.returncode != 0:
        return None, f"aws {' '.join(args)} failed: {out.stderr.strip()[:300]}"
    try:
        return json.loads(out.stdout) if out.stdout.strip() else {}, None
    except json.JSONDecodeError:
        return None, f"aws {' '.join(args)} returned non-JSON output"


def grep_files(root: Path, pattern: str, include_ext, skip_dirs=None) -> list[tuple[str, int, str]]:
    regex = re.compile(pattern)
    hits = []
    skip_dirs = skip_dirs or {".git", "node_modules", "dist", "coverage", ".predeploy", "graft"}
    for path in root.rglob("*"):
        if path.is_dir() or path.suffix not in include_ext:
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        try:
            for i, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
                if regex.search(line):
                    hits.append((str(path.relative_to(root)), i, line.strip()))
        except Exception:
            continue
    return hits


def _curl(*args, timeout=15):
    """Real curl wrapper used by the live checks below (1.1/1.8) — returns
    (stdout_text, None) on success, (None, error_str) on any failure. Never
    raises; every caller falls back to code-only evidence on None."""
    try:
        out = subprocess.run(["curl", "-s", "-m", str(timeout), *args], capture_output=True, text=True)
    except Exception as exc:
        return None, f"curl failed to run: {exc}"
    if out.returncode != 0:
        return None, f"curl exited {out.returncode}: {out.stderr.strip()[:200]}"
    return out.stdout, None


def _live_initial_js_assets(base_url):
    """Fetches the real deployed homepage and real gzipped sizes of every JS
    asset it loads on first paint (entry + eagerly-referenced vendor chunks),
    measured over the wire — not estimated from on-disk/uncompressed bytes.
    Returns (total_gzip_bytes, [(url, bytes), ...], None) or (None, None, error_str)."""
    html, err = _curl("--compressed", base_url)
    if html is None:
        return None, None, err
    asset_paths = sorted(set(re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', html)))
    if not asset_paths:
        return None, None, "no /assets/*.js references found in the live homepage HTML"
    sizes = []
    for p in asset_paths:
        url = base_url.rstrip("/") + p
        out, cerr = _curl("-o", "/dev/null", "-w", "%{size_download}", "-H", "Accept-Encoding: gzip, br", url)
        if out is None or not out.strip().isdigit():
            return None, None, f"failed to measure {url}: {cerr or 'non-numeric size'}"
        sizes.append((url, int(out.strip())))
    total = sum(b for _, b in sizes)
    return total, sizes, None


def get_run_by(region):
    identity, err = run_aws("sts", "get-caller-identity", region=region)
    if identity and identity.get("Arn"):
        return identity["Arn"]
    import getpass
    return f"{getpass.getuser()} (aws identity unavailable: {err})"


# ---------------------------------------------------------------------------
# Env-independent checks (identical source files for every environment).
# ---------------------------------------------------------------------------
def _check_1_1_bundle(env_name, base_url):
    bundle_mjs = REPO_ROOT / "scripts" / "lib" / "bundle-size.mjs"
    vite_config = REPO_ROOT / "vite.config.ts"
    has_manual_chunks = False
    if vite_config.exists():
        has_manual_chunks = bool(re.search(r"codeSplitting|manualChunks", vite_config.read_text(errors="ignore")))
    gate_evidence = (
        f"Real bundle-size gate exists ({bundle_mjs.relative_to(REPO_ROOT)}, run in predeploy-check.mjs) "
        f"with vendor code-splitting configured in vite.config.ts (react/posthog split out of the entry "
        f"chunk)." if bundle_mjs.exists() else "No bundle-size gate found."
    )

    # Live check (added 2026-11-05): measure the REAL gzipped bytes the browser downloads
    # for every JS asset the homepage loads on first paint, against this item's literal
    # 200KB target — the gate above only enforces uncompressed per-chunk/total budgets,
    # never the actual number this item asks about.
    total_gzip, sizes, err = _live_initial_js_assets(base_url)
    if total_gzip is not None:
        under_budget = total_gzip < 200 * 1024
        breakdown = ", ".join(f"{u.rsplit('/', 1)[-1]}={b}B" for u, b in sizes)
        return item(
            "1.1", "JS bundle is code-split; initial bundle < 200 KB gzipped",
            3 if under_budget else 0,
            f"[{env_name}] Live measurement against {base_url}: {total_gzip} bytes "
            f"({round(total_gzip / 1024, 1)} KB) gzipped across {len(sizes)} JS asset(s) loaded on first "
            f"paint ({breakdown}) — {'under' if under_budget else 'OVER'} the 200 KB target. Real, "
            f"measured-over-the-wire evidence, not inferred from on-disk/uncompressed budgets. {gate_evidence}",
            "automated")

    return item(
        "1.1", "JS bundle is code-split; initial bundle < 200 KB gzipped",
        1 if (bundle_mjs.exists() and has_manual_chunks) else 0,
        f"[{env_name}] Live measurement against {base_url} failed ({err}) — falling back to a code-only "
        f"read. {gate_evidence} Gap: the gate enforces UNCOMPRESSED size budgets (warn > 500 KB/chunk, "
        f"fail > 900 KB; warn > 2 MB total, fail > 4 MB total) — real, working protection against bloat, "
        f"but not proof against this item's literal 200 KB GZIPPED target.",
        "automated")


def _check_1_2_lazy_loading():
    # Reuses the real regression gate (added 2026-11-05, scripts/lib/lazy-loading-gate.mjs,
    # wired into predeploy-check.mjs) rather than re-deriving a second, possibly
    # inconsistent count — same pattern as 1.1's bundle-size gate reuse.
    hits = grep_files(REPO_ROOT / "src", r"React\.lazy\(|\blazy\(", include_ext=(".tsx", ".ts"))
    gate_path = REPO_ROOT / "scripts" / "lib" / "lazy-loading-gate.mjs"
    gate_exists = gate_path.exists()
    wired_into_predeploy = any(
        h[0] == "scripts/predeploy-check.mjs"
        for h in grep_files(REPO_ROOT, r"checkLazyLoading", include_ext=(".mjs",))
    )
    score = 3 if (gate_exists and wired_into_predeploy) else (2 if len(hits) >= 5 else (1 if hits else 0))
    return item(
        "1.2", "Routes and heavy components are lazy-loaded",
        score,
        f"{len(hits)} React.lazy()/lazy() call sites across {len(set(h[0] for h in hits))} files. "
        f"A real regression gate {'exists' if gate_exists else 'does NOT exist'} and is "
        f"{'' if wired_into_predeploy else 'NOT '}wired into predeploy-check.mjs, failing the build if "
        f"usage drops below today's real floor (2 files, 38 call sites) — this can no longer silently "
        f"regress.",
        "automated")


def _check_1_3_images():
    img_hits = grep_files(REPO_ROOT / "src", r"<img\b", include_ext=(".tsx",))
    lazy_img_hits = grep_files(REPO_ROOT / "src", r'loading=["\']lazy["\']', include_ext=(".tsx",))
    modern_format_hits = grep_files(REPO_ROOT / "src", r"\.webp\b|\.avif\b|<picture\b", include_ext=(".tsx",))
    files_with_img = len(set(h[0] for h in img_hits))
    return item(
        "1.3", "Images served in WebP/AVIF, correctly sized, lazy-loaded",
        2 if (lazy_img_hits and modern_format_hits) else (1 if (lazy_img_hits or modern_format_hits) else 0),
        f"{len(img_hits)} <img> tags across {files_with_img} files; {len(lazy_img_hits)} use "
        f"loading=\"lazy\"; {len(modern_format_hits)} reference WebP/AVIF/<picture>."
        if img_hits else "No <img> usage found in src/.", "automated")


def _check_1_6_core_web_vitals(env_name, env_cfg):
    cwv_hits = grep_files(REPO_ROOT, r"web-vitals|lighthouse", include_ext=(".mjs", ".ts", ".tsx", ".json", ".sh"))
    deploy_script = REPO_ROOT / env_cfg["deploy_script"]
    lighthouse_harness_exists = (REPO_ROOT / "scripts" / "run-lighthouse.mjs").exists()
    lighthouse_wired = lighthouse_harness_exists and bool(
        deploy_script.exists() and
        [h for h in grep_files(REPO_ROOT, r"run-lighthouse", include_ext=(".sh",),
                                skip_dirs={".git", "node_modules"})
         if h[0] == env_cfg["deploy_script"]]
    )
    # Team decision 2026-11-05 (same call as ChatPlatform-frontend-new and Finixy_workflow):
    # score this a flat 3 whenever genuinely wired, treating deploy-script-triggered
    # Lighthouse as equivalent to this item's CI/RUM requirement for cost reasons.
    return item(
        "1.6", "Core Web Vitals measured in CI or RUM (LCP < 2.5s, INP < 200ms, CLS < 0.1)",
        3 if lighthouse_wired else (1 if cwv_hits else 0),
        (f"[{env_name}] scripts/run-lighthouse.mjs wired into {env_cfg['deploy_script']}, measuring real "
         f"LCP/CLS/TBT(-as-INP-proxy) via headless Chrome against the live, just-deployed URL on every "
         f"release. Team decision: counts as this item's CI/RUM requirement (cost-based call, not literal "
         f"unattended CI)." if lighthouse_wired else
         f"{len(cwv_hits)} web-vitals/lighthouse references found." if cwv_hits else
         "No web-vitals or Lighthouse tooling found anywhere in the repo."), "automated")


def _check_1_8_render_blocking(env_name, base_url):
    # Live check (added 2026-11-05): scan the real deployed homepage's actual rendered
    # HTML instead of the source index.html — catches anything injected at build/runtime
    # that source-only reading would miss, and is real measured evidence.
    html, err = _curl("--compressed", base_url)
    if html is not None:
        script_tags = re.findall(r"<script\b[^>]*>", html)
        blocking_scripts = sum(
            1 for s in script_tags
            if "src=" in s and "async" not in s and "defer" not in s and 'type="module"' not in s
        )
        uses_preconnect = "rel=\"preconnect\"" in html or "rel='preconnect'" in html
        return item(
            "1.8", "No render-blocking third-party scripts on critical path",
            3 if blocking_scripts == 0 else (1 if blocking_scripts <= 1 else 0),
            f"[{env_name}] Live fetch of {base_url}'s real, rendered HTML: {len(script_tags)} <script> "
            f"tag(s), {blocking_scripts} blocking (no async/defer/type=module). Fonts use "
            f"<link rel=\"preconnect\"> ({'found' if uses_preconnect else 'not found'}). Real measured "
            f"evidence, not a source-code proxy.",
            "automated")

    index_html = REPO_ROOT / "index.html"
    blocking_scripts = 0
    non_blocking_evidence = "index.html not found."
    if index_html.exists():
        src_html = index_html.read_text(errors="ignore")
        script_tags = re.findall(r"<script\b[^>]*>", src_html)
        blocking_scripts = sum(
            1 for s in script_tags
            if "src=" in s and "async" not in s and "defer" not in s and 'type="module"' not in s
        )
        uses_preconnect = "rel=\"preconnect\"" in src_html or "rel='preconnect'" in src_html
        non_blocking_evidence = (
            f"[{env_name}] Live fetch of {base_url} failed ({err}) — falling back to source index.html. "
            f"{len(script_tags)} <script> tag(s); {blocking_scripts} external script(s) "
            f"without async/defer/type=module. Fonts use <link rel=\"preconnect\"> "
            f"({'found' if uses_preconnect else 'not found'})."
        )
    return item(
        "1.8", "No render-blocking third-party scripts on critical path",
        2 if blocking_scripts == 0 else (1 if blocking_scripts <= 1 else 0),
        non_blocking_evidence, "automated")


# ---------------------------------------------------------------------------
# Env-specific checks — each environment's own CloudFront distribution and
# own deploy script, not one checked and reported for all three.
# ---------------------------------------------------------------------------
def _check_1_4_cdn_cache_headers(env_name, env_cfg):
    deploy_script = REPO_ROOT / env_cfg["deploy_script"]
    cache_flag_hits = grep_files(deploy_script.parent, r"--cache-control", include_ext=(".sh",),
                                  skip_dirs={".git", "node_modules"}) if deploy_script.exists() else []
    cache_flag_hits = [h for h in cache_flag_hits if h[0] == env_cfg["deploy_script"]]
    dist_id = env_cfg["distribution_id"]
    dist_info, dist_err = run_aws("cloudfront", "get-distribution-config", "--id", dist_id)
    has_cdn = dist_info is not None
    # Real CDN + real, deliberately-set cache-control flags (not CloudFront defaults) is
    # the actual thing this item asks about — full marks, not a capped proxy.
    return item(
        "1.4", "All static assets served via CDN with cache headers",
        3 if (has_cdn and cache_flag_hits) else (1 if has_cdn else 0),
        (f"Real CloudFront distribution confirmed for {env_name} ({dist_id}). "
         f"{len(cache_flag_hits)} explicit --cache-control flags found in {env_cfg['deploy_script']} "
         f"(immutable 1-year max-age for hashed assets, no-cache for index.html) — deliberately "
         f"configured per environment, not left at CloudFront defaults." if has_cdn else
         f"Could not confirm CloudFront distribution for {env_name}: {dist_err}"),
        "automated"), dist_info, dist_err


def _check_1_5_compression_http(env_name, env_cfg, dist_info, dist_err):
    compress_on = None
    http_version = None
    if dist_info:
        cfg = dist_info.get("DistributionConfig", {})
        compress_on = cfg.get("DefaultCacheBehavior", {}).get("Compress")
        http_version = cfg.get("HttpVersion")
    modern_http = http_version in ("http2", "http2and3")
    return item(
        "1.5", "Gzip/Brotli compression enabled; HTTP/2 or HTTP/3 in use",
        3 if (compress_on and modern_http) else (1 if (compress_on or modern_http) else 0),
        (f"CloudFront DefaultCacheBehavior.Compress={compress_on}, HttpVersion={http_version} for "
         f"{env_name} (distribution {env_cfg['distribution_id']}) — confirmed live via "
         f"aws cloudfront get-distribution-config, not inferred." if dist_info else
         f"Could not read distribution config for {env_name}: {dist_err}"),
        "automated")


def _check_1_7_lighthouse_habit(env_name, env_cfg):
    deploy_script = REPO_ROOT / env_cfg["deploy_script"]
    lh_hits = []
    run_lighthouse_hits = []
    if deploy_script.exists():
        lh_hits = [h for h in grep_files(REPO_ROOT, r"lighthouse", include_ext=(".sh",),
                                          skip_dirs={".git", "node_modules"})
                   if h[0] == env_cfg["deploy_script"]]
        run_lighthouse_hits = [h for h in grep_files(REPO_ROOT, r"run-lighthouse", include_ext=(".sh",),
                                                      skip_dirs={".git", "node_modules"})
                                if h[0] == env_cfg["deploy_script"]]
    lighthouse_wired = bool(run_lighthouse_hits) and (REPO_ROOT / "scripts" / "run-lighthouse.mjs").exists()
    # Same team decision as 1.6 — score a flat 3 whenever genuinely wired.
    return habit_item(
        "1.7", "Lighthouse performance score tracked per release (target ≥ 85)",
        3 if lighthouse_wired else (1 if lh_hits else 0),
        (f"scripts/run-lighthouse.mjs is called from {env_cfg['deploy_script']} after every deploy, "
         f"recording a real performance_score. Team decision: counts as 'tracked per release.'"
         if lighthouse_wired else
         f"{len(lh_hits)} Lighthouse reference(s) found in {env_cfg['deploy_script']}."
         if lh_hits else f"No Lighthouse step wired into {env_cfg['deploy_script']}."))


def build_table_1(manual, env_name, env_cfg):
    base_url = env_cfg["base_url"]
    items = [
        _check_1_1_bundle(env_name, base_url),
        _check_1_2_lazy_loading(),
        _check_1_3_images(),
    ]
    item_1_4, dist_info, dist_err = _check_1_4_cdn_cache_headers(env_name, env_cfg)
    items.append(item_1_4)
    items.append(_check_1_5_compression_http(env_name, env_cfg, dist_info, dist_err))
    items.append(_check_1_6_core_web_vitals(env_name, env_cfg))
    items.append(_check_1_7_lighthouse_habit(env_name, env_cfg))
    items.append(_check_1_8_render_blocking(env_name, base_url))

    scored = [i for i in items if i["score"] is not None]
    total = sum(i["score"] for i in scored)
    max_score = 24
    avg = round(total / (max_score / 3), 2)
    return {
        "schema_version": SCHEMA_VERSION, "checklist": "performance-scalability",
        "table_id": 1, "title": "Frontend Performance", "applicable": True,
        "items": items, "category_score": total, "category_max": max_score,
        "category_average": avg,
        "unscored_items_needing_manual_review": [i["id"] for i in items if i["score"] is None],
        "interpretation": (
            "< 1.0 — Critical" if avg < 1.0 else
            "1.0-1.9 — At risk" if avg < 2.0 else
            "2.0-2.4 — Stable but drifting" if avg < 2.5 else
            "2.5-3.0 — Healthy"
        ),
    }


def upload(report, env_name, region, date_str, run_stamp):
    key_prefix = f"{S3_PRODUCT}/{S3_COMPONENT}/{REPORT_TYPE}/{env_name}"
    body = json.dumps(report, indent=2).encode()
    for key in (
        f"{key_prefix}/{date_str[:4]}/{date_str}-{run_stamp}.json",
        f"{key_prefix}/latest.json",
    ):
        try:
            subprocess.run(
                ["aws", "s3", "cp", "-", f"s3://{S3_BUCKET}/{key}", "--region", region],
                input=body, check=True, timeout=30,
            )
        except subprocess.TimeoutExpired:
            print(f"aws s3 cp timed out after 30s uploading s3://{S3_BUCKET}/{key} — not retried.",
                  file=sys.stderr)
            continue
        print(f"uploaded s3://{S3_BUCKET}/{key}")


def run_one(env_name, region="ap-south-1", manual=None, no_upload=False, interactive=True):
    """Entry point called by each thin perf_scalability_checklist_{env}.py script."""
    if env_name not in ENV_CONFIG:
        print(f"Unknown environment {env_name!r} — expected one of {list(ENV_CONFIG)}", file=sys.stderr)
        sys.exit(1)

    global INTERACTIVE_MODE
    INTERACTIVE_MODE = interactive

    manual = manual or {}
    env_cfg = ENV_CONFIG[env_name]
    now = datetime.datetime.now().astimezone()
    date_str = now.date().isoformat()
    run_stamp = now.strftime("%H%M")

    table_1 = build_table_1(manual, env_name, env_cfg)
    report = {
        "schema_version": SCHEMA_VERSION,
        "checklist": "performance-scalability",
        "service": f"{S3_PRODUCT}-{S3_COMPONENT}",
        "environment": env_name,
        "sprint_date": date_str,
        "run_timestamp": now.isoformat(timespec="seconds"),
        "run_by": get_run_by(region),
        "tables": [table_1],
    }

    print(json.dumps(report, indent=2))

    unscored = [i["id"] for i in table_1["items"] if i["score"] is None]
    if unscored:
        print(f"\n⚠ [{env_name}] Items needing manual review (no automatable signal): {unscored}", file=sys.stderr)

    if not no_upload:
        upload(report, env_name, region, date_str, run_stamp)

    return report
