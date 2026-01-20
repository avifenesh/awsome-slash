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
    result.issues = issues;
    categorizeIssues(result, issues);
    findStaleItems(result, issues, 90);
    extractThemes(result, issues);
  }

  // Fetch open PRs
  const prs = execGh([
    'pr', 'list',
    '--state', 'open',
    '--json', 'number,title,labels,isDraft,createdAt,updatedAt,body',
    '--limit', String(opts.prLimit)
  ], opts);

  if (prs) {
    result.prs = prs;
  }

  // Fetch milestones
  const milestones = execGh([
    'api', 'repos/{owner}/{repo}/milestones',
    '--jq', '.[].{title,state,due_on,open_issues,closed_issues}'
  ], opts);

  if (milestones) {
    result.milestones = Array.isArray(milestones) ? milestones : [milestones];
    findOverdueMilestones(result);
  }

  return result;
}

/**
 * Categorize issues by labels
 *
 * Uses word-boundary matching to avoid false positives (e.g., "debug" won't match "bug").
 * Patterns are checked with word boundaries so "bug-fix" matches "bug" but "debug" does not.
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

    for (const { regex, category } of labelPatterns) {
      if (labels.some(l => regex.test(l))) {
        result.categorized[category].push(issue);
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      result.categorized.other.push(issue);
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
 * @returns {Object} Documentation analysis
 */
function analyzeDocumentation(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    files: {},
    features: [],
    plans: [],
    checkboxes: { total: 0, checked: 0, unchecked: 0 },
    gaps: [],
    lastModified: {}
  };

  // Standard documentation files to analyze
  const docFiles = [
    'README.md',
    'PLAN.md',
    'CLAUDE.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'docs/README.md',
    'docs/PLAN.md'
  ];

  for (const file of docFiles) {
    const content = safeReadFile(file, basePath);
    if (content) {
      result.files[file] = analyzeMarkdownFile(content, file);
      extractCheckboxes(result, content);
      extractFeatures(result, content);
      extractPlans(result, content);

      // Get last modified date
      try {
        const stat = fs.statSync(path.join(basePath, file));
        result.lastModified[file] = stat.mtime.toISOString();
      } catch {
        // Ignore stat errors
      }
    }
  }

  // Find additional markdown files if depth is thorough
  if (opts.depth === 'thorough') {
    const docsDir = path.join(basePath, 'docs');
    if (fs.existsSync(docsDir)) {
      try {
        const additionalFiles = fs.readdirSync(docsDir)
          .filter(f => f.endsWith('.md') && !docFiles.includes(`docs/${f}`));

        for (const file of additionalFiles.slice(0, 10)) {
          const filePath = `docs/${file}`;
          const content = safeReadFile(filePath, basePath);
          if (content) {
            result.files[filePath] = analyzeMarkdownFile(content, filePath);
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }
  }

  // Identify documentation gaps
  identifyDocGaps(result);

  return result;
}

/**
 * Analyze a single markdown file
 */
function analyzeMarkdownFile(content, filePath) {
  const analysis = {
    path: filePath,
    sections: [],
    hasInstallation: false,
    hasUsage: false,
    hasApi: false,
    hasTesting: false,
    codeBlocks: 0,
    wordCount: 0
  };

  // Extract sections (## headers)
  const sectionMatches = content.match(/^##\s+(.+)$/gm) || [];
  analysis.sections = sectionMatches.map(s => s.replace(/^##\s+/, ''));

  // Check for common sections
  const sectionLower = analysis.sections.map(s => s.toLowerCase()).join(' ');
  analysis.hasInstallation = /install|setup|getting.started/i.test(sectionLower);
  analysis.hasUsage = /usage|how.to|example/i.test(sectionLower);
  analysis.hasApi = /api|reference|methods/i.test(sectionLower);
  analysis.hasTesting = /test|spec|coverage/i.test(sectionLower);

  // Count code blocks
  analysis.codeBlocks = (content.match(/```/g) || []).length / 2;

  // Word count
  analysis.wordCount = content.split(/\s+/).length;

  return analysis;
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
 * Extract documented features
 */
function extractFeatures(result, content) {
  // Look for feature lists
  const featurePattern = /^[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*[-–]\s*(.+))?$/gm;
  let match;

  while ((match = featurePattern.exec(content)) !== null) {
    const feature = match[1].trim();
    if (feature.length > 5 && feature.length < 100) {
      result.features.push(feature);
    }
  }

  // Deduplicate
  result.features = [...new Set(result.features)];
}

/**
 * Extract planned items from content
 */
function extractPlans(result, content) {
  // Look for TODO, FIXME, future plans sections
  const planPatterns = [
    /(?:TODO|FIXME|PLAN):\s*(.+)/gi,
    /^##\s+(?:Roadmap|Future|Planned|Coming Soon)/gim
  ];

  for (const pattern of planPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      result.plans.push(match[1] || match[0]);
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
 * @returns {Object} Codebase analysis
 */
function scanCodebase(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const basePath = opts.cwd;

  const result = {
    structure: {},
    frameworks: [],
    testFramework: null,
    hasTypeScript: false,
    implementedFeatures: [],
    health: {
      hasTests: false,
      hasLinting: false,
      hasCi: false,
      hasReadme: false
    },
    fileStats: {}
  };

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

  // Scan directory structure
  scanDirectory(result, basePath, '', opts.depth === 'thorough' ? 3 : 2);

  // Detect health indicators
  detectHealth(result, basePath);

  // Find implemented features from code
  if (opts.depth === 'thorough') {
    findImplementedFeatures(result, basePath);
  }

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
async function collectAllData(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sources = opts.sources;

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
