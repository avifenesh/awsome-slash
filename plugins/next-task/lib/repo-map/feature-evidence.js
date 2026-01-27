/**
 * Feature evidence helpers for repo-map
 *
 * @module lib/repo-map/feature-evidence
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cache = require('./cache');
const {
  STOPWORDS,
  GENERIC_TOKENS,
  GENERIC_SYMBOL_NAMES,
  PATH_TOKEN_WHITELIST,
  TOKEN_ALIASES
} = require('./feature-lexicon');

const DEFAULT_OPTIONS = {
  maxFeatures: 40,
  maxDefsPerFeature: 6,
  maxRefsPerFeature: 6,
  maxFilesScannedPerDef: 8,
  snippetLines: 2,
  enablePathFallback: true,
  maxPathScanFiles: 4000
};

const ALIAS_ROOTS = buildAliasRoots();

function isImplementedByFileMatches(fileMatches, feature) {
  if (!Array.isArray(fileMatches) || fileMatches.length === 0) return false;
  const nonTestMatches = fileMatches.filter(entry => entry.testOnly !== true);
  if (nonTestMatches.length === 0) return false;
  if (nonTestMatches.some(entry => entry.kind === 'flag')) return true;
  if (feature?.hasNonGeneric) {
    return nonTestMatches.length >= 2;
  }
  return nonTestMatches.length >= 4;
}


const EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rs', '.go', '.java'
];

function findFeatureEvidence(basePath, features = [], options = {}) {
  const map = cache.load(basePath);
  if (!map) {
    return { available: false, features: [], unmatched: [] };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const normalizedFeatures = normalizeFeatures(features, opts.maxFeatures);
  if (normalizedFeatures.length === 0) {
    return { available: true, features: [], unmatched: [] };
  }

  const fileSet = new Set(Object.keys(map.files || {}));
  const reverseDeps = buildReverseDependencies(map, fileSet);
  const referenceIndex = buildReferenceIndex(map);
  const symbolIndex = buildSymbolIndex(map);

  const results = [];
  const unmatched = [];

  for (const feature of normalizedFeatures) {
    if (feature.sourceType === 'cargo' && feature.sourceFile) {
      results.push({
        feature: feature.original,
        normalized: feature.normalized,
        tokens: feature.tokens,
        status: 'implemented',
        defs: [{
          file: feature.sourceFile,
          name: feature.original,
          kind: 'cargo',
          line: feature.sourceLine || null,
          exported: false
        }],
        refs: [],
        snippets: []
      });
      continue;
    }
    const matches = matchFeatureToSymbols(feature, symbolIndex, opts.maxDefsPerFeature);
    if (matches.length === 0) {
      let fileMatches = matchFeatureToFiles(feature, map, opts.maxDefsPerFeature);
      if (fileMatches.length === 0 || fileMatches.every(entry => entry.testOnly)) {
        const hintMatches = matchFeatureToFlagStrings(basePath, map, feature, opts);
        if (hintMatches.length > 0) {
          fileMatches = hintMatches;
        }
      }
      if (fileMatches.length === 0 && opts.enablePathFallback) {
        fileMatches = matchFeatureToDiskFiles(basePath, feature, opts);
      }
      if (fileMatches.length === 0) {
        unmatched.push(feature.original);
        results.push({
          feature: feature.original,
          normalized: feature.normalized,
          tokens: feature.tokens,
          status: 'missing',
          defs: [],
          refs: [],
          snippets: []
        });
        continue;
      }
      const implementedByFiles = isImplementedByFileMatches(fileMatches, feature);
      results.push({
        feature: feature.original,
        normalized: feature.normalized,
        tokens: feature.tokens,
        status: implementedByFiles ? 'implemented' : 'partial',
        defs: fileMatches.map(entry => ({
          file: entry.file,
          name: entry.name,
          kind: entry.kind || 'file',
          line: entry.line || null,
          exported: false,
          testOnly: entry.testOnly === true
        })),
        refs: [],
        snippets: []
      });
      continue;
    }

    const defs = [];
    const refs = [];
    const snippets = [];
    let implemented = false;

    for (const def of matches) {
      const usage = collectUsageEvidence(basePath, def, reverseDeps, map, opts, referenceIndex);
      if (usage.used && !def.testOnly) implemented = true;
      defs.push({
        file: def.file,
        name: def.name,
        kind: def.kind,
        line: def.line,
        exported: def.exported || false,
        testOnly: def.testOnly === true
      });

      for (const ref of usage.refs) {
        refs.push(ref);
        if (refs.length >= opts.maxRefsPerFeature) break;
      }

      const snippet = getSnippet(basePath, def.file, def.line, opts.snippetLines);
      if (snippet) {
        snippets.push(snippet);
      }

      if (defs.length >= opts.maxDefsPerFeature) break;
    }

    if (!implemented) {
      let fileMatches = matchFeatureToFiles(feature, map, opts.maxDefsPerFeature);
      if (fileMatches.length === 0 || fileMatches.every(entry => entry.testOnly)) {
        const hintMatches = matchFeatureToFlagStrings(basePath, map, feature, opts);
        if (hintMatches.length > 0) {
          fileMatches = hintMatches;
        }
      }
      if (fileMatches.length === 0 && opts.enablePathFallback) {
        fileMatches = matchFeatureToDiskFiles(basePath, feature, opts);
      }
      if (isImplementedByFileMatches(fileMatches, feature)) {
        implemented = true;
      }
    }

    const status = implemented ? 'implemented' : 'partial';
    results.push({
      feature: feature.original,
      normalized: feature.normalized,
      tokens: feature.tokens,
      status,
      defs,
      refs: refs.slice(0, opts.maxRefsPerFeature),
      snippets
    });
  }

  return { available: true, features: results, unmatched };
}

function normalizeFeatures(features, maxFeatures) {
  const output = [];
  const seen = new Set();

  for (const item of Array.isArray(features) ? features : []) {
    const normalized = normalizeFeatureItem(item);
    if (!normalized || !normalized.tokens || normalized.tokens.length === 0) continue;
    if (seen.has(normalized.normalized)) continue;
    seen.add(normalized.normalized);
    output.push(normalized);
    if (output.length >= maxFeatures) break;
  }

  return output;
}

function normalizeFeatureItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const normalized = normalizeText(item);
    const tokens = expandTokens(tokenize(normalized));
    return {
      original: item,
      normalized,
      tokens,
      hasNonGeneric: tokens.some(token => !GENERIC_TOKENS.has(token)),
      sourceType: null,
      sourceFile: null,
      sourceLine: null
    };
  }

  if (typeof item === 'object') {
    const original = item.name || item.feature || item.normalized || '';
    const normalized = item.normalized || normalizeText(original);
    let tokens = Array.isArray(item.tokens) && item.tokens.length > 0
      ? item.tokens
      : tokenize(normalized);
    tokens = expandTokens(tokens);
    return {
      original,
      normalized,
      tokens,
      hasNonGeneric: tokens.some(token => !GENERIC_TOKENS.has(token)),
      sourceType: item.sourceType || null,
      sourceFile: item.sourceFile || null,
      sourceLine: item.sourceLine || null,
      context: item.context || null
    };
  }

  return null;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return String(text || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => (token.length >= 3 || isShortCodeToken(token)) && !STOPWORDS.has(token));
}

function expandTokens(tokens) {
  const output = [];
  const seen = new Set();
  const aliasLists = new Map();
  const addToken = (token) => {
    const value = String(token || '').trim();
    if (!value || (value.length < 3 && !isShortCodeToken(value))) return;
    if (STOPWORDS.has(value)) return;
    if (seen.has(value)) return;
    seen.add(value);
    output.push(value);
  };
  const collectAliases = (token) => {
    if (!token) return [];
    if (aliasLists.has(token)) return aliasLists.get(token);
    let aliases = [];
    if (Object.prototype.hasOwnProperty.call(TOKEN_ALIASES, token)) {
      const value = TOKEN_ALIASES[token];
      if (Array.isArray(value)) {
        aliases = value;
      } else if (typeof value === 'string') {
        aliases = [value];
      }
    }
    aliasLists.set(token, aliases);
    return aliases;
  };

  for (const raw of Array.isArray(tokens) ? tokens : []) {
    const token = String(raw || '').trim();
    if (!token) continue;
    const base = singularizeToken(token);
    addToken(base);
    if (base.includes('/') || base.includes('-')) {
      const parts = base.split(/[/-]+/).filter(part => part && part !== base);
      for (const part of parts) {
        addToken(part);
      }
    }
    const aliasSet = new Set();
    for (const alias of collectAliases(base)) aliasSet.add(alias);
    if (base !== token) {
      for (const alias of collectAliases(token)) aliasSet.add(alias);
    }
    for (const alias of aliasSet) {
      addToken(alias);
    }
  }

  if (seen.has('lets') && seen.has('encrypt')) addToken('letsencrypt');
  if (seen.has('let') && seen.has('encrypt')) addToken('letsencrypt');

  return output;
}

function singularizeToken(token) {
  const value = String(token || '').trim();
  if (!value) return value;
  if (isShortCodeToken(value)) return value;
  if (/\d/.test(value)) return value;
  if (value.endsWith('js') || value.endsWith('css')) return value;
  if (value.endsWith('indices')) return 'index';
  if (value.endsWith('axes') && value.length > 4) return `${value.slice(0, -2)}is`;
  if (value.endsWith('axis')) return value;
  if (/(is|us)$/.test(value)) return value;
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith('s') && value.length > 3 && !value.endsWith('ss')) return value.slice(0, -1);
  return value;
}

function buildAliasRoots() {
  const roots = new Map();
  for (const [root, aliases] of Object.entries(TOKEN_ALIASES)) {
    const rootValue = String(root || '').trim();
    if (rootValue) roots.set(rootValue, rootValue);
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        const aliasValue = String(alias || '').trim();
        if (!aliasValue || roots.has(aliasValue)) continue;
        roots.set(aliasValue, rootValue || aliasValue);
      }
    } else if (typeof aliases === 'string') {
      const aliasValue = String(aliases || '').trim();
      if (aliasValue && !roots.has(aliasValue)) {
        roots.set(aliasValue, rootValue || aliasValue);
      }
    }
  }
  return roots;
}

function canonicalizeToken(token) {
  const value = String(token || '').trim();
  if (!value) return value;
  return ALIAS_ROOTS.get(value) || value;
}

function isShortCodeToken(token) {
  return /^[a-z]\d$/i.test(token) || /^\d[a-z]$/i.test(token);
}

function isValidSymbolName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (value.length > 120) return false;
  if (/\s/.test(value)) return false;
  if (/[(){}\[\];]/.test(value)) return false;
  if (value.includes('=>')) return false;
  return true;
}

function buildSymbolIndex(map) {
  const index = [];
  for (const [file, data] of Object.entries(map.files || {})) {
    if (isTestFile(file) || isDocLikePath(file)) continue;
    const symbols = data.symbols || {};
    for (const [kind, list] of Object.entries(symbols)) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (!entry || !entry.name) continue;
        if (!isValidSymbolName(entry.name)) continue;
        index.push({
          file,
          name: entry.name,
          kind,
          line: entry.line || null,
          exported: entry.exported || kind === 'exports'
        });
      }
    }
  }
  return index;
}

function matchFeatureToSymbols(feature, symbolIndex, limit) {
  const matches = [];
  for (const symbol of symbolIndex) {
    if (isGenericSymbolName(symbol.name) && (feature?.tokens || []).length >= 2) continue;
    if (looksLikeTestSymbol(symbol.name)) continue;
    const score = featureMatchScore(feature, symbol.name, symbol.file);
    if (score <= 0) continue;
    matches.push({ ...symbol, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.exported !== b.exported) return a.exported ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nonTest = matches.filter(entry => !isTestFile(entry.file));
  if (nonTest.length > 0) return nonTest.slice(0, limit);

  const testOnly = matches.filter(entry => isTestFile(entry.file));
  if (testOnly.length === 0) return [];
  return testOnly.slice(0, limit).map(entry => ({ ...entry, testOnly: true }));
}

function featureMatchScore(feature, symbolName, filePath) {
  const tokens = feature?.tokens || [];
  if (tokens.length === 0) return 0;
  const onlyGeneric = feature?.hasNonGeneric === false;
  const nonGenericTokens = tokens.filter(token => !GENERIC_TOKENS.has(token));
  const nameLower = String(symbolName || '').toLowerCase();
  const nameNormalized = normalizeSymbolName(symbolName);
  const fileLower = String(filePath || '').toLowerCase();
  let count = 0;
  let nameMatches = 0;
  let fileMatches = 0;
  const matchedTokens = new Set();
  const matchedRoots = new Set();

  for (const token of tokens) {
    if (onlyGeneric) {
      const wordMatch = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(nameNormalized);
      if (wordMatch) {
        count += 2;
        nameMatches += 1;
        matchedTokens.add(token);
        matchedRoots.add(canonicalizeToken(token));
      }
      continue;
    }

    if (token.length <= 4) {
      const wordMatch = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(nameNormalized);
      if (wordMatch) {
        count += 2;
        nameMatches += 1;
        matchedTokens.add(token);
        matchedRoots.add(canonicalizeToken(token));
      } else if (fileLower.includes(token) && (token.length >= 5 || PATH_TOKEN_WHITELIST.has(token))) {
        count += 1;
        fileMatches += 1;
        matchedTokens.add(token);
        matchedRoots.add(canonicalizeToken(token));
      }
      continue;
    }

    if (nameLower.includes(token)) {
      count += 2;
      nameMatches += 1;
      matchedTokens.add(token);
      matchedRoots.add(canonicalizeToken(token));
    } else if (fileLower.includes(token) && (token.length >= 5 || PATH_TOKEN_WHITELIST.has(token))) {
      count += 1;
      fileMatches += 1;
      matchedTokens.add(token);
      matchedRoots.add(canonicalizeToken(token));
    }
  }

  const matchCount = matchedRoots.size;
  let requiredMatches = tokens.length >= 2 ? 2 : 1;
  if (nonGenericTokens.length <= 1) {
    requiredMatches = 1;
  } else if (nameMatches > 0 && tokens.length >= 3) {
    requiredMatches = 1;
  } else if (nonGenericTokens.length === 0 && tokens.length >= 2) {
    requiredMatches = 2;
  }
  if (matchCount < requiredMatches) return 0;
  if (nonGenericTokens.length > 0) {
    const nonGenericMatched = nonGenericTokens
      .map(token => canonicalizeToken(token))
      .filter(token => matchedRoots.has(token)).length;
    if (nonGenericMatched === 0) return 0;
  }
  if (nameMatches === 0 && fileMatches === 0) return 0;
  if (onlyGeneric && nameMatches === 0) return 0;
  if (isTestFile(filePath)) count -= 1;
  return count > 0 ? count : 0;
}

function normalizeSymbolName(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\\-]+/g, ' ')
    .toLowerCase();
}

function isGenericSymbolName(name) {
  if (!name) return true;
  const raw = String(name);
  const normalized = raw.toLowerCase();
  if (GENERIC_SYMBOL_NAMES.has(normalized)) return true;
  if (normalized.length <= 2 && !/^[A-Z]{2,}$/.test(raw)) return true;
  return false;
}

function looksLikeTestSymbol(name) {
  if (!name) return false;
  const normalized = String(name).toLowerCase();
  if (normalized.startsWith('test_') || normalized.startsWith('test')) return true;
  if (normalized.includes('spec')) return true;
  return false;
}

function isTestFile(filePath) {
  if (!filePath) return false;
  const lower = String(filePath).toLowerCase();
  const normalized = lower.replace(/\\/g, '/');
  if (lower.includes('_test.') || lower.includes('.spec.') || lower.includes('.test.')) return true;
  if (normalized.startsWith('test/') || normalized.startsWith('tests/')) return true;
  if (normalized.includes('/test/') || normalized.includes('/tests/') || normalized.includes('__tests__')) return true;
  if (lower.includes('\\test\\') || lower.includes('\\tests\\') || lower.includes('__tests__')) return true;
  return false;
}

function isDocLikePath(filePath) {
  if (!filePath) return false;
  const normalized = String(filePath).replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/docs/')) return true;
  if (normalized.includes('/documentation/')) return true;
  if (normalized.includes('/doc/')) return true;
  if (normalized.includes('/examples/')) return true;
  if (normalized.includes('/example/')) return true;
  if (normalized.includes('/samples/')) return true;
  if (normalized.includes('/sample/')) return true;
  if (normalized.includes('/guides/')) return true;
  if (normalized.includes('/guide/')) return true;
  return false;
}

function buildReverseDependencies(map, fileSet) {
  const reverse = new Map();
  for (const [file, deps] of Object.entries(map.dependencies || {})) {
    if (!Array.isArray(deps)) continue;
    for (const source of deps) {
      const resolved = resolveImportSource(file, source, fileSet);
      if (!resolved) continue;
      if (!reverse.has(resolved)) reverse.set(resolved, new Set());
      reverse.get(resolved).add(file);
    }
  }
  return reverse;
}

function buildReferenceIndex(map) {
  const index = new Map();
  for (const [file, data] of Object.entries(map.files || {})) {
    const refs = data.references;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      if (!ref || !ref.name) continue;
      const name = ref.name;
      if (!index.has(name)) index.set(name, new Map());
      const fileMap = index.get(name);
      fileMap.set(file, (fileMap.get(file) || 0) + (ref.count || 1));
    }
  }
  return index;
}

function matchFeatureToFiles(feature, map, limit) {
  const files = Object.keys(map.files || {});
  const tokens = feature?.tokens || [];
  if (tokens.length === 0) return [];
  const nonGeneric = tokens.filter(token => !GENERIC_TOKENS.has(token));
  const matches = [];
  const testMatches = [];

  for (const file of files) {
    if (isDocLikePath(file)) continue;
    const isTest = isTestFile(file);
    const fileLower = file.toLowerCase();
    const matched = new Set();
    for (const token of tokens) {
      if (token.length < 4 && !PATH_TOKEN_WHITELIST.has(token)) continue;
      if (fileLower.includes(token)) matched.add(token);
    }
    if (matched.size === 0) continue;
    if (nonGeneric.length > 0) {
      const nonGenericMatched = nonGeneric.some(token => matched.has(token));
      if (!nonGenericMatched && matched.size < 2) continue;
    }
    const score = matched.size + (nonGeneric.length > 0 ? 1 : 0);
    const entry = {
      file,
      name: path.posix.basename(file),
      kind: 'file',
      score
    };
    if (isTest) {
      testMatches.push(entry);
    } else {
      matches.push(entry);
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.localeCompare(b.file);
  });

  if (matches.length > 0) return matches.slice(0, limit);

  testMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.localeCompare(b.file);
  });

  return testMatches.slice(0, limit).map(entry => ({ ...entry, testOnly: true }));
}

function extractFlagHints(feature) {
  const raw = [feature?.context, feature?.original, feature?.normalized].filter(Boolean).join(' ');
  if (!raw) return [];
  const matches = raw.match(/--[a-z0-9][\w-]*/gi) || [];
  const normalized = String(feature?.normalized || '').toLowerCase();
  if (/\b(command[-\s]?line|argv|arguments?)\b/.test(normalized)) {
    matches.push('argv', 'sys.argv');
  }
  return Array.from(new Set(matches.map(match => match.toLowerCase())));
}

function expandFlagVariants(flag) {
  const cleaned = String(flag || '').toLowerCase();
  if (!cleaned) return [];
  if (!cleaned.startsWith('--')) {
    return [cleaned];
  }
  const base = cleaned.replace(/^--/, '');
  if (!base) return [];
  const variants = new Set();
  variants.add(`--${base}`);
  variants.add(base);
  variants.add(base.replace(/-/g, '_'));
  variants.add(base.replace(/-/g, ''));
  return Array.from(variants);
}

function matchFeatureToFlagStrings(basePath, map, feature, options) {
  const flags = extractFlagHints(feature);
  if (flags.length === 0) return [];
  const limit = Number(options?.maxDefsPerFeature) || DEFAULT_OPTIONS.maxDefsPerFeature;
  const maxFiles = Number(options?.maxPathScanFiles) || DEFAULT_OPTIONS.maxPathScanFiles;
  const files = Object.keys(map.files || {}).slice(0, maxFiles);
  const matches = [];
  const testMatches = [];
  const flagVariants = flags.flatMap(expandFlagVariants);
  const uniqueVariants = Array.from(new Set(flagVariants));

  for (const file of files) {
    if (matches.length >= limit) break;
    if (isDocLikePath(file)) continue;
    const fullPath = path.join(basePath, file);
    let content;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 512 * 1024) continue;
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    const found = uniqueVariants.find(variant => lower.includes(variant));
    if (!found) continue;
    const entry = {
      file,
      name: found,
      kind: 'flag',
      score: 1
    };
    if (isTestFile(file)) {
      testMatches.push(entry);
    } else {
      matches.push(entry);
    }
  }

  if (matches.length > 0) return matches.slice(0, limit);
  return testMatches.slice(0, limit).map(entry => ({ ...entry, testOnly: true }));
}

function matchFeatureToDiskFiles(basePath, feature, options) {
  const tokens = feature?.tokens || [];
  if (tokens.length === 0) return [];
  const nonGeneric = tokens.filter(token => !GENERIC_TOKENS.has(token));
  const limit = Number(options?.maxDefsPerFeature) || DEFAULT_OPTIONS.maxDefsPerFeature;
  const maxScan = Number(options?.maxPathScanFiles) || DEFAULT_OPTIONS.maxPathScanFiles;
  const matches = [];
  const testMatches = [];
  const files = listCodeFiles(basePath, maxScan);

  for (const file of files) {
    if (isDocLikePath(file)) continue;
    const isTest = isTestFile(file);
    const fileLower = file.toLowerCase();
    const matched = new Set();
    for (const token of tokens) {
      if (token.length < 4 && !PATH_TOKEN_WHITELIST.has(token)) continue;
      if (fileLower.includes(token)) matched.add(token);
    }
    if (matched.size === 0) continue;
    if (nonGeneric.length > 0) {
      const nonGenericMatched = nonGeneric.some(token => matched.has(token));
      if (!nonGenericMatched && matched.size < 2) continue;
    }
    const score = matched.size + (nonGeneric.length > 0 ? 1 : 0);
    const entry = {
      file,
      name: path.posix.basename(file),
      kind: 'file',
      score
    };
    if (isTest) {
      testMatches.push(entry);
    } else {
      matches.push(entry);
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.localeCompare(b.file);
  });

  if (matches.length > 0) return matches.slice(0, limit);

  testMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.localeCompare(b.file);
  });

  return testMatches.slice(0, limit).map(entry => ({ ...entry, testOnly: true }));
}

function listCodeFiles(basePath, maxFiles) {
  const results = [];
  const stack = [basePath];
  const skipDirs = new Set([
    '.git', 'node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'coverage',
    '.cache', '.next', 'tmp', 'temp', 'bin', 'obj', '.idea', '.vscode'
  ]);

  while (stack.length > 0 && results.length < maxFiles) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!EXTENSIONS.includes(ext)) continue;
      const relative = path.relative(basePath, fullPath).replace(/\\/g, '/');
      results.push(relative);
    }
  }

  return results;
}

function resolveImportSource(fromFile, source, fileSet) {
  if (!source || typeof source !== 'string') return null;
  let basePath = null;

  if (source.startsWith('.')) {
    const dir = path.posix.dirname(fromFile);
    basePath = path.posix.normalize(path.posix.join(dir, source));
  } else if (source.startsWith('/')) {
    basePath = source.replace(/^\/+/, '');
  } else {
    return null;
  }

  const candidates = [];
  candidates.push(basePath);
  for (const ext of EXTENSIONS) {
    candidates.push(`${basePath}${ext}`);
  }
  for (const ext of EXTENSIONS) {
    candidates.push(path.posix.join(basePath, `index${ext}`));
  }

  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, '/');
    if (fileSet.has(normalized)) return normalized;
  }

  return null;
}

function collectUsageEvidence(basePath, def, reverseDeps, map, options, referenceIndex) {
  const refs = [];
  let used = false;
  const importers = reverseDeps.get(def.file) ? Array.from(reverseDeps.get(def.file)) : [];

  const filesToScan = importers.slice(0, options.maxFilesScannedPerDef);
  for (const file of filesToScan) {
    const count = countSymbolInMap(map, file, def.name) ?? countSymbolInFile(basePath, file, def.name);
    if (count > 0) {
      refs.push({ file, count });
      if (refs.length >= options.maxRefsPerFeature) break;
    }
  }

  if (refs.length > 0) {
    used = true;
  } else if (def.exported && importers.length > 0) {
    used = true;
  } else {
    const refFiles = referenceIndex?.get(def.name);
    if (refFiles && refFiles.size > 0) {
      for (const [file, count] of refFiles.entries()) {
        if (file === def.file) continue;
        if (isTestFile(file)) continue;
        refs.push({ file, count });
        if (refs.length >= options.maxRefsPerFeature) break;
      }
      if (refs.length > 0) {
        used = true;
      }
    }
  }

  if (!used) {
    const selfCount = countSymbolInMap(map, def.file, def.name) ?? countSymbolInFile(basePath, def.file, def.name);
    if (selfCount > 1) used = true;
  }

  if (!used && def.exported && !isTestFile(def.file)) {
    used = true;
  }

  return { used, refs };
}

function countSymbolInFile(basePath, relativePath, symbolName) {
  if (!relativePath || !symbolName) return 0;
  const fullPath = path.join(basePath, relativePath);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return 0;
  }
  const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function countSymbolInMap(map, relativePath, symbolName) {
  const fileData = map?.files?.[relativePath];
  if (!fileData || !Array.isArray(fileData.references)) return null;
  let count = 0;
  for (const ref of fileData.references) {
    if (ref && ref.name === symbolName) {
      count += ref.count || 1;
    }
  }
  return count;
}

function getSnippet(basePath, relativePath, lineNumber, radius) {
  if (!relativePath || !lineNumber) return null;
  const fullPath = path.join(basePath, relativePath);
  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split(/\r?\n/);
  const index = Math.max(lineNumber - 1, 0);
  const start = Math.max(index - radius, 0);
  const end = Math.min(index + radius + 1, lines.length);
  const text = lines.slice(start, end).join('\n').trim();
  if (!text) return null;
  return { file: relativePath, line: lineNumber, text };
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  findFeatureEvidence
};
