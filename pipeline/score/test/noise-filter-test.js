#!/usr/bin/env node
'use strict';

const { filterNoise, decide } = require('../src/engine');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

// === Test 1: Dedup by id (keeps lower-severity) ===
console.log('Test 1: Deduplication by id');
{
  const findings = [
    { id: 'dup-1', severity: 'high', confidence: 1, ruleId: 'rule-a', category: 'sast', tool: 'semgrep', file: 'a.js', line: 1, message: 'high' },
    { id: 'dup-1', severity: 'critical', confidence: 1, ruleId: 'rule-a', category: 'sast', tool: 'semgrep', file: 'a.js', line: 1, message: 'critical' },
    { id: 'unique-2', severity: 'low', confidence: 1, ruleId: 'rule-b', category: 'sca', tool: 'trivy', file: 'b.js', line: 2, message: 'unique' },
  ];
  const result = filterNoise(findings, { noise: { minConfidence: 0.5, ignoredRules: [] }, severity: {}, category: {} });
  assert(result.length === 2, 'bruts: 3 → filtrés: 2 (dedup keeps lower-severity)');
  assert(result.find(f => f.id === 'dup-1')?.severity === 'critical', 'kept the critical (lower = more severe)');
  assert(result.find(f => f.id === 'unique-2') !== undefined, 'unique finding preserved');
}

// === Test 2: Filter by confidence ===
console.log('Test 2: Confidence filtering');
{
  const findings = [
    { id: 'conf-1', severity: 'high', confidence: 1.0, ruleId: 'rule-c', category: 'sast', tool: 'semgrep', file: 'c.js', line: 3, message: 'confident' },
    { id: 'conf-2', severity: 'high', confidence: 0.3, ruleId: 'rule-c', category: 'sast', tool: 'semgrep', file: 'c.js', line: 4, message: 'low-conf' },
    { id: 'conf-3', severity: 'medium', confidence: 0.0, ruleId: 'rule-c', category: 'sast', tool: 'semgrep', file: 'c.js', line: 5, message: 'no-conf' },
  ];
  const result = filterNoise(findings, { noise: { minConfidence: 0.5, ignoredRules: [] }, severity: {}, category: {} });
  assert(result.length === 1, 'bruts: 3 → filtrés: 1 (confidence < 0.5 dropped)');
  assert(result[0].id === 'conf-1', 'only the high-confidence finding kept');
}

// === Test 3: ignoredRules ===
console.log('Test 3: ignoredRules filtering');
{
  const findings = [
    { id: 'ign-1', severity: 'high', confidence: 1, ruleId: 'noisy-rule', category: 'sast', tool: 'semgrep', file: 'd.js', line: 6, message: 'ignored' },
    { id: 'ign-2', severity: 'high', confidence: 1, ruleId: 'important-rule', category: 'sast', tool: 'semgrep', file: 'd.js', line: 7, message: 'kept' },
    { id: 'ign-3', severity: 'medium', confidence: 1, ruleId: 'noisy-rule', category: 'sast', tool: 'semgrep', file: 'd.js', line: 8, message: 'also ignored' },
  ];
  const result = filterNoise(findings, { noise: { minConfidence: 0.5, ignoredRules: ['noisy-rule'] }, severity: {}, category: {} });
  assert(result.length === 1, 'bruts: 3 → filtrés: 1 (noisy-rule ignored)');
  assert(result[0].ruleId === 'important-rule', 'only the important-rule finding kept');
}

// === Test 4: Combined — full pipeline scenario ===
console.log('Test 4: Combined scenario (dedup + confidence + ignoredRules)');
{
  const findings = [
    { id: 'A', severity: 'critical', confidence: 1.0, ruleId: 'real-rule', category: 'secrets', tool: 'gitleaks', file: 'config.js', line: 9, message: 'real secret' },
    { id: 'A', severity: 'high', confidence: 0.3, ruleId: 'real-rule', category: 'secrets', tool: 'gitleaks', file: 'config.js', line: 9, message: 'duplicate low-conf' },
    { id: 'B', severity: 'medium', confidence: 0.1, ruleId: 'noisy', category: 'sast', tool: 'semgrep', file: 'app.js', line: 1, message: 'low confidence' },
    { id: 'C', severity: 'low', confidence: 1.0, ruleId: 'noisy', category: 'sast', tool: 'semgrep', file: 'app.js', line: 2, message: 'ignored rule' },
    { id: 'D', severity: 'high', confidence: 0.8, ruleId: 'real-rule', category: 'sca', tool: 'trivy', file: 'pkg.json', line: 1, message: 'genuine finding' },
  ];
  const result = filterNoise(findings, { noise: { minConfidence: 0.5, ignoredRules: ['noisy'] }, severity: {}, category: {} });
  assert(result.length === 2, 'bruts: 5 → filtrés: 2 (dedup + confidence + ignoredRules)');
  assert(result.find(f => f.id === 'A')?.severity === 'critical', 'A: dedup kept critical');
  assert(result.find(f => f.id === 'D') !== undefined, 'D: genuine finding preserved');
}

// === Test 5: decide() with noise filtering ===
console.log('Test 5: Full decide() with noise');
{
  const pivot = {
    findings: [
      { id: 'X1', severity: 'high', confidence: 1.0, ruleId: 'r1', category: 'secrets', tool: 'gitleaks', file: 'a', line: 1, message: 'real' },
      { id: 'X1', severity: 'medium', confidence: 0.2, ruleId: 'r1', category: 'secrets', tool: 'gitleaks', file: 'a', line: 1, message: 'dup' },
      { id: 'X2', severity: 'critical', confidence: 0.1, ruleId: 'r2', category: 'sast', tool: 'semgrep', file: 'b', line: 2, message: 'low-conf' },
    ],
  };
  const result = decide(pivot);
  assert(result.rawFindings === 3, 'raw: 3');
  assert(result.filteredFindings === 1, 'filtered: 2 dropped (1 dedup + 1 low-confidence)');
}

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
