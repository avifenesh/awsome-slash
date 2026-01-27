#!/usr/bin/env node
/**
 * Feature extraction tuning runner
 *
 * Usage:
 *  node scripts/tune-feature-extraction.js --repos plans/skills-integration/research/feature-tuning-repos.json --clone-root ../feature-tuning-repos
 *  node scripts/tune-feature-extraction.js --local ../valkey-glide --local ../balance-beacon --local ../tuicr --no-clone
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const repoMap = require('../lib/repo-map');
const collectors = require('../lib/drift-detect/collectors');
const featureExtractor = require('../lib/drift-detect/feature-extractor');

const args = process.argv.slice(2);
const options = {
  reposFile: null,
  cloneRoot: path.resolve(process.cwd(), '../feature-tuning-repos'),
  allowClone: true,
  maxRepos: 60,
  locals: [],
  deleteAfter: false,
  sequential: false,
  limitLanguage: true,
  maxFilesPerLanguage: 2000,
  output: path.resolve(process.cwd(), 'plans/skills-integration/research/feature-tuning-report.md')
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--repos') options.reposFile = args[i + 1];
  if (arg === '--clone-root') options.cloneRoot = path.resolve(args[i + 1]);
  if (arg === '--no-clone') options.allowClone = false;
  if (arg === '--max-repos') options.maxRepos = Number(args[i + 1]) || options.maxRepos;
  if (arg === '--local') options.locals.push(args[i + 1]);
  if (arg === '--output') options.output = path.resolve(args[i + 1]);
  if (arg === '--delete-after') options.deleteAfter = true;
  if (arg === '--sequential') options.sequential = true;
  if (arg === '--no-limit-language') options.limitLanguage = false;
  if (arg === '--max-files-per-language') options.maxFilesPerLanguage = Number(args[i + 1]) || options.maxFilesPerLanguage;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeRepoName(fullName) {
  return fullName.replace(/[\\/]/g, '__');
}

function repoPathFor(entry) {
  if (entry.path) return entry.path;
  if (!entry.name) return null;
  return path.join(options.cloneRoot, sanitizeRepoName(entry.name));
}

function cloneRepo(entry, targetPath) {
  if (!options.allowClone || !entry.name) return false;
  ensureDir(options.cloneRoot);
  try {
    execSync(`git clone --filter=blob:none --depth 1 https://github.com/${entry.name}.git "${targetPath}"`, {
      stdio: 'inherit'
    });
    return true;
  } catch {
    return false;
  }
}

function summarizeFeatureEvidence(featureEvidence) {
  const summary = { implemented: 0, partial: 0, missing: 0 };
  if (!featureEvidence || !Array.isArray(featureEvidence.features)) return summary;
  for (const item of featureEvidence.features) {
    if (item.status === 'implemented') summary.implemented += 1;
    else if (item.status === 'partial') summary.partial += 1;
    else summary.missing += 1;
  }
  return summary;
}

function collectTokenStats(featureEvidence) {
  const tokenStats = new Map();
  if (!featureEvidence || !Array.isArray(featureEvidence.features)) return tokenStats;
  for (const item of featureEvidence.features) {
    if (!Array.isArray(item.tokens)) continue;
    for (const token of item.tokens) {
      if (!tokenStats.has(token)) {
        tokenStats.set(token, { total: 0, missing: 0 });
      }
      const entry = tokenStats.get(token);
      entry.total += 1;
      if (item.status === 'missing') entry.missing += 1;
    }
  }
  return tokenStats;
}

function buildRepoEntries() {
  const entries = [];
  const locals = options.locals || [];
  for (const local of locals) {
    entries.push({ name: local, path: path.resolve(local), local: true });
  }

  if (options.reposFile) {
    const list = safeReadJson(options.reposFile) || [];
    const ordered = options.sequential ? reorderByLanguage(list) : list;
    for (const entry of ordered.slice(0, options.maxRepos)) {
      if (!entry || !entry.name) continue;
      entries.push({ name: entry.name, language: entry.language });
    }
  }

  return entries;
}

async function run() {
  const installed = repoMap.installer.checkInstalledSync();
  if (!installed.found || !repoMap.installer.meetsMinimumVersion(installed.version)) {
    console.error('ast-grep not available; repo-map init/update will be skipped.');
  }

  const entries = buildRepoEntries();
  const report = [];
  const aggregateTokens = new Map();
  const aggregateStopwords = new Map();

  for (const entry of entries) {
    const repoPath = repoPathFor(entry);
    if (!repoPath) continue;
    if (!fs.existsSync(repoPath)) {
      const cloned = cloneRepo(entry, repoPath);
      if (!cloned) {
        report.push({ name: entry.name, status: 'skipped', reason: 'clone failed or disabled' });
        continue;
      }
    }

    try {
      if (installed.found) {
        if (repoMap.exists(repoPath)) {
          await repoMap.update(repoPath, {});
        } else {
          const initOptions = { includeDocs: false };
          if (options.limitLanguage && entry.language) {
            const mapped = mapLanguage(entry.language);
            if (mapped) initOptions.languages = [mapped];
          }
          if (Number.isFinite(options.maxFilesPerLanguage)) {
            initOptions.maxFilesPerLanguage = options.maxFilesPerLanguage;
          }
          await repoMap.init(repoPath, initOptions);
        }
      }

      const data = collectors.collectAllData({
        cwd: repoPath,
        sources: ['docs', 'code'],
        depth: 'thorough'
      });

      const featureEvidence = data.code?.repoMap?.featureEvidence;
      const evidenceSummary = summarizeFeatureEvidence(featureEvidence);
      const extracted = data.docs?.features?.length || 0;
      const tokenStats = collectTokenStats(featureEvidence);
      for (const [token, stats] of tokenStats) {
        if (!aggregateTokens.has(token)) aggregateTokens.set(token, { total: 0, missing: 0 });
        const entryStats = aggregateTokens.get(token);
        entryStats.total += stats.total;
        entryStats.missing += stats.missing;
      }

      const repoStopwords = suggestStopwords(tokenStats);
      for (const stopword of repoStopwords) {
        aggregateStopwords.set(stopword, (aggregateStopwords.get(stopword) || 0) + 1);
      }

      report.push({
        name: entry.name,
        path: repoPath,
        language: entry.language || 'local',
        extracted,
        implemented: evidenceSummary.implemented,
        partial: evidenceSummary.partial,
        missing: evidenceSummary.missing,
        stopwords: repoStopwords
      });
    } catch (error) {
      report.push({ name: entry.name, status: 'error', reason: error.message });
    }

    if (options.deleteAfter && !entry.local) {
      removeRepo(repoPath);
    }
  }

  const topTokens = Array.from(aggregateTokens.entries())
    .map(([token, stats]) => ({
      token,
      total: stats.total,
      missing: stats.missing,
      missingRate: stats.total > 0 ? (stats.missing / stats.total) : 0
    }))
    .filter(item => item.total >= 8)
    .sort((a, b) => {
      if (b.missingRate !== a.missingRate) return b.missingRate - a.missingRate;
      return b.total - a.total;
    })
    .slice(0, 20);

  const lines = [
    '# Feature Extraction Tuning Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Per-Repo Summary',
    ''
  ];

  for (const item of report) {
    if (item.status === 'skipped' || item.status === 'error') {
      lines.push(`- ${item.name}: ${item.status} (${item.reason})`);
      continue;
    }
    lines.push(`- ${item.name} [${item.language}] — features: ${item.extracted}, implemented: ${item.implemented}, partial: ${item.partial}, missing: ${item.missing}`);
  }

  lines.push('', '## Token Noise Candidates', '');
  for (const token of topTokens) {
    const percent = Math.round(token.missingRate * 100);
    lines.push(`- ${token.token}: missing ${percent}% (${token.missing}/${token.total})`);
  }

  const stableStopwords = Array.from(aggregateStopwords.entries())
    .filter(([, count]) => count >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  if (stableStopwords.length > 0) {
    lines.push('', '## Suggested Stopwords', '');
    for (const [token, count] of stableStopwords) {
      lines.push(`- ${token} (flagged in ${count} repos)`);
    }
  }

  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, lines.join('\n'), 'utf8');
}

run();

function suggestStopwords(tokenStats) {
  const candidates = [];
  for (const [token, stats] of tokenStats.entries()) {
    if (stats.total < 8) continue;
    const rate = stats.total > 0 ? stats.missing / stats.total : 0;
    if (rate >= 0.8) candidates.push(token);
  }
  return candidates.slice(0, 15);
}

function removeRepo(repoPath) {
  try {
    fs.rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function reorderByLanguage(list) {
  const buckets = new Map();
  for (const entry of list) {
    const lang = entry.language || 'Unknown';
    if (!buckets.has(lang)) buckets.set(lang, []);
    buckets.get(lang).push(entry);
  }
  const ordered = [];
  const keys = Array.from(buckets.keys());
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket && bucket.length > 0) {
        ordered.push(bucket.shift());
        remaining = true;
      }
    }
  }
  return ordered;
}

function mapLanguage(label) {
  const value = String(label || '').toLowerCase();
  if (value.startsWith('javascript')) return 'javascript';
  if (value.startsWith('typescript')) return 'typescript';
  if (value.startsWith('python')) return 'python';
  if (value === 'go' || value === 'golang') return 'go';
  if (value.startsWith('rust')) return 'rust';
  if (value.startsWith('java')) return 'java';
  return null;
}
