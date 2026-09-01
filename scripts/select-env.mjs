#!/usr/bin/env node
// Arrow-key menu to pick a Vite mode, then runs `vite --mode <mode>`.
// Vite's own loadEnv() already maps mode -> .env.<mode>, so no env-file
// copying is needed here — just tell Vite which mode to load.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODES = ["development", "staging", "production", "test"];
const choices = MODES.filter((m) => existsSync(`${ROOT}.env.${m}`));

if (choices.length === 0) {
  console.error("No .env.<mode> files found in " + ROOT);
  process.exit(1);
}

let selected = 0;

function render() {
  console.clear();
  console.log("Pick env mode (↑/↓, Enter to run, q to quit):\n");
  choices.forEach((c, i) => {
    console.log((i === selected ? "> " : "  ") + c);
  });
}

function run(mode) {
  console.clear();
  console.log(`Starting Vite dev server with mode=${mode}\n`);
  // shell: win32-only is required because npx/vite are .cmd shims on Windows that spawn
  // can't exec without a shell (same justification already applied to
  // scripts/predeploy-check.mjs). args are hardcoded ("vite", "--mode") plus `mode`, which
  // is never user input -- it's one of MODES, filtered to only entries with a matching
  // .env.<mode> file actually present on disk (line 11).
  const child = spawn("npx", ["vite", "--mode", mode], { // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

render();
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (key) => {
  if (key === "[A") {
    selected = (selected - 1 + choices.length) % choices.length;
    render();
  } else if (key === "[B") {
    selected = (selected + 1) % choices.length;
    render();
  } else if (key === "\r" || key === "\n") {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    run(choices[selected]);
  } else if (key === "q" || key === "") {
    process.exit(0);
  }
});
