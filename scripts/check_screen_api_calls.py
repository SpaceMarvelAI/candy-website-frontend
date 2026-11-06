#!/usr/bin/env python3
"""
Real check for checklist item 2.4 ("Endpoints are batched/aggregated — no screen
needs > 3 API calls") — added 2026-11-06.

Real investigation (2026-11-06): this repo is a Vite + react-router-dom app. Real
routes live in src/App.tsx's <Route path=... element={<X /... /> list, where each
X is a `const X = lazy(() => import('./pages/...'))` (some via `.then((m) => ({
default: m.NamedExport }))` for multiple screens grouped in one real file, e.g.
CrmCasesPage/CrmCaseDetailPage/CrmTasksPage/CrmTaskDetailPage all resolve to the
same ./pages/crm/WorkPages.tsx file).

Method: parses src/App.tsx for every `const X = lazy(() => import('PATH')...)`
line, resolves PATH relative to src/ to a real file or directory, then greps
every .tsx/.ts file under that resolved location (the file itself, or its whole
directory if PATH points to a directory's index) for real network-call patterns:
useQuery(, useMutation(, await api./apiClient.*(, fetch(, axios. — counting
DISTINCT call sites (not .refetch() on an existing query).

LIMITATIONS (real, not glossed over):
- Several screens that resolve to the SAME shared file (e.g. the WorkPages.tsx /
  SchedulingPages.tsx grouped files) share one call count here — this script
  cannot cleanly separate "CasesPage's own calls" from "TasksPage's own calls"
  when both live in one file; the reported count is for the WHOLE shared file,
  which may overstate any one individual screen's real number.
- Named API functions called directly WITHOUT going through a use*Query/
  use*Mutation hook (e.g. a plain `await listPatients(...)` outside any query
  hook) are not counted — only verified this repo's query-hook convention
  (useCrmQuery), not every possible direct-call convention. A screen showing 0
  may still make real direct calls this script can't distinguish from a plain
  function call.

Exit code is always 0 — this never fails the calling script, only reports.
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_TSX = REPO_ROOT / "src" / "App.tsx"
SRC_DIR = REPO_ROOT / "src"

# Broadened 2026-11-06 after a real sanity check: src/pages/crm/PatientsPage.tsx
# (a real screen) uses a CUSTOM query hook (useCrmQuery, not TanStack's useQuery)
# plus named functions imported from ../../api/crm (listPatients, searchPatients)
# — the original pattern (useQuery/useMutation/await *api.) matched NONE of these
# and would have falsely reported this repo as universally clean. use\w*Query/
# use\w*Mutation catches any custom query-hook naming convention generically.
CALL_PATTERN = re.compile(
    r"use\w*Query\(|use\w*Mutation\(|await\s+\w*[Aa]pi\w*\.\w+\(|(?<!\.)fetch\(|axios\.\w+\("
)


def count_calls_in_text(text: str) -> int:
    return len(CALL_PATTERN.findall(text))


def resolve_import_path(import_str: str) -> Path | None:
    """import_str like './pages/live' or './pages/crm/PatientsPage' (relative to
    src/App.tsx's own directory, i.e. SRC_DIR)."""
    candidate = (SRC_DIR / import_str.lstrip("./")).resolve()
    for suffix in (".tsx", ".ts"):
        p = Path(str(candidate) + suffix)
        if p.exists():
            return p
    # Real bug fixed 2026-11-06: './pages/crm' resolves as a directory import
    # (index.tsx), but src/pages/crm/ ALSO contains PatientsPage.tsx,
    # PatientDetailPage.tsx etc. — each already counted as its OWN separate
    # screen. Returning the whole directory here double-counted every sibling
    # screen's calls into CrmHomePage's total (28 vs a real ~3-4). Only the
    # index file's own code belongs to this screen, not its siblings'.
    index_candidate = candidate / "index.tsx"
    if index_candidate.exists():
        return index_candidate
    if candidate.is_dir():
        return None  # can't safely resolve to "just this directory's own code"
    return None


def parse_screen_map():
    """Returns [(screen_name, resolved_path_or_None)]."""
    text = APP_TSX.read_text(errors="ignore")
    screens = []
    # Matches both `import('./pages/x')` and `import('./pages/x').then((m) => ({ default: m.Y }))`
    for m in re.finditer(
        r"const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*'([^']+)'\s*\)(?:\.then\([^)]*\)\s*)?\)",
        text,
    ):
        screen_name, import_str = m.group(1), m.group(2)
        resolved = resolve_import_path(import_str)
        screens.append((screen_name, resolved))
    return screens


def count_for_path(path: Path | None) -> int:
    if path is None:
        return 0
    if path.is_dir():
        total = 0
        for f in path.rglob("*"):
            if f.suffix in (".tsx", ".ts") and f.is_file():
                try:
                    total += count_calls_in_text(f.read_text(errors="ignore"))
                except Exception:
                    continue
        return total
    try:
        return count_calls_in_text(path.read_text(errors="ignore"))
    except Exception:
        return 0


def main():
    print("Real per-screen API call-site count (2026-11-06 investigation).")
    print("Counts distinct useQuery/useMutation/await *api./fetch/axios call sites "
          "per real screen (resolved from App.tsx's real <Route> -> lazy-loaded page "
          "mapping); .refetch() on an existing query is not counted as a new call.\n")

    if not APP_TSX.exists():
        print("src/App.tsx not found — cannot resolve real screens. Leaving this "
              "item as manual review.")
        sys.exit(0)

    screens = parse_screen_map()
    resolved = [(n, p, count_for_path(p)) for n, p in screens if p is not None]
    unresolved = [n for n, p in screens if p is None]

    flagged = [r for r in resolved if r[2] > 3]
    for name, path, count in resolved:
        marker = "⚠" if count > 3 else "✓"
        print(f"  {marker} {name}: {count} call site(s)")
    for name in unresolved:
        print(f"  ? {name}: could not resolve real source file — not counted, not assumed clean")

    print(f"\n{len(flagged)}/{len(resolved)} resolved real screen(s) exceed 3 API call "
          f"sites ({len(unresolved)} screen(s) could not be resolved to a real file).")
    if not flagged and not unresolved:
        print("All real screens checked stay at or under 3 call sites. Not exhaustive — "
              "see this script's LIMITATIONS docstring.")
    elif flagged:
        print("Real gap(s) found above — not exhaustive, see LIMITATIONS docstring.")

    sys.exit(0)


if __name__ == "__main__":
    main()
