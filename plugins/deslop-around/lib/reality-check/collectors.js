/**
 * Reality Check Data Collectors
 * Pure JavaScript data collection - no LLM needed
 *
 * Replaces three LLM agents (issue-scanner, doc-analyzer, code-explorer)
 * with deterministic JavaScript functions.
 *
 * @module lib/reality-check/collectors
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Default options for data collection
 */
const DEFAULT_OPTIONS = {
  sources: ['github', 'docs', 'code'],
  depth: 'thorough', // quick | thorough
  issueLimit: 100,
  prLimit: 50,
  timeout: 10000, // 10s
  cwd: process.cwd()
};

/**
 * Validate file path to prevent path traversal
 * @param {string} filePath - Path to validate
 * @param {string} basePath - Base directory
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath, basePath) {
  const resolved = path.resolve(basePath, filePath);
  return resolved.startsWith(path.resolve(basePath));
}

/**
 * Safe file read with path validation
 * @param {string} filePath - Path to read
 * @param {string} basePath - Base directory for validation
 * @returns {string|null} File contents or null
 */
function safeReadFile(filePath, basePath) {
  const fullPath = path.resolve(basePath, filePath);
  if (!isPathSafe(filePath, basePath)) {
    return null;
  }
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Execute gh CLI command safely
 * @param {string[]} args - Command arguments
 * @param {Object} options - Execution options
 * @returns {Object|null} Parsed JSON result or null
 */
function execGh(args, options = {}) {
  try {
    const result = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeout || DEFAULT_OPTIONS.timeout,
      cwd: options.cwd || DEFAULT_OPTIONS.cwd
    });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Check if gh CLI is available and authenticated
 * @returns {boolean} True if gh is ready
 */
function isGhAvailable() {
  try {
    execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Summarize an issue for analysis (keep essentials, drop verbose body)
 * @param {Object} item - Issue object
 * @returns {Object} Summarized item
 */
function summarizeIssue(item) {
  return {
    number: item.number,
    title: item.title,
    labels: (item.labels || []).map(l => l.name || l),
    milestone: item.milestone?.title || item.milestone || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    // First 200 chars of body for context
    snippet: item.body ? item.body.slice(0, 200).replace(/\n/g, ' ').trim() + (item.body.length > 200 ? '...' : '') : ''
  };
}

/**
 * Summarize a PR for analysis (include files changed)
 * @param {Object} item - PR object
 * @returns {Object} Summarized item
 */
function summarizePR(item) {
  return {
    number: item.number,
    title: item.title,
    labels: (item.labels || []).map(l => l.name || l),
    isDraft: item.isDraft,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    files: item.files || [],
    // First 150 chars of body
    snippet: item.body ? item.body.slice(0, 150).replace(/\n/g, ' ').trim() + (item.body.length > 150 ? '...' : '') : ''
  };
}

/**
 * Scan GitHub state: issues, PRs, milestones
 * Replaces issue-scanner.md agent
 *
 * @param {Object} options - Collection options
 * @returns {Object} GitHub state data
 */
function scanGitHubState(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result = {
    available: false,
    summary: { issueCount: 0, prCount: 0, milestoneCount: 0 },
    issues: [],
    prs: [],
    milestones: [],
    categorized: { bugs: [], features: [], security: [], enhancements: [], other: [] },
    stale: [],
    themes: []
  };

  if (!isGhAvailable()) {
    result.error = 'gh CLI not available or not authenticated';
    return result;
  }

  result.available = true;

  // Fetch open issues
  const issues = execGh([
    'issue', 'list',
    '--state', 'open',
    '--json', 'number,title,labels,milestone,createdAt,updatedAt,body',
    '--limit', String(opts.issueLimit)
  ], opts);

  if (issues) {
    // Summarize issues - keep number, title, labels, snippet
    result.issues = issues.map(summarizeIssue);
    result.summary.issueCount = issues.length;
    categorizeIssues(result, issues);
    findStaleItems(result, issues, 90);
    extractThemes(result, issues);
  }

  // Fetch open PRs with files changed
  const prs = execGh([
    'pr', 'list',
    '--state', 'open',
    '--json', 'number,title,labels,isDraft,createdAt,updatedAt,body,files',
    '--limit', String(opts.prLimit)
  ], opts);

  if (prs) {
    // Summarize PRs - keep number, title, files changed
    result.prs = prs.map(summarizePR);
    result.summary.prCount = prs.length;
  }

  // Fetch milestones
  const milestones = execGh([
    'api', 'repos/{owner}/{repo}/milestones',
    '--jq', '.[].{title,state,due_on,open_issues,closed_issues}'
  ], opts);

  if (milestones) {
    result.milestones = Array.isArray(milestones) ? milestones : [milestones];
    result.summary.milestoneCount = result.milestones.length;
    findOverdueMilestones(result);
  }

  return result;
}

/**
 * Categorize issues by labels
 *
 * Uses regexes that treat non-letter characters (start/end of string, space, hyphen, colon, etc.)
 * as boundaries to avoid common false positives (e.g., "debug" won't match "bug", but "bug-fix" will).
 * Stores issue number + title (enough to understand without lookup).
 */
function categorizeIssues(result, issues) {
  const labelMap = {
    bug: 'bugs',
    'type: bug': 'bugs',
    feature: 'features',
    'type: feature': 'features',
    enhancement: 'enhancements',
    security: 'security',
    'type: security': 'security'
  };

  // Create regex patterns with word boundaries for more precise matching
  const labelPatterns = Object.entries(labelMap).map(([pattern, category]) => ({
    // Match pattern at word boundary (start/end of string, space, hyphen, colon, etc.)
    regex: new RegExp(`(^|[^a-z])${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i'),
    category
  }));

  for (const issue of issues) {
    const labels = (issue.labels || []).map(l => (l.name || l).toLowerCase());
    let categorized = false;
    // Store number + title for context
    const ref = { number: issue.number, title: issue.title };

    for (const { regex, category } of labelPatterns) {
      if (labels.some(l => regex.test(l))) {
        result.categorized[category].push(ref);
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      result.categorized.other.push(ref);
    }
  }
}

/**
 * Find stale items (not updated in N days)
 */
function findStaleItems(result, items, staleDays) {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  for (const item of items) {
    const updated = new Date(item.updatedAt);
    if (updated < staleDate) {
      result.stale.push({
        number: item.number,
        title: item.title,
        lastUpdated: item.updatedAt,
        daysStale: Math.floor((Date.now() - updated) / (1000 * 60 * 60 * 24))
      });
    }
  }
}

/**
 * Extract common themes from issue titles
 */
function extractThemes(result, issues) {
  const words = {};
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'for', 'in', 'on', 'at', 'with', 'and', 'or', 'of']);

  for (const issue of issues) {
    const titleWords = (issue.title || '').toLowerCase().split(/\s+/);
    for (const word of titleWords) {
      if (word.length > 3 && !stopWords.has(word)) {
        words[word] = (words[word] || 0) + 1;
      }
    }
  }

  result.themes = Object.entries(words)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
}

/**
 * Find overdue milestones
 */
function findOverdueMilestones(result) {
  const now = new Date();
  result.overdueMilestones = result.milestones.filter(m => {
    if (!m.due_on || m.state === 'closed') return false;
    return new Date(m.due_on) < now;
  });
}

/**
 * Analyze documentation files
 * Replaces doc-analyzer.md agent
 *
 * @param {Object} options - Collection options
 * @returns {Object} Documentation analysis (condensed)
 */
function analyzeDocumentation(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    summary: { fileCount: 0, totalWords: 0 },
    files: {},
    features: [],
    plans: [],
    checkboxes: { total: 0, checked: 0, unchecked: 0 },
    gaps: []
  };

  // Standard documentation files to analyze
  const docFiles = [
    'README.md',
    'PLAN.md',
    'CLAUDE.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'docs/README.md',
    'docs/PLAN.md'
  ];

  for (const file of docFiles) {
    const content = safeReadFile(file, basePath);
    if (content) {
      const analysis = analyzeMarkdownFile(content, file);
      result.files[file] = analysis;
      result.summary.totalWords += analysis.wordCount;
      extractCheckboxes(result, content);
      extractFeatures(result, content);
      extractPlans(result, content);
    }
  }

  // Find additional markdown files if depth is thorough (limit to 5)
  if (opts.depth === 'thorough') {
    const docsDir = path.join(basePath, 'docs');
    if (fs.existsSync(docsDir)) {
      try {
        const additionalFiles = fs.readdirSync(docsDir)
          .filter(f => f.endsWith('.md') && !docFiles.includes(`docs/${f}`));

        for (const file of additionalFiles.slice(0, 5)) {
          const filePath = `docs/${file}`;
          const content = safeReadFile(filePath, basePath);
          if (content) {
            const analysis = analyzeMarkdownFile(content, filePath);
            result.files[filePath] = analysis;
            result.summary.totalWords += analysis.wordCount;
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }
  }

  result.summary.fileCount = Object.keys(result.files).length;

  // Identify documentation gaps
  identifyDocGaps(result);

  return result;
}

/**
 * Analyze a single markdown file (condensed output)
 */
function analyzeMarkdownFile(content, filePath) {
  // Extract sections (## headers) - limit to first 10
  const sectionMatches = content.match(/^##\s+(.+)$/gm) || [];
  const sections = sectionMatches.slice(0, 10).map(s => s.replace(/^##\s+/, ''));

  // Check for common sections
  const sectionLower = sections.map(s => s.toLowerCase()).join(' ');

  return {
    path: filePath,
    sectionCount: sectionMatches.length,
    sections: sections, // Top 10 only
    hasInstallation: /install|setup|getting.started/i.test(sectionLower),
    hasUsage: /usage|how.to|example/i.test(sectionLower),
    hasApi: /api|reference|methods/i.test(sectionLower),
    hasTesting: /test|spec|coverage/i.test(sectionLower),
    codeBlocks: Math.floor((content.match(/```/g) || []).length / 2),
    wordCount: content.split(/\s+/).length
  };
}

/**
 * Extract checkboxes from content
 */
function extractCheckboxes(result, content) {
  const checked = (content.match(/^[-*]\s+\[x\]/gim) || []).length;
  const unchecked = (content.match(/^[-*]\s+\[\s\]/gim) || []).length;

  result.checkboxes.checked += checked;
  result.checkboxes.unchecked += unchecked;
  result.checkboxes.total += checked + unchecked;
}

/**
 * Extract documented features (limited to top 20)
 */
function extractFeatures(result, content) {
  // Look for feature lists
  const featurePattern = /^[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*[-–]\s*(.+))?$/gm;
  let match;

  while ((match = featurePattern.exec(content)) !== null && result.features.length < 20) {
    const feature = match[1].trim();
    if (feature.length > 5 && feature.length < 80) {
      result.features.push(feature);
    }
  }

  // Deduplicate and limit
  result.features = [...new Set(result.features)].slice(0, 20);
}

/**
 * Extract planned items from content (limited to top 15)
 */
function extractPlans(result, content) {
  // Look for TODO, FIXME, future plans sections
  const planPatterns = [
    /(?:TODO|FIXME|PLAN):\s*(.+)/gi,
    /^##\s+(?:Roadmap|Future|Planned|Coming Soon)/gim
  ];

  for (const pattern of planPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && result.plans.length < 15) {
      const plan = (match[1] || match[0]).slice(0, 100); // Truncate long plans
      result.plans.push(plan);
    }
  }
}

/**
 * Identify documentation gaps
 */
function identifyDocGaps(result) {
  const readme = result.files['README.md'];

  if (!readme) {
    result.gaps.push({ type: 'missing', file: 'README.md', severity: 'high' });
  } else {
    if (!readme.hasInstallation) {
      result.gaps.push({ type: 'missing-section', file: 'README.md', section: 'Installation', severity: 'medium' });
    }
    if (!readme.hasUsage) {
      result.gaps.push({ type: 'missing-section', file: 'README.md', section: 'Usage', severity: 'medium' });
    }
  }

  if (!result.files['CHANGELOG.md']) {
    result.gaps.push({ type: 'missing', file: 'CHANGELOG.md', severity: 'low' });
  }
}

/**
 * Scan codebase structure and features
 * Replaces code-explorer.md agent
 *
 * @param {Object} options - Collection options
 * @returns {Object} Codebase analysis (condensed)
 */
function scanCodebase(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    summary: { totalDirs: 0, totalFiles: 0 },
    topLevelDirs: [],
    frameworks: [],
    testFramework: null,
    hasTypeScript: false,
    implementedFeatures: [],
    symbols: {}, // Function/class/export names per file
    health: {
      hasTests: false,
      hasLinting: false,
      hasCi: false,
      hasReadme: false
    },
    fileStats: {}
  };

  // Internal structure for scanning (not exposed in full)
  const internalStructure = {};

  // Detect package.json dependencies
  const pkgContent = safeReadFile('package.json', basePath);
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      detectFrameworks(result, pkg);
      detectTestFramework(result, pkg);
    } catch {
      // Invalid JSON
    }
  }

  // Check for TypeScript
  result.hasTypeScript = fs.existsSync(path.join(basePath, 'tsconfig.json'));

  // Scan directory structure (internal)
  scanDirectory({ structure: internalStructure, fileStats: result.fileStats }, basePath, '', opts.depth === 'thorough' ? 3 : 2);

  // Extract summary from internal structure
  result.summary.totalDirs = Object.keys(internalStructure).length;
  result.summary.totalFiles = Object.values(internalStructure).reduce((sum, d) => sum + (d.fileCount || 0), 0);

  // Get top-level directories only
  const rootEntry = internalStructure['.'];
  if (rootEntry) {
    result.topLevelDirs = rootEntry.dirs || [];
  }

  // Detect health indicators
  detectHealth(result, basePath);

  // Find implemented features from code
  if (opts.depth === 'thorough') {
    findImplementedFeatures({ ...result, structure: internalStructure }, basePath);
    // Extract symbols from source files
    result.symbols = scanFileSymbols(basePath, result.topLevelDirs);
  }

  // Limit fileStats to top 10 extensions
  const sortedStats = Object.entries(result.fileStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  result.fileStats = Object.fromEntries(sortedStats);

  return result;
}

/**
 * Detect frameworks from package.json
 */
function detectFrameworks(result, pkgJson) {
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const frameworkMap = {
    react: 'React',
    'react-dom': 'React',
    next: 'Next.js',
    vue: 'Vue.js',
    nuxt: 'Nuxt',
    angular: 'Angular',
    express: 'Express',
    fastify: 'Fastify',
    koa: 'Koa',
    nestjs: 'NestJS'
  };

  for (const [pkgName, framework] of Object.entries(frameworkMap)) {
    if (deps[pkgName]) {
      result.frameworks.push(framework);
    }
  }

  result.frameworks = [...new Set(result.frameworks)];
}

/**
 * Detect test framework
 */
function detectTestFramework(result, pkgJson) {
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const testFrameworks = ['jest', 'mocha', 'vitest', 'ava', 'tap', 'jasmine'];

  for (const framework of testFrameworks) {
    if (deps[framework]) {
      result.testFramework = framework;
      result.health.hasTests = true;
      break;
    }
  }
}

/**
 * Extract symbols (functions, classes, exports) from a JS/TS file
 * Uses regex patterns - not a full parser, but good enough for analysis
 * @param {string} content - File content
 * @returns {Object} Extracted symbols
 */
function extractSymbols(content) {
  const symbols = {
    functions: [],
    classes: [],
    exports: []
  };

  // Function declarations: function foo() or async function foo()
  const funcPattern = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    symbols.functions.push(match[1]);
  }

  // Arrow functions assigned to const/let: const foo = () => or const foo = async () =>
  const arrowPattern = /(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
  while ((match = arrowPattern.exec(content)) !== null) {
    symbols.functions.push(match[1]);
  }

  // Class declarations: class Foo
  const classPattern = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = classPattern.exec(content)) !== null) {
    symbols.classes.push(match[1]);
  }

  // Named exports: export { foo, bar } or export function foo
  const namedExportPattern = /export\s+(?:(?:async\s+)?function|class|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  while ((match = namedExportPattern.exec(content)) !== null) {
    symbols.exports.push(match[1]);
  }

  // module.exports = { foo, bar } - extract keys
  const moduleExportsPattern = /module\.exports\s*=\s*\{([^}]+)\}/;
  const moduleMatch = content.match(moduleExportsPattern);
  if (moduleMatch) {
    const keys = moduleMatch[1].split(',').map(k => k.trim().split(':')[0].trim());
    symbols.exports.push(...keys.filter(k => k && /^[a-zA-Z_$]/.test(k)));
  }

  // Deduplicate
  symbols.functions = [...new Set(symbols.functions)];
  symbols.classes = [...new Set(symbols.classes)];
  symbols.exports = [...new Set(symbols.exports)];

  return symbols;
}

/**
 * Scan key source files for symbols (recursive)
 * @param {string} basePath - Project root
 * @param {string[]} topLevelDirs - Top-level directories
 * @returns {Object} File -> symbols mapping
 */
function scanFileSymbols(basePath, topLevelDirs) {
  const sourceSymbols = {};
  const sourceDirs = ['lib', 'src', 'app', 'pages', 'components', 'utils', 'services', 'api'];
  const dirsToScan = topLevelDirs.filter(d => sourceDirs.includes(d));

  let filesScanned = 0;
  const maxFiles = 40; // Limit to avoid huge output

  function scanDir(dirPath, relativePath, depth = 0) {
    if (filesScanned >= maxFiles || depth > 2) return;
    if (!fs.existsSync(dirPath)) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (filesScanned >= maxFiles) break;

        const fullPath = path.join(dirPath, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Skip common non-source dirs
          if (['node_modules', '__tests__', 'test', 'tests', 'dist', 'build'].includes(entry.name)) continue;
          scanDir(fullPath, relPath, depth + 1);
        } else if (entry.isFile()) {
          if (!/\.(js|ts|jsx|tsx)$/.test(entry.name)) continue;
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;

          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 50000) continue; // Skip large files

            const content = fs.readFileSync(fullPath, 'utf8');
            const symbols = extractSymbols(content);

            // Only include if has meaningful symbols
            if (symbols.functions.length || symbols.classes.length || symbols.exports.length) {
              sourceSymbols[relPath] = symbols;
              filesScanned++;
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  for (const dir of dirsToScan) {
    if (filesScanned >= maxFiles) break;
    scanDir(path.join(basePath, dir), dir);
  }

  return sourceSymbols;
}

/**
 * Scan directory structure recursively
 */
function scanDirectory(result, basePath, relativePath, maxDepth, depth = 0) {
  if (depth >= maxDepth) return;

  const fullPath = path.join(basePath, relativePath);
  if (!fs.existsSync(fullPath)) return;

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const entry of entries) {
      // Skip common excluded directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage', '.claude'].includes(entry.name)) {
          continue;
        }
        dirs.push(entry.name);
      } else {
        files.push(entry.name);
      }
    }

    // Store structure
    const key = relativePath || '.';
    result.structure[key] = { dirs, fileCount: files.length };

    // Count files by extension
    for (const file of files) {
      const ext = path.extname(file).toLowerCase() || 'no-ext';
      result.fileStats[ext] = (result.fileStats[ext] || 0) + 1;
    }

    // Recurse into subdirectories
    for (const dir of dirs) {
      scanDirectory(result, basePath, path.join(relativePath, dir), maxDepth, depth + 1);
    }
  } catch {
    // Permission or read errors
  }
}

/**
 * Detect project health indicators
 */
function detectHealth(result, basePath) {
  // Check for README
  result.health.hasReadme = fs.existsSync(path.join(basePath, 'README.md'));

  // Check for linting config
  const lintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'biome.json'];
  result.health.hasLinting = lintConfigs.some(f => fs.existsSync(path.join(basePath, f)));

  // Check for CI config
  const ciConfigs = [
    '.github/workflows',
    '.gitlab-ci.yml',
    '.circleci',
    'Jenkinsfile',
    '.travis.yml'
  ];
  result.health.hasCi = ciConfigs.some(f => fs.existsSync(path.join(basePath, f)));

  // Check for tests directory
  const testDirs = ['tests', '__tests__', 'test', 'spec'];
  result.health.hasTests = result.health.hasTests || testDirs.some(d => fs.existsSync(path.join(basePath, d)));
}

/**
 * Find implemented features from code patterns
 */
function findImplementedFeatures(result, basePath) {
  // Common feature indicators
  const featurePatterns = {
    authentication: ['auth', 'login', 'session', 'jwt', 'oauth'],
    api: ['routes', 'controllers', 'handlers', 'endpoints'],
    database: ['models', 'schemas', 'migrations', 'seeds'],
    ui: ['components', 'views', 'pages', 'layouts'],
    testing: ['__tests__', 'test', 'spec', '.test.', '.spec.'],
    docs: ['docs', 'documentation', 'wiki']
  };

  for (const [feature, patterns] of Object.entries(featurePatterns)) {
    const found = patterns.some(pattern => {
      // Check directory structure
      for (const dir of Object.keys(result.structure)) {
        if (dir.toLowerCase().includes(pattern)) {
          return true;
        }
      }
      return false;
    });

    if (found) {
      result.implementedFeatures.push(feature);
    }
  }
}

/**
 * Collect all data from all sources
 * Main entry point for data collection
 *
 * @param {Object} options - Collection options
 * @returns {Object} All collected data
 */
function collectAllData(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sources = Array.isArray(opts.sources) ? opts.sources : DEFAULT_OPTIONS.sources;

  const data = {
    timestamp: new Date().toISOString(),
    options: opts,
    github: null,
    docs: null,
    code: null
  };

  // Collect from each enabled source
  if (sources.includes('github')) {
    data.github = scanGitHubState(opts);
  }

  if (sources.includes('docs')) {
    data.docs = analyzeDocumentation(opts);
  }

  if (sources.includes('code')) {
    data.code = scanCodebase(opts);
  }

  return data;
}

module.exports = {
  DEFAULT_OPTIONS,
  scanGitHubState,
  analyzeDocumentation,
  scanCodebase,
  collectAllData,
  isGhAvailable,
  isPathSafe
};
