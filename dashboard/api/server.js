'use strict';

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3200;
const PIPELINE_OUT = path.resolve(__dirname, '../../pipeline/out');
const RUNS_DIR = path.resolve(__dirname, '../../pipeline/runs');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listRunDirs() {
  try {
    if (!fs.existsSync(RUNS_DIR)) return [];
    return fs.readdirSync(RUNS_DIR)
      .filter(d => fs.statSync(path.join(RUNS_DIR, d)).isDirectory())
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

app.get('/api/status', (_req, res) => {
  const decision = readJSON(path.join(PIPELINE_OUT, 'decision.json'));
  const pivot = readJSON(path.join(PIPELINE_OUT, 'pivot.json'));
  res.json({
    latest: decision,
    findingsCount: pivot ? pivot.findings.length : 0,
    pipelineOut: PIPELINE_OUT,
  });
});

app.get('/api/runs', (_req, res) => {
  const dirs = listRunDirs();
  const runs = dirs.map(d => {
    const dir = path.join(RUNS_DIR, d);
    const decision = readJSON(path.join(dir, 'decision.json'));
    return {
      id: d,
      decision: decision ? decision.decision : 'UNKNOWN',
      score: decision ? decision.totalScore : 0,
      threshold: decision ? decision.blockThreshold : 10,
      findings: decision ? decision.filteredFindings : 0,
    };
  });
  res.json(runs);
});

app.get('/api/runs/:id', (req, res) => {
  const dir = path.join(RUNS_DIR, req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'run not found' });
  const decision = readJSON(path.join(dir, 'decision.json'));
  const pivot = readJSON(path.join(dir, 'pivot.json'));
  const log = (() => {
    try { return fs.readFileSync(path.join(dir, 'decision.log'), 'utf8'); } catch { return null; }
  })();
  res.json({ id: req.params.id, decision, pivot, log });
});

app.get('/api/findings', (_req, res) => {
  const pivot = readJSON(path.join(PIPELINE_OUT, 'pivot.json'));
  if (!pivot) return res.json([]);
  res.json(pivot.findings || []);
});

app.get('/api/weights', (_req, res) => {
  const weights = readJSON(path.resolve(__dirname, '../../pipeline/score/config/weights.json'));
  res.json(weights || {});
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[dashboard-api] listening on http://localhost:${PORT}`);
});
