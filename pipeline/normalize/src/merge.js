'use strict';

const crypto = require('crypto');

function mergePivots(pivots) {
  const allFindings = [];
  const tools = [];

  for (const pivot of pivots) {
    allFindings.push(...(pivot.findings || []));
    if (pivot.run && pivot.run.tool) tools.push(pivot.run.tool);
  }

  return {
    schemaVersion: '1.0',
    run: {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tool: tools.join('+'),
    },
    findings: allFindings,
  };
}

module.exports = { mergePivots };
