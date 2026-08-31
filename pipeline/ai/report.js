'use strict';

const fs = require('fs');
const path = require('path');
const { callLLM, formatLLMSection } = require('./llm');

const SEVERITY_LABELS = {
  critical: 'CRITIQUE',
  high: 'HAUTE',
  medium: 'MOYENNE',
  low: 'BASSE',
  info: 'INFO',
};

const CATEGORY_LABELS = {
  sast: 'Analyse statique (SAST)',
  sca: 'Dépendances (SCA)',
  secrets: 'Secrets exposés',
  container: 'Conteneur',
  k8s: 'Kubernetes',
  dast: 'Analyse dynamique (DAST)',
};

const RECOMMENDATIONS = {
  'hardcoded-aws-credential': {
    action: 'Déplacer les credentials dans un gestionnaire de secrets (Vault, AWS Secrets Manager, .env exclu du dépôt).',
    impact: 'Élevé — compromission potentielle de l\'infrastructure cloud.',
    cwe: 'CWE-798',
  },
  'nosql-injection-query-filter': {
    action: 'Valider et assainir toutes les entrées utilisateur avant injection dans les requêtes MongoDB.',
    impact: 'Élevé — extraction non autorisée de données ou exécution de requêtes arbitraires.',
    cwe: 'CWE-943',
  },
  'nosql-injection-where': {
    action: 'Utiliser des schémas de validation (Joi, Zod) pour les filtres de requête.',
    impact: 'Élevé — manipulation de requêtes MongoDB.',
    cwe: 'CWE-943',
  },
  'CVE-2020-8203': {
    action: 'Mettre à jour lodash vers >= 4.17.21.',
    impact: 'HAUTE — prototype pollution.',
    cwe: 'CWE-1321',
  },
  'CVE-2021-23337': {
    action: 'Mettre à jour lodash vers >= 4.17.21.',
    impact: 'HAUTE — command injection via template.',
    cwe: 'CWE-78',
  },
  'CVE-2026-4800': {
    action: 'Mettre à jour la dépendance concernée vers une version corrigée.',
    impact: 'HAUTE — CVE identifié par Trivy SCA.',
    cwe: 'N/A',
  },
  'NSWG-ECO-516': {
    action: 'Vulnérabilité documentée dans la base NodeSecurity. Mettre à jour le package affecté.',
    impact: 'HAUTE — advisory de sécurité Node.js.',
    cwe: 'N/A',
  },
  'aws-access-key': {
    action: 'Révoquer la clé exposée immédiatement, la rotation, migrer vers des rôles IAM ou des credentials temporaires.',
    impact: 'CRITIQUE — accès direct à l\'infrastructure AWS.',
    cwe: 'CWE-798',
  },
  'generic-secret': {
    action: 'Révoquer le secret exposé, le rotation, utiliser un gestionnaire de secrets.',
    impact: 'HAUTE — secret compromis dans le contrôle de version.',
    cwe: 'CWE-798',
  },
};

function groupBy(findings, key) {
  const groups = {};
  for (const f of findings) {
    const k = f[key] || 'unknown';
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  }
  return groups;
}

function buildReport(pivot, decision) {
  const findings = pivot.findings || [];
  const bySeverity = groupBy(findings, 'severity');
  const byCategory = groupBy(findings, 'category');
  const byTool = groupBy(findings, 'tool');

  const lines = [];
  const now = new Date().toISOString();

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║          RAPPORT EXÉCUTIF SÉCURITÉ — DevSecOps              ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Date : ${now}`);
  lines.push(`  Décision : ${decision.decision}`);
  if (decision.phase1) {
    lines.push(`  Score Phase 1 (V0-V2) : ${decision.phase1.score} pts  (${decision.phase1.findings} findings)`);
    lines.push(`  Score Phase 2 (V3)    : +${decision.phase2Contribution} pts  (kube-score + composition)`);
    lines.push(`  Score total           : ${decision.totalScore} / seuil ${decision.blockThreshold}`);
  } else {
    lines.push(`  Score cumulé : ${decision.totalScore} / seuil ${decision.blockThreshold}`);
  }
  lines.push(`  Findings bruts : ${decision.rawFindings}  →  filtrés : ${decision.filteredFindings}`);
  lines.push('');

  lines.push('─── RÉSUMÉ EXÉCUTIF ───────────────────────────────────────────');
  lines.push('');
  if (decision.decision === 'BLOCK') {
    lines.push('  ⛔ LE BUILD EST BLOQUÉ.');
    lines.push(`  ${decision.filteredFindings} finding(s) de sécurité dépassent le seuil de ${decision.blockThreshold}.`);
    lines.push('  Des corrections sont nécessaires avant le déploiement.');
  } else {
    lines.push('  ✅ LE BUILD EST AUTORISÉ.');
    if (decision.filteredFindings === 0) {
      lines.push('  Aucun finding de sécurité détecté.');
    } else {
      lines.push(`  ${decision.filteredFindings} finding(s) détecté(s) sous le seuil de ${decision.blockThreshold}.`);
    }
  }
  lines.push('');

  lines.push('─── RÉPARTITION PAR SÉVÉRITÉ ─────────────────────────────────');
  lines.push('');
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    const count = (bySeverity[sev] || []).length;
    if (count > 0) {
      const bar = '█'.repeat(Math.min(count, 30));
      lines.push(`  ${SEVERITY_LABELS[sev].padEnd(10)} ${String(count).padStart(3)}  ${bar}`);
    }
  }
  lines.push('');

  lines.push('─── RÉPARTITION PAR CATÉGORIE ────────────────────────────────');
  lines.push('');
  for (const [cat, items] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
    const totalScore = items.reduce((s, f) => s + (decision.top.find(t => t.id === f.id)?.score || 0), 0);
    lines.push(`  ${(CATEGORY_LABELS[cat] || cat).padEnd(30)} ${String(items.length).padStart(3)} findings  (score: ${totalScore.toFixed(1)})`);
  }
  lines.push('');

  lines.push('─── RÉPARTITION PAR OUTIL ────────────────────────────────────');
  lines.push('');
  for (const [tool, items] of Object.entries(byTool).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`  ${tool.padEnd(12)} ${String(items.length).padStart(3)} findings`);
  }
  lines.push('');

  lines.push('─── TOP FINDINGS (par score pondéré) ─────────────────────────');
  lines.push('');
  if (decision.top.length === 0) {
    lines.push('  Aucun finding significatif.');
  } else {
    for (let i = 0; i < decision.top.length; i++) {
      const t = decision.top[i];
      lines.push(`  #${i + 1}  [${t.score.toFixed(1)} pts] ${SEVERITY_LABELS[t.severity] || t.severity} — ${t.tool} — ${t.category}`);
      lines.push(`      ID: ${t.id}`);
      lines.push(`      Règle: ${t.ruleId}`);
      lines.push(`      Fichier: ${t.file}:${t.line}`);
      lines.push(`      Description: ${t.message}`);

      const rec = RECOMMENDATIONS[t.ruleId];
      if (rec) {
        lines.push(`      Action: ${rec.action}`);
        lines.push(`      Impact: ${rec.impact}`);
        if (rec.cwe && rec.cwe !== 'N/A') lines.push(`      Réf: ${rec.cwe}`);
      }
      lines.push('');
    }
  }

  lines.push('─── PLAN D\'ACTION RECOMMANDÉ ──────────────────────────────────');
  lines.push('');

  const secrets = byCategory.secrets || [];
  const sca = byCategory.sca || [];
  const sast = byCategory.sast || [];

  if (secrets.length > 0) {
    lines.push('  1. SÉCURITÉ IMMÉDIATE (secrets exposés) :');
    lines.push('     → Révoquer toutes les clés AWS exposées.');
    lines.push('     → Activer AWS IAM Access Analyzer.');
    lines.push(`     → ${secrets.length} secret(s) à traiter en priorité.`);
    lines.push('');
  }
  if (sca.length > 0) {
    lines.push('  2. MISES À JOUR DÉPENDANCES :');
    lines.push('     → Mettre à jour lodash >= 4.17.21 (CVE-2020-8203, CVE-2021-23337).');
    lines.push(`     → ${sca.length} vulnérabilité(s) SCA à corriger.`);
    lines.push('');
  }
  if (sast.length > 0) {
    lines.push('  3. CORRECTIONS CODE (SAST) :');
    lines.push('     → Supprimer les credentials en dur dans le code.');
    lines.push('     → Ajouter la validation des entrées pour les requêtes MongoDB.');
    lines.push(`     → ${sast.length} finding(s) SAST à corriger.`);
    lines.push('');
  }
  if (secrets.length === 0 && sca.length === 0 && sast.length === 0) {
    lines.push('  Aucune action critique requise. Le code respecte les seuils de sécurité.');
    lines.push('');
  }

  lines.push('─── MÉTHODOLOGIE ─────────────────────────────────────────────');
  lines.push('');
  lines.push('  Outils : SemGrep (SAST), Trivy (SCA), Gitleaks (secrets)');
  lines.push('  Scoring : sévérité × catégorie pondérée (seuil: ' + decision.blockThreshold + ')');
  lines.push('  Gate : déterministe — le rapport IA ne modifie pas la décision.');
  lines.push('');
  lines.push('═'.repeat(62));

  return lines.join('\n');
}

async function run(pivotPath, decisionPath, outPath) {
  const pivot = JSON.parse(fs.readFileSync(pivotPath, 'utf8'));
  const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf8'));
  let report = buildReport(pivot, decision);

  console.log('[report] deterministic report built');
  console.log('[report] calling LLM (Groq)...');
  const llm = await callLLM(pivot, decision);
  if (llm) {
    report += formatLLMSection(llm);
    console.log('[report] LLM summary appended');
  } else {
    console.log('[report] LLM unavailable — deterministic report only');
  }

  if (outPath) {
    fs.writeFileSync(outPath, report, 'utf8');
    console.log(`[report] written to ${outPath}`);
  }

  return report;
}

if (require.main === module) {
  const [pivotPath, decisionPath, outPath] = process.argv.slice(2);
  if (!pivotPath || !decisionPath) {
    console.error('Usage: node report.js <pivot.json> <decision.json> [output.txt]');
    process.exit(1);
  }
  run(pivotPath, decisionPath, outPath || pivotPath.replace('pivot.json', 'report.txt'))
    .catch(err => { console.error('[report] fatal:', err.message); process.exit(1); });
}

module.exports = { buildReport, run };
