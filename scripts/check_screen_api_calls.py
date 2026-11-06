#!/usr/bin/env python3
"""
Real check for checklist item 2.4 ("Endpoints are batched/aggregated — no screen
needs > 3 API calls") — added 2026-11-06.

Real investigation (2026-11-06): this repo is a React Router SPA with real
screens defined as `<Route path="..." element={...}>` in src/App.tsx, each
wrapped in zero or more layout/guard wrappers (AppRoute, ProtectedRoute,
RouteErrorBoundary, Suspense, Navigate) around the real screen component
(e.g. HealthcareDomainPage, CrmHomePage, LiveCallsPage). Real screen files
live under src/pages/<name>/index.tsx (one folder per screen); most are
lazy-loaded in App.tsx as `const Name = lazy(() => import('./pages/x'))` —
resolved here by following that real import path, not assumed from the
route path alone (a route path like /crm/patients doesn't literally match
its file's directory name).

This repo's real backend calls are NOT bare `fetch(`/`axios.` at call
sites — every domain has its own module under src/api/*.ts (agents.ts,
healthcare.ts, crm.ts, etc.) exporting real `async function` wrappers
(confirmed: 86 real `export async function` definitions across src/api/,
vs. 77 non-async exports which are local helpers like storeUser/
loadStoredUser, not network calls). Pages call these by name (e.g.
`listAgents()`, `getAgent(id)`), and CRM pages additionally use a
repo-specific `useCrmQuery()` hook (src/pages/crm/useCrmQuery.ts) as their
data-fetching wrapper. The scanner reads the real list of async export
names from src/api/*.ts at run time rather than hardcoding one — if the
API surface changes, this check automatically keeps up.

COUNTING RULE (same as the other 2 products' copies of this script, for the
same real reason): useQuery()/useMutation()/useCrmQuery() can only be
called at a component's top level per React's Rules of Hooks, so every one
in a screen genuinely fires together on mount — summed. Direct calls to a
src/api/*.ts async function are grouped by their nearest enclosing named
handler function with the MAX taken (different handlers are alternative
user actions, not simultaneous); a call found outside any named handler
(e.g. directly inside a useEffect callback) is treated the same way, as
its own one-call group in the max — this is a real limitation (such calls
should arguably be summed as mount-time work instead), noted here rather
than silently assumed correct.

LIMITS (stated honestly): component-name → file resolution relies on the
real `lazy(() => import(...))` pattern or a direct `function Name(`/`const
Name` match — if neither is found, or a name is ambiguous, it's reported
as unresolved, not assumed clean. Regex/offset heuristic, not a full TSX
parser; a shared custom hook that itself wraps several calls (other than
the known useCrmQuery) would be undercounted.

Exit code is always 0 — this never fails the calling script, only reports.
"""
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "src"


def _real_api_function_names():
    names = set()
    api_dir = SRC / "api"
    if not api_dir.exists():
        return names
    for f in api_dir.glob("*.ts"):
        text = f.read_text(errors="ignore")
        names.update(re.findall(r"^export async function (\w+)\(", text, re.M))
    return names


API_FUNCTION_NAMES = _real_api_function_names()
HOOK_CALL_RE = re.compile(r"\b(?:useQuery|useMutation|useCrmQuery)\s*\(")
_api_fn_alt = "|".join(re.escape(n) for n in sorted(API_FUNCTION_NAMES)) or r"(?!x)x"
NETWORK_CALL_RE = re.compile(
    r"\bawait\s+\w*[Aa]pi\w*\.\w+\(|\bawait\s+fetch\(|\bfetch\(|\baxios\.\w+\(|"
    rf"\b(?:{_api_fn_alt})\s*\("
)
HANDLER_DEF_RE = re.compile(
    r"^(\s*)(?:const\s+(\w+)\s*=\s*(?:async\s*)?\(|"
    r"(?:async\s+)?function\s+(\w+)\s*\()"
)

KNOWN_WRAPPERS = {
    "AppRoute", "ProtectedRoute", "RouteErrorBoundary", "Suspense", "Navigate",
    "Fragment", "React.Fragment",
}


def _find_matching(text, open_idx, open_ch, close_ch):
    depth = 0
    for j in range(open_idx, len(text)):
        c = text[j]
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return j
    return None


def find_function_span(text, start_idx):
    paren_idx = text.find("(", start_idx)
    if paren_idx == -1:
        return None
    close_paren = _find_matching(text, paren_idx, "(", ")")
    if close_paren is None:
        return None
    body_open = text.find("{", close_paren)
    if body_open == -1:
        return None
    return _find_matching(text, body_open, "{", "}")


def count_calls_in_span(span_text):
    hook_count = len(HOOK_CALL_RE.findall(span_text))
    lines = span_text.splitlines()
    offsets = []
    pos = 0
    for line in lines:
        offsets.append(pos)
        pos += len(line) + 1

    handlers = []
    for idx, line in enumerate(lines):
        m = HANDLER_DEF_RE.match(line)
        if m:
            name = m.group(2) or m.group(3)
            start_off = offsets[idx]
            end_off = find_function_span(span_text, start_off)
            if end_off:
                handlers.append((name, start_off, end_off))

    handler_counts = {}
    for name, s, e in handlers:
        sub = span_text[s:e]
        handler_counts[name] = len(NETWORK_CALL_RE.findall(sub))

    covered = [False] * len(span_text)
    for _, s, e in handlers:
        for i in range(s, min(e, len(span_text))):
            covered[i] = True
    unattributed = sum(1 for m in NETWORK_CALL_RE.finditer(span_text) if not covered[m.start()])

    max_handler = max(handler_counts.values()) if handler_counts else 0
    max_handler = max(max_handler, unattributed)
    return hook_count, max_handler


def get_route_components():
    app_tsx = SRC / "App.tsx"
    if not app_tsx.exists():
        return []
    text = app_tsx.read_text(errors="ignore")
    screens = []
    for m in re.finditer(r'<Route\s+path="([^"]*)"\s+element=\{', text):
        path = m.group(1)
        brace_start = text.index("{", m.end() - 1)
        brace_end = _find_matching(text, brace_start, "{", "}")
        if brace_end is None:
            continue
        block = text[brace_start:brace_end]
        # Real screen components are JSX elements with NO "=" prop named
        # "skeleton" immediately preceding them (that's the loading placeholder,
        # not the real screen) — find every `<Name` that is a direct child tag
        # (opening tag, not a prop value like `skeleton={<X />}`).
        # Strip out any `skeleton={...}` sub-blocks entirely first so their inner
        # component names never get picked up as candidates.
        cleaned = block
        out = []
        i = 0
        while i < len(cleaned):
            sm = re.compile(r"skeleton=\{").search(cleaned, i)
            if not sm:
                out.append(cleaned[i:])
                break
            out.append(cleaned[i:sm.start()])
            b_open = cleaned.index("{", sm.end() - 1)
            b_end = _find_matching(cleaned, b_open, "{", "}")
            i = (b_end + 1) if b_end is not None else len(cleaned)
        cleaned = "".join(out)
        names = re.findall(r"<([A-Za-z][\w.]*)", cleaned)
        real = [n for n in names if n not in KNOWN_WRAPPERS]
        if not real:
            continue
        # The innermost real component (deepest nesting = last opening tag before
        # any wrapper's self-closing) is the actual screen.
        screens.append((path, real[-1]))
    return screens


def _resolve_lazy_import(name, app_text):
    """Many screens are declared in App.tsx as `const Name = lazy(() =>
    import('./pages/x'))`. Follow that real import path to the real file, which
    may be a directory (resolves to index.tsx)."""
    m = re.search(rf"const\s+{name}\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(['\"]([^'\"]+)['\"]", app_text)
    if not m:
        return None
    rel = m.group(1)
    if rel.startswith("./"):
        rel = rel[2:]
    base = SRC / rel
    for candidate in (base.with_suffix(".tsx"), base / "index.tsx", base.with_suffix(".ts")):
        if candidate.exists():
            return candidate
    return None


def resolve_component_file(name, app_text):
    lazy_file = _resolve_lazy_import(name, app_text)
    if lazy_file is not None:
        return lazy_file, [str(lazy_file)]

    out = subprocess.run(
        ["grep", "-rl", "-E", rf"(export )?(function {name}\(|const {name}\s*[:=])",
         "--include=*.tsx", "--include=*.ts", str(SRC)],
        capture_output=True, text=True,
    )
    candidates = [l for l in out.stdout.strip().splitlines() if "test" not in l.lower() and ".test." not in l]
    # App.tsx itself just holds the lazy() declaration, not the real definition —
    # prefer any other real match over it.
    non_app = [c for c in candidates if not c.endswith("App.tsx")]
    if len(non_app) == 1:
        return Path(non_app[0]), candidates
    if len(candidates) != 1:
        return None, candidates
    return Path(candidates[0]), candidates


def count_component(name, filepath):
    text = filepath.read_text(errors="ignore")
    m = re.search(rf"(?:export )?(?:function {name}\(|const {name}\s*[:=])", text)
    if m:
        end = find_function_span(text, m.start())
        span = text[m.start():end] if end else text[m.start():]
        return count_calls_in_span(span)
    # Resolved via a lazy import to a dedicated page file/directory — the local
    # name inside that file may differ from the route's alias (e.g. default
    # export under its own name). One page file is one screen, so the whole
    # file's content is the honest span to count.
    return count_calls_in_span(text)


def main():
    print("Real per-screen API call count (2026-11-06 investigation) — "
          "useQuery/useMutation hooks (always fire together on mount, per React's "
          "Rules of Hooks) summed; other network calls (axios./fetch(/await "
          "apiClient.*()) grouped by enclosing handler, max taken (alternative "
          "user actions, not simultaneous).")
    print()

    app_text = (SRC / "App.tsx").read_text(errors="ignore")
    screens = get_route_components()
    seen = set()
    unresolved = []
    over = []
    for path, comp in screens:
        if comp in seen:
            continue
        seen.add(comp)
        filepath, candidates = resolve_component_file(comp, app_text)
        if filepath is None:
            unresolved.append((comp, path, candidates))
            print(f"? {path} ({comp}): "
                  f"{'ambiguous — ' + str(len(candidates)) + ' matches' if candidates else 'not found'}")
            continue
        result = count_component(comp, filepath)
        if result is None:
            unresolved.append((comp, path, [str(filepath)]))
            print(f"? {path} ({comp}): found file but couldn't locate definition span")
            continue
        hooks, max_handler = result
        total = hooks + max_handler
        flag = "⚠ " if total > 3 else "  "
        print(f"{flag}{path} ({comp}): {total} real call(s) (hooks={hooks}, "
              f"max-per-handler={max_handler}) [{filepath.relative_to(REPO_ROOT)}]")
        if total > 3:
            over.append((path, comp, total))

    print()
    if unresolved:
        print(f"{len(unresolved)} screen(s) could not be reliably resolved — "
              f"NOT counted as clean, reported as unknown: "
              f"{[p for _, p, _ in unresolved]}")
    if over:
        print(f"{len(over)} screen(s) genuinely need more than 3 API calls:")
        for path, comp, total in over:
            print(f"  {path} ({comp}): {total} calls")
    elif not unresolved:
        print("No screens found needing more than 3 real API calls, by this method. "
              "Not exhaustive — see the LIMITS note in this script's docstring.")

    resolved_total = len(seen) - len(unresolved)
    print()
    print("SUMMARY (machine-parsed by the backend checklist — do not reword):")
    print(f"  {len(over)}/{resolved_total} resolved real screen(s) exceed 3 API call sites "
          f"({len(unresolved)} unresolved, not counted as clean)")

    sys.exit(0)


if __name__ == "__main__":
    main()
