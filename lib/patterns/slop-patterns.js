/**
 * Slop Detection Patterns
 * Pattern library for detecting and removing AI-generated code slop
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Deep freeze an object for V8 optimization and immutability
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
function deepFreeze(obj) {
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'object' && obj[key] !== null && !(obj[key] instanceof RegExp)) {
      deepFreeze(obj[key]);
    }
  });
  return Object.freeze(obj);
}

// Pre-compiled regex cache for performance (limited to prevent memory growth)
const MAX_PATTERN_CACHE_SIZE = 50;
const _compiledExcludePatterns = new Map();

/**
 * Maximum allowed wildcards in a glob pattern to prevent ReDoS
 */
const MAX_GLOB_WILDCARDS = 10;

/**
 * Get a compiled regex for an exclude pattern (cached)
 * Uses safe regex construction to prevent catastrophic backtracking
 * @param {string} pattern - Glob pattern to compile
 * @returns {RegExp} Compiled regex
 */
function getCompiledPattern(pattern) {
  if (!_compiledExcludePatterns.has(pattern)) {
    // Enforce cache size limit using FIFO eviction
    if (_compiledExcludePatterns.size >= MAX_PATTERN_CACHE_SIZE) {
      const firstKey = _compiledExcludePatterns.keys().next().value;
      _compiledExcludePatterns.delete(firstKey);
    }

    // Count wildcards to prevent overly complex patterns
    const wildcardCount = (pattern.match(/\*/g) || []).length;
    if (wildcardCount > MAX_GLOB_WILDCARDS) {
      // Too many wildcards - use a safe fallback that matches nothing dangerous
      _compiledExcludePatterns.set(pattern, /^$/);
      return _compiledExcludePatterns.get(pattern);
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
    _compiledExcludePatterns.set(pattern, new RegExp(regexStr));
  }
  return _compiledExcludePatterns.get(pattern);
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
  jwt_tokens: {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded JWT token'
  },

  /**
   * OpenAI API keys (sk-... format)
   */
  openai_api_key: {
    pattern: /sk-[a-zA-Z0-9]{32,}/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded OpenAI API key'
  },

  /**
   * GitHub tokens (personal access tokens, fine-grained tokens, OAuth)
   */
  github_token: {
    pattern: /(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded GitHub token'
  },

  /**
   * AWS credentials (access key IDs and secret keys)
   */
  aws_credentials: {
    pattern: /(AKIA[0-9A-Z]{16}|aws_secret_access_key\s*[:=]\s*["'`][A-Za-z0-9/+=]{40}["'`])/i,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded AWS credentials'
  },

  /**
   * Google Cloud / Firebase API keys and service accounts
   */
  google_api_key: {
    pattern: /(AIza[0-9A-Za-z_-]{35}|[0-9]+-[a-z0-9_]{32}\.apps\.googleusercontent\.com)/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded Google/Firebase API key'
  },

  /**
   * Stripe API keys (live and test)
   */
  stripe_api_key: {
    pattern: /(sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}|rk_live_[a-zA-Z0-9]{24,}|rk_test_[a-zA-Z0-9]{24,})/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded Stripe API key'
  },

  /**
   * Slack tokens (bot, user, webhook)
   */
  slack_token: {
    pattern: /(xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxp-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxa-[0-9]{10,}-[a-zA-Z0-9]{24}|https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8}\/B[A-Z0-9]{8,}\/[a-zA-Z0-9]{24})/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded Slack token or webhook URL'
  },

  /**
   * Discord tokens and webhook URLs
   */
  discord_token: {
    pattern: /(discord.*["'`][A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}["'`]|https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+)/i,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded Discord token or webhook'
  },

  /**
   * SendGrid API key
   */
  sendgrid_api_key: {
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded SendGrid API key'
  },

  /**
   * Twilio credentials
   */
  twilio_credentials: {
    pattern: /(AC[a-f0-9]{32}|SK[a-f0-9]{32})/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded Twilio credentials'
  },

  /**
   * NPM tokens
   */
  npm_token: {
    pattern: /npm_[a-zA-Z0-9]{36}/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Hardcoded NPM token'
  },

  /**
   * Private keys (RSA, DSA, EC, PGP)
   */
  private_key: {
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', '*.pem.example'],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Private key in source code'
  },

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
 * @param {Object} criteria - Filter criteria
 * @param {string} [criteria.language] - Language filter
 * @param {string} [criteria.severity] - Severity filter
 * @param {string} [criteria.autoFix] - AutoFix strategy filter
 * @returns {Object} Patterns matching all criteria
 */
function getPatternsByCriteria(criteria = {}) {
  let result = { ...slopPatterns };

  if (criteria.language) {
    const langPatterns = getPatternsForLanguage(criteria.language);
    result = Object.fromEntries(
      Object.entries(result).filter(([name]) => name in langPatterns)
    );
  }

  if (criteria.severity) {
    const severityPatterns = getPatternsBySeverity(criteria.severity);
    result = Object.fromEntries(
      Object.entries(result).filter(([name]) => name in severityPatterns)
    );
  }

  if (criteria.autoFix) {
    const autoFixPatterns = getPatternsByAutoFix(criteria.autoFix);
    result = Object.fromEntries(
      Object.entries(result).filter(([name]) => name in autoFixPatterns)
    );
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
 * Uses pre-compiled regex cache for performance
 * @param {string} filePath - File path to check
 * @param {Array<string>} excludePatterns - Exclude patterns
 * @returns {boolean} True if file should be excluded
 */
function isFileExcluded(filePath, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false;

  return excludePatterns.some(pattern => {
    const regex = getCompiledPattern(pattern);
    return regex.test(filePath);
  });
}

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
  isFileExcluded
};
