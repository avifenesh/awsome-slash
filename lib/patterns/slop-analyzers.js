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
 * Count source files in directory (recursive, excludes tests/vendor)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {Function} options.readdir - Directory reader (for testing)
 * @param {Function} options.stat - Stat function (for testing)
 * @param {number} options.maxFiles - Maximum files to count (default 10000)
 * @returns {Object} { count, files[] }
 */
function countSourceFiles(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');
  const maxFiles = options.maxFiles || 10000;

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

        if (allExts.includes(ext) && !isTestFile(relativePath)) {
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

module.exports = {
  analyzeDocCodeRatio,
  analyzeOverEngineering,
  // Export helpers for testing
  findMatchingBrace,
  countNonEmptyLines,
  countSourceFiles,
  countSourceLines,
  countEntryPointExports,
  countExportsInContent,
  getMaxDirectoryDepth,
  detectLanguage,
  shouldExclude,
  isTestFile,
  // Export constants for testing
  ENTRY_POINTS,
  EXPORT_PATTERNS,
  SOURCE_EXTENSIONS,
  EXCLUDE_DIRS
};
