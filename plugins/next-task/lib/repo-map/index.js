/**
 * Repo Map - AST-based repository symbol mapping
 * 
 * Uses ast-grep (sg) for accurate symbol extraction across multiple languages.
 * Generates a cached map of exports, functions, classes, and imports.
 * 
 * @module lib/repo-map
 */

'use strict';

const installer = require('./installer');
const runner = require('./runner');
const cache = require('./cache');
const updater = require('./updater');
const featureEvidence = require('./feature-evidence');

const EXT_LANGUAGE_MAP = new Map([
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.rs', 'rust'],
  ['.go', 'go'],
  ['.py', 'python'],
  ['.java', 'java']
]);

/**
 * Initialize a new repo map (full scan)
 * @param {string} basePath - Repository root path
 * @param {Object} options - Options
 * @param {boolean} options.force - Force rebuild even if map exists
 * @param {string[]} options.languages - Languages to scan (auto-detect if not specified)
 * @returns {Promise<{success: boolean, map?: Object, error?: string}>}
 */
async function init(basePath, options = {}) {
  // Check if ast-grep is installed
  const installed = await installer.checkInstalled();
  if (!installed.found) {
    return {
      success: false,
      error: 'ast-grep not found',
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!installer.meetsMinimumVersion(installed.version)) {
    return {
      success: false,
      error: `ast-grep version ${installed.version || 'unknown'} is too old. Minimum required: ${installer.getMinimumVersion()}`,
      installSuggestion: installer.getInstallInstructions()
    };
  }

  // Check if map already exists
  const existing = cache.load(basePath);
  if (existing && !options.force) {
    return {
      success: false,
      error: 'Repo map already exists. Use --force to rebuild or /repo-map update to refresh.',
      existing: cache.getStatus(basePath)
    };
  }

  // Detect languages in the project
  const languages = options.languages || await runner.detectLanguages(basePath);
  if (languages.length === 0) {
    return {
      success: false,
      error: 'No supported languages detected in repository'
    };
  }

  // Run full scan
  const startTime = Date.now();
  const map = await runner.fullScan(basePath, languages, {
    includeDocs: options.includeDocs,
    docsDepth: options.docsDepth,
    maxFilesPerLanguage: options.maxFilesPerLanguage
  });
  map.stats.scanDurationMs = Date.now() - startTime;

  // Save map
  cache.save(basePath, map);

  return {
    success: true,
    map,
    summary: {
      files: Object.keys(map.files).length,
      symbols: map.stats.totalSymbols,
      languages: map.project.languages,
      duration: map.stats.scanDurationMs
    }
  };
}

/**
 * Update an existing repo map (incremental)
 * @param {string} basePath - Repository root path
 * @param {Object} options - Options
 * @param {boolean} options.full - Force full rebuild instead of incremental
 * @returns {Promise<{success: boolean, changes?: Object, error?: string}>}
 */
async function update(basePath, options = {}) {
  // Check if ast-grep is installed
  const installed = await installer.checkInstalled();
  if (!installed.found) {
    return {
      success: false,
      error: 'ast-grep not found',
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!installer.meetsMinimumVersion(installed.version)) {
    return {
      success: false,
      error: `ast-grep version ${installed.version || 'unknown'} is too old. Minimum required: ${installer.getMinimumVersion()}`,
      installSuggestion: installer.getInstallInstructions()
    };
  }

  // Load existing map
  const existing = cache.load(basePath);
  if (!existing) {
    return {
      success: false,
      error: 'No repo map found. Run /repo-map init first.'
    };
  }

  // Force full rebuild if requested
  if (options.full) {
    return init(basePath, { force: true });
  }

  // Incremental update
  const result = await updater.incrementalUpdate(basePath, existing);
  
  if (result.success) {
    cache.save(basePath, result.map);
  }

  return result;
}

/**
 * Get repo map status
 * @param {string} basePath - Repository root path
 * @returns {{exists: boolean, status?: Object}}
 */
function status(basePath) {
  const map = cache.load(basePath);
  if (!map) {
    return { exists: false };
  }

  const staleness = updater.checkStaleness(basePath, map);
  
  return {
    exists: true,
    status: {
      generated: map.generated,
      updated: map.updated,
      commit: map.git?.commit,
      branch: map.git?.branch,
      files: Object.keys(map.files).length,
      symbols: map.stats?.totalSymbols || 0,
      languages: map.project?.languages || [],
      staleness
    }
  };
}

/**
 * Load repo map (if exists)
 * @param {string} basePath - Repository root path
 * @returns {Object|null} - The map or null if not found
 */
function load(basePath) {
  return cache.load(basePath);
}

/**
 * Check if ast-grep is installed
 * @returns {Promise<{found: boolean, version?: string, path?: string}>}
 */
async function checkAstGrepInstalled() {
  return installer.checkInstalled();
}

/**
 * Get install instructions for ast-grep
 * @returns {string}
 */
function getInstallInstructions() {
  return installer.getInstallInstructions();
}

/**
 * Check if repo map exists
 * @param {string} basePath - Repository root path
 * @returns {boolean}
 */
function exists(basePath) {
  return cache.exists(basePath);
}

/**
 * Summarize repo-map data for drift detection
 * @param {string} basePath - Repository root path
 * @param {Object} options - Options
 * @param {number} options.maxFiles - Max files to include in symbol summary
 * @param {number} options.maxSymbolsPerType - Max symbols per type per file
 * @param {number} options.maxDependenciesPerFile - Max dependencies per file
 * @param {boolean} options.includeStaleness - Include staleness check
 * @returns {Object}
 */
function summarizeForDrift(basePath, options = {}) {
  const map = cache.load(basePath);
  if (!map) {
    return { available: false };
  }

  const maxFiles = Number(options.maxFiles) || 40;
  const maxSymbolsPerType = Number(options.maxSymbolsPerType) || 20;
  const maxDependenciesPerFile = Number(options.maxDependenciesPerFile) || 10;
  const includeStaleness = options.includeStaleness === true;

  const symbols = summarizeSymbols(map, maxFiles, maxSymbolsPerType);
  const dependencies = summarizeDependencies(map, Object.keys(symbols), maxDependenciesPerFile);

  const result = {
    available: true,
    summary: {
      generated: map.generated,
      updated: map.updated,
      commit: map.git?.commit,
      branch: map.git?.branch,
      files: Object.keys(map.files || {}).length,
      symbols: map.stats?.totalSymbols || 0,
      languages: summarizeLanguages(map)
    },
    symbols,
    dependencies
  };

  if (includeStaleness) {
    result.staleness = updater.checkStaleness(basePath, map);
  }

  return result;
}

function summarizeLanguages(map) {
  const counts = new Map();
  const nonTestCounts = new Map();
  for (const file of Object.keys(map.files || {})) {
    const ext = path.extname(file).toLowerCase();
    const lang = EXT_LANGUAGE_MAP.get(ext);
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) || 0) + 1);
    if (!isTestPath(file)) {
      nonTestCounts.set(lang, (nonTestCounts.get(lang) || 0) + 1);
    }
  }

  const languages = [];
  for (const [lang, total] of counts.entries()) {
    const nonTest = nonTestCounts.get(lang) || 0;
    if (nonTest === 0) continue;
    const ratio = total > 0 ? (nonTest / total) : 0;
    if (nonTest >= 5 || ratio >= 0.25) {
      languages.push(lang);
    }
  }

  if (languages.length === 0) {
    return map.project?.languages || [];
  }

  return languages.sort();
}

function isTestPath(filePath) {
  const lower = String(filePath || '').toLowerCase();
  return lower.includes('/test/')
    || lower.includes('/tests/')
    || lower.includes('/__tests__/')
    || lower.includes('/e2e/')
    || lower.includes('_test.')
    || lower.includes('.spec.')
    || lower.includes('.test.');
}

/**
 * Find repo-map evidence for a set of terms
 * @param {string} basePath - Repository root path
 * @param {string[]} terms - Terms to search for
 * @param {Object} options - Options
 * @param {number} options.maxTerms - Max terms to include
 * @param {number} options.maxMatchesPerTerm - Max file matches per term
 * @param {number} options.maxSymbolsPerType - Max symbols per type per file
 * @param {number} options.maxSymbolsPerMatch - Max symbol matches per type per term
 * @returns {Object}
 */
function findEvidence(basePath, terms = [], options = {}) {
  const map = cache.load(basePath);
  if (!map) {
    return { available: false, terms: [], unmatched: [] };
  }

  const maxTerms = Number(options.maxTerms) || 30;
  const maxMatchesPerTerm = Number(options.maxMatchesPerTerm) || 6;
  const maxSymbolsPerType = Number(options.maxSymbolsPerType) || 20;
  const maxSymbolsPerMatch = Number(options.maxSymbolsPerMatch) || 6;

  const normalizedTerms = prepareTerms(terms, maxTerms);
  if (normalizedTerms.length === 0) {
    return { available: true, terms: [], unmatched: [] };
  }

  const fileIndex = buildFileIndex(map, maxSymbolsPerType);
  const results = [];
  const unmatched = [];

  for (const term of normalizedTerms) {
    const matches = [];
    for (const entry of fileIndex) {
      if (matches.length >= maxMatchesPerTerm) break;
      if (!matchesTokens(entry.searchText, term.tokens)) continue;

      const pathMatch = matchesTokens(entry.fileLower, term.tokens);
      const symbolMatches = filterSymbolMatches(entry.symbols, term.tokens, maxSymbolsPerMatch);
      matches.push({
        file: entry.file,
        pathMatch,
        symbols: symbolMatches
      });
    }

    if (matches.length > 0) {
      results.push({ term: term.term, matches });
    } else {
      unmatched.push(term.term);
    }
  }

  return { available: true, terms: results, unmatched };
}

/**
 * Find repo-map evidence for documented features
 * @param {string} basePath - Repository root path
 * @param {Array} features - Feature list (strings or objects)
 * @param {Object} options - Options
 * @returns {Object}
 */
function findFeatureEvidence(basePath, features = [], options = {}) {
  return featureEvidence.findFeatureEvidence(basePath, features, options);
}

function summarizeSymbols(map, maxFiles, maxSymbolsPerType) {
  const files = Object.entries(map.files || {});
  const scored = files
    .map(([file, data]) => {
      const symbols = data.symbols || {};
      const count =
        (symbols.exports?.length || 0) +
        (symbols.functions?.length || 0) +
        (symbols.classes?.length || 0) +
        (symbols.types?.length || 0) +
        (symbols.constants?.length || 0);
      return { file, data, count };
    })
    .filter(entry => entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.file.localeCompare(b.file);
    })
    .slice(0, Math.max(maxFiles, 0));

  const summary = {};
  for (const entry of scored) {
    const symbols = entry.data.symbols || {};
    summary[entry.file] = {
      exports: takeSymbolNames(symbols.exports, maxSymbolsPerType),
      functions: takeSymbolNames(symbols.functions, maxSymbolsPerType),
      classes: takeSymbolNames(symbols.classes, maxSymbolsPerType),
      types: takeSymbolNames(symbols.types, maxSymbolsPerType),
      constants: takeSymbolNames(symbols.constants, maxSymbolsPerType)
    };
  }

  return summary;
}

function summarizeDependencies(map, files, maxDependenciesPerFile) {
  const dependencies = {};
  const mapDeps = map.dependencies || {};
  for (const file of files) {
    const deps = mapDeps[file];
    if (Array.isArray(deps) && deps.length > 0) {
      dependencies[file] = deps.slice(0, Math.max(maxDependenciesPerFile, 0));
    }
  }
  return dependencies;
}

function takeSymbolNames(list, limit) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => item && item.name)
    .filter(Boolean)
    .slice(0, Math.max(limit, 0));
}

function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, ' ')
    .trim();
}

function prepareTerms(terms, maxTerms) {
  const list = Array.isArray(terms) ? terms : [];
  const normalized = [];
  const seen = new Set();

  for (const term of list) {
    if (!term) continue;
    const normalizedText = normalizeTerm(term);
    if (!normalizedText) continue;
    if (seen.has(normalizedText)) continue;
    const tokens = normalizedText.split(/\s+/).filter(token => token.length >= 3);
    if (tokens.length === 0) continue;
    normalized.push({ term: String(term).trim().slice(0, 120), tokens });
    seen.add(normalizedText);
    if (normalized.length >= maxTerms) break;
  }

  return normalized;
}

function buildFileIndex(map, maxSymbolsPerType) {
  return Object.entries(map.files || {}).map(([file, data]) => {
    const symbols = summarizeFileSymbols(data.symbols, maxSymbolsPerType);
    const searchText = buildSearchText(file, symbols);
    return {
      file,
      fileLower: file.toLowerCase(),
      symbols,
      searchText
    };
  });
}

function summarizeFileSymbols(symbols = {}, maxSymbolsPerType) {
  return {
    exports: takeSymbolNames(symbols.exports, maxSymbolsPerType),
    functions: takeSymbolNames(symbols.functions, maxSymbolsPerType),
    classes: takeSymbolNames(symbols.classes, maxSymbolsPerType),
    types: takeSymbolNames(symbols.types, maxSymbolsPerType),
    constants: takeSymbolNames(symbols.constants, maxSymbolsPerType)
  };
}

function buildSearchText(file, symbols) {
  const parts = [file];
  for (const list of Object.values(symbols)) {
    parts.push(...list);
  }
  return parts.join(' ').toLowerCase();
}

function matchesTokens(text, tokens) {
  if (!text || !tokens || tokens.length === 0) return false;
  return tokens.some(token => text.includes(token));
}

function filterSymbolMatches(symbols, tokens, limit) {
  const filterList = list => {
    if (!Array.isArray(list)) return [];
    return list
      .filter(name => tokens.some(token => name.toLowerCase().includes(token)))
      .slice(0, Math.max(limit, 0));
  };

  return {
    exports: filterList(symbols.exports),
    functions: filterList(symbols.functions),
    classes: filterList(symbols.classes),
    types: filterList(symbols.types),
    constants: filterList(symbols.constants)
  };
}

module.exports = {
  init,
  update,
  status,
  load,
  exists,
  summarizeForDrift,
  findEvidence,
  findFeatureEvidence,
  checkAstGrepInstalled,
  getInstallInstructions,
  
  // Re-export submodules for advanced usage
  installer,
  runner,
  cache,
  updater
};
