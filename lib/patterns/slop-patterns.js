/**
 * Slop Detection Patterns
 * Pattern library for detecting and removing AI-generated code slop
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Deep freeze an object for V8 optimization and immutability
 * Optimized: uses for-of instead of forEach to avoid function call overhead
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
function deepFreeze(obj) {
  // Freeze the object first (fast path)
  Object.freeze(obj);

  // Then recursively freeze nested objects (only if needed)
  // Use Object.keys() for cleaner iteration over own properties
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !(value instanceof RegExp)) {
      deepFreeze(value);
    }
  }

  return obj;
}

// Pre-compiled regex cache for performance (limited to prevent memory growth)
const MAX_PATTERN_CACHE_SIZE = 50;
const _compiledExcludePatterns = new Map();

// Exclude result cache for directory-level caching (limited to prevent memory growth)
const MAX_EXCLUDE_RESULT_CACHE_SIZE = 200;
const _excludeResultCache = new Map();

/**
 * Maximum allowed wildcards in a glob pattern to prevent ReDoS
 */
const MAX_GLOB_WILDCARDS = 10;

/**
 * Get a compiled regex for an exclude pattern (cached)
 * Uses safe regex construction to prevent catastrophic backtracking
 * Optimized: uses Map.get() instead of has() + get() (eliminates redundant lookup)
 * @param {string} pattern - Glob pattern to compile
 * @returns {RegExp} Compiled regex
 */
function getCompiledPattern(pattern) {
  // Try to get cached pattern (O(1) lookup)
  let cached = _compiledExcludePatterns.get(pattern);
  if (cached) {
    return cached;
  }

  // Enforce cache size limit using FIFO eviction
  if (_compiledExcludePatterns.size >= MAX_PATTERN_CACHE_SIZE) {
    const firstKey = _compiledExcludePatterns.keys().next().value;
    _compiledExcludePatterns.delete(firstKey);
  }

  // Count wildcards to prevent overly complex patterns
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  if (wildcardCount > MAX_GLOB_WILDCARDS) {
    // Too many wildcards - use a safe fallback that matches nothing dangerous
    const safeRegex = /^$/;
    _compiledExcludePatterns.set(pattern, safeRegex);
    return safeRegex;
  }

  // Escape all regex metacharacters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert glob patterns to regex:
  // - Both * and ** use .* for backward compatibility (patterns match anywhere in path)
  // - ReDoS protection is provided by MAX_GLOB_WILDCARDS limit above
  let regexStr = escaped
    .replace(/\*\*/g, '\0GLOBSTAR\0')  // Temporarily mark globstar
    .replace(/\*/g, '.*')              // Single star: match anything (backward compatible)
    .replace(/\0GLOBSTAR\0/g, '.*');   // Globstar: match anything

  regexStr = '^' + regexStr + '$';
  const compiledRegex = new RegExp(regexStr);
  _compiledExcludePatterns.set(pattern, compiledRegex);
  return compiledRegex;
}

/**
 * Helper to create secret detection pattern with common metadata
 * Reduces duplication across similar secret patterns (all have same severity/autoFix/language)
 * @param {RegExp} pattern - Detection regex pattern
 * @param {string} description - Human-readable description
 * @param {Array<string>} [additionalExcludes=[]] - Extra files to exclude beyond standard test files
 * @returns {Object} Complete pattern object
 */
function createSecretPattern(pattern, description, additionalExcludes = []) {
  return {
    pattern,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', ...additionalExcludes],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description
  };
}

/**
 * Auto-fix strategies:
 * - remove: Delete the matching line(s)
 * - replace: Replace with suggested fix
 * - add_logging: Add proper error logging
 * - flag: Mark for manual review
 * - none: Report only, no auto-fix
 */

const slopPatterns = {
  /**
   * Console debugging in JavaScript/TypeScript
   */
  console_debugging: {
    pattern: /console\.(log|debug|info|warn)\(/,
    exclude: ['*.test.*', '*.spec.*', '*.config.*'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'javascript',
    description: 'Console.log statements left in production code'
  },

  /**
   * Python debugging statements
   */
  python_debugging: {
    pattern: /(print\(|import pdb|breakpoint\(\)|import ipdb)/,
    exclude: ['test_*.py', '*_test.py', 'conftest.py'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'python',
    description: 'Debug print/breakpoint statements in production'
  },

  /**
   * Rust debugging macros
   */
  rust_debugging: {
    pattern: /(println!|dbg!|eprintln!)\(/,
    exclude: ['*_test.rs', '*_tests.rs'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'rust',
    description: 'Debug print macros in production code'
  },

  /**
   * Old TODO comments (>90 days)
   */
  old_todos: {
    pattern: /(TODO|FIXME|HACK|XXX):/,
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null, // All languages
    description: 'TODO/FIXME comments older than 90 days',
    requiresAgeCheck: true,
    ageThreshold: 90 // days
  },

  /**
   * Commented out code blocks
   */
  commented_code: {
    pattern: /^\s*(\/\/|#)\s*\w{5,}/,
    exclude: [],
    severity: 'medium',
    autoFix: 'remove',
    language: null,
    description: 'Large blocks of commented-out code',
    minConsecutiveLines: 5
  },

  /**
   * Placeholder text
   */
  placeholder_text: {
    pattern: /(lorem ipsum|test test test|asdf|foo bar baz|placeholder|replace this|todo: implement)/i,
    exclude: ['*.test.*', '*.spec.*', 'README.*', '*.md'],
    severity: 'high',
    autoFix: 'flag',
    language: null,
    description: 'Placeholder text that should be replaced'
  },

  // ============================================================================
  // Placeholder Function Detection (#98)
  // Detects compilable but non-functional placeholder code that linters miss
  // ============================================================================

  /**
   * JavaScript/TypeScript: Stub return values
   * Detects functions returning hardcoded 0, true, false, null, undefined, [], {}
   */
  placeholder_stub_returns_js: {
    pattern: /return\s+(?:0|true|false|null|undefined|\[\]|\{\})\s*;?\s*$/m,
    exclude: ['*.test.*', '*.spec.*', '*.config.*'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Stub return value (0, true, false, null, undefined, [], {})'
  },

  /**
   * JavaScript/TypeScript: throw Error("TODO/not implemented")
   */
  placeholder_not_implemented_js: {
    pattern: /throw\s+new\s+Error\s*\(\s*['"`].*(?:TODO|implement|not\s+impl)/i,
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'throw new Error("TODO: implement...") placeholder'
  },

  /**
   * JavaScript/TypeScript: Empty function bodies
   */
  placeholder_empty_function_js: {
    pattern: /(?:function\s+\w+\s*\([^)]*\)|=>\s*)\s*\{\s*\}/,
    exclude: ['*.test.*', '*.spec.*', '*.d.ts'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Empty function body (placeholder)'
  },

  /**
   * Rust: todo!() and unimplemented!() macros
   */
  placeholder_todo_rust: {
    pattern: /\b(?:todo|unimplemented)!\s*\(/,
    exclude: ['*_test.rs', '*_tests.rs', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'rust',
    description: 'Rust todo!() or unimplemented!() macro'
  },

  /**
   * Rust: panic!("TODO: ...") placeholder
   */
  placeholder_panic_todo_rust: {
    pattern: /\bpanic!\s*\(\s*["'].*(?:TODO|implement)/i,
    exclude: ['*_test.rs', '*_tests.rs', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'rust',
    description: 'Rust panic!("TODO: ...") placeholder'
  },

  /**
   * Python: raise NotImplementedError
   */
  placeholder_not_implemented_py: {
    pattern: /raise\s+NotImplementedError/,
    exclude: ['test_*.py', '*_test.py', 'conftest.py', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python raise NotImplementedError placeholder'
  },

  /**
   * Python: Function with only pass statement
   * Matches both single-line (def foo(): pass) and multi-line formats
   */
  placeholder_pass_only_py: {
    pattern: /def\s+\w+\s*\([^)]*\)\s*:\s*(?:pass|\n\s+pass)\s*$/m,
    exclude: ['test_*.py', '*_test.py', 'conftest.py'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python function with only pass statement'
  },

  /**
   * Python: Function with only ellipsis (...)
   * Matches both single-line (def foo(): ...) and multi-line formats
   * Note: .pyi stub files legitimately use ellipsis, so excluded
   */
  placeholder_ellipsis_py: {
    pattern: /def\s+\w+\s*\([^)]*\)\s*:\s*(?:\.\.\.|\n\s+\.\.\.)\s*$/m,
    exclude: ['*.pyi', 'test_*.py', '*_test.py'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python function with only ellipsis (...)'
  },

  /**
   * Go: panic("TODO: ...") placeholder
   */
  placeholder_panic_go: {
    pattern: /panic\s*\(\s*["'].*(?:TODO|implement|not\s+impl)/i,
    exclude: ['*_test.go', '**/testdata/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'go',
    description: 'Go panic("TODO: ...") placeholder'
  },

  /**
   * Java: throw new UnsupportedOperationException()
   */
  placeholder_unsupported_java: {
    pattern: /throw\s+new\s+UnsupportedOperationException\s*\(/,
    exclude: ['*Test.java', '**/test/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'java',
    description: 'Java throw new UnsupportedOperationException() placeholder'
  },

  /**
   * Empty catch blocks (JavaScript/TypeScript)
   */
  empty_catch_js: {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    exclude: [],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'javascript',
    description: 'Empty catch blocks without error handling'
  },

  /**
   * Empty except blocks (Python)
   */
  empty_except_py: {
    pattern: /except\s*[^:]*:\s*pass\s*$/,
    exclude: [],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'python',
    description: 'Empty except blocks with just pass'
  },

  /**
   * Magic numbers (large hardcoded numbers)
   */
  magic_numbers: {
    pattern: /(?<![a-zA-Z_\d])[0-9]{4,}(?![a-zA-Z_\d])/,
    exclude: ['*.test.*', '*.spec.*', '*.config.*', 'package.json', 'package-lock.json'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Magic numbers that should be constants'
  },

  /**
   * Disabled linter rules
   */
  disabled_linter: {
    pattern: /(eslint-disable|pylint: disable|#\s*noqa|@SuppressWarnings|#\[allow\()/,
    exclude: [],
    severity: 'medium',
    autoFix: 'flag',
    language: null,
    description: 'Disabled linter rules that may hide issues'
  },

  /**
   * Unused imports (basic pattern, language-specific tools better)
   */
  unused_imports_hint: {
    pattern: /^import .* from .* \/\/ unused$/,
    exclude: [],
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Imports marked as unused'
  },

  /**
   * Duplicate string literals (same string >5 times)
   */
  duplicate_strings: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Duplicate string literals that should be constants',
    requiresMultiPass: true
  },

  /**
   * Inconsistent indentation markers
   */
  mixed_indentation: {
    pattern: /^\t+ +|^ +\t+/,
    exclude: ['Makefile', '*.mk'],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'Mixed tabs and spaces'
  },

  /**
   * Trailing whitespace
   */
  trailing_whitespace: {
    pattern: /\s+$/,
    exclude: ['*.md'], // Markdown uses trailing spaces for line breaks
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Trailing whitespace at end of lines'
  },

  /**
   * Multiple consecutive blank lines
   */
  multiple_blank_lines: {
    pattern: /^\s*\n\s*\n\s*\n/,
    exclude: [],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'More than 2 consecutive blank lines'
  },

  /**
   * Hardcoded credentials patterns (expanded for comprehensive detection)
   * Excludes common false positives:
   * - Template placeholders: ${VAR}, {{VAR}}, <VAR>
   * - Masked/example values: xxxxxxxx, ********
   */
  hardcoded_secrets: {
    pattern: /(password|secret|api[_-]?key|token|credential|auth)[_-]?(key|token|secret|pass)?\s*[:=]\s*["'`](?!\$\{)(?!\{\{)(?!<[A-Z_])(?![x*#]{8,})(?![X*#]{8,})[^"'`\s]{8,}["'`]/i,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', '*.sample.*', 'README.*', '*.md'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Potential hardcoded credentials'
  },

  /**
   * JWT tokens (eyJ prefix indicates base64 JSON header)
   */
  jwt_tokens: createSecretPattern(
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    'Hardcoded JWT token'
  ),

  /**
   * OpenAI API keys (sk-... format)
   */
  openai_api_key: createSecretPattern(
    /sk-[a-zA-Z0-9]{32,}/,
    'Hardcoded OpenAI API key'
  ),

  /**
   * GitHub tokens (personal access tokens, fine-grained tokens, OAuth)
   */
  github_token: createSecretPattern(
    /(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/,
    'Hardcoded GitHub token'
  ),

  /**
   * AWS credentials (access key IDs and secret keys)
   */
  aws_credentials: createSecretPattern(
    /(AKIA[0-9A-Z]{16}|aws_secret_access_key\s*[:=]\s*["'`][A-Za-z0-9/+=]{40}["'`])/i,
    'Hardcoded AWS credentials'
  ),

  /**
   * Google Cloud / Firebase API keys and service accounts
   */
  google_api_key: createSecretPattern(
    /(AIza[0-9A-Za-z_-]{35}|[0-9]+-[a-z0-9_]{32}\.apps\.googleusercontent\.com)/,
    'Hardcoded Google/Firebase API key'
  ),

  /**
   * Stripe API keys (live and test)
   */
  stripe_api_key: createSecretPattern(
    /(sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}|rk_live_[a-zA-Z0-9]{24,}|rk_test_[a-zA-Z0-9]{24,})/,
    'Hardcoded Stripe API key'
  ),

  /**
   * Slack tokens (bot, user, webhook)
   */
  slack_token: createSecretPattern(
    /(xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxp-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxa-[0-9]{10,}-[a-zA-Z0-9]{24}|https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8}\/B[A-Z0-9]{8,}\/[a-zA-Z0-9]{24})/,
    'Hardcoded Slack token or webhook URL'
  ),

  /**
   * Discord tokens and webhook URLs
   */
  discord_token: createSecretPattern(
    /(discord.*["'`][A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}["'`]|https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+)/i,
    'Hardcoded Discord token or webhook'
  ),

  /**
   * SendGrid API key
   */
  sendgrid_api_key: createSecretPattern(
    /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    'Hardcoded SendGrid API key'
  ),

  /**
   * Twilio credentials
   */
  twilio_credentials: createSecretPattern(
    /(AC[a-f0-9]{32}|SK[a-f0-9]{32})/,
    'Hardcoded Twilio credentials'
  ),

  /**
   * NPM tokens
   */
  npm_token: createSecretPattern(
    /npm_[a-zA-Z0-9]{36}/,
    'Hardcoded NPM token'
  ),

  /**
   * Private keys (RSA, DSA, EC, PGP)
   */
  private_key: createSecretPattern(
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    'Private key in source code',
    ['*.pem.example'] // Additional excludes beyond standard test files
  ),

  /**
   * Generic high-entropy strings (potential secrets)
   */
  high_entropy_string: {
    pattern: /["'`][A-Za-z0-9+/=_-]{40,}["'`]/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    severity: 'medium',
    autoFix: 'flag',
    language: null,
    description: 'High-entropy string that may be a secret',
    requiresEntropyCheck: true,
    entropyThreshold: 4.5
  },

  /**
   * Process.exit in libraries
   */
  process_exit: {
    pattern: /process\.exit\(/,
    exclude: ['*.test.*', 'cli.js', 'index.js', 'bin/*'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'process.exit() should not be in library code'
  },

  /**
   * Bare URLs in code (should use constants)
   */
  bare_urls: {
    pattern: /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    exclude: ['*.test.*', '*.md', 'package.json', 'README.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded URLs that should be configuration'
  },

  // ============================================================================
  // Doc/Code Ratio Detection (#P1-T2)
  // Detects JSDoc blocks that are disproportionately longer than function bodies
  // ============================================================================

  /**
   * JSDoc-to-function ratio (excessive documentation)
   * Flags when JSDoc is >3x the length of the function body
   * Requires multi-pass analysis since simple regex can't compute ratios
   */
  doc_code_ratio_js: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*', '*.d.ts'],
    severity: 'medium',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Documentation longer than code (JSDoc > 3x function body)',
    requiresMultiPass: true,
    minFunctionLines: 3,  // Skip tiny functions
    maxRatio: 3.0          // Doc can be 3x function length max
  },

  // ============================================================================
  // Phantom Reference Detection (#P1-T3)
  // Detects issue/PR mentions and file path references in code comments
  // ============================================================================

  /**
   * Issue/PR/iteration references in code comments
   * ANY mention of issue/PR numbers is treated as slop - context belongs in commits
   */
  issue_pr_references: {
    pattern: /\/\/.*(?:#\d+|issue\s+#?\d+|PR\s+#?\d+|pull\s+request\s+#?\d+|fixed\s+in\s+#?\d+|closes?\s+#?\d+|resolves?\s+#?\d+|iteration\s+\d+)/i,
    exclude: ['*.md', 'README.*', 'CHANGELOG.*', 'CONTRIBUTING.*'],
    severity: 'medium',
    autoFix: 'remove',
    language: null,  // Universal - all languages
    description: 'Issue/PR/iteration references in comments (slop - remove context from code)'
  },

  /**
   * File path references in code comments
   * References like "see auth-flow.md" may become outdated
   */
  file_path_references: {
    pattern: /\/\/.*(?:see|refer\s+to|in|per|documented\s+in)\s+([a-zA-Z0-9_\-./]+\.(?:md|js|ts|json|yaml|yml|toml|txt))/i,
    exclude: ['*.md', 'README.*', '*.test.*', '*.spec.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'File path references in comments that may be outdated'
  },

  // ============================================================================
  // Generic Naming Detection
  // ============================================================================

  /** JavaScript/TypeScript: Generic variable names */
  generic_naming_js: {
    pattern: /\b(?:const|let|var)\s+(data|result|item|temp|value|output|response|obj|ret|res|val|arr|str|num|buf|ctx|cfg|opts|args|params)\s*[=:]/i,
    exclude: ['*.test.*', '*.spec.*', '**/test/**', '**/tests/**'],
    severity: 'low',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Generic variable name that could be more descriptive (e.g., "data" -> "userData")'
  },

  /** Python: Generic variable names */
  generic_naming_py: {
    pattern: /^(\s*)(?!.*\bfor\s+\w+\s+in\b)(data|result|item|temp|value|output|response|obj|ret|res|val|arr|ctx|cfg|opts|args|params)\s*[:=]/im,
    exclude: ['*test*.py', '**/test_*.py', '**/tests/**', 'conftest.py'],
    severity: 'low',
    autoFix: 'flag',
    language: 'python',
    description: 'Generic variable name that could be more descriptive'
  },

  /** Rust: Generic variable names */
  generic_naming_rust: {
    pattern: /\blet\s+(?:mut\s+)?(data|result|item|temp|value|output|response|obj|ret|res|val|buf|ctx|cfg|opts|args)\s*[=:]/i,
    exclude: ['*_test.rs', '*_tests.rs', '**/tests/**'],
    severity: 'low',
    autoFix: 'flag',
    language: 'rust',
    description: 'Generic variable name that could be more descriptive'
  },

  /** Go: Generic variable names */
  generic_naming_go: {
    pattern: /\b(data|result|item|temp|value|output|response|obj|ret|res|val|buf|ctx|cfg|opts|args)\s*:=/i,
    exclude: ['*_test.go', '**/tests/**', '**/testdata/**'],
    severity: 'low',
    autoFix: 'flag',
    language: 'go',
    description: 'Generic variable name that could be more descriptive'
  },

  // ============================================================================
  // Over-Engineering Detection
  // Detects excessive complexity relative to public API surface
  // ============================================================================

  /**
   * Over-engineering metrics (project-level analysis)
   * Detects: file proliferation, code density, directory depth
   * Requires multi-pass analysis - cannot be done with simple regex
   */
  over_engineering_metrics: {
    pattern: null, // Requires multi-pass analysis
    exclude: [],  // Analyzes entire project
    severity: 'high',
    autoFix: 'flag',  // Cannot auto-fix architectural issues
    language: null,   // Universal - all languages
    description: 'Excessive files/lines relative to public API (over-engineering indicator)',
    requiresMultiPass: true,
    // Thresholds for violation detection
    fileRatioThreshold: 20,       // Max 20 files per export
    linesPerExportThreshold: 500, // Max 500 lines per export
    depthThreshold: 4             // Max 4 directory levels
  }
};

// Freeze the patterns object for V8 optimization
deepFreeze(slopPatterns);

// ============================================================================
// Pre-indexed Maps for O(1) lookup performance (#18)
// Built once at module load time, avoiding iteration on every lookup
// ============================================================================

/**
 * Pre-indexed patterns by language
 * Key: language name (or 'universal' for language-agnostic patterns)
 * Value: Object of pattern name -> pattern definition
 */
const _patternsByLanguage = new Map();

/**
 * Pre-indexed patterns by severity
 * Key: severity level ('critical', 'high', 'medium', 'low')
 * Value: Object of pattern name -> pattern definition
 */
const _patternsBySeverity = new Map();

/**
 * Pre-indexed patterns by autoFix strategy
 * Key: autoFix type ('remove', 'replace', 'add_logging', 'flag', 'none')
 * Value: Object of pattern name -> pattern definition
 */
const _patternsByAutoFix = new Map();

/**
 * Set of all available languages for O(1) existence check
 */
const _availableLanguages = new Set();

/**
 * Set of all available severity levels for O(1) existence check
 */
const _availableSeverities = new Set();

// Build indexes at module load time
(function buildIndexes() {
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    // Index by language
    const lang = pattern.language || 'universal';
    if (!_patternsByLanguage.has(lang)) {
      _patternsByLanguage.set(lang, {});
    }
    _patternsByLanguage.get(lang)[name] = pattern;
    _availableLanguages.add(lang);

    // Index by severity
    const severity = pattern.severity;
    if (!_patternsBySeverity.has(severity)) {
      _patternsBySeverity.set(severity, {});
    }
    _patternsBySeverity.get(severity)[name] = pattern;
    _availableSeverities.add(severity);

    // Index by autoFix strategy
    const autoFix = pattern.autoFix || 'none';
    if (!_patternsByAutoFix.has(autoFix)) {
      _patternsByAutoFix.set(autoFix, {});
    }
    _patternsByAutoFix.get(autoFix)[name] = pattern;
  }
})();

// Freeze the index Sets
Object.freeze(_availableLanguages);
Object.freeze(_availableSeverities);

/**
 * Get patterns for a specific language (O(1) lookup via pre-indexed Map)
 * Includes universal patterns that apply to all languages
 * @param {string} language - Language identifier ('javascript', 'python', 'rust', etc.)
 * @returns {Object} Filtered patterns (language-specific + universal)
 */
function getPatternsForLanguage(language) {
  const langPatterns = _patternsByLanguage.get(language) || {};
  const universalPatterns = _patternsByLanguage.get('universal') || {};

  // Merge language-specific with universal patterns
  return { ...universalPatterns, ...langPatterns };
}

/**
 * Get patterns for a specific language only (excludes universal patterns)
 * @param {string} language - Language identifier
 * @returns {Object} Language-specific patterns only
 */
function getPatternsForLanguageOnly(language) {
  return _patternsByLanguage.get(language) || {};
}

/**
 * Get universal patterns (apply to all languages)
 * @returns {Object} Universal patterns
 */
function getUniversalPatterns() {
  return _patternsByLanguage.get('universal') || {};
}

/**
 * Get patterns by severity (O(1) lookup via pre-indexed Map)
 * @param {string} severity - Severity level ('critical', 'high', 'medium', 'low')
 * @returns {Object} Filtered patterns
 */
function getPatternsBySeverity(severity) {
  return _patternsBySeverity.get(severity) || {};
}

/**
 * Get patterns by autoFix strategy (O(1) lookup via pre-indexed Map)
 * @param {string} autoFix - AutoFix strategy ('remove', 'replace', 'add_logging', 'flag', 'none')
 * @returns {Object} Filtered patterns
 */
function getPatternsByAutoFix(autoFix) {
  return _patternsByAutoFix.get(autoFix) || {};
}

/**
 * Get patterns matching multiple criteria (language AND severity)
 * Optimized: single-pass filtering instead of chained Object.entries
 * @param {Object} criteria - Filter criteria
 * @param {string} [criteria.language] - Language filter
 * @param {string} [criteria.severity] - Severity filter
 * @param {string} [criteria.autoFix] - AutoFix strategy filter
 * @returns {Object} Patterns matching all criteria
 */
function getPatternsByCriteria(criteria = {}) {
  // Fast path: no criteria means return all patterns
  if (!criteria.language && !criteria.severity && !criteria.autoFix) {
    return { ...slopPatterns };
  }

  // Pre-fetch filter sets (O(1) Map lookups)
  const langPatterns = criteria.language ? getPatternsForLanguage(criteria.language) : null;
  const severityPatterns = criteria.severity ? getPatternsBySeverity(criteria.severity) : null;
  const autoFixPatterns = criteria.autoFix ? getPatternsByAutoFix(criteria.autoFix) : null;

  // Single-pass filter: check all criteria at once
  const result = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    // Check all criteria in one pass (short-circuit on first failure)
    if (langPatterns && !(name in langPatterns)) continue;
    if (severityPatterns && !(name in severityPatterns)) continue;
    if (autoFixPatterns && !(name in autoFixPatterns)) continue;

    result[name] = pattern;
  }

  return result;
}

/**
 * Get all available languages
 * @returns {Array<string>} List of language identifiers
 */
function getAvailableLanguages() {
  return Array.from(_availableLanguages);
}

/**
 * Get all available severity levels
 * @returns {Array<string>} List of severity levels
 */
function getAvailableSeverities() {
  return Array.from(_availableSeverities);
}

/**
 * Check if patterns exist for a language
 * @param {string} language - Language identifier
 * @returns {boolean} True if patterns exist
 */
function hasLanguage(language) {
  return _patternsByLanguage.has(language);
}

/**
 * Check if a file should be excluded based on pattern rules
 * Uses pre-compiled regex cache and result cache for performance
 * @param {string} filePath - File path to check
 * @param {Array<string>} excludePatterns - Exclude patterns
 * @returns {boolean} True if file should be excluded
 */
function isFileExcluded(filePath, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false;

  // Create cache key using JSON.stringify for collision-resistant format
  const cacheKey = JSON.stringify([filePath, excludePatterns]);

  // Check cache first (O(1) lookup)
  const cached = _excludeResultCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Compute result
  const result = excludePatterns.some(pattern => {
    const regex = getCompiledPattern(pattern);
    return regex.test(filePath);
  });

  // Store in cache with FIFO eviction
  if (_excludeResultCache.size >= MAX_EXCLUDE_RESULT_CACHE_SIZE) {
    const firstKey = _excludeResultCache.keys().next().value;
    _excludeResultCache.delete(firstKey);
  }
  _excludeResultCache.set(cacheKey, result);

  return result;
}

/**
 * Get patterns that require multi-pass analysis
 * These patterns have `requiresMultiPass: true` and need structural code analysis
 * @returns {Object} Patterns requiring multi-pass analysis
 */
function getMultiPassPatterns() {
  const result = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    if (pattern.requiresMultiPass) {
      result[name] = pattern;
    }
  }
  return result;
}

// Import analyzers for multi-pass patterns
const analyzers = require('./slop-analyzers');

module.exports = {
  slopPatterns,
  // Pre-indexed lookup functions (O(1) performance)
  getPatternsForLanguage,
  getPatternsForLanguageOnly,
  getUniversalPatterns,
  getPatternsBySeverity,
  getPatternsByAutoFix,
  getPatternsByCriteria,
  // Metadata functions
  getAvailableLanguages,
  getAvailableSeverities,
  hasLanguage,
  // File exclusion
  isFileExcluded,
  // Multi-pass analysis
  getMultiPassPatterns,
  analyzers
};
