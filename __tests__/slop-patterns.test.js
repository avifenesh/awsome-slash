/**
 * Tests for slop-patterns.js
 */

const {
  slopPatterns,
  getPatternsForLanguage,
  getPatternsForLanguageOnly,
  getUniversalPatterns,
  getPatternsBySeverity,
  getPatternsByAutoFix,
  getPatternsByCriteria,
  getAvailableLanguages,
  getAvailableSeverities,
  hasLanguage,
  isFileExcluded
} = require('../lib/patterns/slop-patterns');

describe('slop-patterns', () => {
  describe('slopPatterns', () => {
    it('should be a frozen object', () => {
      expect(Object.isFrozen(slopPatterns)).toBe(true);
    });

    it('should have pattern definitions with required fields', () => {
      Object.entries(slopPatterns).forEach(([name, pattern]) => {
        expect(pattern).toHaveProperty('severity');
        expect(pattern).toHaveProperty('autoFix');
        expect(pattern).toHaveProperty('description');
        expect(['critical', 'high', 'medium', 'low']).toContain(pattern.severity);
      });
    });

    it('should have valid regex patterns', () => {
      Object.entries(slopPatterns).forEach(([name, pattern]) => {
        if (pattern.pattern !== null) {
          expect(pattern.pattern).toBeInstanceOf(RegExp);
        }
      });
    });
  });

  describe('getPatternsForLanguage', () => {
    it('should return javascript patterns plus universal patterns', () => {
      const patterns = getPatternsForLanguage('javascript');
      expect(patterns).toHaveProperty('console_debugging');
      expect(patterns).toHaveProperty('empty_catch_js');
      // Should also include universal patterns
      expect(patterns).toHaveProperty('placeholder_text');
    });

    it('should return python patterns plus universal patterns', () => {
      const patterns = getPatternsForLanguage('python');
      expect(patterns).toHaveProperty('python_debugging');
      expect(patterns).toHaveProperty('empty_except_py');
    });

    it('should return rust patterns plus universal patterns', () => {
      const patterns = getPatternsForLanguage('rust');
      expect(patterns).toHaveProperty('rust_debugging');
    });

    it('should return only universal patterns for unknown language', () => {
      const patterns = getPatternsForLanguage('cobol');
      const universalPatterns = getUniversalPatterns();
      expect(Object.keys(patterns)).toEqual(Object.keys(universalPatterns));
    });
  });

  describe('getPatternsForLanguageOnly', () => {
    it('should return only javascript-specific patterns', () => {
      const patterns = getPatternsForLanguageOnly('javascript');
      expect(patterns).toHaveProperty('console_debugging');
      expect(patterns).not.toHaveProperty('placeholder_text'); // universal
    });
  });

  describe('getUniversalPatterns', () => {
    it('should return patterns with language: null', () => {
      const patterns = getUniversalPatterns();
      expect(patterns).toHaveProperty('placeholder_text');
      expect(patterns).toHaveProperty('old_todos');
      expect(patterns).toHaveProperty('trailing_whitespace');
    });
  });

  describe('getPatternsBySeverity', () => {
    it('should return critical severity patterns', () => {
      const patterns = getPatternsBySeverity('critical');
      expect(Object.keys(patterns).length).toBeGreaterThan(0);
      Object.values(patterns).forEach(pattern => {
        expect(pattern.severity).toBe('critical');
      });
    });

    it('should return high severity patterns', () => {
      const patterns = getPatternsBySeverity('high');
      expect(patterns).toHaveProperty('placeholder_text');
      expect(patterns).toHaveProperty('empty_catch_js');
    });

    it('should return empty object for invalid severity', () => {
      const patterns = getPatternsBySeverity('invalid');
      expect(Object.keys(patterns).length).toBe(0);
    });
  });

  describe('getPatternsByAutoFix', () => {
    it('should return patterns with remove autoFix', () => {
      const patterns = getPatternsByAutoFix('remove');
      expect(Object.keys(patterns).length).toBeGreaterThan(0);
      Object.values(patterns).forEach(pattern => {
        expect(pattern.autoFix).toBe('remove');
      });
    });

    it('should return patterns with flag autoFix', () => {
      const patterns = getPatternsByAutoFix('flag');
      expect(Object.keys(patterns).length).toBeGreaterThan(0);
    });
  });

  describe('getPatternsByCriteria', () => {
    it('should filter by language and severity', () => {
      const patterns = getPatternsByCriteria({
        language: 'javascript',
        severity: 'high'
      });

      Object.values(patterns).forEach(pattern => {
        expect(pattern.severity).toBe('high');
        expect([null, 'javascript']).toContain(pattern.language);
      });
    });

    it('should return all patterns when no criteria specified', () => {
      const patterns = getPatternsByCriteria({});
      expect(Object.keys(patterns).length).toBe(Object.keys(slopPatterns).length);
    });

    describe('negative cases', () => {
      it('should return only universal patterns for non-existent language', () => {
        // Non-existent languages still get universal patterns (language-agnostic)
        const patterns = getPatternsByCriteria({ language: 'cobol' });
        const universalPatterns = getUniversalPatterns();
        expect(Object.keys(patterns).length).toBe(Object.keys(universalPatterns).length);
        // Verify no language-specific patterns are included
        Object.values(patterns).forEach(p => {
          expect(p.language).toBeNull();
        });
      });

      it('should return empty object for non-existent severity', () => {
        const patterns = getPatternsByCriteria({ severity: 'extreme' });
        expect(Object.keys(patterns).length).toBe(0);
      });

      it('should return empty object when no patterns match combined criteria', () => {
        // Request a very specific combination that likely doesn't exist
        const patterns = getPatternsByCriteria({
          language: 'rust',
          severity: 'low',
          autoFix: 'refactor'  // assuming this autoFix type doesn't exist
        });
        expect(Object.keys(patterns).length).toBe(0);
      });

      it('should handle undefined criteria values', () => {
        const patterns = getPatternsByCriteria({
          language: undefined,
          severity: undefined
        });
        // Should return all patterns since criteria are undefined
        expect(Object.keys(patterns).length).toBe(Object.keys(slopPatterns).length);
      });

      it('should handle null criteria values', () => {
        const patterns = getPatternsByCriteria({
          language: null,
          severity: null
        });
        // Should filter for patterns with language: null (universal)
        expect(Object.keys(patterns).length).toBeGreaterThan(0);
      });

      it('should return empty for conflicting criteria', () => {
        // Request javascript patterns but also filter by rust-specific autoFix
        const jsPatterns = getPatternsByCriteria({ language: 'javascript' });
        const rustPatterns = getPatternsByCriteria({ language: 'rust' });

        // These should be different sets
        const jsKeys = new Set(Object.keys(jsPatterns));
        const rustKeys = new Set(Object.keys(rustPatterns));

        // Find patterns unique to each language (excluding universal)
        const jsOnly = [...jsKeys].filter(k => {
          const p = jsPatterns[k];
          return p.language === 'javascript';
        });

        const rustOnly = [...rustKeys].filter(k => {
          const p = rustPatterns[k];
          return p.language === 'rust';
        });

        // These should not overlap
        jsOnly.forEach(k => expect(rustOnly).not.toContain(k));
      });
    });
  });

  describe('getAvailableLanguages', () => {
    it('should return array of languages', () => {
      const languages = getAvailableLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
      expect(languages).toContain('rust');
      expect(languages).toContain('universal');
    });
  });

  describe('getAvailableSeverities', () => {
    it('should return array of severity levels', () => {
      const severities = getAvailableSeverities();
      expect(Array.isArray(severities)).toBe(true);
      expect(severities).toContain('critical');
      expect(severities).toContain('high');
      expect(severities).toContain('medium');
      expect(severities).toContain('low');
    });
  });

  describe('hasLanguage', () => {
    it('should return true for existing languages', () => {
      expect(hasLanguage('javascript')).toBe(true);
      expect(hasLanguage('python')).toBe(true);
      expect(hasLanguage('universal')).toBe(true);
    });

    it('should return false for non-existing languages', () => {
      expect(hasLanguage('cobol')).toBe(false);
      expect(hasLanguage('fortran')).toBe(false);
    });
  });

  describe('Pattern Index Verification', () => {
    it('should index all patterns by language', () => {
      const allLanguages = getAvailableLanguages();
      let totalIndexed = 0;

      allLanguages.forEach(lang => {
        const langPatterns = lang === 'universal'
          ? getUniversalPatterns()
          : getPatternsForLanguageOnly(lang);
        totalIndexed += Object.keys(langPatterns).length;
      });

      // Total indexed should equal total patterns
      expect(totalIndexed).toBe(Object.keys(slopPatterns).length);
    });

    it('should index all patterns by severity', () => {
      const allSeverities = getAvailableSeverities();
      let totalIndexed = 0;

      allSeverities.forEach(sev => {
        const sevPatterns = getPatternsBySeverity(sev);
        totalIndexed += Object.keys(sevPatterns).length;
      });

      // Total indexed should equal total patterns
      expect(totalIndexed).toBe(Object.keys(slopPatterns).length);
    });

    it('should maintain consistency between original and indexed patterns', () => {
      // Verify each pattern can be found in the correct language index
      Object.entries(slopPatterns).forEach(([name, pattern]) => {
        const lang = pattern.language || 'universal';
        const langPatterns = lang === 'universal'
          ? getUniversalPatterns()
          : getPatternsForLanguageOnly(lang);

        expect(langPatterns).toHaveProperty(name);
        expect(langPatterns[name]).toBe(pattern);
      });
    });

    it('should maintain consistency between original and severity index', () => {
      Object.entries(slopPatterns).forEach(([name, pattern]) => {
        const sevPatterns = getPatternsBySeverity(pattern.severity);
        expect(sevPatterns).toHaveProperty(name);
        expect(sevPatterns[name]).toBe(pattern);
      });
    });

    it('should maintain consistency between original and autoFix index', () => {
      Object.entries(slopPatterns).forEach(([name, pattern]) => {
        const autoFix = pattern.autoFix || 'none';
        const autoFixPatterns = getPatternsByAutoFix(autoFix);
        expect(autoFixPatterns).toHaveProperty(name);
        expect(autoFixPatterns[name]).toBe(pattern);
      });
    });

    it('should have no orphaned patterns in indexes', () => {
      // Every pattern in the language index should exist in original
      const allLanguages = getAvailableLanguages();
      allLanguages.forEach(lang => {
        const langPatterns = lang === 'universal'
          ? getUniversalPatterns()
          : getPatternsForLanguageOnly(lang);

        Object.keys(langPatterns).forEach(name => {
          expect(slopPatterns).toHaveProperty(name);
        });
      });
    });

    it('should preserve pattern references (not copies)', () => {
      // Verify indexes reference the same objects, not copies
      const jsPatterns = getPatternsForLanguage('javascript');
      const consoleDebug = jsPatterns.console_debugging;

      expect(consoleDebug).toBe(slopPatterns.console_debugging);

      // Also verify via severity index
      const mediumPatterns = getPatternsBySeverity('medium');
      expect(mediumPatterns.console_debugging).toBe(slopPatterns.console_debugging);
    });
  });

  describe('isFileExcluded', () => {
    it('should exclude test files when pattern matches', () => {
      expect(isFileExcluded('app.test.js', ['*.test.*'])).toBe(true);
      expect(isFileExcluded('app.spec.ts', ['*.spec.*'])).toBe(true);
    });

    it('should not exclude non-matching files', () => {
      expect(isFileExcluded('app.js', ['*.test.*'])).toBe(false);
      expect(isFileExcluded('index.ts', ['*.spec.*'])).toBe(false);
    });

    it('should handle multiple patterns', () => {
      const excludes = ['*.test.*', '*.spec.*', 'README.*'];
      expect(isFileExcluded('app.test.js', excludes)).toBe(true);
      expect(isFileExcluded('README.md', excludes)).toBe(true);
      expect(isFileExcluded('app.js', excludes)).toBe(false);
    });

    it('should return false for empty exclude patterns', () => {
      expect(isFileExcluded('any-file.js', [])).toBe(false);
      expect(isFileExcluded('any-file.js', null)).toBe(false);
    });
  });

  describe('Secret Detection Patterns', () => {
    it('should detect hardcoded secrets', () => {
      const pattern = slopPatterns.hardcoded_secrets.pattern;
      expect(pattern.test('password = "mysecretpass123"')).toBe(true);
      expect(pattern.test('api_key: "abcdefghij123456"')).toBe(true);
      expect(pattern.test('token = `verysecrettoken`')).toBe(true);
    });

    it('should detect JWT tokens', () => {
      const pattern = slopPatterns.jwt_tokens.pattern;
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(pattern.test(jwt)).toBe(true);
    });

    it('should detect OpenAI API keys', () => {
      const pattern = slopPatterns.openai_api_key.pattern;
      expect(pattern.test('sk-abcdefghijklmnopqrstuvwxyz123456789012')).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      const pattern = slopPatterns.github_token.pattern;
      expect(pattern.test('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    });

    it('should detect AWS credentials', () => {
      const pattern = slopPatterns.aws_credentials.pattern;
      expect(pattern.test('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    });

    it('should detect private keys', () => {
      const pattern = slopPatterns.private_key.pattern;
      expect(pattern.test('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
      expect(pattern.test('-----BEGIN PRIVATE KEY-----')).toBe(true);
    });
  });

  describe('Secret Detection False Positives', () => {
    describe('hardcoded_secrets pattern', () => {
      const pattern = slopPatterns.hardcoded_secrets.pattern;

      it('should NOT match empty password values', () => {
        expect(pattern.test('password = ""')).toBe(false);
        expect(pattern.test("password = ''")).toBe(false);
        expect(pattern.test('password = ``')).toBe(false);
      });

      it('should NOT match short values (less than 8 chars)', () => {
        expect(pattern.test('password = "short"')).toBe(false);
        expect(pattern.test('api_key = "abc123"')).toBe(false);
        expect(pattern.test('token = "1234567"')).toBe(false);
      });

      it('should NOT match environment variable references', () => {
        // These patterns use env vars, not hardcoded secrets
        expect(pattern.test('password = process.env.PASSWORD')).toBe(false);
        expect(pattern.test('apiKey = os.environ.get("API_KEY")')).toBe(false);
        expect(pattern.test('token = ENV["TOKEN"]')).toBe(false);
      });

      it('should NOT match placeholder templates', () => {
        // Template placeholders are clearly not real secrets
        expect(pattern.test('api_key: "${API_KEY}"')).toBe(false);
        expect(pattern.test('password = "{{PASSWORD}}"')).toBe(false);
        expect(pattern.test('token = "<YOUR_TOKEN_HERE>"')).toBe(false);
      });

      it('should NOT match masked/example values', () => {
        // Masked values like xxxxxxxx or ******** are not real secrets
        expect(pattern.test('password = "xxxxxxxx"')).toBe(false);
        expect(pattern.test('password = "********"')).toBe(false);
        expect(pattern.test('api_key = "########"')).toBe(false);
        expect(pattern.test('secret = "XXXXXXXX"')).toBe(false);
      });

      it('should NOT match type annotations or declarations', () => {
        // TypeScript/documentation patterns
        expect(pattern.test('password: string')).toBe(false);
        expect(pattern.test('apiKey?: string | undefined')).toBe(false);
      });
    });

    describe('jwt_tokens pattern', () => {
      const pattern = slopPatterns.jwt_tokens.pattern;

      it('should NOT match partial JWT-like strings', () => {
        expect(pattern.test('eyJ')).toBe(false);
        expect(pattern.test('eyJhbGciOiJIUzI1NiJ9')).toBe(false); // Just header, no payload
      });

      it('should NOT match random base64 that looks like JWT prefix', () => {
        expect(pattern.test('eyJunk.garbage.data')).toBe(false);
      });

      it('should NOT match JWT documentation references', () => {
        // Pattern checking text that mentions JWT format
        expect(pattern.test('JWT format: eyJ...')).toBe(false);
      });
    });

    describe('openai_api_key pattern', () => {
      const pattern = slopPatterns.openai_api_key.pattern;

      it('should NOT match sk- prefix alone', () => {
        expect(pattern.test('sk-')).toBe(false);
        expect(pattern.test('sk-short')).toBe(false);
      });

      it('should NOT match sk- with less than 32 chars', () => {
        expect(pattern.test('sk-abc123')).toBe(false);
        expect(pattern.test('sk-abcdefghijklmnopqrstuvwxyz12')).toBe(false); // 30 chars
      });

      it('should NOT match other sk- prefixed identifiers', () => {
        // Stripe secret keys start with sk_ (underscore), not sk- (dash)
        // The pattern sk_test_XXXX... is different from OpenAI's sk-XXXX format
        expect(pattern.test('sk_test_FAKEKEY1234567890FAKE1234')).toBe(false);
      });
    });

    describe('github_token pattern', () => {
      const pattern = slopPatterns.github_token.pattern;

      it('should NOT match partial token prefixes', () => {
        expect(pattern.test('ghp_')).toBe(false);
        expect(pattern.test('gho_')).toBe(false);
        expect(pattern.test('ghu_')).toBe(false);
      });

      it('should NOT match tokens with wrong length', () => {
        expect(pattern.test('ghp_shorttoken')).toBe(false);
        expect(pattern.test('ghp_abcdefghijklmnopqrstuvwxyz12345')).toBe(false); // 35 chars (needs 36)
      });

      it('should NOT match random strings starting with gh', () => {
        expect(pattern.test('ghost_writer')).toBe(false);
        expect(pattern.test('github.com')).toBe(false);
      });
    });

    describe('aws_credentials pattern', () => {
      const pattern = slopPatterns.aws_credentials.pattern;

      it('should NOT match AKIA prefix alone', () => {
        expect(pattern.test('AKIA')).toBe(false);
        expect(pattern.test('AKIA123')).toBe(false);
      });

      it('should NOT match AKIA with wrong length', () => {
        expect(pattern.test('AKIAIOSFODNN7EXAMPL')).toBe(false); // 19 chars (needs 20)
        expect(pattern.test('AKIAIOSFODNN')).toBe(false); // too short
      });

      it('should NOT match words starting with AKIA', () => {
        // Made up word that happens to start with AKIA
        expect(pattern.test('AKIAble to proceed')).toBe(false);
      });

      it('should NOT match aws_secret_access_key with short values', () => {
        expect(pattern.test('aws_secret_access_key = "short"')).toBe(false);
        expect(pattern.test('aws_secret_access_key: "abc"')).toBe(false);
      });
    });

    describe('private_key pattern', () => {
      const pattern = slopPatterns.private_key.pattern;

      it('should NOT match partial BEGIN patterns', () => {
        expect(pattern.test('-----BEGIN')).toBe(false);
        expect(pattern.test('BEGIN PRIVATE KEY')).toBe(false);
      });

      it('should NOT match public key headers', () => {
        expect(pattern.test('-----BEGIN PUBLIC KEY-----')).toBe(false);
        expect(pattern.test('-----BEGIN RSA PUBLIC KEY-----')).toBe(false);
      });

      it('should NOT match certificate headers', () => {
        expect(pattern.test('-----BEGIN CERTIFICATE-----')).toBe(false);
      });

      it('should NOT match documentation mentioning private keys', () => {
        expect(pattern.test('Generate a private key using openssl')).toBe(false);
        expect(pattern.test('The private key file should be secured')).toBe(false);
      });
    });

    describe('isFileExcluded for secret patterns', () => {
      const secretExcludes = slopPatterns.hardcoded_secrets.exclude;

      it('should exclude test files from secret detection', () => {
        expect(isFileExcluded('auth.test.js', secretExcludes)).toBe(true);
        expect(isFileExcluded('api.spec.ts', secretExcludes)).toBe(true);
      });

      it('should exclude example and sample files', () => {
        expect(isFileExcluded('config.example.js', secretExcludes)).toBe(true);
        expect(isFileExcluded('settings.sample.yaml', secretExcludes)).toBe(true);
      });

      it('should exclude documentation files', () => {
        expect(isFileExcluded('README.md', secretExcludes)).toBe(true);
        expect(isFileExcluded('SECURITY.md', secretExcludes)).toBe(true);
      });

      it('should NOT exclude production code files', () => {
        expect(isFileExcluded('auth.js', secretExcludes)).toBe(false);
        expect(isFileExcluded('config.ts', secretExcludes)).toBe(false);
        expect(isFileExcluded('api-client.py', secretExcludes)).toBe(false);
      });
    });
  });

  describe('ReDoS Protection', () => {
    // ReDoS (Regular Expression Denial of Service) tests verify that patterns
    // don't cause catastrophic backtracking with malicious input strings

    const MAX_SAFE_EXEC_TIME_MS = 100; // Regex should complete within 100ms

    /**
     * Helper to time regex execution
     */
    function timeRegex(regex, input, iterations = 100) {
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        regex.test(input);
      }
      return Date.now() - start;
    }

    describe('pattern complexity validation', () => {
      it('should complete all pattern tests within time limit', () => {
        const testInput = 'a'.repeat(100);

        Object.entries(slopPatterns).forEach(([name, pattern]) => {
          if (pattern.pattern) {
            const duration = timeRegex(pattern.pattern, testInput);
            expect(duration).toBeLessThan(MAX_SAFE_EXEC_TIME_MS * 10);
          }
        });
      });

      it('should handle long strings without catastrophic backtracking', () => {
        // These inputs could trigger ReDoS in vulnerable patterns
        const maliciousInputs = [
          'a'.repeat(1000),
          'a'.repeat(100) + 'b',
          'password = "' + 'a'.repeat(200) + '"',
          '-----BEGIN ' + 'A'.repeat(100) + ' KEY-----',
          'sk-' + 'a'.repeat(100),
          'eyJ' + 'a'.repeat(100) + '.eyJ' + 'a'.repeat(100) + '.xyz'
        ];

        Object.entries(slopPatterns).forEach(([name, pattern]) => {
          if (pattern.pattern) {
            maliciousInputs.forEach(input => {
              const start = Date.now();
              pattern.pattern.test(input);
              const duration = Date.now() - start;
              expect(duration).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
            });
          }
        });
      });
    });

    describe('isFileExcluded glob-to-regex security', () => {
      it('should handle pathological glob patterns safely', () => {
        // These patterns could cause issues in naive glob-to-regex
        const safePatterns = [
          '*.test.*',
          '**/*.spec.*',
          'node_modules/**/*'
        ];

        const maliciousFilenames = [
          'a'.repeat(1000) + '.test.js',
          '.'.repeat(500) + 'test.js',
          'file' + 'a'.repeat(1000) + '.test.js'
        ];

        safePatterns.forEach(pattern => {
          maliciousFilenames.forEach(filename => {
            const start = Date.now();
            isFileExcluded(filename, [pattern]);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
          });
        });
      });

      it('should reject patterns that could cause ReDoS', () => {
        // Verify common ReDoS-inducing patterns are handled
        const edgeCaseFilenames = [
          'test.test.test.test.test.test.test.test.test.test.js',
          '....................................test.js'
        ];

        edgeCaseFilenames.forEach(filename => {
          const start = Date.now();
          isFileExcluded(filename, ['*.test.*']);
          const duration = Date.now() - start;
          expect(duration).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        });
      });

      it('should limit excessive wildcards in glob patterns', () => {
        // Pattern with more than MAX_GLOB_WILDCARDS (10) should be safely rejected
        const excessiveWildcards = '*'.repeat(15).split('').join('/');
        const filename = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o';

        const start = Date.now();
        const result = isFileExcluded(filename, [excessiveWildcards]);
        const duration = Date.now() - start;

        // Should complete quickly regardless of pattern complexity
        expect(duration).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        // Excessive wildcard patterns match nothing (safety fallback)
        expect(result).toBe(false);
      });

      it('should match patterns anywhere in path (backward compatible)', () => {
        // Single star matches anything including path separators for backward compatibility
        // This matches existing behavior where *.test.* excludes test files anywhere
        expect(isFileExcluded('test.js', ['*.js'])).toBe(true);
        expect(isFileExcluded('path/test.js', ['*.js'])).toBe(true); // * matches path separators
        expect(isFileExcluded('src/test.ts', ['src/*.ts'])).toBe(true);
        expect(isFileExcluded('src/deep/test.ts', ['src/*.ts'])).toBe(true); // * matches path separators
      });

      it('should allow globstar (**) to match path separators', () => {
        // ** (globstar) matches any characters including path separators
        // Pattern **/*.js requires at least one / because the literal / is in the pattern
        expect(isFileExcluded('deep/path/test.js', ['**/*.js'])).toBe(true);
        expect(isFileExcluded('a/b/c/d/test.js', ['**/*.js'])).toBe(true);
        expect(isFileExcluded('dir/test.js', ['**/*.js'])).toBe(true);
        // For root files without path separators, use *.js pattern directly
        expect(isFileExcluded('test.js', ['*.js'])).toBe(true);
      });

      it('should handle mixed single-star and globstar patterns', () => {
        // Mix of * and ** in same pattern
        // Pattern src/**/*.test.* requires at least one / after src/
        expect(isFileExcluded('src/components/Button.test.tsx', ['src/**/*.test.*'])).toBe(true);
        expect(isFileExcluded('src/deep/nested/Button.test.tsx', ['src/**/*.test.*'])).toBe(true);
        expect(isFileExcluded('lib/Button.test.tsx', ['src/**/*.test.*'])).toBe(false);
        // For direct children of src/, use src/*.test.* pattern
        expect(isFileExcluded('src/Button.test.tsx', ['src/*.test.*'])).toBe(true);
      });

      it('should perform efficiently with repeated pattern access (cache test)', () => {
        const pattern = '**/*.test.js';
        const filenames = Array.from({ length: 100 }, (_, i) => `path${i}/file.test.js`);

        const start = Date.now();
        filenames.forEach(filename => {
          isFileExcluded(filename, [pattern]);
        });
        const duration = Date.now() - start;

        // 100 cached lookups should be very fast
        expect(duration).toBeLessThan(100);
      });
    });

    describe('individual pattern safety', () => {
      it('hardcoded_secrets pattern should resist ReDoS', () => {
        const pattern = slopPatterns.hardcoded_secrets.pattern;
        const inputs = [
          'password = "' + 'x'.repeat(10000) + '"',
          'api_key: "' + 'a'.repeat(500) + 'b'.repeat(500) + '"',
          'secret' + '='.repeat(100) + '"value"'
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        });
      });

      it('jwt_tokens pattern should resist ReDoS', () => {
        const pattern = slopPatterns.jwt_tokens.pattern;
        const inputs = [
          'eyJ' + 'A'.repeat(10000),
          'eyJ' + 'a-_'.repeat(3333) + '.eyJ' + 'b-_'.repeat(3333) + '.sig',
          'eyJ' + 'x'.repeat(100) + '.' + 'y'.repeat(100) + '.' + 'z'.repeat(100)
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        });
      });

      it('aws_credentials pattern should resist ReDoS', () => {
        const pattern = slopPatterns.aws_credentials.pattern;
        const inputs = [
          'AKIA' + '0'.repeat(10000),
          'aws_secret_access_key = "' + 'A'.repeat(10000) + '"',
          'AKIA' + 'IO'.repeat(5000)
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        });
      });

      it('placeholder_text pattern should resist ReDoS', () => {
        const pattern = slopPatterns.placeholder_text.pattern;
        const inputs = [
          'TODO'.repeat(1000),
          'FIXME: ' + 'fix'.repeat(1000),
          'Lorem ipsum ' + 'dolor '.repeat(1000)
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
        });
      });
    });

    describe('pattern structure analysis', () => {
      it('should not contain nested quantifiers that cause exponential backtracking', () => {
        // Check that patterns don't have dangerous nested quantifier structures
        // like (a+)+ or (a*)*
        const dangerousPatterns = /\([^)]*[+*]\)[+*]/;

        Object.entries(slopPatterns).forEach(([name, pattern]) => {
          if (pattern.pattern) {
            const source = pattern.pattern.source;
            // Most dangerous: nested quantifiers with same characters
            // Less dangerous but still risky: overlapping alternatives
            // We're checking the most critical case here
            const hasDangerousNesting = dangerousPatterns.test(source);
            if (hasDangerousNesting) {
              // If pattern has nested quantifiers, it should still be safe
              // Test with input that would trigger exponential backtracking
              const testInput = 'a'.repeat(30) + 'b';
              const start = Date.now();
              pattern.pattern.test(testInput);
              expect(Date.now() - start).toBeLessThan(MAX_SAFE_EXEC_TIME_MS);
            }
          }
        });
      });

      it('all patterns should complete regex test in reasonable time', () => {
        // Systematic test of all patterns with various inputs
        const testInputs = [
          '',
          'short',
          'a'.repeat(100),
          'a'.repeat(1000),
          'ab'.repeat(500),
          'test'.repeat(250),
          'x'.repeat(100) + 'y'.repeat(100)
        ];

        Object.entries(slopPatterns).forEach(([name, pattern]) => {
          if (pattern.pattern) {
            testInputs.forEach(input => {
              const start = Date.now();
              pattern.pattern.test(input);
              const duration = Date.now() - start;
              // Should complete within 50ms for any input
              expect(duration).toBeLessThan(50);
            });
          }
        });
      });
    });
  });
});
