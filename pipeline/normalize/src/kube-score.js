'use strict';

const fs = require('fs');
const path = require('path');

function parseKubeScore(text) {
  const findings = [];
  const lines = text.split('\n');
  let currentResource = '';

  for (const line of lines) {
    const resourceMatch = line.match(/^(apps\/v1\/Deployment|networking\.k8s\.io\/v1\/Ingress|v1\/Service|v1\/Pod)\s+(\S+)\s+in\s+(\S+)/);
    if (resourceMatch) {
      currentResource = `${resourceMatch[2]}/${resourceMatch[3]}`;
      continue;
    }

    const critMatch = line.match(/\[CRITICAL\]\s+(.*)/);
    if (critMatch) {
      findings.push({
        id: `kube-score-${findings.length}-${Date.now()}`,
        tool: 'kube-score',
        category: 'k8s',
        severity: 'high',
        ruleId: critMatch[1].trim().replace(/\s+/g, '-').toLowerCase(),
        file: currentResource,
        line: 0,
        message: critMatch[1].trim(),
        confidence: 1.0,
      });
      continue;
    }

    const warnMatch = line.match(/\[WARNING\]\s+(.*)/);
    if (warnMatch) {
      findings.push({
        id: `kube-score-${findings.length}-${Date.now()}`,
        tool: 'kube-score',
        category: 'k8s',
        severity: 'medium',
        ruleId: warnMatch[1].trim().replace(/\s+/g, '-').toLowerCase(),
        file: currentResource,
        line: 0,
        message: warnMatch[1].trim(),
        confidence: 1.0,
      });
    }
  }

  return findings;
}

function run(inputPath, outPath) {
  const text = fs.readFileSync(inputPath, 'utf8');
  const findings = parseKubeScore(text);
  const pivot = { findings };

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(pivot, null, 2), 'utf8');
    console.log(`[kube-score] ${findings.length} findings → ${outPath}`);
  }

  return pivot;
}

if (require.main === module) {
  const [inputPath, outPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error('Usage: node kube-score.js <kube-score-output.txt> [pivot.json]');
    process.exit(1);
  }
  run(inputPath, outPath || inputPath.replace('.txt', '-pivot.json'));
}

module.exports = { parseKubeScore, run };
