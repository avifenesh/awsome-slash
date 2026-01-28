/**
 * Reality Check Data Collectors
 * Pure JavaScript data collection - no LLM needed
 *
 * Replaces three LLM agents (issue-scanner, doc-analyzer, code-explorer)
 * with deterministic JavaScript functions.
 *
 * @module lib/drift-detect/collectors
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const featureExtractor = require('./feature-extractor');

let cachedRepoMap = null;
function getRepoMap() {
  if (!cachedRepoMap) {
    cachedRepoMap = require('../repo-map');
  }
  return cachedRepoMap;
}

/**
 * Default options for data collection
 */
const DEFAULT_OPTIONS = {
  sources: ['github', 'docs', 'code'],
  depth: 'thorough', // quick | thorough
  issueLimit: 100,
  prLimit: 50,
  timeout: 10000, // 10s
  cwd: process.cwd(),
  calculatePriority: false, // opt-in: calculate priority scores for issues
  docFeatures: {
    maxPerFile: 20,
    maxTotal: 60
  },
  repoMap: {
    maxFiles: 40,
    maxSymbolsPerType: 20,
    maxDependenciesPerFile: 10,
    maxTerms: 30,
    maxMatchesPerTerm: 6,
    maxSymbolsPerMatch: 6,
    maxFeatures: 40,
    maxDefsPerFeature: 6,
    maxRefsPerFeature: 6,
    maxFilesScannedPerDef: 8,
    snippetLines: 2
  }
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
 * Parse Cargo.toml for Rust dependencies
 * @param {string} basePath - Project root
 * @param {string} cargoPath - Path to Cargo.toml (relative to basePath)
 * @returns {Object|null} Parsed cargo info
 */
function parseCargoToml(basePath, cargoPath = 'Cargo.toml') {
  const content = safeReadFile(cargoPath, basePath);
  if (!content) return null;

  const result = { dependencies: [], devDependencies: [] };

  // Extract [dependencies] section
  const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
  if (depsMatch) {
    const lines = depsMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-z0-9_-]+)\s*=/i);
      if (match) result.dependencies.push(match[1]);
    }
  }

  // Extract [dev-dependencies] section
  const devMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\n\[|$)/);
  if (devMatch) {
    const lines = devMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-z0-9_-]+)\s*=/i);
      if (match) result.devDependencies.push(match[1]);
    }
  }

  return result;
}

/**
 * Parse Python project files for dependencies
 * @param {string} basePath - Project root
 * @param {string} subDir - Subdirectory (e.g., 'python/')
 * @returns {Object|null} Parsed Python info
 */
function parsePythonProject(basePath, subDir = '') {
  const prefix = subDir ? `${subDir}/` : '';
  const result = { dependencies: [], devDependencies: [], type: null };

  // Try pyproject.toml first
  const pyproject = safeReadFile(`${prefix}pyproject.toml`, basePath);
  if (pyproject) {
    result.type = 'pyproject';
    // Extract dependencies from [project] or [tool.poetry.dependencies]
    const depsMatch = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depsMatch) {
      const items = depsMatch[1].match(/"([^"]+)"/g) || [];
      result.dependencies.push(...items.map(d => d.replace(/"/g, '').split(/[<>=~!]/)[0].trim()));
    }
  }

  // Try requirements.txt or dev_requirements.txt
  for (const reqFile of [`${prefix}requirements.txt`, `${prefix}dev_requirements.txt`]) {
    const requirements = safeReadFile(reqFile, basePath);
    if (requirements) {
      result.type = result.type || 'requirements';
      const deps = requirements.split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'))
        .map(l => l.split(/[<>=~!\[]/)[0].trim())
        .filter(d => d);
      result.dependencies.push(...deps);
    }
  }

  // Try Pipfile
  const pipfile = safeReadFile(`${prefix}Pipfile`, basePath);
  if (pipfile) {
    result.type = result.type || 'pipfile';
    // Simple extraction of package names from [packages] and [dev-packages]
    const packagesMatch = pipfile.match(/\[packages\]([\s\S]*?)(?:\n\[|$)/);
    if (packagesMatch) {
      const lines = packagesMatch[1].split('\n');
      for (const line of lines) {
        const match = line.match(/^([a-z0-9_-]+)\s*=/i);
        if (match) result.dependencies.push(match[1]);
      }
    }
  }

  // Deduplicate
  result.dependencies = [...new Set(result.dependencies)];
  return result.type ? result : null;
}

/**
 * Detect Python frameworks from parsed project
 */
function detectPythonFrameworks(result, basePath) {
  const pythonFrameworkMap = {
    django: 'Django',
    flask: 'Flask',
    fastapi: 'FastAPI',
    starlette: 'Starlette',
    pytest: 'Pytest',
    unittest: 'Unittest',
    pandas: 'Pandas',
    numpy: 'NumPy',
    sqlalchemy: 'SQLAlchemy',
    pydantic: 'Pydantic',
    celery: 'Celery',
    aiohttp: 'aiohttp',
    httpx: 'HTTPX',
    maturin: 'Maturin (Rust+Python)'
  };

  // Check root and python/ subdirectory
  const pythonDirs = ['', 'python'];
  for (const dir of pythonDirs) {
    const pyInfo = parsePythonProject(basePath, dir);
    if (pyInfo) {
      for (const [dep, name] of Object.entries(pythonFrameworkMap)) {
        if (pyInfo.dependencies.includes(dep) && !result.frameworks.includes(name)) {
          result.frameworks.push(name);
        }
      }
      // Set test framework if pytest found
      if (pyInfo.dependencies.includes('pytest') && !result.testFramework) {
        result.testFramework = 'pytest';
        result.health.hasTests = true;
      }
    }
  }
}

/**
 * Parse Java build files for dependencies
 * @param {string} basePath - Project root
 * @param {string} subDir - Subdirectory (e.g., 'java/')
 * @returns {Object|null} Parsed Java info
 */
function parseJavaProject(basePath, subDir = '') {
  const prefix = subDir ? `${subDir}/` : '';
  const result = { dependencies: [], plugins: [], type: null };

  // Try build.gradle first
  const gradle = safeReadFile(`${prefix}build.gradle`, basePath);
  if (gradle) {
    result.type = 'gradle';

    // Extract plugins
    const pluginMatches = gradle.match(/id\s+['"]([^'"]+)['"]/g) || [];
    result.plugins.push(...pluginMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]));

    // Extract dependencies (implementation, testImplementation, etc.)
    const depMatches = gradle.match(/(?:implementation|testImplementation|api)\s+['"]([^'"]+)['"]/g) || [];
    result.dependencies.push(...depMatches.map(m => {
      const match = m.match(/['"]([^'"]+)['"]/);
      return match ? match[1].split(':')[1] || match[1] : null;
    }).filter(Boolean));
  }

  // Try pom.xml
  const pom = safeReadFile(`${prefix}pom.xml`, basePath);
  if (pom) {
    result.type = result.type || 'maven';

    // Extract artifactIds
    const artifactMatches = pom.match(/<artifactId>([^<]+)<\/artifactId>/g) || [];
    result.dependencies.push(...artifactMatches.map(m => m.replace(/<\/?artifactId>/g, '')));
  }

  return result.type ? result : null;
}

/**
 * Detect Java frameworks from parsed project
 */
function detectJavaFrameworks(result, basePath) {
  const javaFrameworkMap = {
    'spring-boot': 'Spring Boot',
    'spring-web': 'Spring MVC',
    'spring-core': 'Spring',
    'hibernate-core': 'Hibernate',
    lombok: 'Lombok',
    junit: 'JUnit',
    'junit-jupiter': 'JUnit 5',
    mockito: 'Mockito',
    jacoco: 'JaCoCo',
    spotless: 'Spotless',
    netty: 'Netty',
    'protobuf-java': 'Protobuf',
    'grpc-stub': 'gRPC',
    'io.freefair.lombok': 'Lombok'
  };

  // Check root and java/ subdirectory
  const javaDirs = ['', 'java'];
  for (const dir of javaDirs) {
    const javaInfo = parseJavaProject(basePath, dir);
    if (javaInfo) {
      const allDeps = [...javaInfo.dependencies, ...javaInfo.plugins];
      for (const [dep, name] of Object.entries(javaFrameworkMap)) {
        if (allDeps.some(d => d.includes(dep)) && !result.frameworks.includes(name)) {
          result.frameworks.push(name);
        }
      }
      // Set test framework if JUnit found
      if (allDeps.some(d => d.includes('junit')) && !result.testFramework) {
        result.testFramework = 'junit';
        result.health.hasTests = true;
      }
    }
  }
}

/**
 * Parse Go go.mod for dependencies
 * @param {string} basePath - Project root
 * @param {string} subDir - Subdirectory (e.g., 'go/')
 * @returns {Object|null} Parsed Go info
 */
function parseGoMod(basePath, subDir = '') {
  const prefix = subDir ? `${subDir}/` : '';
  const content = safeReadFile(`${prefix}go.mod`, basePath);
  if (!content) return null;

  const result = { dependencies: [], goVersion: null };

  // Extract Go version
  const versionMatch = content.match(/^go\s+(\d+\.\d+)/m);
  if (versionMatch) result.goVersion = versionMatch[1];

  // Extract require dependencies
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s+([^\s]+)\s+v/);
    if (match) result.dependencies.push(match[1]);
  }

  return result;
}

/**
 * Detect Go frameworks from parsed project
 */
function detectGoFrameworks(result, basePath) {
  const goFrameworkMap = {
    'github.com/gin-gonic/gin': 'Gin',
    'github.com/labstack/echo': 'Echo',
    'github.com/gofiber/fiber': 'Fiber',
    'github.com/gorilla/mux': 'Gorilla Mux',
    'github.com/go-chi/chi': 'Chi',
    'gorm.io/gorm': 'GORM',
    'github.com/jmoiron/sqlx': 'sqlx',
    'github.com/stretchr/testify': 'Testify',
    'google.golang.org/grpc': 'gRPC',
    'google.golang.org/protobuf': 'Protobuf'
  };

  // Check root and go/ subdirectory
  const goDirs = ['', 'go'];
  for (const dir of goDirs) {
    const goInfo = parseGoMod(basePath, dir);
    if (goInfo) {
      for (const [dep, name] of Object.entries(goFrameworkMap)) {
        if (goInfo.dependencies.includes(dep) && !result.frameworks.includes(name)) {
          result.frameworks.push(name);
        }
      }
      // Set test framework if testify found
      if (goInfo.dependencies.includes('github.com/stretchr/testify') && !result.testFramework) {
        result.testFramework = 'testify';
        result.health.hasTests = true;
      }
    }
  }
}

/**
 * Detect project type(s) based on build files
 * @param {string} basePath - Project root
 * @returns {Object} Project type info
 */
function detectProjectType(basePath) {
  const types = [];

  // Check for each language's build files
  if (fs.existsSync(path.join(basePath, 'Cargo.toml'))) types.push('rust');
  if (fs.existsSync(path.join(basePath, 'go.mod'))) types.push('go');
  if (fs.existsSync(path.join(basePath, 'package.json'))) types.push('node');
  if (fs.existsSync(path.join(basePath, 'pom.xml')) ||
      fs.existsSync(path.join(basePath, 'build.gradle')) ||
      fs.existsSync(path.join(basePath, 'build.gradle.kts'))) types.push('java');
  if (fs.existsSync(path.join(basePath, 'pyproject.toml')) ||
      fs.existsSync(path.join(basePath, 'setup.py')) ||
      fs.existsSync(path.join(basePath, 'requirements.txt')) ||
      fs.existsSync(path.join(basePath, 'Pipfile'))) types.push('python');

  // Check subdirectories for multi-language projects (like valkey-glide)
  const subDirs = ['go', 'java', 'python', 'node', 'rust'];
  for (const dir of subDirs) {
    const subPath = path.join(basePath, dir);
    if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
      // Check for language-specific files in subdirectory
      if (dir === 'go' && fs.existsSync(path.join(subPath, 'go.mod')) && !types.includes('go')) {
        types.push('go');
      }
      if (dir === 'java' && (fs.existsSync(path.join(subPath, 'build.gradle')) ||
          fs.existsSync(path.join(subPath, 'pom.xml'))) && !types.includes('java')) {
        types.push('java');
      }
      if (dir === 'python' && (fs.existsSync(path.join(subPath, 'Pipfile')) ||
          fs.existsSync(path.join(subPath, 'pyproject.toml'))) && !types.includes('python')) {
        types.push('python');
      }
      if (dir === 'node' && fs.existsSync(path.join(subPath, 'package.json')) && !types.includes('node')) {
        types.push('node');
      }
    }
  }

  // Also check glide-core pattern (Rust in subdirectory)
  const rustDirs = ['glide-core', 'core', 'crates'];
  for (const dir of rustDirs) {
    if (fs.existsSync(path.join(basePath, dir, 'Cargo.toml')) && !types.includes('rust')) {
      types.push('rust');
    }
  }

  return {
    primary: types[0] || 'unknown',
    all: types,
    isMultiLang: types.length > 1
  };
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
    categorizeIssues(result, issues, opts);
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
 * Detect severity from issue labels
 */
function detectSeverityFromLabels(labels) {
  const labelStr = labels.map(l => (l.name || l).toLowerCase()).join(' ');
  if (/critical|p0|urgent|blocker|severity[:\s-]*critical/i.test(labelStr)) return 'critical';
  if (/high|p1|important|severity[:\s-]*high/i.test(labelStr)) return 'high';
  if (/medium|p2|severity[:\s-]*medium/i.test(labelStr)) return 'medium';
  if (/low|p3|minor|severity[:\s-]*low/i.test(labelStr)) return 'low';
  return 'medium'; // Default
}

/**
 * Calculate priority score for an issue (opt-in via options.calculatePriority)
 * Based on prioritization.md reference
 */
function calculateIssuePriority(issue, category) {
  const severityScores = { critical: 15, high: 10, medium: 5, low: 2 };
  const categoryWeights = { security: 2.0, bugs: 1.5, enhancements: 1.0, features: 1.0, other: 0.8 };

  const severity = detectSeverityFromLabels(issue.labels || []);
  let score = severityScores[severity] || 5;
  score *= categoryWeights[category] || 1.0;

  // Staleness factor
  const daysOld = Math.floor((Date.now() - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24));
  if (daysOld > 180) score *= 0.9;
  if (daysOld < 7) score *= 1.2; // Recency boost

  return {
    score: Math.round(score),
    severity,
    bucket: score >= 15 ? 'immediate' : score >= 10 ? 'short-term' : score >= 5 ? 'medium-term' : 'backlog'
  };
}

/**
 * Categorize issues by labels
 *
 * Uses regexes that treat non-letter characters (start/end of string, space, hyphen, colon, etc.)
 * as boundaries to avoid common false positives (e.g., "debug" won't match "bug", but "bug-fix" will).
 * Stores issue number + title (enough to understand without lookup).
 */
function categorizeIssues(result, issues, opts = {}) {
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
    let matchedCategory = 'other';

    // Store number + title for context
    const ref = { number: issue.number, title: issue.title };

    for (const { regex, category } of labelPatterns) {
      if (labels.some(l => regex.test(l))) {
        matchedCategory = category;
        break;
      }
    }

    // Add priority if opt-in
    if (opts.calculatePriority) {
      ref.priority = calculateIssuePriority(issue, matchedCategory);
    }

    result.categorized[matchedCategory].push(ref);
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
      featureDetails: [],
      plans: [],
      checkboxes: { total: 0, checked: 0, unchecked: 0 },
      gaps: []
    };

  // Standard documentation files to analyze
  const docFiles = [
    'README.md',
    'README.mdx',
    'README.rst',
    'README.txt',
    'README.adoc',
    'README.asciidoc',
    '.github/README.md',
    '.github/README.mdx',
    '.github/README.rst',
    '.github/README.txt',
    '.github/README.adoc',
    '.github/README.asciidoc',
    'PLAN.md',
    'CLAUDE.md',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'HISTORY.md',
    'RELEASES.md',
    'RELEASE_NOTES.md',
    'docs/README.md',
    'docs/README.mdx',
    'docs/README.rst',
    'docs/README.txt',
    'docs/README.adoc',
    'docs/README.asciidoc',
    'docs/PLAN.md'
  ];

    const seenFiles = new Set();
    const documents = [];

    const addDoc = (filePath, content) => {
      if (!content || seenFiles.has(filePath)) return;
      seenFiles.add(filePath);
      documents.push({ path: filePath, content });
      const analysis = analyzeMarkdownFile(content, filePath);
      result.files[filePath] = analysis;
      result.summary.totalWords += analysis.wordCount;
      extractCheckboxes(result, content);
      extractPlans(result, content);

      const pointer = resolveDocPointer(content);
      if (pointer && !seenFiles.has(pointer)) {
        const linkedContent = safeReadFile(pointer, basePath);
        if (linkedContent) {
          addDoc(pointer, linkedContent);
        }
      }
    };

    for (const file of docFiles) {
      const content = safeReadFile(file, basePath);
      if (content) {
        addDoc(file, content);
      }
    }

    const extraLimits = opts.depth === 'thorough'
      ? { docs: 20, plans: 30, checklists: 20 }
      : { docs: 8, plans: 8, checklists: 8 };

    const extraDirs = [
      { dir: 'docs', limit: extraLimits.docs },
      { dir: 'examples', limit: extraLimits.docs },
      { dir: 'extensions', limit: extraLimits.docs },
      { dir: 'plans', limit: extraLimits.plans },
      { dir: 'checklists', limit: extraLimits.checklists }
    ];
    const extraDocRoots = findExtraDocRoots(basePath, 4);
    for (const root of extraDocRoots) {
      extraDirs.push({ dir: root, limit: extraLimits.docs });
    }

    for (const entry of extraDirs) {
      let dirsToScan = [entry.dir];
      if (entry.dir === 'docs') {
        const docsEn = path.join(basePath, 'docs', 'en');
        const docsMarkdown = path.join(basePath, 'docs', 'markdown');
        if (fs.existsSync(docsEn)) {
          dirsToScan = ['docs/en'];
          if (fs.existsSync(docsMarkdown)) {
            dirsToScan.push('docs/markdown');
          }
        }
      }
      const items = dirsToScan.flatMap((dir) => listMarkdownFiles(basePath, dir, entry.limit));
      for (const filePath of items) {
        if (docFiles.includes(filePath)) continue;
        const content = safeReadFile(filePath, basePath);
        if (content) {
          addDoc(filePath, content);
        }
      }
    }

    const subprojectLimit = opts.depth === 'thorough' ? 8 : 3;
    const subprojectReadmes = listSubprojectReadmes(basePath, subprojectLimit);
    for (const filePath of subprojectReadmes) {
      if (docFiles.includes(filePath)) continue;
      if (seenFiles.has(filePath)) continue;
      const content = safeReadFile(filePath, basePath);
      if (content) {
        addDoc(filePath, content);
      }
    }

    const featureCandidates = findFeatureDocCandidates(basePath, 6);
    for (const filePath of featureCandidates) {
      if (docFiles.includes(filePath)) continue;
      if (seenFiles.has(filePath)) continue;
      const content = safeReadFile(filePath, basePath);
      if (content) {
        addDoc(filePath, content);
      }
    }

    const featureDocs = documents.filter(doc => !shouldSkipFeatureDoc(doc.path) && !shouldSkipFeatureDocPath(doc.path, doc.content));
    const featureData = featureExtractor.extractFeaturesFromDocs(featureDocs, opts.docFeatures);
    result.features = featureData.features || [];
    result.featureDetails = featureData.details || [];

    const cargoFeatures = extractCargoFeatures(basePath, 40);
    if (cargoFeatures.length > 0) {
      const seen = new Set(result.featureDetails.map(item => item.normalized));
      for (const feature of cargoFeatures) {
        if (seen.has(feature.normalized)) continue;
        seen.add(feature.normalized);
        result.featureDetails.push(feature);
        result.features.push(feature.name);
      }
    }

  result.summary.fileCount = Object.keys(result.files).length;

  // Identify documentation gaps
  identifyDocGaps(result);

  return result;
}

function shouldSkipFeatureDoc(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);
  if (normalized === 'docs/readme.md') return true;
  return [
    'agents.md',
    'claude.md',
    'contributing.md',
    'code_of_conduct.md',
    'security.md',
    'license.md',
    'history.md'
  ].includes(name);
}

function shouldSkipFeatureDocPath(filePath, content) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const hasSignal = hasFeatureSignal(content);
  if (normalized.startsWith('agent-docs/') || normalized.includes('/agent-docs/')) return true;
  if (normalized.startsWith('checklists/') || normalized.includes('/checklists/')) return true;
  if (normalized.startsWith('references/') || normalized.includes('/references/')) return true;
  if (normalized.startsWith('research/') || normalized.includes('/research/')) return true;
  if (normalized.startsWith('docs/internal/') || normalized.includes('/docs/internal/')) return true;
  if (normalized.startsWith('docs/specs/') || normalized.includes('/docs/specs/')) return true;
  if (normalized.startsWith('docs/archive/') || normalized.includes('/docs/archive/')) return true;
  if (normalized.startsWith('docs/archived/') || normalized.includes('/docs/archived/')) return true;
  if (normalized.startsWith('docs/legacy/') || normalized.includes('/docs/legacy/')) return true;
  if (normalized.startsWith('docs/old/') || normalized.includes('/docs/old/')) return true;
  if (normalized.startsWith('docs/drafts/') || normalized.includes('/docs/drafts/')) return true;
  if (normalized.startsWith('scripts/') || normalized.includes('/scripts/')) return true;
  if (/^docs\/[a-z-]{2}\//.test(normalized) && !/^docs\/en\//.test(normalized)) return true;
  const baseName = normalized.split('/').pop() || '';
  const baseStem = baseName.replace(/\.[^.]+$/, '');
  const allowDocNames = /(readme|index|overview|introduction|intro|get-started|getting-started|quickstart|features?|capabilities?|doc|tutorial|guide|howto|how-to|blueprints?|cli|async|deploy|patterns?|extensions?)/.test(baseStem);
  if (/^(api|reference|ref|changes?|changelog|release|breaking|migration|deprecated|deprecation|security)$/.test(baseStem)) return true;
  if (normalized.startsWith('docs/en/docs/') && !allowDocNames && !normalized.includes('/features') && !hasSignal) return true;
  const parts = normalized.split('/');
  const docsIndex = parts.indexOf('docs');
  if (docsIndex >= 0) {
    const depthAfterDocs = parts.length - docsIndex - 1;
    const allowDocPath = /^(docs\/(charts|axes|plugins|elements|markdown|guides|guide|howto|how-to|config|changes|concepts|api|intro|topics|faq|tutorial|tutorials|java-rest|internal|extend|community-clients)\/)/.test(normalized)
      || /^docs\/en\/docs\//.test(normalized);
    if (depthAfterDocs >= 2 && !allowDocPath && !hasSignal) return true;
    if (!allowDocNames && !allowDocPath && !hasSignal) return true;
    if (!hasSignal && /(docs\/(extend|community-clients|internal|java-rest)\/)/.test(normalized)) return true;
  }
  if (normalized.endsWith('supportedsites.md')) return true;
  if (normalized.includes('docs/source/') && !normalized.endsWith('docs/source/index.md')) return true;
  if (normalized.includes('docs/content/') && !normalized.endsWith('docs/content/index.md')) return true;
  if (/(^|\/)api\//.test(normalized)) return true;
  if (/(^|\/)reference\//.test(normalized)) return true;
  if (/(^|\/)spec\//.test(normalized)) return true;
  if (/(^|\/)docs\/blog\//.test(normalized)) return true;
  if (/(^|\/)examples?\//.test(normalized)) return true;
  if (/(^|\/)i18n\//.test(normalized)) return true;
  if (/(^|\/)release(s)?\//.test(normalized)) return true;
  if (/(^|\/)checklists?\//.test(normalized)) return true;
  if (normalized.includes('migration') || normalized.includes('migrations')) return true;
  if (normalized.includes('breaking-changes') || normalized.includes('breaking-changes')) return true;
  if (normalized.includes('changes') || normalized.includes('changelog')) return true;
  if (/(^|\/)releases?\.md$/.test(normalized)) return true;
  if (normalized.includes('release-notes') || normalized.includes('release_notes')) return true;
  if (normalized.includes('deprecations') || normalized.includes('deprecated')) return true;
  return false;
}

function hasFeatureSignal(content) {
  if (!content) return false;
  const text = String(content);
  if (/\b(features include|features includes|feature list|list of features|key features|supported features|core features|feature highlights)\b/i.test(text)) return true;
  if (/^#{1,6}\s+.*features?\b/im.test(text)) return true;
  if (/^=+\s+.*features?\b/im.test(text)) return true;
  return false;
}

function resolveDocPointer(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('\n')) return null;
  if (/\s/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  if (!/\.(md|mdx|rst|txt|adoc|asciidoc)$/i.test(trimmed)) return null;
  return trimmed.replace(/^\.\//, '');
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
 * Supports: - [x], * [x], + [x], 1. [x], and indented versions
 */
function extractCheckboxes(result, content) {
  // Match all checkbox formats
  const checkedPattern = /^[\s]*(?:[-*+]|\d+\.)\s*\[x\]/gim;
  const uncheckedPattern = /^[\s]*(?:[-*+]|\d+\.)\s*\[\s\]/gim;

  const checked = (content.match(checkedPattern) || []).length;
  const unchecked = (content.match(uncheckedPattern) || []).length;

  result.checkboxes.checked += checked;
  result.checkboxes.unchecked += unchecked;
  result.checkboxes.total += checked + unchecked;

  // Extract checkbox text for cross-referencing
  if (!result.checkboxes.items) result.checkboxes.items = [];
  const itemPattern = /^[\s]*(?:[-*+]|\d+\.)\s*\[(x|\s)\]\s*(.+)$/gim;
  let match;
  while ((match = itemPattern.exec(content)) !== null && result.checkboxes.items.length < 100) {
    result.checkboxes.items.push({
      checked: match[1].toLowerCase() === 'x',
      text: match[2].trim().slice(0, 150)  // Truncate long items
    });
  }
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

  // Detect project type first
  const projectType = detectProjectType(basePath);

  const result = {
    summary: { totalDirs: 0, totalFiles: 0 },
    projectType: projectType,
    topLevelDirs: [],
    frameworks: [],
    testFramework: null,
    hasTypeScript: false,
    implementedFeatures: [],
    symbols: {}, // Function/class/export names per file
    repoMap: { available: false },
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

  // Detect package.json dependencies (Node.js)
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

  // Detect Rust frameworks if project includes Rust
  if (projectType.all.includes('rust')) {
    detectRustFrameworks(result, basePath);
  }

  // Detect Python frameworks if project includes Python
  if (projectType.all.includes('python')) {
    detectPythonFrameworks(result, basePath);
  }

  // Detect Go frameworks if project includes Go
  if (projectType.all.includes('go')) {
    detectGoFrameworks(result, basePath);
  }

  // Detect Java frameworks if project includes Java
  if (projectType.all.includes('java')) {
    detectJavaFrameworks(result, basePath);
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
  detectHealth(result, basePath, projectType);

  const repoMapSummary = getRepoMapSummary(opts, basePath);
  if (repoMapSummary) {
    result.repoMap = repoMapSummary;
  }

  // Find implemented features from code
  if (opts.depth === 'thorough') {
    findImplementedFeatures({ ...result, structure: internalStructure }, basePath);
  }

  if (result.repoMap && result.repoMap.available) {
    result.symbols = result.repoMap.symbols || {};
  } else if (opts.depth === 'thorough') {
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

function getRepoMapSummary(options, basePath) {
  try {
    const repoMapOptions = options.repoMap || {};
    const depth = options.depth || 'thorough';
    const maxFiles = repoMapOptions.maxFiles || (depth === 'thorough' ? 40 : 15);
    const maxSymbolsPerType = repoMapOptions.maxSymbolsPerType || (depth === 'thorough' ? 20 : 8);

    return repoMap.summarizeForDrift(basePath, {
      maxFiles,
      maxSymbolsPerType,
      maxDependenciesPerFile: repoMapOptions.maxDependenciesPerFile || 10,
      includeStaleness: true
    });
  } catch {
    return { available: false };
  }
}

function getRepoMapSummaryFallback(basePath) {
  try {
    const repoMap = getRepoMap();
    const map = repoMap.cache?.load?.(basePath);
    if (!map) return null;
    return {
      available: true,
      summary: {
        generated: map.generated,
        updated: map.updated,
        commit: map.git?.commit,
        branch: map.git?.branch,
        files: Object.keys(map.files || {}).length,
        symbols: map.stats?.totalSymbols || 0,
        languages: summarizeRepoMapLanguages(map)
      }
    };
  } catch {
    return null;
  }
}

function summarizeRepoMapLanguages(map) {
  const extMap = new Map([
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
  const counts = new Map();
  const nonTestCounts = new Map();
  for (const file of Object.keys(map.files || {})) {
    const ext = path.extname(file).toLowerCase();
    const lang = extMap.get(ext);
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
  if (languages.length === 0) return map.project?.languages || [];
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
 * Detect frameworks from package.json (Node.js)
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
 * Detect Rust frameworks from Cargo.toml
 */
function detectRustFrameworks(result, basePath) {
  // Try root Cargo.toml first, then common subdirs
  const cargoPaths = ['Cargo.toml', 'glide-core/Cargo.toml', 'core/Cargo.toml', 'src/Cargo.toml'];

  const rustFrameworkMap = {
    ratatui: 'Ratatui (TUI)',
    crossterm: 'Crossterm',
    tokio: 'Tokio',
    'async-std': 'async-std',
    'actix-web': 'Actix Web',
    'actix-rt': 'Actix',
    axum: 'Axum',
    rocket: 'Rocket',
    warp: 'Warp',
    hyper: 'Hyper',
    serde: 'Serde',
    sqlx: 'SQLx',
    diesel: 'Diesel',
    'sea-orm': 'SeaORM',
    clap: 'Clap (CLI)',
    tracing: 'Tracing',
    log: 'Log'
  };

  for (const cargoPath of cargoPaths) {
    const cargo = parseCargoToml(basePath, cargoPath);
    if (cargo) {
      const allDeps = [...cargo.dependencies, ...cargo.devDependencies];
      for (const [dep, name] of Object.entries(rustFrameworkMap)) {
        if (allDeps.includes(dep) && !result.frameworks.includes(name)) {
          result.frameworks.push(name);
        }
      }
    }
  }
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
function detectHealth(result, basePath, projectType) {
  // Check for README
  result.health.hasReadme = fs.existsSync(path.join(basePath, 'README.md'));

  // Check for linting config
  const lintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'biome.json', 'clippy.toml'];
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

  // Check for Rust tests (inline or test directories)
  if (projectType && projectType.all.includes('rust')) {
    // Check for test directories in Rust subdirectories
    const rustTestDirs = ['tests', 'glide-core/tests', 'core/tests', 'src/tests'];
    for (const dir of rustTestDirs) {
      if (fs.existsSync(path.join(basePath, dir))) {
        result.health.hasTests = true;
        if (!result.testFramework) result.testFramework = 'rust-builtin';
        break;
      }
    }

    // Also check for inline tests in src files
    if (!result.health.hasTests) {
      const rustSrcDirs = ['src', 'glide-core/src', 'core/src'];
      for (const dir of rustSrcDirs) {
        const srcPath = path.join(basePath, dir);
        if (fs.existsSync(srcPath)) {
          try {
            const files = fs.readdirSync(srcPath).filter(f => f.endsWith('.rs')).slice(0, 5);
            for (const file of files) {
              const content = safeReadFile(path.join(dir, file), basePath);
              if (content && (content.includes('#[test]') || content.includes('#[cfg(test)]'))) {
                result.health.hasTests = true;
                if (!result.testFramework) result.testFramework = 'rust-builtin';
                break;
              }
            }
          } catch {
            // Ignore read errors
          }
          if (result.health.hasTests) break;
        }
      }
    }
  }
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

  if (data.code && data.docs) {
    const featuresSource = Array.isArray(data.docs.featureDetails) && data.docs.featureDetails.length > 0
      ? data.docs.featureDetails
      : data.docs.features || [];

    const featureEvidence = getRepoMap().findFeatureEvidence(opts.cwd, featuresSource, {
      maxFeatures: opts.repoMap?.maxFeatures,
      maxDefsPerFeature: opts.repoMap?.maxDefsPerFeature,
      maxRefsPerFeature: opts.repoMap?.maxRefsPerFeature,
      maxFilesScannedPerDef: opts.repoMap?.maxFilesScannedPerDef,
      snippetLines: opts.repoMap?.snippetLines
    });

    if (!data.code.repoMap) {
      data.code.repoMap = { available: false };
    }

    data.code.repoMap.featureEvidence = featureEvidence;

    if (featureEvidence?.available && !data.code.repoMap.available) {
      const refreshed = getRepoMapSummary(opts, opts.cwd);
      if (refreshed && refreshed.available) {
        data.code.repoMap = { ...data.code.repoMap, ...refreshed };
      } else {
        data.code.repoMap.available = true;
      }
    }
  }

  if (data.code && data.docs) {
    data.drift = buildDriftSummary(data.docs, data.code, opts);
  }

  if (data.code && data.docs && opts.depth === 'thorough') {
    const evidenceTerms = extractRepoMapTerms(data.docs);
    const evidence = getRepoMap().findEvidence(opts.cwd, evidenceTerms, {
      maxTerms: opts.repoMap?.maxTerms,
      maxMatchesPerTerm: opts.repoMap?.maxMatchesPerTerm,
      maxSymbolsPerType: opts.repoMap?.maxSymbolsPerType,
      maxSymbolsPerMatch: opts.repoMap?.maxSymbolsPerMatch
    });

    if (!data.code.repoMap) {
      data.code.repoMap = { available: false };
    }

    data.code.repoMap.evidence = evidence;
  }

  if (data.code?.repoMap?.available && !data.code.repoMap.summary) {
    const refreshed = getRepoMapSummary(opts, opts.cwd);
    if (refreshed && refreshed.available && refreshed.summary) {
      data.code.repoMap = { ...data.code.repoMap, ...refreshed };
    } else {
      const fallback = getRepoMapSummaryFallback(opts.cwd);
      if (fallback && fallback.summary) {
        data.code.repoMap = { ...data.code.repoMap, ...fallback };
      }
    }
  }

  return data;
}

function buildDriftSummary(docs, code, opts) {
  const summary = {};
  summary.features = summarizeFeatureDrift(docs, code);
  summary.plans = summarizePlanDrift(docs, code, opts);
  return summary;
}

function summarizeFeatureDrift(docs, code) {
  const evidence = code?.repoMap?.featureEvidence?.features;
  if (!Array.isArray(evidence)) {
    return { available: false };
  }

  const evidenceMap = new Map();
  for (const item of evidence) {
    if (!item) continue;
    const key = item.normalized || featureExtractor.normalizeText(item.feature);
    if (!key) continue;
    evidenceMap.set(key, item.status || 'missing');
  }

  const rawFeatures = Array.isArray(docs?.featureDetails) && docs.featureDetails.length > 0
    ? docs.featureDetails
    : (docs?.features || []).map(name => ({ name, normalized: featureExtractor.normalizeText(name) }));
  const features = rawFeatures.filter(feature => feature && feature.sourceType !== 'plan' && !feature.plan);

  let totalWeight = 0;
  let implementedWeight = 0;
  let partialWeight = 0;
  let implemented = 0;
  let partial = 0;
  let missing = 0;
  const missingItems = [];

  for (const feature of features) {
    if (!feature) continue;
    const normalized = feature.normalized || featureExtractor.normalizeText(feature.name || feature.feature || '');
    if (!normalized) continue;
    const status = evidenceMap.get(normalized) || 'missing';
    const weightBase = Number.isFinite(feature.totalWeight) ? feature.totalWeight
      : (Number.isFinite(feature.sourceWeight) ? feature.sourceWeight : 0.7);
    const weight = weightBase * (Number.isFinite(feature.confidence) ? feature.confidence : 1);
    totalWeight += weight;
    if (status === 'implemented') {
      implemented += 1;
      implementedWeight += weight;
    } else if (status === 'partial') {
      partial += 1;
      partialWeight += weight;
    } else {
      missing += 1;
      if (missingItems.length < 12) {
        missingItems.push({ name: feature.name, weight, normalized });
      }
    }
  }

  missingItems.sort((a, b) => b.weight - a.weight);

  const weightedCoverage = totalWeight > 0
    ? (implementedWeight + partialWeight * 0.5) / totalWeight
    : 0;

  return {
    available: true,
    total: implemented + partial + missing,
    implemented,
    partial,
    missing,
    weightedCoverage,
    weightedTotal: totalWeight,
    weightedImplemented: implementedWeight,
    weightedPartial: partialWeight,
    topMissing: missingItems
  };
}

function summarizePlanDrift(docs, code, opts) {
  const repoMap = code?.repoMap;
  if (!repoMap?.available) {
    return { available: false };
  }

  const checkboxItems = docs?.checkboxes?.items || [];
  const planItems = Array.isArray(docs?.plans) ? docs.plans.map(text => ({ text, checked: null })) : [];
  const items = [];

  for (const item of checkboxItems) {
    if (!item?.text) continue;
    if (!shouldIncludePlanItem(item.text)) continue;
    items.push({ text: item.text, checked: item.checked === true });
  }
  for (const item of planItems) {
    if (!item?.text) continue;
    if (!shouldIncludePlanItem(item.text)) continue;
    items.push({ text: item.text, checked: null });
  }

  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const normalized = featureExtractor.normalizeText(item.text);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ ...item, normalized });
  }

  if (unique.length === 0) {
    return { available: true, total: 0 };
  }

  const limit = Math.min(unique.length, opts?.repoMap?.maxFeatures || 30);
  const slice = unique.slice(0, limit);
  const evidence = getRepoMap().findFeatureEvidence(opts.cwd, slice.map(item => item.text), {
    maxFeatures: limit,
    maxDefsPerFeature: opts.repoMap?.maxDefsPerFeature,
    maxRefsPerFeature: opts.repoMap?.maxRefsPerFeature,
    maxFilesScannedPerDef: opts.repoMap?.maxFilesScannedPerDef,
    snippetLines: opts.repoMap?.snippetLines
  });

  const evidenceMap = new Map();
  if (Array.isArray(evidence?.features)) {
    for (const item of evidence.features) {
      const key = item.normalized || featureExtractor.normalizeText(item.feature);
      if (!key) continue;
      evidenceMap.set(key, item.status || 'missing');
    }
  }

  let checked = 0;
  let unchecked = 0;
  let implemented = 0;
  let partial = 0;
  let missing = 0;
  const mismatches = {
    checkedMissing: [],
    uncheckedImplemented: [],
    plannedImplemented: []
  };

  for (const item of slice) {
    if (item.checked === true) checked += 1;
    if (item.checked === false) unchecked += 1;
    const status = evidenceMap.get(item.normalized) || 'missing';
    if (status === 'implemented') implemented += 1;
    else if (status === 'partial') partial += 1;
    else missing += 1;

    if (item.checked === true && status === 'missing' && mismatches.checkedMissing.length < 10) {
      mismatches.checkedMissing.push(item.text);
    }
    if (item.checked === false && status === 'implemented' && mismatches.uncheckedImplemented.length < 10) {
      mismatches.uncheckedImplemented.push(item.text);
    }
    if (item.checked === null && status === 'implemented' && mismatches.plannedImplemented.length < 10) {
      mismatches.plannedImplemented.push(item.text);
    }
  }

  const planFeatures = summarizePlanFeatures(docs, code, opts);

  return {
    available: true,
    total: slice.length,
    checked,
    unchecked,
    implemented,
    partial,
    missing,
    mismatches,
    planFeatures
  };
}

function summarizePlanFeatures(docs, code, opts) {
  const repoMap = code?.repoMap;
  if (!repoMap?.available) {
    return { available: false };
  }

  const detailFeatures = Array.isArray(docs?.featureDetails) ? docs.featureDetails : [];
  const planFeatures = detailFeatures.filter(feature => feature && (feature.sourceType === 'plan' || feature.plan));
  if (planFeatures.length === 0) {
    return { available: true, total: 0 };
  }

  const items = [];
  const seen = new Set();
  for (const feature of planFeatures) {
    const text = feature.name || feature.feature || '';
    if (!text) continue;
    if (!shouldIncludePlanItem(text)) continue;
    const normalized = feature.normalized || featureExtractor.normalizeText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push({
      text,
      normalized,
      status: feature.plan?.status || null,
      phase: feature.plan?.phase || null
    });
  }

  if (items.length === 0) {
    return { available: true, total: 0 };
  }

  const limit = Math.min(items.length, opts?.repoMap?.maxFeatures || 30);
  const slice = items.slice(0, limit);
  const evidence = getRepoMap().findFeatureEvidence(opts.cwd, slice.map(item => item.text), {
    maxFeatures: limit,
    maxDefsPerFeature: opts.repoMap?.maxDefsPerFeature,
    maxRefsPerFeature: opts.repoMap?.maxRefsPerFeature,
    maxFilesScannedPerDef: opts.repoMap?.maxFilesScannedPerDef,
    snippetLines: opts.repoMap?.snippetLines
  });

  const evidenceMap = new Map();
  if (Array.isArray(evidence?.features)) {
    for (const item of evidence.features) {
      const key = item.normalized || featureExtractor.normalizeText(item.feature);
      if (!key) continue;
      evidenceMap.set(key, item.status || 'missing');
    }
  }

  let implemented = 0;
  let partial = 0;
  let missing = 0;
  const mismatches = {
    plannedImplemented: [],
    doneMissing: [],
    inProgressMissing: []
  };

  for (const item of slice) {
    const status = evidenceMap.get(item.normalized) || 'missing';
    if (status === 'implemented') implemented += 1;
    else if (status === 'partial') partial += 1;
    else missing += 1;

    if ((item.status === null || item.status === 'planned') && status === 'implemented' && mismatches.plannedImplemented.length < 10) {
      mismatches.plannedImplemented.push(item.text);
    }
    if (item.status === 'done' && status === 'missing' && mismatches.doneMissing.length < 10) {
      mismatches.doneMissing.push(item.text);
    }
    if (item.status === 'in_progress' && status === 'missing' && mismatches.inProgressMissing.length < 10) {
      mismatches.inProgressMissing.push(item.text);
    }
  }

  return {
    available: true,
    total: slice.length,
    implemented,
    partial,
    missing,
    mismatches
  };
}

function shouldIncludePlanItem(text) {
  const normalized = featureExtractor.normalizeText(text);
  if (!normalized) return false;
  if (normalized.length < 6) return false;
  if (normalized.split(' ').length < 2) return false;
  if (/^(todo|fixme|note|notes|misc|chore|refactor)\b/.test(normalized)) return false;
  return true;
}

function extractRepoMapTerms(docs) {
  const terms = [];
  if (!docs) return terms;

  if (Array.isArray(docs.features)) {
    terms.push(...docs.features);
  }

  if (Array.isArray(docs.featureDetails)) {
    for (const feature of docs.featureDetails) {
      if (feature && feature.normalized) {
        terms.push(feature.normalized);
      }
    }
  }

  if (Array.isArray(docs.plans)) {
    terms.push(...docs.plans);
  }

  const checkboxItems = docs.checkboxes?.items;
  if (Array.isArray(checkboxItems)) {
    for (const item of checkboxItems) {
      if (item && item.text) {
        terms.push(item.text);
      }
    }
  }

  return terms;
}

function listMarkdownFiles(basePath, relativeDir, limit) {
  const priority = [];
  const standard = [];
  const lowPriority = [];
  const root = path.join(basePath, relativeDir);
  if (!fs.existsSync(root)) return [];

  const walk = (dir) => {
    if ((priority.length + standard.length) >= limit * 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if ((priority.length + standard.length) >= limit * 4) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx') || entry.name.endsWith('.rst') || entry.name.endsWith('.txt') || entry.name.endsWith('.adoc') || entry.name.endsWith('.asciidoc'))) {
        const relPath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        const baseName = entry.name.toLowerCase();
        const isPriority = /(readme|index|overview|introduction|intro|getting-started|gettingstarted|quickstart|features?|capabilities?|concepts?)\.(md|mdx|rst|txt|adoc|asciidoc)$/.test(baseName);
        const isLow = /(nav|appendix|glossary|changelog|release|changes)\.(md|mdx|rst|txt|adoc|asciidoc)$/.test(baseName);
        if (isPriority) {
          priority.push(relPath);
        } else if (isLow) {
          lowPriority.push(relPath);
        } else {
          standard.push(relPath);
        }
      }
    }
  };

  walk(root);
  return priority.concat(standard, lowPriority).slice(0, limit);
}

function findExtraDocRoots(basePath, limit) {
  const results = [];
  if (!fs.existsSync(basePath)) return results;
  let entries;
  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return results;
  }

  const ignoreDirs = new Set([
    '.git', '.github', '.claude', '.codex', '.opencode', '.vscode',
    'node_modules', 'dist', 'build', 'out', 'coverage', 'tmp', 'temp',
    'vendor', 'packages', 'examples', 'docs'
  ]);

  for (const entry of entries) {
    if (results.length >= limit) break;
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith('.')) continue;
    if (ignoreDirs.has(name)) continue;
    const lower = name.toLowerCase();
    if (!lower.includes('doc') && !lower.includes('docs') && !lower.includes('documentation')) continue;
    results.push(name);
  }

  return results.slice(0, limit);
}

function extractCargoFeatures(basePath, limit) {
  const files = listCargoFiles(basePath, 6);
  const results = [];
  for (const filePath of files) {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    if (normalizedPath.includes('/perf-tests/') || normalizedPath.includes('/perf_test/') || normalizedPath.includes('/dummy')) {
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(path.join(basePath, filePath), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    let inFeatures = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('[')) {
        inFeatures = trimmed.toLowerCase() === '[features]';
        continue;
      }
      if (!inFeatures) continue;
      const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=/);
      if (!match) continue;
      const name = match[1];
      if (name.toLowerCase() === 'default') continue;
      const normalized = featureExtractor.normalizeText(name);
      const tokens = featureExtractor.tokenize(normalized);
      if (!tokens.length) continue;
      results.push({
        name,
        normalized,
        tokens,
        sourceFile: filePath,
        sourceType: 'cargo',
        sourceLine: i + 1,
        context: line.trim().slice(0, 200)
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function listCargoFiles(basePath, limit) {
  const results = [];
  const root = basePath;
  const walk = (dir) => {
    if (results.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) break;
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        const relLower = relativePath.toLowerCase();
        if (relLower.includes('node_modules') || relLower.includes('/target/') || relLower.includes('/dist/') || relLower.includes('/build/')) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name === 'Cargo.toml') {
        results.push(relativePath);
      }
    }
  };

  walk(root);
  return results.slice(0, limit);
}

function findFeatureDocCandidates(basePath, limit) {
  const results = [];
  const root = path.join(basePath, 'docs');
  if (!fs.existsSync(root)) return results;

  const targets = new Set(['features.md', 'feature.md']);
  const walk = (dir) => {
    if (results.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile() && targets.has(entry.name.toLowerCase())) {
        const relPath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        results.push(relPath);
      }
    }
  };

  walk(root);
  return results.slice(0, limit);
}

function listSubprojectReadmes(basePath, limit) {
  const results = [];
  if (!fs.existsSync(basePath)) return results;
  let entries;
  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return results;
  }

  const ignoreDirs = new Set([
    '.git', '.github', '.claude', '.codex', '.opencode', '.vscode',
    'node_modules', 'dist', 'build', 'out', 'coverage', 'tmp', 'temp',
    'vendor', 'packages', 'examples', 'docs'
  ]);

  for (const entry of entries) {
    if (results.length >= limit) break;
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (ignoreDirs.has(entry.name)) continue;
    const readmePath = path.join(basePath, entry.name, 'README.md');
    const readmeLower = path.join(basePath, entry.name, 'readme.md');
    if (fs.existsSync(readmePath)) {
      results.push(path.relative(basePath, readmePath).replace(/\\/g, '/'));
    } else if (fs.existsSync(readmeLower)) {
      results.push(path.relative(basePath, readmeLower).replace(/\\/g, '/'));
    }
  }

  return results.slice(0, limit);
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
