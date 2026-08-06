#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { decide, explain } = require('./engine');

const SCORE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');

function usage() {
  console.error('Usage: node score/src/index.js <pivot.json> [--weights <file>] [--thresholds <file>] [--out <decision.json>]');
  process.exit(2);
}

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

const pivotFile = argv.find((a) => !a.startsWith('--'));
if (!pivotFile) usage();

const pivot = JSON.parse(fs.readFileSync(pivotFile, 'utf8'));

const weightsFile = arg('--weights');
const thresholdsFile = arg('--thresholds');
const out = arg('--out');

const opts = {};
if (weightsFile) opts.weights = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
if (thresholdsFile) opts.thresholds = JSON.parse(fs.readFileSync(thresholdsFile, 'utf8'));

const result = decide(pivot, opts);

const outPath = out || path.join(SCORE_DIR, 'decisions/decision.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

const logPath = path.join(path.dirname(outPath), path.basename(outPath).replace(/\.json$/, '') + '.log');
fs.writeFileSync(logPath, explain(result));

console.log(explain(result));
console.log(`[score] décision structurée → ${outPath}`);
console.log(`[score] log explicatif      → ${logPath}`);
