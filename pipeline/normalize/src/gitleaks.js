'use strict';

const crypto = require('crypto');
const path = require('path');

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function toRepoPath(file, root) {
  if (path.isAbsolute(file)) return path.relative(root, file);
  return file.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
}

function convertGitleaks(findings, { root }) {
  return findings.map((f) => {
    const file = toRepoPath(f.File, root);
    const ruleId = f.RuleID || 'unknown';

    return {
      id: hashId(['gitleaks', ruleId, file, f.StartLine]),
      tool: 'gitleaks',
      category: 'secrets',
      severity: 'high',
      confidence: 1.0,
      ruleId,
      title: f.Description || ruleId,
      message: `Secret detected: ${f.Match || ruleId} at line ${f.StartLine}`,
      file,
      line: f.StartLine || 0,
      cwe: [],
      owasp: [],
      raw: f,
    };
  });
}

module.exports = { convertGitleaks };
