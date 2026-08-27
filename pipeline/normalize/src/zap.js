'use strict';

const fs = require('fs');

const ZAP_SEVERITY_MAP = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Informational: 'info',
};

function parseZapJson(zapData) {
  const findings = [];

  if (!zapData || !zapData.site) return findings;

  const sites = Array.isArray(zapData.site) ? zapData.site : [zapData.site];

  for (const site of sites) {
    const alerts = site.alerts || [];
    for (const alert of alerts) {
      findings.push({
        id: `zap-${alert.pluginid}-${Date.now()}`,
        tool: 'zaproxy',
        category: 'dast',
        severity: ZAP_SEVERITY_MAP[alert.riskdesc?.split(' ')[0]] || 'info',
        ruleId: `ZAP-${alert.pluginid}`,
        file: site.host || site.name || 'unknown',
        line: 0,
        message: alert.name || alert.desc || 'ZAP finding',
        confidence: 1.0,
        reference: alert.reference || '',
        solution: alert.solution || '',
        cweid: alert.cweid || '',
      });
    }
  }

  return findings;
}

function run(jsonPath, outPath) {
  const text = fs.readFileSync(jsonPath, 'utf8');
  let zapData;
  try {
    zapData = JSON.parse(text);
  } catch (e) {
    console.error(`[zap] failed to parse JSON: ${e.message}`);
    return { findings: [] };
  }

  const findings = parseZapJson(zapData);
  const pivot = { findings };

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(pivot, null, 2), 'utf8');
    console.log(`[zap] ${findings.length} findings → ${outPath}`);
  }

  return pivot;
}

if (require.main === module) {
  const [jsonPath, outPath] = process.argv.slice(2);
  if (!jsonPath) {
    console.error('Usage: node zap.js <zap-report.json> [pivot.json]');
    process.exit(1);
  }
  run(jsonPath, outPath || jsonPath.replace('.json', '-pivot.json'));
}

module.exports = { parseZapJson, run };
