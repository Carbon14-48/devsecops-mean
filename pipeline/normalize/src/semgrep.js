'use strict';

const crypto = require('crypto');
const path = require('path');

const SEVERITY_MAP = {
  error: 'high',
  warning: 'medium',
  note: 'low',
};

function toRepoPath(uri, root) {
  if (path.isAbsolute(uri)) return path.relative(root, uri);
  return uri.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
}

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function convertSemgrep(sarif, { root }) {
  const run = sarif.runs[0];
  const rules = new Map((run.tool.driver.rules || []).map((r, i) => [r.id, { rule: r, index: i }]));
  const findings = [];

  for (const result of run.results || []) {
    const meta = rules.get(result.ruleId);
    const level = (meta && meta.rule.defaultConfiguration.level) || 'warning';
    const loc = result.locations[0].physicalLocation;
    const file = toRepoPath(loc.artifactLocation.uri, root);
    const line = loc.region ? loc.region.startLine : 0;
    const ruleId = result.ruleId.replace(/^rules\./, '');

    findings.push({
      id: hashId(['semgrep', ruleId, file, line]),
      tool: 'semgrep',
      category: 'sast',
      severity: SEVERITY_MAP[level] || 'medium',
      confidence: 1.0,
      ruleId,
      title: (meta && meta.rule.shortDescription && meta.rule.shortDescription.text) || ruleId,
      message: result.message.text,
      file,
      line,
      cwe: [],
      owasp: [],
      raw: result,
    });
  }

  return findings;
}

module.exports = { convertSemgrep };