#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { convertSemgrep } = require('./semgrep');

const REPO_ROOT = path.resolve(__dirname, '../../..');

function usage() {
  console.error('Usage: node normalize/src/index.js --sarif <file.sarif> [--tool semgrep] [--out <pivot.json>] [--root <dir>]');
  process.exit(2);
}

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

const sarifFile = arg('--sarif');
const tool = arg('--tool', 'semgrep');
const out = arg('--out');
const root = path.resolve(arg('--root', REPO_ROOT));

if (!sarifFile) usage();

const sarif = JSON.parse(fs.readFileSync(sarifFile, 'utf8'));

let findings;
if (tool === 'semgrep') {
  findings = convertSemgrep(sarif, { root });
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

const outPath = out || path.join(REPO_ROOT, 'pipeline/out/pivot.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(pivot, null, 2));

console.log(`[normalize] ${findings.length} finding(s) → pivot (${tool})`);
console.log(`[normalize] écrit dans ${outPath}`);
