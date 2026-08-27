'use strict';

const fs = require('fs');
const path = require('path');

function analyzeComposition(appDir) {
  const findings = [];

  // 1. Check for exposed routes
  const routesDir = path.join(appDir, 'server', 'src', 'routes');
  if (fs.existsSync(routesDir)) {
    const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf8');

      // Check for unvalidated input
      if (content.includes('$where') || content.includes('$regex')) {
        findings.push({
          id: `composition-${findings.length}-${Date.now()}`,
          tool: 'composition',
          category: 'sast',
          severity: 'high',
          ruleId: 'unvalidated-nosql-operator',
          file: `app/server/src/routes/${file}`,
          line: 0,
          message: `NoSQL operator ($where/$regex) used in ${file} without input validation`,
          confidence: 0.9,
        });
      }

      // Check for missing auth
      if (content.includes('router.get') || content.includes('router.post')) {
        if (!content.includes('auth') && !content.includes('middleware')) {
          findings.push({
            id: `composition-${findings.length}-${Date.now()}`,
            tool: 'composition',
            category: 'sast',
            severity: 'medium',
            ruleId: 'missing-auth-middleware',
            file: `app/server/src/routes/${file}`,
            line: 0,
            message: `Route file ${file} may lack authentication middleware`,
            confidence: 0.6,
          });
        }
      }
    }
  }

  // 2. Check for hardcoded secrets in config
  const configPath = path.join(appDir, 'server', 'src', 'config.js');
  if (fs.existsSync(configPath)) {
    const config = fs.readFileSync(configPath, 'utf8');
    if (config.includes('apiKey') || config.includes('password') || config.includes('secret')) {
      findings.push({
        id: `composition-${findings.length}-${Date.now()}`,
        tool: 'composition',
        category: 'secrets',
        severity: 'critical',
        ruleId: 'hardcoded-secrets-in-config',
        file: 'app/server/src/config.js',
        line: 0,
        message: 'Configuration file contains hardcoded secrets',
        confidence: 1.0,
      });
    }
  }

  // 3. Check for vulnerable dependencies
  const packagePath = path.join(appDir, 'server', 'package.json');
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Check for known vulnerable packages
    const vulnerablePackages = {
      'lodash': { maxSafe: '4.17.21', ruleId: 'vulnerable-lodash' },
      'express': { maxSafe: '4.18.2', ruleId: 'outdated-express' },
    };

    for (const [name, version] of Object.entries(deps || {})) {
      const vuln = vulnerablePackages[name];
      if (vuln) {
        const cleanVersion = version.replace(/^[^0-9]/, '');
        if (cleanVersion < vuln.maxSafe) {
          findings.push({
            id: `composition-${findings.length}-${Date.now()}`,
            tool: 'composition',
            category: 'sca',
            severity: 'high',
            ruleId: vuln.ruleId,
            file: 'app/server/package.json',
            line: 0,
            message: `${name}@${cleanVersion} is below recommended safe version ${vuln.maxSafe}`,
            confidence: 0.95,
          });
        }
      }
    }
  }

  // 4. Check for container exposure
  const dockerPath = path.join(appDir, 'server', 'Dockerfile');
  if (fs.existsSync(dockerPath)) {
    const dockerfile = fs.readFileSync(dockerPath, 'utf8');

    if (!dockerfile.includes('USER') || dockerfile.includes('USER root')) {
      findings.push({
        id: `composition-${findings.length}-${Date.now()}`,
        tool: 'composition',
        category: 'container',
        severity: 'medium',
        ruleId: 'container-running-as-root',
        file: 'app/server/Dockerfile',
        line: 0,
        message: 'Container runs as root user',
        confidence: 0.9,
      });
    }

    if (!dockerfile.includes('--no-cache')) {
      findings.push({
        id: `composition-${findings.length}-${Date.now()}`,
        tool: 'composition',
        category: 'container',
        severity: 'low',
        ruleId: 'dockerfile-cache-not-disabled',
        file: 'app/server/Dockerfile',
        line: 0,
        message: 'Dockerfile build may use cached layers',
        confidence: 0.5,
      });
    }
  }

  return findings;
}

function run(appDir, outPath) {
  const findings = analyzeComposition(appDir);
  const pivot = { findings };

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(pivot, null, 2), 'utf8');
    console.log(`[composition] ${findings.length} findings → ${outPath}`);
  }

  return pivot;
}

if (require.main === module) {
  const [appDir, outPath] = process.argv.slice(2);
  if (!appDir) {
    console.error('Usage: node composition.js <app-dir> [pivot.json]');
    process.exit(1);
  }
  run(appDir, outPath || path.join(appDir, '..', 'pipeline', 'out', 'pivot-composition.json'));
}

module.exports = { analyzeComposition, run };
