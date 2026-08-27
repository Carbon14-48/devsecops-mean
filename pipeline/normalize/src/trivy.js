'use strict';

const crypto = require('crypto');
const path = require('path');

function hashId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function convertTrivy(report, { root }) {
  const findings = [];
  const isImage = report.ArtifactType === 'image' || report.ArtifactType === 'container_image';

  for (const result of report.Results || []) {
    const target = result.Target || '';
    const category = isImage ? 'container' : 'sca';

    for (const vuln of result.Vulnerabilities || []) {
      const file = target;
      const severity = (vuln.Severity || 'medium').toLowerCase();

      findings.push({
        id: hashId(['trivy', vuln.VulnerabilityID, file, vuln.PkgName]),
        tool: 'trivy',
        category,
        severity,
        confidence: 1.0,
        ruleId: vuln.VulnerabilityID,
        title: vuln.Title || vuln.VulnerabilityID,
        message: `${vuln.PkgName}@${vuln.InstalledVersion} is vulnerable: ${vuln.VulnerabilityID} (${vuln.FixedVersion ? 'fix: ' + vuln.FixedVersion : 'no fix'})`,
        file,
        line: 0,
        cwe: vuln.CweIDs || [],
        owasp: [],
        raw: vuln,
      });
    }
  }

  return findings;
}

module.exports = { convertTrivy };
