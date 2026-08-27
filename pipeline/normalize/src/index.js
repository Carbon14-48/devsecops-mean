#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { convertSemgrep } = require('./semgrep');
const { convertTrivy } = require('./trivy');
const { convertGitleaks } = require('./gitleaks');
const { parseKubeScore } = require('./kube-score');
const { mergePivots } = require('./merge');

const REPO_ROOT = path.resolve(__dirname, '../../..');

function usage() {
  console.error('Usage:');
  console.error('  node normalize/src/index.js --sarif <file> [--tool semgrep] [--out pivot.json] [--root dir]');
  console.error('  node normalize/src/index.js --json <file> --tool trivy   [--out pivot.json] [--root dir]');
  console.error('  node normalize/src/index.js --json <file> --tool gitleaks [--out pivot.json] [--root dir]');
  console.error('  node normalize/src/index.js --text <file> --tool kube-score [--out pivot.json]');
  console.error('  node normalize/src/index.js --merge <p1.json> <p2.json> ... [--out pivot.json]');
  process.exit(2);
}

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

const out = arg('--out');
const root = path.resolve(arg('--root', REPO_ROOT));

// Merge mode: combine multiple pivot files
if (argv.includes('--merge')) {
  const mergeStart = argv.indexOf('--merge') + 1;
  const pivotFiles = [];
  for (const a of argv.slice(mergeStart)) {
    if (a.startsWith('--')) break;
    pivotFiles.push(a);
  }
  const pivots = pivotFiles.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const merged = mergePivots(pivots);
  const outPath = out || path.join(REPO_ROOT, 'pipeline/out/pivot-merged.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`[normalize] ${merged.findings.length} finding(s) mergés → ${outPath}`);
  process.exit(0);
}

// Single-tool mode
const sarifFile = arg('--sarif');
const jsonFile = arg('--json');
const textFile = arg('--text');
const tool = arg('--tool', sarifFile ? 'semgrep' : 'semgrep');

if (!sarifFile && !jsonFile && !textFile) usage();

let findings;

if (tool === 'semgrep') {
  const input = JSON.parse(fs.readFileSync(sarifFile, 'utf8'));
  findings = convertSemgrep(input, { root });
} else if (tool === 'trivy') {
  const input = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  findings = convertTrivy(input, { root });
} else if (tool === 'gitleaks') {
  const input = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  findings = convertGitleaks(input, { root });
} else if (tool === 'kube-score') {
  const text = fs.readFileSync(textFile, 'utf8');
  findings = parseKubeScore(text);
} else {
  console.error(`[normalize] tool inconnu: ${tool}`);
  process.exit(1);
}

const pivot = {
  schemaVersion: '1.0',
  run: {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    tool,
  },
  findings,
};

const outPath = out || path.join(REPO_ROOT, `pipeline/out/pivot-${tool}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(pivot, null, 2));

console.log(`[normalize] ${findings.length} finding(s) → pivot (${tool})`);
console.log(`[normalize] écrit dans ${outPath}`);
