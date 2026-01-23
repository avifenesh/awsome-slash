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
  isFileExcluded,
  getMultiPassPatterns,
  analyzers
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

  // ============================================================================
  // Placeholder Function Detection Tests (#98)
  // ============================================================================
  describe('Placeholder Function Detection (#98)', () => {
    describe('pattern definitions', () => {
      // Note: placeholder_stub_returns_js is disabled (pattern: null) due to high false positive rate
      const placeholderPatterns = [
        'placeholder_not_implemented_js',
        'placeholder_empty_function_js',
        'placeholder_todo_rust',
        'placeholder_panic_todo_rust',
        'placeholder_not_implemented_py',
        'placeholder_pass_only_py',
        'placeholder_ellipsis_py',
        'placeholder_panic_go',
        'placeholder_unsupported_java'
      ];

      placeholderPatterns.forEach(name => {
        it(`should have ${name} pattern defined`, () => {
          expect(slopPatterns).toHaveProperty(name);
          expect(slopPatterns[name].pattern).toBeInstanceOf(RegExp);
          // severity can vary (high or low depending on certainty)
          expect(['high', 'low']).toContain(slopPatterns[name].severity);
          expect(slopPatterns[name].autoFix).toBe('flag');
          expect(slopPatterns[name].description).toBeDefined();
        });
      });
    });

    describe('JavaScript/TypeScript placeholder detection', () => {
      describe('stub returns (multi-pass analyzer)', () => {
        // Uses analyzeStubFunctions from slop-analyzers.js
        const { analyzeStubFunctions } = require('../lib/patterns/slop-analyzers.js');

        it('should detect stub function returning 0', () => {
          const code = 'function stub() { return 0; }';
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(1);
          expect(violations[0].returnValue).toBe('0');
        });

        it('should detect stub function returning null/undefined', () => {
          const code = `
            function stub1() { return null; }
            function stub2() { return undefined; }
          `;
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(2);
        });

        it('should detect stub function returning true/false', () => {
          const code = `
            function stub1() { return true; }
            function stub2() { return false; }
          `;
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(2);
        });

        it('should detect stub function returning empty array/object', () => {
          const code = `
            function stub1() { return []; }
            function stub2() { return {}; }
          `;
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(2);
        });

        it('should NOT match functions with real logic', () => {
          const code = `
            function realLogic(x) {
              if (x > 10) return true;
              return false;
            }
            function withComputation() {
              const result = doSomething();
              return result;
            }
          `;
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(0);
        });

        it('should mark stubs with TODO as HIGH certainty', () => {
          const code = `
            function notImplemented() {
              // TODO: implement
              return null;
            }
          `;
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(1);
          expect(violations[0].certainty).toBe('HIGH');
          expect(violations[0].hasTodo).toBe(true);
        });

        it('should detect arrow function stubs', () => {
          const code = 'const stub = () => { return 0; }';
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(1);
        });

        it('should detect async function stubs', () => {
          const code = 'async function stub() { return null; }';
          const violations = analyzeStubFunctions(code, { filePath: 'test.js' });
          expect(violations.length).toBe(1);
        });
      });

      describe('stub returns - Python', () => {
        const { analyzeStubFunctions } = require('../lib/patterns/slop-analyzers.js');

        it('should detect Python stub returning None', () => {
          const code = `def stub():\n    return None`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.py' });
          expect(violations.length).toBe(1);
          expect(violations[0].returnValue).toBe('None');
        });

        it('should detect Python stub with pass', () => {
          const code = `def stub():\n    pass`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.py' });
          expect(violations.length).toBe(1);
        });

        it('should detect Python stub with ellipsis', () => {
          const code = `def stub():\n    ...`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.py' });
          expect(violations.length).toBe(1);
        });

        it('should detect Python stub raising NotImplementedError', () => {
          const code = `def stub():\n    raise NotImplementedError("not done")`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.py' });
          expect(violations.length).toBe(1);
        });

        it('should NOT match Python functions with real logic', () => {
          const code = `def process():\n    x = compute()\n    return x * 2`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.py' });
          expect(violations.length).toBe(0);
        });
      });

      describe('stub returns - Rust', () => {
        const { analyzeStubFunctions } = require('../lib/patterns/slop-analyzers.js');

        it('should detect Rust stub returning None', () => {
          const code = `fn stub() -> Option<i32> { None }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.rs' });
          expect(violations.length).toBe(1);
        });

        it('should detect Rust stub with todo!()', () => {
          const code = `fn stub() { todo!() }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.rs' });
          expect(violations.length).toBe(1);
        });

        it('should detect Rust stub with unimplemented!()', () => {
          const code = `fn stub() { unimplemented!() }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.rs' });
          expect(violations.length).toBe(1);
        });

        it('should detect Rust pub fn stub', () => {
          const code = `pub fn stub() -> Vec<i32> { Vec::new() }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.rs' });
          expect(violations.length).toBe(1);
        });

        it('should NOT match Rust functions with real logic', () => {
          const code = `fn process() -> i32 { let x = 5; x * 2 }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.rs' });
          expect(violations.length).toBe(0);
        });
      });

      describe('stub returns - Java', () => {
        const { analyzeStubFunctions } = require('../lib/patterns/slop-analyzers.js');

        it('should detect Java stub returning null', () => {
          const code = `public String stub() { return null; }`;
          const violations = analyzeStubFunctions(code, { filePath: 'Test.java' });
          expect(violations.length).toBe(1);
        });

        it('should detect Java stub throwing UnsupportedOperationException', () => {
          const code = `public void stub() { throw new UnsupportedOperationException(); }`;
          const violations = analyzeStubFunctions(code, { filePath: 'Test.java' });
          expect(violations.length).toBe(1);
        });

        it('should detect Java stub returning empty collections', () => {
          const code = `public List<String> stub() { return Collections.emptyList(); }`;
          const violations = analyzeStubFunctions(code, { filePath: 'Test.java' });
          expect(violations.length).toBe(1);
        });

        it('should NOT match Java methods with real logic', () => {
          const code = `public int process() { int x = compute(); return x * 2; }`;
          const violations = analyzeStubFunctions(code, { filePath: 'Test.java' });
          expect(violations.length).toBe(0);
        });
      });

      describe('stub returns - Go', () => {
        const { analyzeStubFunctions } = require('../lib/patterns/slop-analyzers.js');

        it('should detect Go stub returning nil', () => {
          const code = `func stub() error { return nil }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.go' });
          expect(violations.length).toBe(1);
        });

        it('should detect Go stub with panic', () => {
          const code = `func stub() { panic("not implemented") }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.go' });
          expect(violations.length).toBe(1);
        });

        it('should detect Go method stub', () => {
          const code = `func (s *Server) stub() string { return "" }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.go' });
          expect(violations.length).toBe(1);
        });

        it('should NOT match Go functions with real logic', () => {
          const code = `func process() int { x := compute(); return x * 2 }`;
          const violations = analyzeStubFunctions(code, { filePath: 'test.go' });
          expect(violations.length).toBe(0);
        });
      });

      describe('not implemented errors', () => {
        const pattern = () => slopPatterns.placeholder_not_implemented_js.pattern;

        it('should detect throw new Error with TODO', () => {
          expect(pattern().test('throw new Error("TODO: implement this")')).toBe(true);
          expect(pattern().test("throw new Error('TODO')")).toBe(true);
          expect(pattern().test('throw new Error(`TODO: implement`)')).toBe(true);
        });

        it('should detect throw new Error with implement', () => {
          expect(pattern().test('throw new Error("not implemented")')).toBe(true);
          expect(pattern().test('throw new Error("Not Implemented")')).toBe(true);
          expect(pattern().test('throw new Error("implement this")')).toBe(true);
        });

        it('should not match regular errors', () => {
          expect(pattern().test('throw new Error("Invalid input")')).toBe(false);
          expect(pattern().test('throw new Error("Connection failed")')).toBe(false);
        });
      });

      describe('empty functions', () => {
        const pattern = () => slopPatterns.placeholder_empty_function_js.pattern;

        it('should detect empty named functions', () => {
          expect(pattern().test('function foo() {}')).toBe(true);
          expect(pattern().test('function bar(a, b) {}')).toBe(true);
          expect(pattern().test('function process() { }')).toBe(true);
        });

        it('should detect empty arrow functions', () => {
          expect(pattern().test('=> {}')).toBe(true);
          expect(pattern().test('=> { }')).toBe(true);
        });

        it('should not match functions with content', () => {
          expect(pattern().test('function foo() { return 1; }')).toBe(false);
          expect(pattern().test('function bar() {\n  console.log("hi");\n}')).toBe(false);
        });
      });
    });

    describe('Rust placeholder detection', () => {
      describe('todo/unimplemented macros', () => {
        const pattern = () => slopPatterns.placeholder_todo_rust.pattern;

        it('should detect todo!()', () => {
          expect(pattern().test('todo!()')).toBe(true);
          expect(pattern().test('todo!("implement later")')).toBe(true);
          expect(pattern().test('  todo!()')).toBe(true);
        });

        it('should detect unimplemented!()', () => {
          expect(pattern().test('unimplemented!()')).toBe(true);
          expect(pattern().test('unimplemented!("not yet")')).toBe(true);
        });

        it('should not match similar names that are not macros', () => {
          expect(pattern().test('let todo = true;')).toBe(false);
          expect(pattern().test('// todo: fix this')).toBe(false);
        });
      });

      describe('panic TODO', () => {
        const pattern = () => slopPatterns.placeholder_panic_todo_rust.pattern;

        it('should detect panic with TODO', () => {
          expect(pattern().test('panic!("TODO: implement")')).toBe(true);
          expect(pattern().test("panic!('TODO')")).toBe(true);
        });

        it('should detect panic with implement', () => {
          expect(pattern().test('panic!("implement this")')).toBe(true);
        });

        it('should not match regular panics', () => {
          expect(pattern().test('panic!("unexpected state")')).toBe(false);
          expect(pattern().test('panic!("index out of bounds")')).toBe(false);
        });
      });
    });

    describe('Python placeholder detection', () => {
      describe('NotImplementedError', () => {
        const pattern = () => slopPatterns.placeholder_not_implemented_py.pattern;

        it('should detect raise NotImplementedError', () => {
          expect(pattern().test('raise NotImplementedError')).toBe(true);
          expect(pattern().test('raise NotImplementedError()')).toBe(true);
          expect(pattern().test('raise NotImplementedError("TODO")')).toBe(true);
          expect(pattern().test('    raise NotImplementedError')).toBe(true);
        });
      });

      describe('pass-only functions', () => {
        const pattern = () => slopPatterns.placeholder_pass_only_py.pattern;

        it('should detect def with only pass (multi-line)', () => {
          expect(pattern().test('def foo():\n    pass')).toBe(true);
          expect(pattern().test('def bar(x, y):\n  pass')).toBe(true);
        });

        it('should detect def with only pass (single-line)', () => {
          expect(pattern().test('def foo(): pass')).toBe(true);
          expect(pattern().test('def bar(x, y): pass')).toBe(true);
        });

        it('should not match functions with more content', () => {
          expect(pattern().test('def foo():\n    x = 1\n    pass')).toBe(false);
        });
      });

      describe('ellipsis-only functions', () => {
        const pattern = () => slopPatterns.placeholder_ellipsis_py.pattern;

        it('should detect def with only ellipsis (multi-line)', () => {
          expect(pattern().test('def foo():\n    ...')).toBe(true);
          expect(pattern().test('def bar(x):\n  ...')).toBe(true);
        });

        it('should detect def with only ellipsis (single-line)', () => {
          expect(pattern().test('def foo(): ...')).toBe(true);
          expect(pattern().test('def bar(x): ...')).toBe(true);
        });
      });
    });

    describe('Go placeholder detection', () => {
      const pattern = () => slopPatterns.placeholder_panic_go.pattern;

      it('should detect panic with TODO', () => {
        expect(pattern().test('panic("TODO: implement")')).toBe(true);
        expect(pattern().test("panic('TODO')")).toBe(true);
      });

      it('should detect panic with implement', () => {
        expect(pattern().test('panic("not implemented")')).toBe(true);
        expect(pattern().test('panic("implement this")')).toBe(true);
      });

      it('should not match regular panics', () => {
        expect(pattern().test('panic("unexpected error")')).toBe(false);
        expect(pattern().test('panic("nil pointer")')).toBe(false);
      });
    });

    describe('Java placeholder detection', () => {
      const pattern = () => slopPatterns.placeholder_unsupported_java.pattern;

      it('should detect throw new UnsupportedOperationException', () => {
        expect(pattern().test('throw new UnsupportedOperationException()')).toBe(true);
        expect(pattern().test('throw new UnsupportedOperationException("TODO")')).toBe(true);
        expect(pattern().test('    throw new UnsupportedOperationException();')).toBe(true);
      });

      it('should not match other exceptions', () => {
        expect(pattern().test('throw new IllegalArgumentException()')).toBe(false);
        expect(pattern().test('throw new RuntimeException()')).toBe(false);
      });
    });

    describe('language filtering', () => {
      it('should include JS placeholders in javascript patterns', () => {
        const patterns = getPatternsForLanguage('javascript');
        expect(patterns).toHaveProperty('placeholder_stub_returns_js');
        expect(patterns).toHaveProperty('placeholder_not_implemented_js');
        expect(patterns).toHaveProperty('placeholder_empty_function_js');
      });

      it('should include Rust placeholders in rust patterns', () => {
        const patterns = getPatternsForLanguage('rust');
        expect(patterns).toHaveProperty('placeholder_todo_rust');
        expect(patterns).toHaveProperty('placeholder_panic_todo_rust');
      });

      it('should include Python placeholders in python patterns', () => {
        const patterns = getPatternsForLanguage('python');
        expect(patterns).toHaveProperty('placeholder_not_implemented_py');
        expect(patterns).toHaveProperty('placeholder_pass_only_py');
        expect(patterns).toHaveProperty('placeholder_ellipsis_py');
      });

      it('should include Go placeholders in go patterns', () => {
        const patterns = getPatternsForLanguage('go');
        expect(patterns).toHaveProperty('placeholder_panic_go');
      });

      it('should include Java placeholders in java patterns', () => {
        const patterns = getPatternsForLanguage('java');
        expect(patterns).toHaveProperty('placeholder_unsupported_java');
      });

      it('should not include JS placeholders in python patterns', () => {
        const patterns = getPatternsForLanguageOnly('python');
        expect(patterns).not.toHaveProperty('placeholder_stub_returns_js');
        expect(patterns).not.toHaveProperty('placeholder_not_implemented_js');
      });
    });

    describe('file exclusion', () => {
      it('should exclude test files for JS patterns', () => {
        const excludes = slopPatterns.placeholder_stub_returns_js.exclude;
        expect(isFileExcluded('utils.test.js', excludes)).toBe(true);
        expect(isFileExcluded('helper.spec.ts', excludes)).toBe(true);
        expect(isFileExcluded('utils.js', excludes)).toBe(false);
      });

      it('should exclude test files for Rust patterns', () => {
        const excludes = slopPatterns.placeholder_todo_rust.exclude;
        expect(isFileExcluded('lib_test.rs', excludes)).toBe(true);
        expect(isFileExcluded('lib_tests.rs', excludes)).toBe(true);
        expect(isFileExcluded('lib.rs', excludes)).toBe(false);
      });

      it('should exclude test files for Python patterns', () => {
        const excludes = slopPatterns.placeholder_not_implemented_py.exclude;
        expect(isFileExcluded('test_utils.py', excludes)).toBe(true);
        expect(isFileExcluded('utils_test.py', excludes)).toBe(true);
        expect(isFileExcluded('conftest.py', excludes)).toBe(true);
        expect(isFileExcluded('utils.py', excludes)).toBe(false);
      });

      it('should exclude .pyi stub files for Python ellipsis', () => {
        const excludes = slopPatterns.placeholder_ellipsis_py.exclude;
        expect(isFileExcluded('typing.pyi', excludes)).toBe(true);
        expect(isFileExcluded('types.pyi', excludes)).toBe(true);
      });

      it('should exclude .d.ts files for empty function detection', () => {
        const excludes = slopPatterns.placeholder_empty_function_js.exclude;
        expect(isFileExcluded('types.d.ts', excludes)).toBe(true);
        expect(isFileExcluded('utils.ts', excludes)).toBe(false);
      });
    });

    describe('severity and autoFix consistency', () => {
      // Filter out placeholder_text and disabled patterns (pattern === null)
      const placeholderPatterns = Object.entries(slopPatterns).filter(([name, p]) =>
        name.startsWith('placeholder_') && name !== 'placeholder_text' && p.pattern !== null
      );

      it('all active placeholder patterns should have consistent severity', () => {
        placeholderPatterns.forEach(([name, pattern]) => {
          // severity can be 'high' or 'low' depending on certainty
          expect(['high', 'low']).toContain(pattern.severity);
        });
      });

      it('all placeholder patterns should have flag autoFix', () => {
        placeholderPatterns.forEach(([name, pattern]) => {
          expect(pattern.autoFix).toBe('flag');
        });
      });
    });

    describe('ReDoS safety', () => {
      const MAX_SAFE_TIME = 100; // ms

      it('placeholder patterns should resist ReDoS attacks', () => {
        // Filter out disabled patterns (pattern === null)
        const placeholderPatterns = Object.entries(slopPatterns).filter(([name, p]) =>
          name.startsWith('placeholder_') && name !== 'placeholder_text' && p.pattern !== null
        );

        const attackInputs = [
          'return '.repeat(1000) + '0;',
          'throw new Error("' + 'TODO'.repeat(1000) + '")',
          'function ' + 'a'.repeat(1000) + '() {}',
          'todo!' + '('.repeat(100),
          'panic!("' + 'implement'.repeat(500) + '")',
          'raise NotImplementedError' + '()'.repeat(500),
          'def ' + 'f'.repeat(1000) + '():\n    pass'
        ];

        placeholderPatterns.forEach(([name, patternDef]) => {
          attackInputs.forEach(input => {
            const start = Date.now();
            patternDef.pattern.test(input);
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(MAX_SAFE_TIME);
          });
        });
      });
    });
  });

  // ============================================================================
  // Doc/Code Ratio and Phantom Reference Detection Tests (#P1-T2, #P1-T3)
  // ============================================================================
  describe('Doc/Code Ratio Detection (#P1-T2)', () => {
    describe('doc_code_ratio_js pattern definition', () => {
      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.doc_code_ratio_js).toBeDefined();
        expect(slopPatterns.doc_code_ratio_js.pattern).toBeNull(); // Multi-pass
        expect(slopPatterns.doc_code_ratio_js.severity).toBe('medium');
        expect(slopPatterns.doc_code_ratio_js.autoFix).toBe('flag');
        expect(slopPatterns.doc_code_ratio_js.language).toBe('javascript');
        expect(slopPatterns.doc_code_ratio_js.requiresMultiPass).toBe(true);
        expect(slopPatterns.doc_code_ratio_js.minFunctionLines).toBe(3);
        expect(slopPatterns.doc_code_ratio_js.maxRatio).toBe(3.0);
      });

      it('should exclude test files and type definitions', () => {
        const excludes = slopPatterns.doc_code_ratio_js.exclude;
        expect(isFileExcluded('utils.test.js', excludes)).toBe(true);
        expect(isFileExcluded('helper.spec.ts', excludes)).toBe(true);
        expect(isFileExcluded('types.d.ts', excludes)).toBe(true);
        expect(isFileExcluded('utils.js', excludes)).toBe(false);
      });
    });

    describe('getMultiPassPatterns', () => {
      const { getMultiPassPatterns } = require('../lib/patterns/slop-patterns');

      it('should return patterns with requiresMultiPass: true', () => {
        const multiPass = getMultiPassPatterns();
        expect(multiPass).toHaveProperty('doc_code_ratio_js');
        expect(multiPass).toHaveProperty('duplicate_strings');

        // All returned patterns should have requiresMultiPass
        Object.values(multiPass).forEach(pattern => {
          expect(pattern.requiresMultiPass).toBe(true);
        });
      });

      it('should not include patterns without requiresMultiPass', () => {
        const multiPass = getMultiPassPatterns();
        // console_debugging does not have requiresMultiPass
        expect(multiPass).not.toHaveProperty('console_debugging');
        expect(multiPass).not.toHaveProperty('placeholder_text');
      });
    });
  });

  describe('Phantom Reference Detection (#P1-T3)', () => {
    describe('issue_pr_references pattern', () => {
      const pattern = () => slopPatterns.issue_pr_references.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.issue_pr_references).toBeDefined();
        expect(slopPatterns.issue_pr_references.severity).toBe('medium');
        expect(slopPatterns.issue_pr_references.autoFix).toBe('remove');
        expect(slopPatterns.issue_pr_references.language).toBeNull(); // Universal
      });

      it('should match issue number references', () => {
        expect(pattern().test('// Fixed in #123')).toBe(true);
        expect(pattern().test('// fixes #456')).toBe(true);
        expect(pattern().test('// See issue #789')).toBe(true);
        expect(pattern().test('// issue 123')).toBe(true);
      });

      it('should match PR references', () => {
        expect(pattern().test('// See PR #123')).toBe(true);
        expect(pattern().test('// PR 456')).toBe(true);
        expect(pattern().test('// pull request #789')).toBe(true);
      });

      it('should match closes/resolves references', () => {
        expect(pattern().test('// closes #123')).toBe(true);
        expect(pattern().test('// close #456')).toBe(true);
        expect(pattern().test('// resolves #789')).toBe(true);
        expect(pattern().test('// resolve #100')).toBe(true);
      });

      it('should match iteration references', () => {
        expect(pattern().test('// iteration 5')).toBe(true);
        expect(pattern().test('// iteration 12')).toBe(true);
      });

      it('should not match non-issue text', () => {
        expect(pattern().test('// Fixed the bug')).toBe(false);
        expect(pattern().test('// See the PR for details')).toBe(false);
        expect(pattern().test('// This is a comment')).toBe(false);
      });

      it('should not match without comment prefix', () => {
        expect(pattern().test('Fixed in #123')).toBe(false);
        expect(pattern().test('closes #456')).toBe(false);
      });

      it('should exclude markdown files', () => {
        const excludes = slopPatterns.issue_pr_references.exclude;
        expect(isFileExcluded('README.md', excludes)).toBe(true);
        expect(isFileExcluded('CHANGELOG.md', excludes)).toBe(true);
        expect(isFileExcluded('CONTRIBUTING.md', excludes)).toBe(true);
        expect(isFileExcluded('utils.js', excludes)).toBe(false);
      });
    });

    describe('file_path_references pattern', () => {
      const pattern = () => slopPatterns.file_path_references.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.file_path_references).toBeDefined();
        expect(slopPatterns.file_path_references.severity).toBe('low');
        expect(slopPatterns.file_path_references.autoFix).toBe('flag');
        expect(slopPatterns.file_path_references.language).toBeNull();
      });

      it('should match "see" file references', () => {
        expect(pattern().test('// see auth-flow.md')).toBe(true);
        expect(pattern().test('// See docs/API.md')).toBe(true);
        expect(pattern().test('// see config.json')).toBe(true);
      });

      it('should match "documented in" references', () => {
        expect(pattern().test('// documented in docs/spec.md')).toBe(true);
        expect(pattern().test('// Documented in README.md')).toBe(true);
      });

      it('should match "refer to" references', () => {
        expect(pattern().test('// refer to utils.js')).toBe(true);
        expect(pattern().test('// Refer to helpers.ts')).toBe(true);
      });

      it('should match "per" references', () => {
        expect(pattern().test('// per config.yaml')).toBe(true);
        expect(pattern().test('// Per settings.toml')).toBe(true);
      });

      it('should match various file extensions', () => {
        expect(pattern().test('// see file.md')).toBe(true);
        expect(pattern().test('// see file.js')).toBe(true);
        expect(pattern().test('// see file.ts')).toBe(true);
        expect(pattern().test('// see file.json')).toBe(true);
        expect(pattern().test('// see file.yaml')).toBe(true);
        expect(pattern().test('// see file.yml')).toBe(true);
        expect(pattern().test('// see file.toml')).toBe(true);
        expect(pattern().test('// see file.txt')).toBe(true);
      });

      it('should not match non-file references', () => {
        expect(pattern().test('// see the documentation')).toBe(false);
        expect(pattern().test('// See above for details')).toBe(false);
        expect(pattern().test('// refer to line 42')).toBe(false);
      });

      it('should exclude markdown and test files', () => {
        const excludes = slopPatterns.file_path_references.exclude;
        expect(isFileExcluded('docs.md', excludes)).toBe(true);
        expect(isFileExcluded('README.md', excludes)).toBe(true);
        expect(isFileExcluded('utils.test.js', excludes)).toBe(true);
        expect(isFileExcluded('helper.spec.ts', excludes)).toBe(true);
        expect(isFileExcluded('app.js', excludes)).toBe(false);
      });
    });

    describe('ReDoS safety for reference patterns', () => {
      const MAX_SAFE_TIME = 100;

      it('issue_pr_references pattern should resist ReDoS', () => {
        const pattern = slopPatterns.issue_pr_references.pattern;
        const inputs = [
          '// ' + '#123'.repeat(1000),
          '// issue ' + '#'.repeat(1000) + '123',
          '// ' + 'fixed in '.repeat(500) + '#123',
          '// PR ' + '0'.repeat(10000)
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
        });
      });

      it('file_path_references pattern should resist ReDoS', () => {
        const pattern = slopPatterns.file_path_references.pattern;
        const inputs = [
          '// see ' + 'a'.repeat(10000) + '.md',
          '// documented in ' + 'path/'.repeat(1000) + 'file.js',
          '// see ' + 'file'.repeat(1000) + '.ts',
          '// refer to ' + './'.repeat(500) + 'utils.json'
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
        });
      });
    });
  });

  describe('analyzers module export', () => {
    const { analyzers } = require('../lib/patterns/slop-patterns');

    it('should export analyzers object', () => {
      expect(analyzers).toBeDefined();
      expect(typeof analyzers).toBe('object');
    });

    it('should have analyzeDocCodeRatio function', () => {
      expect(analyzers.analyzeDocCodeRatio).toBeDefined();
      expect(typeof analyzers.analyzeDocCodeRatio).toBe('function');
    });

    it('should have helper functions', () => {
      expect(analyzers.findMatchingBrace).toBeDefined();
      expect(analyzers.countNonEmptyLines).toBeDefined();
    });
  });

  // ============================================================================
  // Over-Engineering Metrics Pattern Tests
  // ============================================================================

  describe('over_engineering_metrics pattern', () => {
    it('should exist with correct metadata', () => {
      expect(slopPatterns).toHaveProperty('over_engineering_metrics');
      const pattern = slopPatterns.over_engineering_metrics;

      expect(pattern.severity).toBe('high');
      expect(pattern.autoFix).toBe('flag');
      expect(pattern.language).toBeNull();
      expect(pattern.description).toContain('over-engineering');
    });

    it('should have pattern set to null (multi-pass only)', () => {
      expect(slopPatterns.over_engineering_metrics.pattern).toBeNull();
    });

    it('should have requiresMultiPass set to true', () => {
      expect(slopPatterns.over_engineering_metrics.requiresMultiPass).toBe(true);
    });

    it('should have threshold configuration', () => {
      const pattern = slopPatterns.over_engineering_metrics;

      expect(pattern.fileRatioThreshold).toBe(20);
      expect(pattern.linesPerExportThreshold).toBe(500);
      expect(pattern.depthThreshold).toBe(4);
    });

    it('should be included in getMultiPassPatterns()', () => {
      const multiPassPatterns = getMultiPassPatterns();

      expect(multiPassPatterns).toHaveProperty('over_engineering_metrics');
      expect(multiPassPatterns.over_engineering_metrics.requiresMultiPass).toBe(true);
    });

    it('should be included in universal patterns (language: null)', () => {
      const universalPatterns = getUniversalPatterns();

      expect(universalPatterns).toHaveProperty('over_engineering_metrics');
    });

    it('should be included in high severity patterns', () => {
      const highPatterns = getPatternsBySeverity('high');

      expect(highPatterns).toHaveProperty('over_engineering_metrics');
    });

    it('should be included in flag autoFix patterns', () => {
      const flagPatterns = getPatternsByAutoFix('flag');

      expect(flagPatterns).toHaveProperty('over_engineering_metrics');
    });
  });

  describe('buzzword_inflation pattern', () => {
    it('should exist with correct metadata', () => {
      expect(slopPatterns).toHaveProperty('buzzword_inflation');
      const pattern = slopPatterns.buzzword_inflation;

      expect(pattern.severity).toBe('high');
      expect(pattern.autoFix).toBe('flag');
      expect(pattern.language).toBeNull();
      expect(pattern.description).toContain('claim');
    });

    it('should have null pattern (requires analyzer)', () => {
      expect(slopPatterns.buzzword_inflation.pattern).toBeNull();
    });

    it('should have requiresMultiPass set to true', () => {
      expect(slopPatterns.buzzword_inflation.requiresMultiPass).toBe(true);
    });

    it('should have minEvidenceMatches configuration', () => {
      const pattern = slopPatterns.buzzword_inflation;
      expect(pattern.minEvidenceMatches).toBe(2);
    });

    it('should be included in getMultiPassPatterns', () => {
      const multiPassPatterns = getMultiPassPatterns();
      expect(multiPassPatterns).toHaveProperty('buzzword_inflation');
      expect(multiPassPatterns.buzzword_inflation.requiresMultiPass).toBe(true);
    });

    it('should be included in universal patterns (language: null)', () => {
      const universalPatterns = getUniversalPatterns();
      expect(universalPatterns).toHaveProperty('buzzword_inflation');
    });

    it('should be included in high severity patterns', () => {
      const highPatterns = getPatternsBySeverity('high');
      expect(highPatterns).toHaveProperty('buzzword_inflation');
    });

    it('should be included in flag autoFix patterns', () => {
      const flagPatterns = getPatternsByAutoFix('flag');
      expect(flagPatterns).toHaveProperty('buzzword_inflation');
    });
  });

  describe('getMultiPassPatterns', () => {
    it('should return only patterns with requiresMultiPass: true', () => {
      const multiPassPatterns = getMultiPassPatterns();

      expect(Object.keys(multiPassPatterns).length).toBeGreaterThan(0);

      Object.entries(multiPassPatterns).forEach(([name, pattern]) => {
        expect(pattern.requiresMultiPass).toBe(true);
      });
    });

    it('should include doc_code_ratio_js pattern', () => {
      const multiPassPatterns = getMultiPassPatterns();

      expect(multiPassPatterns).toHaveProperty('doc_code_ratio_js');
    });

    it('should include over_engineering_metrics pattern', () => {
      const multiPassPatterns = getMultiPassPatterns();

      expect(multiPassPatterns).toHaveProperty('over_engineering_metrics');
    });

    it('should include buzzword_inflation pattern', () => {
      const multiPassPatterns = getMultiPassPatterns();

      expect(multiPassPatterns).toHaveProperty('buzzword_inflation');
    });
  });

  // ============================================================================
  // Verbosity Detection Patterns
  // ============================================================================

  describe('verbosity_preambles', () => {
    const pattern = slopPatterns.verbosity_preambles.pattern;

    it('should detect "certainly" preamble', () => {
      expect(pattern.test('// Certainly, this function handles...')).toBe(true);
    });

    it('should detect "I\'d be happy" preamble', () => {
      expect(pattern.test("// I'd be happy to explain this...")).toBe(true);
    });

    it('should detect "great question" preamble', () => {
      expect(pattern.test('// Great question! This method...')).toBe(true);
    });

    it('should detect "absolutely" preamble', () => {
      expect(pattern.test('// Absolutely, we can do this...')).toBe(true);
    });

    it('should detect "of course" preamble', () => {
      expect(pattern.test('// Of course, this is simple...')).toBe(true);
    });

    it('should detect "happy to help" preamble', () => {
      expect(pattern.test('// Happy to help with this...')).toBe(true);
    });

    it('should detect "let me help" preamble', () => {
      expect(pattern.test('// Let me help you understand...')).toBe(true);
    });

    it('should NOT match normal comments', () => {
      expect(pattern.test('// This function validates input')).toBe(false);
      expect(pattern.test('// Calculate the total price')).toBe(false);
    });

    it('should NOT match code containing these words', () => {
      expect(pattern.test('const certainly = true;')).toBe(false);
    });
  });

  describe('verbosity_buzzwords', () => {
    const pattern = slopPatterns.verbosity_buzzwords.pattern;

    it('should detect "synergize"', () => {
      expect(pattern.test('// This will synergize our systems')).toBe(true);
    });

    it('should detect "operationalize"', () => {
      expect(pattern.test('// We need to operationalize this strategy')).toBe(true);
    });

    it('should detect "paradigm shift"', () => {
      expect(pattern.test('This represents a paradigm shift in our approach')).toBe(true);
    });

    it('should detect "best-in-class"', () => {
      expect(pattern.test('Our best-in-class solution')).toBe(true);
    });

    it('should detect "world-class"', () => {
      expect(pattern.test('A world-class implementation')).toBe(true);
    });

    it('should detect "cutting-edge"', () => {
      expect(pattern.test('Using cutting-edge technology')).toBe(true);
    });

    it('should detect "game-changing"', () => {
      expect(pattern.test('This is a game-changing feature')).toBe(true);
    });

    it('should detect "holistic"', () => {
      expect(pattern.test('A holistic approach to the problem')).toBe(true);
    });

    it('should detect "revolutionary"', () => {
      expect(pattern.test('Our revolutionary new algorithm')).toBe(true);
    });

    it('should detect "transformative"', () => {
      expect(pattern.test('A transformative update')).toBe(true);
    });

    it('should detect "seamless"', () => {
      expect(pattern.test('For a seamless experience')).toBe(true);
    });

    it('should detect "next-generation"', () => {
      expect(pattern.test('Our next-generation platform')).toBe(true);
    });

    it('should detect "bleeding-edge"', () => {
      expect(pattern.test('Using bleeding-edge techniques')).toBe(true);
    });

    it('should detect "industry-leading"', () => {
      expect(pattern.test('An industry-leading solution')).toBe(true);
    });

    it('should NOT match standard SE terms like leverage', () => {
      expect(pattern.test('// leverage the existing API')).toBe(false);
    });

    it('should NOT match standard SE terms like utilize', () => {
      expect(pattern.test('// utilize the cache')).toBe(false);
    });

    it('should NOT match standard SE terms like orchestrate', () => {
      expect(pattern.test('// orchestrate the services')).toBe(false);
    });

    it('should NOT match normal technical language', () => {
      expect(pattern.test('// This function validates the input')).toBe(false);
      expect(pattern.test('// Initialize the connection pool')).toBe(false);
    });
  });

  describe('verbosity_hedging', () => {
    const pattern = slopPatterns.verbosity_hedging.pattern;

    it('should detect "it\'s worth noting"', () => {
      expect(pattern.test("// It's worth noting that this...")).toBe(true);
    });

    it('should detect "its worth noting" (without apostrophe)', () => {
      expect(pattern.test('// Its worth noting that...')).toBe(true);
    });

    it('should detect "generally speaking"', () => {
      expect(pattern.test('// Generally speaking, this works...')).toBe(true);
    });

    it('should detect "more or less"', () => {
      expect(pattern.test('// This is more or less correct')).toBe(true);
    });

    it('should detect "arguably"', () => {
      expect(pattern.test('// Arguably, this is the best approach')).toBe(true);
    });

    it('should detect "perhaps"', () => {
      expect(pattern.test('// Perhaps we should consider...')).toBe(true);
    });

    it('should detect "possibly"', () => {
      expect(pattern.test('// Possibly this could fail...')).toBe(true);
    });

    it('should detect "might be"', () => {
      expect(pattern.test('// This might be slow...')).toBe(true);
    });

    it('should detect "should work"', () => {
      expect(pattern.test('// This should work in most cases')).toBe(true);
    });

    it('should detect "i think"', () => {
      expect(pattern.test('// I think this is correct')).toBe(true);
    });

    it('should detect "i believe"', () => {
      expect(pattern.test('// I believe this handles all cases')).toBe(true);
    });

    it('should detect "probably"', () => {
      expect(pattern.test('// This is probably fine')).toBe(true);
    });

    it('should detect "maybe"', () => {
      expect(pattern.test('// Maybe we need to refactor')).toBe(true);
    });

    it('should NOT match code, only comments', () => {
      expect(pattern.test('const perhaps = true;')).toBe(false);
      expect(pattern.test('if (maybe) { return; }')).toBe(false);
    });

    it('should NOT match definitive comments', () => {
      expect(pattern.test('// This function validates input')).toBe(false);
      expect(pattern.test('// Returns the computed hash')).toBe(false);
    });
  });

  describe('verbosity_ratio (multi-pass pattern)', () => {
    const pattern = slopPatterns.verbosity_ratio;

    it('should be a multi-pass pattern', () => {
      expect(pattern.pattern).toBeNull();
      expect(pattern.requiresMultiPass).toBe(true);
    });

    it('should have maxCommentRatio option', () => {
      expect(pattern.maxCommentRatio).toBe(2.0);
    });

    it('should have minCodeLines option', () => {
      expect(pattern.minCodeLines).toBe(3);
    });

    it('should have medium severity', () => {
      expect(pattern.severity).toBe('medium');
    });
  });

  describe('getMultiPassPatterns includes verbosity_ratio', () => {
    it('should include verbosity_ratio pattern', () => {
      const multiPassPatterns = getMultiPassPatterns();
      expect(multiPassPatterns).toHaveProperty('verbosity_ratio');
    });
  });

  describe('analyzers export', () => {
    it('should export analyzers module', () => {
      expect(analyzers).toBeDefined();
    });

    it('should have analyzeDocCodeRatio function', () => {
      expect(typeof analyzers.analyzeDocCodeRatio).toBe('function');
    });

    it('should have analyzeOverEngineering function', () => {
      expect(typeof analyzers.analyzeOverEngineering).toBe('function');
    });

    it('should have analyzeVerbosityRatio function', () => {
      expect(typeof analyzers.analyzeVerbosityRatio).toBe('function');
    });

    it('should have analyzeDeadCode function', () => {
      expect(typeof analyzers.analyzeDeadCode).toBe('function');
    });

    it('should have analyzeShotgunSurgery function', () => {
      expect(typeof analyzers.analyzeShotgunSurgery).toBe('function');
    });
  });

  // ============================================================================
  // Code Smell Detection Tests (#106)
  // High-impact code smell patterns for maintainability and readability
  // ============================================================================

  describe('Code Smell Detection (#106)', () => {
    describe('boolean_blindness pattern', () => {
      const pattern = () => slopPatterns.boolean_blindness.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.boolean_blindness).toBeDefined();
        expect(slopPatterns.boolean_blindness.severity).toBe('medium');
        expect(slopPatterns.boolean_blindness.autoFix).toBe('flag');
        expect(slopPatterns.boolean_blindness.language).toBeNull(); // Universal
      });

      it('should detect function calls with 3+ boolean params', () => {
        expect(pattern().test('process(true, false, true)')).toBe(true);
        expect(pattern().test('foo.bar(true, true, true, false)')).toBe(true);
        expect(pattern().test('config(false, false, true)')).toBe(true);
        expect(pattern().test('setupUser(true, true, false, true)')).toBe(true);
      });

      it('should NOT detect function calls with 2 or fewer booleans', () => {
        expect(pattern().test('process(true, false)')).toBe(false);
        expect(pattern().test('toggle(true)')).toBe(false);
        expect(pattern().test('foo.bar(false, true)')).toBe(false);
      });

      it('should NOT detect booleans mixed with other args', () => {
        expect(pattern().test('process("name", true, false)')).toBe(false);
        expect(pattern().test('config(42, true, false)')).toBe(false);
      });

      it('should exclude test files', () => {
        const excludes = slopPatterns.boolean_blindness.exclude;
        expect(isFileExcluded('utils.test.js', excludes)).toBe(true);
        expect(isFileExcluded('helper.spec.ts', excludes)).toBe(true);
        expect(isFileExcluded('src/tests/foo.js', excludes)).toBe(true);
      });
    });

    describe('message_chains_methods pattern', () => {
      const pattern = () => slopPatterns.message_chains_methods.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.message_chains_methods).toBeDefined();
        expect(slopPatterns.message_chains_methods.severity).toBe('low');
        expect(slopPatterns.message_chains_methods.autoFix).toBe('flag');
      });

      it('should detect 4+ consecutive method calls', () => {
        expect(pattern().test('a.getB().getC().getD().doThing()')).toBe(true);
        expect(pattern().test('obj.foo().bar().baz().qux().quux()')).toBe(true);
        expect(pattern().test('builder.setA().setB().setC().setD()')).toBe(true);
      });

      it('should NOT detect 3 or fewer method calls', () => {
        expect(pattern().test('a.b().c()')).toBe(false);
        expect(pattern().test('obj.foo().bar().baz()')).toBe(false);
        expect(pattern().test('x.y()')).toBe(false);
      });

      it('should exclude config files', () => {
        const excludes = slopPatterns.message_chains_methods.exclude;
        expect(isFileExcluded('webpack.config.js', excludes)).toBe(true);
        expect(isFileExcluded('jest.config.ts', excludes)).toBe(true);
      });
    });

    describe('message_chains_properties pattern', () => {
      const pattern = () => slopPatterns.message_chains_properties.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.message_chains_properties).toBeDefined();
        expect(slopPatterns.message_chains_properties.severity).toBe('low');
      });

      it('should detect 5+ consecutive property accesses', () => {
        expect(pattern().test('obj.a.b.c.d.e')).toBe(true);
        expect(pattern().test('this.state.user.profile.settings.theme')).toBe(true);
        expect(pattern().test('config.app.db.host.port.timeout')).toBe(true);
      });

      it('should NOT detect 4 or fewer property accesses', () => {
        expect(pattern().test('obj.a.b.c')).toBe(false);
        expect(pattern().test('obj.a.b.c.d')).toBe(false);
        expect(pattern().test('this.state.user')).toBe(false);
      });

      it('should NOT detect method calls (those are message_chains_methods)', () => {
        expect(pattern().test('obj.a().b().c().d().e()')).toBe(false);
      });
    });

    describe('mutable_globals_js pattern', () => {
      const pattern = () => slopPatterns.mutable_globals_js.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.mutable_globals_js).toBeDefined();
        expect(slopPatterns.mutable_globals_js.severity).toBe('high');
        expect(slopPatterns.mutable_globals_js.language).toBe('javascript');
      });

      it('should detect let with UPPERCASE names', () => {
        expect(pattern().test('let CONFIG = {}')).toBe(true);
        expect(pattern().test('let SETTINGS = []')).toBe(true);
        expect(pattern().test('let API_ENDPOINT = "url"')).toBe(true);
      });

      it('should detect var with UPPERCASE names', () => {
        expect(pattern().test('var GLOBAL_STATE = {}')).toBe(true);
        expect(pattern().test('var MAX_RETRIES = 5')).toBe(true);
      });

      it('should NOT detect const with UPPERCASE names', () => {
        expect(pattern().test('const CONFIG = {}')).toBe(false);
        expect(pattern().test('const SETTINGS = []')).toBe(false);
      });

      it('should NOT detect let/var with lowercase names', () => {
        expect(pattern().test('let config = {}')).toBe(false);
        expect(pattern().test('var settings = []')).toBe(false);
        expect(pattern().test('let myVar = 123')).toBe(false);
      });

      it('should exclude constants.js files', () => {
        const excludes = slopPatterns.mutable_globals_js.exclude;
        expect(isFileExcluded('constants.js', excludes)).toBe(true);
        expect(isFileExcluded('constants.ts', excludes)).toBe(true);
      });
    });

    describe('mutable_globals_py pattern', () => {
      const pattern = () => slopPatterns.mutable_globals_py.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.mutable_globals_py).toBeDefined();
        expect(slopPatterns.mutable_globals_py.severity).toBe('high');
        expect(slopPatterns.mutable_globals_py.language).toBe('python');
      });

      it('should detect UPPERCASE names with mutable types', () => {
        expect(pattern().test('CACHE = {}')).toBe(true);
        expect(pattern().test('CONFIG = []')).toBe(true);
        expect(pattern().test('SETTINGS = dict()')).toBe(true);
        expect(pattern().test('DATA = list()')).toBe(true);
        expect(pattern().test('ITEMS = set()')).toBe(true);
      });

      it('should NOT detect lowercase names', () => {
        expect(pattern().test('cache = {}')).toBe(false);
        expect(pattern().test('config = []')).toBe(false);
      });

      it('should NOT detect immutable assignments', () => {
        expect(pattern().test('MAX_SIZE = 100')).toBe(false);
        expect(pattern().test('API_URL = "https://api.com"')).toBe(false);
      });

      it('should exclude settings.py files', () => {
        const excludes = slopPatterns.mutable_globals_py.exclude;
        expect(isFileExcluded('settings.py', excludes)).toBe(true);
        expect(isFileExcluded('constants.py', excludes)).toBe(true);
      });
    });

    describe('dead_code pattern', () => {
      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.dead_code).toBeDefined();
        expect(slopPatterns.dead_code.pattern).toBeNull();
        expect(slopPatterns.dead_code.requiresMultiPass).toBe(true);
        expect(slopPatterns.dead_code.severity).toBe('high');
      });

      it('should be included in getMultiPassPatterns', () => {
        const multiPassPatterns = getMultiPassPatterns();
        expect(multiPassPatterns).toHaveProperty('dead_code');
      });
    });

    describe('shotgun_surgery pattern', () => {
      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.shotgun_surgery).toBeDefined();
        expect(slopPatterns.shotgun_surgery.pattern).toBeNull();
        expect(slopPatterns.shotgun_surgery.requiresMultiPass).toBe(true);
        expect(slopPatterns.shotgun_surgery.severity).toBe('high');
      });

      it('should have configuration options', () => {
        expect(slopPatterns.shotgun_surgery.commitLimit).toBe(100);
        expect(slopPatterns.shotgun_surgery.clusterThreshold).toBe(5);
      });

      it('should be included in getMultiPassPatterns', () => {
        const multiPassPatterns = getMultiPassPatterns();
        expect(multiPassPatterns).toHaveProperty('shotgun_surgery');
      });
    });

    describe('feature_envy pattern', () => {
      const pattern = () => slopPatterns.feature_envy.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.feature_envy).toBeDefined();
        expect(slopPatterns.feature_envy.severity).toBe('low');
        expect(slopPatterns.feature_envy.autoFix).toBe('flag');
      });

      it('should detect repeated access to same object', () => {
        expect(pattern().test('obj.name + obj.price + obj.tax')).toBe(true);
        expect(pattern().test('user.id user.email user.name')).toBe(true);
      });

      it('should NOT detect access to different objects', () => {
        expect(pattern().test('this.x + other.y + another.z')).toBe(false);
        expect(pattern().test('a.foo + b.bar + c.baz')).toBe(false);
      });
    });

    describe('speculative_generality_unused_params pattern', () => {
      const pattern = () => slopPatterns.speculative_generality_unused_params.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.speculative_generality_unused_params).toBeDefined();
        expect(slopPatterns.speculative_generality_unused_params.severity).toBe('low');
        expect(slopPatterns.speculative_generality_unused_params.language).toBe('javascript');
      });

      it('should detect underscore-prefixed parameters', () => {
        expect(pattern().test('function foo(_unusedArg, usedArg) {}')).toBe(true);
        expect(pattern().test('function handler(_event, context) {}')).toBe(true);
        expect(pattern().test('function process(_req, _res, next) {}')).toBe(true);
      });

      it('should NOT detect functions without underscore params', () => {
        expect(pattern().test('function foo(arg1, arg2) {}')).toBe(false);
        expect(pattern().test('function bar() {}')).toBe(false);
      });

      it('should exclude .d.ts files', () => {
        const excludes = slopPatterns.speculative_generality_unused_params.exclude;
        expect(isFileExcluded('types.d.ts', excludes)).toBe(true);
      });
    });

    describe('speculative_generality_empty_interface pattern', () => {
      const pattern = () => slopPatterns.speculative_generality_empty_interface.pattern;

      it('should have pattern defined with correct metadata', () => {
        expect(slopPatterns.speculative_generality_empty_interface).toBeDefined();
        expect(slopPatterns.speculative_generality_empty_interface.severity).toBe('low');
      });

      it('should detect empty interfaces', () => {
        expect(pattern().test('interface IEmpty {}')).toBe(true);
        expect(pattern().test('interface Empty { }')).toBe(true);
        expect(pattern().test('interface IMarker {}')).toBe(true);
      });

      it('should detect empty generic interfaces', () => {
        expect(pattern().test('interface IEmpty<T> {}')).toBe(true);
        expect(pattern().test('interface Container<T, U> { }')).toBe(true);
      });

      it('should NOT detect interfaces with members', () => {
        expect(pattern().test('interface IUser { name: string; }')).toBe(false);
        expect(pattern().test('interface IConfig {\n  port: number;\n}')).toBe(false);
      });
    });

    describe('ReDoS safety for code smell patterns', () => {
      const MAX_SAFE_TIME = 100;

      it('boolean_blindness should resist ReDoS', () => {
        const pattern = slopPatterns.boolean_blindness.pattern;
        const inputs = [
          'process(' + 'true, '.repeat(1000) + 'true)',
          'foo(' + 'false, '.repeat(5000) + 'false)',
          '('.repeat(100) + 'true, false, true' + ')'.repeat(100)
        ];

        inputs.forEach(input => {
          const start = Date.now();
          pattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
        });
      });

      it('message_chains patterns should resist ReDoS', () => {
        const methodPattern = slopPatterns.message_chains_methods.pattern;
        const propPattern = slopPatterns.message_chains_properties.pattern;
        const inputs = [
          'obj' + '.method()'.repeat(1000),
          'obj' + '.prop'.repeat(1000),
          'a'.repeat(10000) + '.b().c().d().e()'
        ];

        inputs.forEach(input => {
          const start = Date.now();
          methodPattern.test(input);
          propPattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
        });
      });

      it('mutable_globals patterns should resist ReDoS', () => {
        const jsPattern = slopPatterns.mutable_globals_js.pattern;
        const pyPattern = slopPatterns.mutable_globals_py.pattern;
        const inputs = [
          'let ' + 'A'.repeat(10000) + ' = {}',
          'CACHE' + '='.repeat(10000) + '{}',
          ' '.repeat(10000) + 'let CONFIG = {}'
        ];

        inputs.forEach(input => {
          const start = Date.now();
          jsPattern.test(input);
          pyPattern.test(input);
          expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
        });
      });
    });

    describe('language filtering for code smell patterns', () => {
      it('should include universal patterns in all languages', () => {
        const jsPatterns = getPatternsForLanguage('javascript');
        const pyPatterns = getPatternsForLanguage('python');

        expect(jsPatterns).toHaveProperty('boolean_blindness');
        expect(jsPatterns).toHaveProperty('message_chains_methods');
        expect(jsPatterns).toHaveProperty('message_chains_properties');
        expect(jsPatterns).toHaveProperty('feature_envy');

        expect(pyPatterns).toHaveProperty('boolean_blindness');
        expect(pyPatterns).toHaveProperty('message_chains_methods');
        expect(pyPatterns).toHaveProperty('message_chains_properties');
        expect(pyPatterns).toHaveProperty('feature_envy');
      });

      it('should include JS-specific patterns only in javascript', () => {
        const jsPatterns = getPatternsForLanguage('javascript');
        const pyPatterns = getPatternsForLanguageOnly('python');

        expect(jsPatterns).toHaveProperty('mutable_globals_js');
        expect(jsPatterns).toHaveProperty('speculative_generality_unused_params');
        expect(jsPatterns).toHaveProperty('speculative_generality_empty_interface');

        expect(pyPatterns).not.toHaveProperty('mutable_globals_js');
        expect(pyPatterns).not.toHaveProperty('speculative_generality_unused_params');
      });

      it('should include Python-specific patterns only in python', () => {
        const pyPatterns = getPatternsForLanguage('python');
        const jsPatterns = getPatternsForLanguageOnly('javascript');

        expect(pyPatterns).toHaveProperty('mutable_globals_py');
        expect(jsPatterns).not.toHaveProperty('mutable_globals_py');
      });
    });
  });
});
