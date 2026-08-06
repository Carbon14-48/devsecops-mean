'use strict';

const WEIGHTS_DEFAULT = {
  severity: { critical: 10, high: 7, medium: 4, low: 1, info: 0.5 },
  category: { sast: 1.0, sca: 1.0, secrets: 2.0, container: 1.2, k8s: 1.0, dast: 1.5 },
  noise: { minConfidence: 0.5, ignoredRules: [] },
};

const THRESHOLDS_DEFAULT = { blockThreshold: 10, maxFindings: 100 };

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function scoreFinding(f, weights) {
  const sw = weights.severity[f.severity] != null ? weights.severity[f.severity] : 0;
  const cw = weights.category[f.category] != null ? weights.category[f.category] : 0;
  return sw * cw;
}

function filterNoise(findings, weights) {
  const { minConfidence, ignoredRules } = weights.noise;
  const seen = new Map();

  for (const f of findings) {
    if (ignoredRules.includes(f.ruleId)) continue;
    if (f.confidence < minConfidence) continue;
    const prev = seen.get(f.id);
    if (!prev || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[prev.severity]) {
      seen.set(f.id, f);
    }
  }
  return Array.from(seen.values());
}

function decide(pivot, opts = {}) {
  const weights = { ...WEIGHTS_DEFAULT, ...opts.weights };
  const thresholds = { ...THRESHOLDS_DEFAULT, ...opts.thresholds };
  const categoryWeights = { ...WEIGHTS_DEFAULT.category, ...(opts.weights || {}).category };
  const severityWeights = { ...WEIGHTS_DEFAULT.severity, ...(opts.weights || {}).severity };
  const noise = { ...WEIGHTS_DEFAULT.noise, ...(opts.weights || {}).noise };
  const cfg = { ...weights, severity: severityWeights, category: categoryWeights, noise };
  const thr = thresholds;

  const filtered = filterNoise(pivot.findings || [], cfg);
  const scored = filtered
    .map((f) => ({ finding: f, score: scoreFinding(f, cfg) }))
    .sort((a, b) => b.score - a.score);

  const total = scored.reduce((sum, s) => sum + s.score, 0);
  const decision = total >= thr.blockThreshold ? 'BLOCK' : 'PASS';
  const top = scored.slice(0, 10);

  return {
    decision,
    totalScore: total,
    blockThreshold: thr.blockThreshold,
    filteredFindings: filtered.length,
    rawFindings: (pivot.findings || []).length,
    weights: cfg,
    top: top.map((s) => ({
      id: s.finding.id,
      tool: s.finding.tool,
      category: s.finding.category,
      severity: s.finding.severity,
      ruleId: s.finding.ruleId,
      file: s.finding.file,
      line: s.finding.line,
      message: s.finding.message,
      score: s.score,
    })),
  };
}

function explain(result) {
  const lines = [];
  lines.push('='.repeat(64));
  lines.push(`  DÉCISION : ${result.decision}  (score cumulé non plafonné ${result.totalScore} / seuil ${result.blockThreshold})`);
  lines.push('='.repeat(64));
  lines.push('');
  if (result.rawFindings === 0) {
    lines.push('Aucun finding émis par les outils de scan.');
  } else {
    lines.push(`Findings bruts : ${result.rawFindings}  →  après filtrage bruit/dédup : ${result.filteredFindings}`);
    lines.push('');
    if (result.top.length === 0) {
      lines.push('Aucun finding au-dessus des seuils de bruit. Pas de blocage.');
    } else {
      lines.push('Top findings pondérés (sévérité × catégorie) :');
      lines.push('');
      for (const t of result.top) {
        lines.push(
          `  [${t.score.toFixed(1)} pts] ${t.severity.toUpperCase().padEnd(8)} ${t.category.padEnd(8)} ` +
            `${t.tool.padEnd(8)} ${t.file}:${t.line}`,
        );
        lines.push(`      ${t.ruleId} — ${t.message}`);
      }
    }
  }
  lines.push('');
  if (result.decision === 'BLOCK') {
    lines.push('Pourquoi BLOCK : le score cumulé dépasse le seuil de blocage.');
    lines.push('→ Corriger les findings listés, ou recalibrer le seuil/les poids (pipeline/score/config/).');
  } else {
    lines.push('Pourquoi PASS : le score cumulé reste sous le seuil de blocage.');
  }
  lines.push('');
  lines.push(`Poids appliqués — sévérité : ${JSON.stringify(result.weights.severity)}`);
  lines.push(`Poids appliqués — catégorie : ${JSON.stringify(result.weights.category)}`);
  return lines.join('\n');
}

module.exports = { decide, explain, scoreFinding, filterNoise };
