'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const TIMEOUT_MS = 30_000;

function loadKey() {
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) return envKey;
  try {
    return fs.readFileSync(path.join(os.homedir(), '.config', 'devsecops', 'gemini-key'), 'utf8').trim();
  } catch { return null; }
}

function buildPrompt(pivot, decision) {
  const findings = (pivot.findings || []).slice(0, 15);
  const top = (decision.top || []).slice(0, 10);

  const bySeverity = {};
  const byCategory = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  const compact = {
    decision: decision.decision,
    totalScore: decision.totalScore,
    blockThreshold: decision.blockThreshold,
    rawFindings: decision.rawFindings,
    bySeverity,
    byCategory,
    topFindings: top.map(t => ({
      ruleId: t.ruleId,
      tool: t.tool,
      category: t.category,
      severity: t.severity,
      score: t.score,
      file: t.file,
      line: t.line,
      message: t.message,
    })),
  };

  const system = `Tu es un expert DevSecOps francophone. Tu reçois des données brutes d'un pipeline de sécurité (scores, findings, répartitions). Tu dois générer un résumé exécutif en langage naturel clair et concis, destiné à un tech lead ou un CISO. Tu ne modifies JAMAIS la décision (BLOCK/PASS) — tu l'expliques uniquement.

Réponds STRICTEMENT en JSON valide (pas de markdown, pas de backticks) :
{
  "summary": "Résumé de 2-3 phrases de l'état de sécurité",
  "topRisks": ["risque 1", "risque 2", "risque 3"],
  "recommendations": ["action 1 prioritaire", "action 2", "action 3"]
}`;

  const user = `Données du scan :\n${JSON.stringify(compact, null, 2)}`;

  return { system, user };
}

async function callLLM(pivot, decision) {
  const apiKey = loadKey();
  if (!apiKey) {
    console.error('[llm] no API key found (GEMINI_API_KEY or ~/.config/devsecops/gemini-key)');
    return null;
  }

  const { system, user } = buildPrompt(pivot, decision);
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[llm] API error ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      console.error('[llm] empty response from API');
      return null;
    }

    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[llm] call failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatLLMSection(llm) {
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(62));
  lines.push('=== RÉSUMÉ EXÉCUTIF (généré par IA — Google Gemini) ===');
  lines.push('═'.repeat(62));
  lines.push('');

  lines.push(`  ${llm.summary}`);
  lines.push('');

  if (llm.topRisks && llm.topRisks.length > 0) {
    lines.push('  Risques prioritaires :');
    for (const r of llm.topRisks) {
      lines.push(`    → ${r}`);
    }
    lines.push('');
  }

  if (llm.recommendations && llm.recommendations.length > 0) {
    lines.push('  Recommandations :');
    for (let i = 0; i < llm.recommendations.length; i++) {
      lines.push(`    ${i + 1}. ${llm.recommendations[i]}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(62));
  return lines.join('\n');
}

module.exports = { callLLM, formatLLMSection };
