/**
 * Tests for scripts/lib/bundle-size.mjs — the JS bundle-size budget gate.
 * Builds a fake dist/assets/ tree with files of controlled sizes rather than
 * depending on a real `vite build` output, so the pass/warn/fail boundary
 * tests aren't brittle against real bundle drift.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkBundleSize } from '../../../scripts/lib/bundle-size.mjs';

let root: string;

function writeChunk(relPath: string, sizeBytes: number) {
  const full = path.join(root, 'dist', 'assets', relPath);
  writeFileSync(full, Buffer.alloc(sizeBytes, 'x'));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bundle-size-test-'));
  mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('checkBundleSize', () => {
  it('fails when dist/assets is missing (no build has run)', () => {
    rmSync(path.join(root, 'dist'), { recursive: true, force: true });
    const result = checkBundleSize(root);
    expect(result.status).toBe('fail');
    expect(result.detail).toMatch(/dist\/assets not found/);
  });

  it('fails when dist/assets has no .js files', () => {
    writeFileSync(path.join(root, 'dist', 'assets', 'style.css'), 'body{}');
    const result = checkBundleSize(root);
    expect(result.status).toBe('fail');
    expect(result.detail).toMatch(/no \.js files found/);
  });

  it('passes when chunks are well within budget', () => {
    writeChunk('main-abc123.js', 100 * 1024);
    writeChunk('vendor-def456.js', 200 * 1024);
    const result = checkBundleSize(root);
    expect(result.status).toBe('pass');
    expect(result.totalBytes).toBe(300 * 1024);
  });

  it('warns when the largest chunk exceeds the warn threshold but not fail', () => {
    writeChunk('main-abc123.js', 600 * 1024); // > 500 KB warn, < 900 KB fail
    const result = checkBundleSize(root);
    expect(result.status).toBe('warn');
    expect(result.detail).toMatch(/warn threshold/);
    expect(result.largestChunk?.file).toBe('main-abc123.js');
  });

  it('fails when the largest chunk exceeds the fail threshold', () => {
    writeChunk('main-abc123.js', 950 * 1024); // > 900 KB fail budget
    const result = checkBundleSize(root);
    expect(result.status).toBe('fail');
    expect(result.detail).toMatch(/exceeds the 900 KB budget/);
  });

  it('fails on total JS size even when no single chunk is large', () => {
    // 20 chunks x 250 KB = 5 MB total, none individually over the chunk budget.
    for (let i = 0; i < 20; i++) writeChunk(`chunk-${i}.js`, 250 * 1024);
    const result = checkBundleSize(root);
    expect(result.status).toBe('fail');
    expect(result.detail).toMatch(/total JS/);
    expect(result.totalBytes).toBeGreaterThan(4 * 1024 * 1024);
  });

  it('warns on total JS size in the warn band', () => {
    // 10 chunks x 250 KB = 2.5 MB total, > 2 MB warn, < 4 MB fail.
    for (let i = 0; i < 10; i++) writeChunk(`chunk-${i}.js`, 250 * 1024);
    const result = checkBundleSize(root);
    expect(result.status).toBe('warn');
    expect(result.detail).toMatch(/total JS/);
  });

  it('reports a human-readable pass summary when nothing is flagged', () => {
    writeChunk('main-abc123.js', 50 * 1024);
    const result = checkBundleSize(root);
    expect(result.status).toBe('pass');
    expect(result.detail).toMatch(/within budget/);
  });
});
