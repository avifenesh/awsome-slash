/**
 * Slop Analyzers - Multi-pass analysis functions for slop detection
 *
 * These analyzers handle patterns that require structural code analysis
 * beyond simple regex matching (e.g., doc/code ratio computation).
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Analyze JSDoc-to-function ratio to detect excessive documentation
 *
 * Flags functions where JSDoc block lines exceed maxRatio times the function body lines.
 * This pattern often indicates AI-generated code with verbose, unnecessary documentation.
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {number} [options.minFunctionLines=3] - Minimum function body lines to analyze
 * @param {number} [options.maxRatio=3.0] - Maximum allowed doc/code ratio
 * @returns {Array<Object>} Array of violations: { line, docLines, codeLines, ratio }
 */
function analyzeDocCodeRatio(content, options = {}) {
  const minFunctionLines = options.minFunctionLines || 3;
  const maxRatio = options.maxRatio || 3.0;
  const violations = [];

  // Regex to match JSDoc block followed by any function declaration
  // Captures: /** ... */ then finds the next opening brace
  // Handles: function name(), async function name(), export function, const name = () =>
  const jsdocPattern = /\/\*\*([\s\S]*?)\*\/\s*(export\s+)?(async\s+)?(?:function\s+\w+\s*\([^)]*\)|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;

  let match;
  while ((match = jsdocPattern.exec(content)) !== null) {
    const jsdocBlock = match[1];
    const jsdocLines = countNonEmptyLines(jsdocBlock);

    // Find the opening brace after the match
    const afterMatch = match.index + match[0].length;
    const openBraceOffset = content.substring(afterMatch).search(/\{/);
    if (openBraceOffset === -1) continue; // No opening brace found

    const funcStart = afterMatch + openBraceOffset;
    const closingBraceIndex = findMatchingBrace(content, funcStart);

    if (closingBraceIndex === -1) continue; // Parsing failed, skip

    const funcBody = content.substring(funcStart + 1, closingBraceIndex);
    const funcLines = countNonEmptyLines(funcBody);

    // Skip if function is too small
    if (funcLines < minFunctionLines) continue;

    const ratio = jsdocLines / funcLines;
    if (ratio > maxRatio) {
      // Line number is 1-indexed: count newlines before match + 1
      const lineNumber = countNewlines(content.substring(0, match.index)) + 1;
      violations.push({
        line: lineNumber,
        docLines: jsdocLines,
        codeLines: funcLines,
        ratio: parseFloat(ratio.toFixed(2))
      });
    }
  }

  return violations;
}

/**
 * Count non-empty lines in a string
 * @param {string} str - String to count lines in
 * @returns {number} Number of non-empty lines
 */
function countNonEmptyLines(str) {
  return str.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Count newlines in a string (for line number calculation)
 * @param {string} str - String to count newlines in
 * @returns {number} Number of newlines (lines - 1 for content before position)
 */
function countNewlines(str) {
  if (!str) return 0;
  return (str.match(/\n/g) || []).length;
}

/**
 * Find matching closing brace (handles nested braces and string literals)
 *
 * Stops at 5000 characters to prevent runaway parsing on malformed code.
 *
 * @param {string} content - Full file content
 * @param {number} openIndex - Index of opening brace
 * @returns {number} Index of matching closing brace, or -1 if not found
 */
function findMatchingBrace(content, openIndex) {
  let depth = 1;
  let inString = false;
  let stringChar = '';
  let inTemplateExpr = false;
  let templateExprDepth = 0;

  // Limit search to prevent runaway parsing
  const maxSearch = Math.min(content.length, openIndex + 5000);

  for (let i = openIndex + 1; i < maxSearch; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Skip single-line comments (must be checked before string handling)
    // Quotes/apostrophes inside comments should not affect string state
    if (!inString && char === '/' && content[i + 1] === '/') {
      const eol = content.indexOf('\n', i);
      i = eol === -1 ? maxSearch : eol;
      continue;
    }

    // Skip block comments
    if (!inString && char === '/' && content[i + 1] === '*') {
      const endComment = content.indexOf('*/', i + 2);
      i = endComment === -1 ? maxSearch : endComment + 1;
      continue;
    }

    // Handle template literal expression ${...}
    if (char === '$' && content[i + 1] === '{' && inString && stringChar === '`') {
      inTemplateExpr = true;
      templateExprDepth = 1;
      i++; // Skip the {
      continue;
    }

    // Inside template expression, track braces separately
    if (inTemplateExpr) {
      if (char === '{') {
        templateExprDepth++;
      } else if (char === '}') {
        templateExprDepth--;
        if (templateExprDepth === 0) {
          inTemplateExpr = false;
        }
      }
      continue;
    }

    // Track string state (handle escaped quotes)
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        inString = true;
        stringChar = char;
      }
      continue;
    }

    // Count braces outside strings
    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      if (depth === 0) return i;
    }
  }

  return -1; // Not found within limit
}

// ============================================================================
// Verbosity Detection
// ============================================================================

/**
 * Comment syntax patterns for different languages
 * blockLen: length of block comment delimiter (2 for /*, 3 for """)
 */
const COMMENT_SYNTAX = {
  js: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } },
  python: { line: /^\s*#/, block: { start: /"""/, end: /"""/, len: 3 } },
  rust: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } },
  go: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } }
};

/**
 * Detect language from file extension for comment syntax
 * @param {string} filePath - File path or extension
 * @returns {string} Language key (js, python, rust, go)
 */
function detectCommentLanguage(filePath) {
  if (!filePath) return 'js';
  const ext = filePath.includes('.') ? filePath.substring(filePath.lastIndexOf('.')) : filePath;
  if (['.py'].includes(ext)) return 'python';
  if (['.rs'].includes(ext)) return 'rust';
  if (['.go'].includes(ext)) return 'go';
  return 'js'; // Default for .js, .ts, .jsx, .tsx, etc.
}

/**
 * Analyze inline comment-to-code ratio within functions
 *
 * Flags functions where inline comment lines exceed maxCommentRatio times the code lines.
 * This pattern detects over-explained code where comments restate what the code does.
 *
 * Different from doc/code ratio:
 * - doc/code ratio: counts JSDoc blocks ABOVE functions
 * - verbosity ratio: counts inline comments WITHIN function bodies
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {number} [options.minCodeLines=3] - Minimum code lines to analyze
 * @param {number} [options.maxCommentRatio=2.0] - Maximum allowed comment/code ratio
 * @param {string} [options.filePath] - File path for language detection
 * @returns {Array<Object>} Array of violations: { line, commentLines, codeLines, ratio }
 */
function analyzeVerbosityRatio(content, options = {}) {
  const minCodeLines = options.minCodeLines || 3;
  const maxCommentRatio = options.maxCommentRatio || 2.0;
  const lang = detectCommentLanguage(options.filePath);
  const violations = [];

  // Pattern to find function declarations with opening brace
  // Handles: function name(), async function name(), const name = () =>, arrow functions
  const funcPattern = /(export\s+)?(async\s+)?(?:function\s+\w+\s*\([^)]*\)|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?function\s*\([^)]*\))/g;

  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    // Find the opening brace after the function declaration
    const afterMatch = match.index + match[0].length;
    const searchRegion = content.substring(afterMatch, afterMatch + 200); // Look ahead
    const braceMatch = searchRegion.match(/^\s*\{/);

    if (!braceMatch) continue; // No opening brace found (might be expression body arrow)

    const funcStart = afterMatch + searchRegion.indexOf('{');
    const closingBraceIndex = findMatchingBrace(content, funcStart);

    if (closingBraceIndex === -1) continue; // Parsing failed, skip

    const funcBody = content.substring(funcStart + 1, closingBraceIndex);

    // Count comment lines and code lines within function body
    const lines = funcBody.split('\n');
    let commentLines = 0;
    let codeLines = 0;
    let inBlockComment = false;
    const commentSyntax = COMMENT_SYNTAX[lang] || COMMENT_SYNTAX.js;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      // Handle block comments
      if (inBlockComment) {
        commentLines++;
        if (commentSyntax.block.end.test(trimmed)) {
          inBlockComment = false;
        }
        continue;
      }

      if (commentSyntax.block.start.test(trimmed)) {
        commentLines++;
        const delimLen = commentSyntax.block.len || 2;
        if (!commentSyntax.block.end.test(trimmed.substring(trimmed.search(commentSyntax.block.start) + delimLen))) {
          inBlockComment = true;
        }
        continue;
      }

      // Handle line comments
      if (commentSyntax.line.test(trimmed)) {
        commentLines++;
        continue;
      }

      // It's code (may have trailing comment, but primary purpose is code)
      codeLines++;
    }

    // Skip if function is too small
    if (codeLines < minCodeLines) continue;

    const ratio = commentLines / codeLines;
    if (ratio > maxCommentRatio) {
      // Line number is 1-indexed: count newlines before match + 1
      const lineNumber = countNewlines(content.substring(0, match.index)) + 1;
      violations.push({
        line: lineNumber,
        commentLines,
        codeLines,
        ratio: parseFloat(ratio.toFixed(2))
      });
    }
  }

  return violations;
}

// ============================================================================
// Over-Engineering Detection
// ============================================================================

/**
 * Standard entry points per language ecosystem
 * Libraries typically re-export from these files
 */
const ENTRY_POINTS = [
  'index.js', 'index.ts', 'src/index.js', 'src/index.ts',
  'lib/index.js', 'lib/index.ts', 'main.js', 'main.ts',
  'lib.rs', 'src/lib.rs',
  'main.go',
  '__init__.py', 'src/__init__.py'
];

/**
 * Export patterns per language (used by countExportsInContent)
 */
const EXPORT_PATTERNS = {
  js: [
    /export\s+(function|class|const|let|var|default|async\s+function)/g,
    /export\s*\{[^}]+\}/g,           // Named re-exports: export { Foo, Bar }
    /export\s*\*\s*(as\s+\w+\s+)?from/g,  // Star re-exports: export * from './foo'
    /module\.exports\s*=/g,
    /exports\.\w+\s*=/g
  ],
  rust: [
    /^pub\s+(fn|struct|enum|mod|type|trait|const|static)/gm
  ],
  go: [
    /^func\s+[A-Z]/gm,
    /^type\s+[A-Z]\w*\s+(struct|interface)/gm,
    /^var\s+[A-Z]/gm,
    /^const\s+[A-Z]/gm
  ],
  python: [
    /__all__\s*=\s*\[/g,
    /^def\s+(?!_)\w+\s*\(/gm,    // Public functions (excludes _private)
    /^class\s+[A-Z]\w*[\s:(]/gm
  ]
};

/**
 * Source file extensions per language
 */
const SOURCE_EXTENSIONS = {
  js: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  rust: ['.rs'],
  go: ['.go'],
  python: ['.py']
};

/**
 * Directories to exclude from analysis
 */
const EXCLUDE_DIRS = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg', '__pycache__', '.pytest_cache',
  'coverage', '.nyc_output', '.next', '.nuxt', '.cache'
];

/**
 * Detect language from file extension
 * @param {string} filePath - Path to file
 * @returns {string} Language key (js, rust, go, python)
 */
function detectLanguage(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  for (const [lang, exts] of Object.entries(SOURCE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang;
  }
  return 'js'; // Default to JS patterns
}

/**
 * Count exports in file content based on language
 * @param {string} content - File content
 * @param {string} lang - Language key
 * @returns {number} Number of exports detected
 */
function countExportsInContent(content, lang) {
  const patterns = EXPORT_PATTERNS[lang] || EXPORT_PATTERNS.js;
  let count = 0;

  for (const pattern of patterns) {
    // Clone pattern to reset lastIndex
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = content.match(regex);
    if (matches) count += matches.length;
  }

  return count;
}

/**
 * Check if path should be excluded from analysis
 * @param {string} filePath - Path to check
 * @param {string[]} excludeDirs - Directories to exclude
 * @returns {boolean} True if should be excluded
 */
function shouldExclude(filePath, excludeDirs = EXCLUDE_DIRS) {
  const parts = filePath.split(/[\\/]/);
  return parts.some(part => excludeDirs.includes(part));
}

/**
 * Check if file is a test file
 * @param {string} filePath - Path to check
 * @returns {boolean} True if test file
 */
function isTestFile(filePath) {
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_tests?\.(go|rs|py)$/,
    /test_.*\.py$/,
    /__tests__/,
    /tests?\//i
  ];
  return testPatterns.some(p => p.test(filePath));
}

/**
 * Count source files in directory (recursive, excludes tests/vendor by default)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {Function} options.readdir - Directory reader (for testing)
 * @param {Function} options.stat - Stat function (for testing)
 * @param {number} options.maxFiles - Maximum files to count (default 10000)
 * @param {boolean} options.includeTests - Include test files (default false)
 * @returns {Object} { count, files[] }
 */
function countSourceFiles(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');
  const maxFiles = options.maxFiles || 10000;
  const includeTests = options.includeTests || false;

  const files = [];
  let count = 0;
  // Pre-compute extension list for performance (avoid recalculation in loop)
  const allExts = Object.values(SOURCE_EXTENSIONS).flat();

  function walk(dir, depth = 0) {
    if (count >= maxFiles) return;
    if (depth > 10) return; // Prevent infinite recursion

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (count >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      if (shouldExclude(relativePath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);

        if (allExts.includes(ext) && (includeTests || !isTestFile(relativePath))) {
          files.push(relativePath);
          count++;
        }
      }
    }
  }

  walk(repoPath);
  return { count, files };
}

/**
 * Count source lines (excluding comments and blanks)
 *
 * Uses simple heuristics - not a full parser but good enough for metrics.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {string[]} options.files - Files to count (from countSourceFiles)
 * @param {Function} options.readFile - File reader (for testing)
 * @returns {number} Total source lines
 */
function countSourceLines(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');
  const files = options.files || countSourceFiles(repoPath, options).files;

  let totalLines = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(repoPath, file), 'utf8');
      const lines = content.split('\n');

      let inBlockComment = false;
      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines
        if (!trimmed) continue;

        // Process line for block comments (handles inline and multi-line)
        let processedLine = trimmed;

        // Handle block comment state transitions
        if (inBlockComment) {
          const endIdx = processedLine.indexOf('*/');
          if (endIdx !== -1) {
            // Comment ends on this line - keep anything after */
            inBlockComment = false;
            processedLine = processedLine.substring(endIdx + 2).trim();
          } else {
            // Still in block comment
            continue;
          }
        }

        // Check for block comment start (may also end on same line)
        const startIdx = processedLine.indexOf('/*');
        if (startIdx !== -1) {
          const beforeComment = processedLine.substring(0, startIdx).trim();
          const afterStart = processedLine.substring(startIdx + 2);
          const endIdx = afterStart.indexOf('*/');

          if (endIdx !== -1) {
            // Single-line block comment: /* ... */
            processedLine = beforeComment + ' ' + afterStart.substring(endIdx + 2).trim();
            processedLine = processedLine.trim();
          } else {
            // Block comment starts but doesn't end
            inBlockComment = true;
            processedLine = beforeComment;
          }
        }

        // Skip if nothing left after removing comments
        if (!processedLine) continue;

        // Skip single-line comments
        if (processedLine.startsWith('//') || processedLine.startsWith('#')) continue;

        // Skip Python/Rust doc comments that span the whole line
        if (processedLine.startsWith('///') || processedLine.startsWith('"""') || processedLine.startsWith("'''")) continue;

        totalLines++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  return totalLines;
}

/**
 * Count exports from entry points
 *
 * Scans standard entry points (index.js, lib.rs, etc.) for export statements.
 * Falls back to scanning all src/ if no entry points found.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {Function} options.readFile - File reader (for testing)
 * @returns {Object} { count, method, entryPoints[] }
 */
function countEntryPointExports(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const foundEntries = [];
  let count = 0;

  // Try standard entry points
  for (const entry of ENTRY_POINTS) {
    const fullPath = path.join(repoPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lang = detectLanguage(entry);
        const exports = countExportsInContent(content, lang);
        if (exports > 0) {
          foundEntries.push(entry);
          count += exports;
        }
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  if (count > 0) {
    return { count, method: 'entry-points', entryPoints: foundEntries };
  }

  // Fallback: scan src/ for all exports
  const srcDir = path.join(repoPath, 'src');
  try {
    const srcStat = fs.statSync(srcDir);
    if (srcStat.isDirectory()) {
      const { files } = countSourceFiles(srcDir, options);
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
          const lang = detectLanguage(file);
          count += countExportsInContent(content, lang);
        } catch {
          // Skip unreadable
        }
      }
      if (count > 0) {
        return { count, method: 'src-scan', entryPoints: ['src/'] };
      }
    }
  } catch {
    // No src/ directory
  }

  // Final fallback
  return { count: 1, method: 'fallback', entryPoints: [] };
}

/**
 * Get maximum directory depth in a path
 *
 * @param {string} repoPath - Repository root path
 * @param {string} startDir - Directory to start from (e.g., 'src')
 * @param {Object} options - Options
 * @returns {number} Maximum depth (0 if startDir doesn't exist)
 */
function getMaxDirectoryDepth(repoPath, startDir = 'src', options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const rootDir = path.join(repoPath, startDir);
  let maxDepth = 0;

  function walk(dir, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > 20) return; // Safety limit

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !shouldExclude(entry.name)) {
          walk(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  try {
    const stat = fs.statSync(rootDir);
    if (stat.isDirectory()) {
      walk(rootDir, 1);
    }
  } catch {
    return 0;
  }

  return maxDepth;
}

/**
 * Analyze over-engineering metrics for a repository
 *
 * Detects three signals of over-engineering:
 * 1. File-to-export ratio > 20x
 * 2. Lines-per-export > 500:1
 * 3. Directory depth > 4 levels
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {number} [options.fileRatioThreshold=20] - Max files per export
 * @param {number} [options.linesPerExportThreshold=500] - Max lines per export
 * @param {number} [options.depthThreshold=4] - Max directory depth
 * @returns {Object} Analysis results with violations
 */
function analyzeOverEngineering(repoPath, options = {}) {
  const fileRatioThreshold = options.fileRatioThreshold || 20;
  const linesPerExportThreshold = options.linesPerExportThreshold || 500;
  const depthThreshold = options.depthThreshold || 4;

  const violations = [];

  // Count source files
  const { count: sourceFileCount, files } = countSourceFiles(repoPath, options);

  // Count exports from entry points
  const { count: exportCount, method: exportMethod, entryPoints } = countEntryPointExports(repoPath, options);

  // Calculate file-to-export ratio
  const fileRatio = sourceFileCount / Math.max(exportCount, 1);
  if (fileRatio > fileRatioThreshold) {
    violations.push({
      type: 'file_proliferation',
      value: `${sourceFileCount} files / ${exportCount} exports = ${fileRatio.toFixed(1)}x`,
      threshold: `${fileRatioThreshold}x`,
      severity: fileRatio > fileRatioThreshold * 2 ? 'high' : 'medium',
      details: { sourceFileCount, exportCount, fileRatio, exportMethod }
    });
  }

  // Count source lines
  const totalLines = countSourceLines(repoPath, { ...options, files });

  // Calculate lines-per-export ratio
  const linesPerExport = totalLines / Math.max(exportCount, 1);
  if (linesPerExport > linesPerExportThreshold) {
    violations.push({
      type: 'code_density',
      value: `${totalLines} lines / ${exportCount} exports = ${Math.round(linesPerExport)}:1`,
      threshold: `${linesPerExportThreshold}:1`,
      severity: linesPerExport > linesPerExportThreshold * 2 ? 'high' : 'medium',
      details: { totalLines, exportCount, linesPerExport }
    });
  }

  // Get directory depth
  const maxDepth = getMaxDirectoryDepth(repoPath, 'src', options);
  if (maxDepth > depthThreshold) {
    violations.push({
      type: 'directory_depth',
      value: `${maxDepth} levels`,
      threshold: `${depthThreshold} levels`,
      severity: maxDepth > depthThreshold + 2 ? 'high' : 'medium',
      details: { maxDepth }
    });
  }

  return {
    metrics: {
      sourceFiles: sourceFileCount,
      exports: exportCount,
      exportMethod,
      entryPoints,
      totalLines,
      directoryDepth: maxDepth,
      fileRatio: parseFloat(fileRatio.toFixed(2)),
      linesPerExport: Math.round(linesPerExport)
    },
    violations,
    verdict: violations.length > 0
      ? (violations.some(v => v.severity === 'high') ? 'HIGH' : 'MEDIUM')
      : 'OK'
  };
}

// ============================================================================
// Infrastructure Without Implementation Detection
// Detects infrastructure components that are set up but never used
// ============================================================================

/**
 * Common infrastructure component suffixes that indicate setup/configuration
 * These naming patterns typically indicate infrastructure components
 */
const INFRASTRUCTURE_SUFFIXES = [
  'Client', 'Connection', 'Pool', 'Service', 'Provider',
  'Manager', 'Factory', 'Repository', 'Gateway', 'Adapter',
  'Handler', 'Broker', 'Queue', 'Cache', 'Store',
  'Transport', 'Channel', 'Socket', 'Server', 'Database'
];

/**
 * Common setup/initialization verbs that indicate infrastructure creation
 */
const SETUP_VERBS = [
  'create', 'connect', 'init', 'initialize', 'setup',
  'configure', 'establish', 'open', 'start', 'new',
  'build', 'make', 'construct', 'instantiate', 'spawn'
];

/**
 * Language-specific patterns for instantiation/initialization
 * These patterns detect when infrastructure components are created
 */
const INSTANTIATION_PATTERNS = {
  js: [
    // new Class() instantiation
    /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))/g,
    // Factory/builder pattern: createXxx(), Xxx.create()
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:create|connect|init|initialize|setup)(\w+)/gi,
    // Method call pattern: thing.connect(), thing.initialize()
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?\w+\.(?:create|connect|init|initialize|setup|open|start)\(/gi
  ],
  python: [
    // Class instantiation: client = SomeClient()
    /^(\w+)\s*=\s*(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))\(/gm,
    // Factory pattern: client = create_client()
    /^(\w+)\s*=\s*(?:create|connect|init|initialize|setup)_(\w+)\(/gm,
    // Async patterns: client = await create_client()
    /^(\w+)\s*=\s*await\s+(?:create|connect|init|initialize|setup)_(\w+)\(/gm
  ],
  go: [
    // New* function pattern: client := NewClient()
    /(\w+)\s*:=\s*(?:New|Create|Connect|Init|Setup)(\w+)\(/g,
    // Variable declaration: var client = NewClient()
    /var\s+(\w+)\s+.*=\s*(?:New|Create|Connect|Init|Setup)(\w+)\(/g,
    // Struct literal with suffix: client := &RedisClient{}
    /(\w+)\s*:=\s*&(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))\{/g
  ],
  rust: [
    // ::new() constructor: let client = Client::new()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))::(?:new|create|connect|init|build)\(/g,
    // Builder pattern: let client = ClientBuilder::new().build()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w+Builder)::new\(\).*\.build\(\)/g,
    // From/into patterns: let client = Client::from()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))::from/g
  ]
};

// ============================================================================
// Buzzword Inflation Detection
// Detects quality claims in docs/comments without supporting code evidence
// ============================================================================

/**
 * Default buzzword categories and their associated terms
 */
const BUZZWORD_CATEGORIES = {
  production: ['production-ready', 'production-grade', 'prod-ready'],
  enterprise: ['enterprise-grade', 'enterprise-ready', 'enterprise-class'],
  security: ['secure', 'secure by default', 'security-focused'],
  scale: ['scalable', 'high-performance', 'performant', 'highly scalable'],
  reliability: ['battle-tested', 'robust', 'reliable', 'rock-solid'],
  completeness: ['comprehensive', 'complete', 'full-featured', 'feature-complete']
};

/**
 * Evidence patterns per buzzword category
 * Each category maps to evidence types, each with array of regex patterns
 */
const EVIDENCE_PATTERNS = {
  production: {
    tests: [/\.test\.[jt]sx?$|\.spec\.[jt]sx?$|__tests__|test_.*\.py$|_test\.go$|_test\.rs$/],
    errorHandling: [/try\s*\{|catch\s*\(|\.catch\s*\(|except\s*:|if\s+let\s+Err|match.*Err\(/],
    logging: [/logger\.|\.log\s*\(|console\.error|tracing::|slog\.|log\.(info|warn|error|debug)/i]
  },
  enterprise: {
    auth: [/authenticat|authorization|permission|rbac|acl|role/i],
    audit: [/audit|track.*event|event.*log|activity.*log/i],
    rateLimit: [/rate.?limit|throttle|limiter/i]
  },
  security: {
    validation: [/validat|sanitiz|escape|clean|htmlspecialchars/i],
    auth: [/\bauth\b|token|jwt|session|login|passport/i],
    encryption: [/encrypt|decrypt|hash|bcrypt|argon|crypto\./i]
  },
  scale: {
    async: [/async\s+|await\s+|Promise|Future|tokio|async_std|goroutine/],
    cache: [/\bcache\b|redis|memcache|lru/i],
    pool: [/pool|connection.?pool|thread.?pool/i]
  },
  reliability: {
    tests: [/\.test\.[jt]sx?$|\.spec\.[jt]sx?$|__tests__|test_.*\.py$|_test\.go$|_test\.rs$/],
    coverage: [/coverage|lcov|nyc|istanbul|codecov/i],
    errorHandling: [/try\s*\{|catch\s*\(|\.catch\s*\(|except\s*:|if\s+let\s+Err/]
  },
  completeness: {
    edgeCases: [/edge.?case|boundary|corner.?case/i],
    errorHandling: [/\b(handle|handles|handled|handling)\s+(all\s+)?(errors?|exceptions?|failures?)\b/i],
    documentation: [/\/\*\*|\/\/\/|"""|'''/]
  }
};

/**
 * Patterns indicating a positive claim (not TODO/aspirational)
 */
const CLAIM_INDICATORS = [
  /\bis\s+/i,           // "is secure"
  /\bare\s+/i,          // "are production-ready"
  /\bprovides?\s+/i,    // "provides secure"
  /\boffers?\s+/i,      // "offers robust"
  /\bfeatures?\s+/i,    // "features comprehensive"
  /\bfully\s+/i,        // "fully production-ready"
  /\b100%\s+/i,         // "100% secure"
  /\bdesigned\s+(for|to\s+be)\s+/i  // "designed for security"
];

/**
 * Patterns indicating NOT a claim (aspirational/TODO)
 */
const NOT_CLAIM_INDICATORS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bshould\s+be\b/i,
  /\bwill\s+be\b/i,
  /\bmake\s+(?:it\s+(?:more|less|better)|this\b)/i,
  /\bneed(s)?\s+to\s+be\b/i,
  /\bplan(ning)?\s+to\b/i,
  /\bwant(s)?\s+to\b/i
];

/**
 * Escape regex special characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract buzzword claims from file content
 *
 * @param {string} content - File content
 * @param {string} filePath - Path to file (for reporting)
 * @param {Object} buzzwordCategories - Buzzword category mappings
 * @returns {Array<Object>} Array of claims with line, buzzword, category, isPositiveClaim
 */
function extractClaims(content, filePath, buzzwordCategories = BUZZWORD_CATEGORIES) {
  const claims = [];
  const lines = content.split('\n');

  // Build single regex from all buzzwords and reverse map for category lookup
  const allBuzzwords = [];
  const buzzwordToCategory = new Map();
  for (const [category, buzzwords] of Object.entries(buzzwordCategories)) {
    for (const buzzword of buzzwords) {
      allBuzzwords.push(escapeRegex(buzzword));
      buzzwordToCategory.set(buzzword.toLowerCase(), { category, buzzword });
    }
  }
  const combinedRegex = new RegExp(`\\b(${allBuzzwords.join('|')})\\b`, 'gi');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find all buzzword matches in this line
    const matches = [...line.matchAll(combinedRegex)];
    if (matches.length === 0) continue;

    // Check claim indicators once per line (only if matches found)
    const hasNotClaimIndicator = NOT_CLAIM_INDICATORS.some(p => p.test(line));
    const hasClaimIndicator = CLAIM_INDICATORS.some(p => p.test(line));
    const isPositiveClaim = hasClaimIndicator && !hasNotClaimIndicator;

    for (const match of matches) {
      const matchedText = match[1].toLowerCase();
      const mapping = buzzwordToCategory.get(matchedText);
      if (!mapping) continue;

      claims.push({
        line: i + 1,
        column: match.index,
        buzzword: mapping.buzzword,
        category: mapping.category,
        text: line.trim(),
        isPositiveClaim,
        filePath
      });
    }
  }

  return claims;
}

/**
 * Find files that may contain claims (docs, READMEs, code with comments)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options with fs/path overrides
 * @returns {Array<string>} Array of relative file paths
 */
function findClaimSourceFiles(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const files = [];
  const docPatterns = [
    /README/i,
    /\.md$/,
    /docs?\//i,
    /\.rst$/,
    /CHANGELOG/i,
    /\.[jt]sx?$/,  // JS/TS files (JSDoc comments)
    /\.py$/,       // Python (docstrings)
    /\.rs$/,       // Rust (doc comments)
    /\.go$/        // Go (doc comments)
  ];

  function walk(dir, depth = 0) {
    if (depth > 5) return; // Limit depth
    if (files.length > 500) return; // Limit file count

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      if (shouldExclude(relativePath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (docPatterns.some(p => p.test(relativePath))) {
          files.push(relativePath);
        }
      }
    }
  }

  walk(repoPath);
  return files;
}

/**
 * Check if a regex pattern is for matching file paths (vs file content)
 * File path patterns typically match file extensions or test directory structures
 *
 * @param {RegExp} regex - The pattern to check
 * @returns {boolean} True if this is a file path pattern
 */
function isFilePathPattern(regex) {
  const source = regex.source;
  // File path patterns match file extensions or test directories
  return (
    source.includes('\\.[jt]sx?$') ||  // .js, .ts, .jsx, .tsx
    source.includes('\\.py$') ||        // .py
    source.includes('\\.go$') ||        // .go
    source.includes('\\.rs$') ||        // .rs
    source.includes('__tests__') ||     // Jest test directory
    source.includes('_test\\.') ||      // Go/Rust test files
    source.includes('test_.*\\.') ||    // Python test files
    source.includes('\\.spec\\.')       // Spec files
  );
}

/**
 * Search for evidence supporting a buzzword category
 *
 * @param {string} repoPath - Repository root path
 * @param {string} category - Buzzword category to search evidence for
 * @param {Object} evidencePatterns - Evidence patterns mapping
 * @param {Array<string>} filesToSearch - Files to search
 * @param {Object} options - Options with fs/path overrides
 * @returns {Object} Evidence results: { found[], total, categories{} }
 */
function searchEvidence(repoPath, category, evidencePatterns, filesToSearch, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const evidence = {
    found: [],
    total: 0,
    categories: {}
  };

  // Get evidence patterns for this category
  const patterns = evidencePatterns[category];
  if (!patterns) return evidence;

  // Separate path patterns from content patterns for efficiency
  const pathPatterns = [];
  const contentPatterns = [];
  for (const [evidenceType, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      if (isFilePathPattern(regex)) {
        pathPatterns.push({ evidenceType, regex });
      } else {
        contentPatterns.push({ evidenceType, regex });
      }
    }
  }

  for (const file of filesToSearch) {
    // Check path patterns first (no file read needed)
    for (const { evidenceType, regex } of pathPatterns) {
      if (regex.test(file)) {
        if (!evidence.categories[evidenceType]) {
          evidence.categories[evidenceType] = [];
        }
        if (!evidence.categories[evidenceType].includes(file)) {
          evidence.categories[evidenceType].push(file);
          evidence.total++;
        }
      }
    }

    // Only read content if there are content patterns to check
    if (contentPatterns.length > 0) {
      let content;
      try {
        const fullPath = path.isAbsolute(file) ? file : path.join(repoPath, file);
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue; // Skip unreadable files
      }

      for (const { evidenceType, regex } of contentPatterns) {
        if (regex.test(content)) {
          if (!evidence.categories[evidenceType]) {
            evidence.categories[evidenceType] = [];
          }
          if (!evidence.categories[evidenceType].includes(file)) {
            evidence.categories[evidenceType].push(file);
            evidence.total++;
          }
        }
      }
    }
  }

  evidence.found = Object.keys(evidence.categories);
  return evidence;
}

/**
 * Detect gaps between claims and evidence
 *
 * @param {Array<Object>} claims - Extracted claims
 * @param {string} repoPath - Repository root path
 * @param {Object} evidencePatterns - Evidence patterns
 * @param {number} minEvidenceMatches - Minimum evidence required
 * @param {Array<string>} filesToSearch - Files to search for evidence
 * @param {Object} options - Options
 * @returns {Array<Object>} Violations
 */
function detectGaps(claims, repoPath, evidencePatterns, minEvidenceMatches, filesToSearch, options = {}) {
  const violations = [];

  // Cache evidence searches per category (avoid re-searching)
  const evidenceCache = new Map();

  for (const claim of claims) {
    // Skip non-positive claims (TODOs, aspirational)
    if (!claim.isPositiveClaim) continue;

    // Check cache first
    let evidence = evidenceCache.get(claim.category);
    if (!evidence) {
      evidence = searchEvidence(
        repoPath,
        claim.category,
        evidencePatterns,
        filesToSearch,
        options
      );
      evidenceCache.set(claim.category, evidence);
    }

    // Check if sufficient evidence exists
    if (evidence.total < minEvidenceMatches) {
      violations.push({
        type: 'buzzword_inflation',
        file: claim.filePath,
        line: claim.line,
        buzzword: claim.buzzword,
        category: claim.category,
        claim: claim.text,
        evidenceFound: evidence.found,
        evidenceCount: evidence.total,
        evidenceRequired: minEvidenceMatches,
        severity: evidence.total === 0 ? 'high' : 'medium',
        message: `Claim "${claim.buzzword}" without sufficient evidence (found ${evidence.total}/${minEvidenceMatches} required)`
      });
    }
  }

  return violations;
}

/**
 * Analyze buzzword inflation - quality claims without supporting code evidence
 *
 * Detects claims like "production-ready", "secure", "scalable" in documentation
 * and comments, then searches for supporting evidence in the codebase.
 * Flags claims that lack sufficient evidence.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {Object} [options.buzzwordCategories] - Buzzword category mappings
 * @param {Object} [options.evidencePatterns] - Evidence patterns per category
 * @param {number} [options.minEvidenceMatches=2] - Minimum evidence matches required
 * @returns {Object} Analysis results with violations
 */
function analyzeBuzzwordInflation(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const buzzwordCategories = options.buzzwordCategories || BUZZWORD_CATEGORIES;
  const evidencePatterns = options.evidencePatterns || EVIDENCE_PATTERNS;
  const minEvidenceMatches = options.minEvidenceMatches || 2;

  // Find files that may contain claims
  const claimSourceFiles = findClaimSourceFiles(repoPath, options);

  // Find all source files for evidence searching (include tests - they're evidence)
  const { files: sourceFiles } = countSourceFiles(repoPath, { ...options, includeTests: true });

  // Extract all claims from claim source files
  const allClaims = [];
  for (const file of claimSourceFiles) {
    let content;
    try {
      content = fs.readFileSync(path.join(repoPath, file), 'utf8');
    } catch {
      continue; // Skip unreadable files
    }

    const claims = extractClaims(content, file, buzzwordCategories);
    allClaims.push(...claims);
  }

  // Detect gaps (claims without evidence)
  const violations = detectGaps(
    allClaims,
    repoPath,
    evidencePatterns,
    minEvidenceMatches,
    sourceFiles,
    options
  );

  return {
    claimsFound: allClaims.length,
    positiveClaimsFound: allClaims.filter(c => c.isPositiveClaim).length,
    violations,
    verdict: violations.length > 0
      ? (violations.some(v => v.severity === 'high') ? 'HIGH' : 'MEDIUM')
      : 'OK'
  };
}

/**
 * Analyze infrastructure without implementation - setup without usage
 *
 * Detects infrastructure components (clients, connections, pools, services) that are
 * instantiated/configured but never actually used anywhere in the codebase.
 * This pattern often indicates dead code or incomplete implementations.
 *
 * @param {string} rootPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {Array} [options.infrastructureSuffixes] - Component suffixes to detect
 * @param {Array} [options.setupVerbs] - Setup verbs to detect
 * @param {Object} [options.instantiationPatterns] - Language-specific patterns
 * @returns {Object} Analysis results: { setupsFound, usagesFound, violations, verdict }
 */
function analyzeInfrastructureWithoutImplementation(rootPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const infrastructureSuffixes = options.infrastructureSuffixes || INFRASTRUCTURE_SUFFIXES;
  const setupVerbs = options.setupVerbs || SETUP_VERBS;
  const instantiationPatterns = options.instantiationPatterns || INSTANTIATION_PATTERNS;

  // Collect all source files (excluding tests by default)
  const { files: sourceFiles } = countSourceFiles(rootPath, {
    ...options,
    includeTests: false,
    maxFiles: 1000
  });

  // Track infrastructure setups and their usage
  const infrastructureSetups = new Map(); // varName -> { file, line, type, component }
  const infrastructureUsage = new Map();  // varName -> { count, files[] }

  // Phase 1: Find all infrastructure setups
  for (const file of sourceFiles) {
    if (shouldExclude(file) || isTestFile(file)) continue;

    let content;
    try {
      content = fs.readFileSync(path.join(rootPath, file), 'utf8');
    } catch {
      continue; // Skip unreadable files
    }

    const lang = detectLanguage(file);
    const patterns = instantiationPatterns[lang] || instantiationPatterns.js;

    for (const pattern of patterns) {
      // Reset regex state
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const varName = match[1];
        const componentType = match[2] || 'Infrastructure';

        // Skip if variable name is too generic (e.g., 'x', 'i', 'tmp')
        if (varName.length < 2 || /^[ijkxy]$/.test(varName)) continue;

        const lineNumber = countNewlines(content.substring(0, match.index)) + 1;

        // Store the setup location
        const key = `${file}:${varName}`;
        infrastructureSetups.set(key, {
          file,
          line: lineNumber,
          varName,
          type: componentType,
          content: content.split('\n')[lineNumber - 1].trim()
        });

        // Initialize usage tracking
        if (!infrastructureUsage.has(key)) {
          infrastructureUsage.set(key, { count: 0, files: [] });
        }
      }
    }
  }

  // Phase 2: Search for usage of each setup variable
  for (const [key, setup] of infrastructureSetups.entries()) {
    const { varName, file: setupFile } = setup;

    // Search for usage in all source files
    for (const file of sourceFiles) {
      if (shouldExclude(file) || isTestFile(file)) continue;

      let content;
      try {
        content = fs.readFileSync(path.join(rootPath, file), 'utf8');
      } catch {
        continue;
      }

      // Split into lines for line-by-line analysis
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip the setup line itself
        if (file === setupFile && i === setup.line - 1) continue;

        // Look for usage patterns (method calls, property access, passed as argument)
        // Using word boundaries to avoid false positives
        const usagePatterns = [
          new RegExp(`\\b${escapeRegex(varName)}\\s*\\.\\w+`, 'g'),  // varName.method()
          new RegExp(`\\b${escapeRegex(varName)}\\s*\\[`, 'g'),      // varName[prop]
          new RegExp(`\\(.*\\b${escapeRegex(varName)}\\b.*\\)`, 'g'), // func(varName)
          new RegExp(`\\b${escapeRegex(varName)}\\s*\\)`, 'g'),      // func(arg, varName)
          new RegExp(`return\\s+.*\\b${escapeRegex(varName)}\\b`, 'g') // return varName
        ];

        for (const pattern of usagePatterns) {
          if (pattern.test(line)) {
            const usage = infrastructureUsage.get(key);
            usage.count++;
            if (!usage.files.includes(file)) {
              usage.files.push(file);
            }
            break; // Count once per line
          }
        }
      }
    }
  }

  // Phase 3: Detect violations (setups without usage)
  const violations = [];
  for (const [key, setup] of infrastructureSetups.entries()) {
    const usage = infrastructureUsage.get(key);

    if (usage.count === 0) {
      // Check for false positives - might be exported or used in a way we didn't detect
      const setupContent = setup.content.toLowerCase();

      // Skip if it's likely exported or part of a module.exports
      if (setupContent.includes('export') || setupContent.includes('module.exports')) {
        continue;
      }

      // Skip if it's a parameter or destructured assignment
      if (setupContent.includes('function') && setupContent.includes(setup.varName)) {
        continue;
      }

      violations.push({
        file: setup.file,
        line: setup.line,
        varName: setup.varName,
        type: setup.type,
        content: setup.content,
        severity: 'low',
        message: `Infrastructure component "${setup.varName}" (${setup.type}) is created but never used`
      });
    }
  }

  return {
    setupsFound: infrastructureSetups.size,
    usagesFound: Array.from(infrastructureUsage.values()).filter(u => u.count > 0).length,
    violations,
    verdict: violations.length > 0 ? 'LOW' : 'OK'
  };
}

module.exports = {
  analyzeDocCodeRatio,
  analyzeVerbosityRatio,
  analyzeOverEngineering,
  analyzeBuzzwordInflation,
  analyzeInfrastructureWithoutImplementation,
  // Export helpers for testing
  findMatchingBrace,
  countNonEmptyLines,
  countSourceFiles,
  countSourceLines,
  countEntryPointExports,
  countExportsInContent,
  getMaxDirectoryDepth,
  detectLanguage,
  detectCommentLanguage,
  shouldExclude,
  isTestFile,
  // Buzzword inflation helpers (for testing)
  extractClaims,
  searchEvidence,
  detectGaps,
  findClaimSourceFiles,
  escapeRegex,
  isFilePathPattern,
  // Export constants for testing
  ENTRY_POINTS,
  EXPORT_PATTERNS,
  SOURCE_EXTENSIONS,
  EXCLUDE_DIRS,
  COMMENT_SYNTAX,
  // Buzzword inflation constants
  BUZZWORD_CATEGORIES,
  EVIDENCE_PATTERNS,
  CLAIM_INDICATORS,
  NOT_CLAIM_INDICATORS,
  // Infrastructure detection constants
  INFRASTRUCTURE_SUFFIXES,
  SETUP_VERBS,
  INSTANTIATION_PATTERNS
};
