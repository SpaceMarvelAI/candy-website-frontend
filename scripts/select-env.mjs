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
  const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
  const child = spawn(process.execPath, [vite, "--mode", mode], {
    cwd: ROOT,
    stdio: "inherit",
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
