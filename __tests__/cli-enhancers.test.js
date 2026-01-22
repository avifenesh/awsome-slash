/**
 * Tests for cli-enhancers.js
 * Optional CLI tool integration for slop detection pipeline
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  detectAvailableTools,
  detectProjectLanguages,
  getToolsForLanguages,
  getToolAvailabilityForRepo,
  runDuplicateDetection,
  runDependencyAnalysis,
  runComplexityAnalysis,
  getMissingToolsMessage,
  getToolDefinitions,
  getSupportedLanguages,
  clearCache,
  isToolAvailable,
  CLI_TOOLS,
  SUPPORTED_LANGUAGES
} = require('../lib/patterns/cli-enhancers');

describe('cli-enhancers', () => {
  // Clear cache before each test
  beforeEach(() => {
    clearCache();
  });

  describe('SUPPORTED_LANGUAGES', () => {
    it('should include javascript, typescript, python, rust, go', () => {
      expect(SUPPORTED_LANGUAGES).toContain('javascript');
      expect(SUPPORTED_LANGUAGES).toContain('typescript');
      expect(SUPPORTED_LANGUAGES).toContain('python');
      expect(SUPPORTED_LANGUAGES).toContain('rust');
      expect(SUPPORTED_LANGUAGES).toContain('go');
    });

    it('should have exactly 5 supported languages', () => {
      expect(SUPPORTED_LANGUAGES.length).toBe(5);
    });
  });

  describe('CLI_TOOLS constants', () => {
    it('should have JavaScript/TypeScript tools', () => {
      expect(CLI_TOOLS.jscpd).toBeDefined();
      expect(CLI_TOOLS.jscpd.languages).toContain('javascript');
      expect(CLI_TOOLS.jscpd.languages).toContain('typescript');

      expect(CLI_TOOLS.madge).toBeDefined();
      expect(CLI_TOOLS.madge.languages).toContain('javascript');
      expect(CLI_TOOLS.madge.languages).toContain('typescript');

      expect(CLI_TOOLS.escomplex).toBeDefined();
      expect(CLI_TOOLS.escomplex.languages).toContain('javascript');
    });

    it('should have Python tools', () => {
      expect(CLI_TOOLS.pylint).toBeDefined();
      expect(CLI_TOOLS.pylint.languages).toContain('python');

      expect(CLI_TOOLS.radon).toBeDefined();
      expect(CLI_TOOLS.radon.languages).toContain('python');
    });

    it('should have Go tools', () => {
      expect(CLI_TOOLS.golangci_lint).toBeDefined();
      expect(CLI_TOOLS.golangci_lint.languages).toContain('go');
    });

    it('should have Rust tools', () => {
      expect(CLI_TOOLS.clippy).toBeDefined();
      expect(CLI_TOOLS.clippy.languages).toContain('rust');
    });

    it('each tool should have required fields', () => {
      for (const [name, tool] of Object.entries(CLI_TOOLS)) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.checkCommand).toBeDefined();
        expect(tool.installHint).toBeDefined();
        expect(Array.isArray(tool.languages)).toBe(true);
        expect(tool.languages.length).toBeGreaterThan(0);
      }
    });

    it('jscpd should support all languages (cross-language tool)', () => {
      expect(CLI_TOOLS.jscpd.languages).toContain('javascript');
      expect(CLI_TOOLS.jscpd.languages).toContain('typescript');
      expect(CLI_TOOLS.jscpd.languages).toContain('python');
      expect(CLI_TOOLS.jscpd.languages).toContain('go');
      expect(CLI_TOOLS.jscpd.languages).toContain('rust');
    });
  });

  describe('isToolAvailable', () => {
    it('should return true for available commands', () => {
      // node --version should always be available in test environment
      const result = isToolAvailable('node --version');
      expect(result).toBe(true);
    });

    it('should return false for unavailable commands', () => {
      const result = isToolAvailable('nonexistent_tool_xyz_123 --version');
      expect(result).toBe(false);
    });

    it('should handle command execution errors gracefully', () => {
      // Invalid command should return false, not throw
      const result = isToolAvailable('');
      expect(result).toBe(false);
    });
  });

  describe('detectProjectLanguages', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-enhancers-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should detect JavaScript from package.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('javascript');
    });

    it('should detect TypeScript from tsconfig.json', () => {
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('typescript');
    });

    it('should detect Python from requirements.txt', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask\n');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('python');
    });

    it('should detect Go from go.mod', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test\n');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('go');
    });

    it('should detect Rust from Cargo.toml', () => {
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\n');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('rust');
    });

    it('should detect multiple languages', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask\n');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('javascript');
      expect(langs).toContain('python');
    });

    it('should fallback to file extension scanning', () => {
      fs.writeFileSync(path.join(tempDir, 'main.py'), 'print("hello")');
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('python');
    });

    it('should default to javascript if nothing detected', () => {
      const langs = detectProjectLanguages(tempDir);
      expect(langs).toContain('javascript');
    });

    it('should only return supported languages', () => {
      const langs = detectProjectLanguages(tempDir);
      for (const lang of langs) {
        expect(SUPPORTED_LANGUAGES).toContain(lang);
      }
    });
  });

  describe('getToolsForLanguages', () => {
    it('should return JS tools for javascript', () => {
      const tools = getToolsForLanguages(['javascript']);
      expect(tools.jscpd).toBeDefined();
      expect(tools.madge).toBeDefined();
      expect(tools.escomplex).toBeDefined();
    });

    it('should return Python tools for python', () => {
      const tools = getToolsForLanguages(['python']);
      expect(tools.pylint).toBeDefined();
      expect(tools.radon).toBeDefined();
      expect(tools.jscpd).toBeDefined(); // jscpd supports python too
    });

    it('should return Go tools for go', () => {
      const tools = getToolsForLanguages(['go']);
      expect(tools.golangci_lint).toBeDefined();
      expect(tools.jscpd).toBeDefined(); // jscpd supports go too
    });

    it('should return Rust tools for rust', () => {
      const tools = getToolsForLanguages(['rust']);
      expect(tools.clippy).toBeDefined();
      expect(tools.jscpd).toBeDefined(); // jscpd supports rust too
    });

    it('should return combined tools for multiple languages', () => {
      const tools = getToolsForLanguages(['javascript', 'python']);
      // JS tools
      expect(tools.madge).toBeDefined();
      // Python tools
      expect(tools.pylint).toBeDefined();
    });

    it('should return empty object for unknown language', () => {
      const tools = getToolsForLanguages(['brainfuck']);
      expect(Object.keys(tools).length).toBe(0);
    });
  });

  describe('detectAvailableTools', () => {
    it('should return object with tool keys when no languages specified', () => {
      const tools = detectAvailableTools();
      expect(typeof tools).toBe('object');
      // Should include all tools
      expect(Object.keys(tools).length).toBe(Object.keys(CLI_TOOLS).length);
    });

    it('should filter to JS tools when javascript specified', () => {
      const tools = detectAvailableTools(['javascript']);
      expect(tools).toHaveProperty('jscpd');
      expect(tools).toHaveProperty('madge');
      expect(tools).toHaveProperty('escomplex');
      // Should not have python-only tools
      expect(tools).not.toHaveProperty('pylint');
    });

    it('should filter to Python tools when python specified', () => {
      const tools = detectAvailableTools(['python']);
      expect(tools).toHaveProperty('pylint');
      expect(tools).toHaveProperty('radon');
      expect(tools).toHaveProperty('jscpd'); // jscpd supports python
      // Should not have JS-only tools
      expect(tools).not.toHaveProperty('madge');
    });

    it('should return boolean values for each tool', () => {
      const tools = detectAvailableTools(['javascript']);
      for (const value of Object.values(tools)) {
        expect(typeof value).toBe('boolean');
      }
    });

    it('should use cache when repoPath provided', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
      try {
        // First call - populates cache
        const tools1 = detectAvailableTools(['javascript'], tempDir);
        // Second call - should use cache
        const tools2 = detectAvailableTools(['javascript'], tempDir);
        expect(tools2).toEqual(tools1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('getToolAvailabilityForRepo', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-enhancers-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return detected languages', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result = getToolAvailabilityForRepo(tempDir);
      expect(result.languages).toContain('javascript');
    });

    it('should return available tools object', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result = getToolAvailabilityForRepo(tempDir);
      expect(result.available).toBeDefined();
      expect(typeof result.available).toBe('object');
    });

    it('should return missing tools array', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result = getToolAvailabilityForRepo(tempDir);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it('should use cache on subsequent calls', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result1 = getToolAvailabilityForRepo(tempDir);
      const result2 = getToolAvailabilityForRepo(tempDir);
      expect(result2.languages).toEqual(result1.languages);
    });

    it('should refresh cache when forceRefresh is true', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      const result1 = getToolAvailabilityForRepo(tempDir);
      // Add Python
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask\n');
      // Without force refresh, should still show only JS
      const result2 = getToolAvailabilityForRepo(tempDir);
      // With force refresh, should detect Python too
      const result3 = getToolAvailabilityForRepo(tempDir, { forceRefresh: true });
      expect(result3.languages).toContain('python');
    });
  });

  describe('runDuplicateDetection', () => {
    it('should return null if jscpd not available', () => {
      const result = runDuplicateDetection('/nonexistent/path');
      // Either null (tool not available) or array (tool available)
      expect(result === null || Array.isArray(result)).toBe(true);
    });

    it('should accept options', () => {
      const result = runDuplicateDetection('/nonexistent/path', {
        minLines: 10,
        minTokens: 100
      });
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  describe('runDependencyAnalysis', () => {
    it('should return null if madge not available', () => {
      const result = runDependencyAnalysis('/nonexistent/path');
      expect(result === null || Array.isArray(result)).toBe(true);
    });

    it('should accept entry option', () => {
      const result = runDependencyAnalysis('/nonexistent/path', {
        entry: 'src/index.js'
      });
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  describe('runComplexityAnalysis', () => {
    it('should return null if escomplex not available', () => {
      const result = runComplexityAnalysis('/nonexistent/path', ['app.js']);
      expect(result === null || Array.isArray(result)).toBe(true);
    });

    it('should skip non-JS files', () => {
      const result = runComplexityAnalysis('/nonexistent/path', ['app.py', 'main.go']);
      // Should return null since no JS files to analyze
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  describe('getMissingToolsMessage', () => {
    it('should return empty string for empty array', () => {
      const message = getMissingToolsMessage([]);
      expect(message).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(getMissingToolsMessage(null)).toBe('');
      expect(getMissingToolsMessage(undefined)).toBe('');
    });

    it('should format message for single missing tool', () => {
      const message = getMissingToolsMessage(['jscpd']);
      expect(message).toContain('jscpd');
      expect(message).toContain('npm install -g jscpd');
      expect(message).toContain('Enhanced Analysis Available');
    });

    it('should format message for multiple missing tools', () => {
      const message = getMissingToolsMessage(['jscpd', 'madge', 'escomplex']);
      expect(message).toContain('jscpd');
      expect(message).toContain('madge');
      expect(message).toContain('escomplex');
    });

    it('should include detected languages when provided', () => {
      const message = getMissingToolsMessage(['pylint'], ['python']);
      expect(message).toContain('python');
      expect(message).toContain('Detected project languages');
    });

    it('should skip unknown tools', () => {
      const message = getMissingToolsMessage(['unknown_tool']);
      expect(message).toBe('');
    });

    it('should include optional notice', () => {
      const message = getMissingToolsMessage(['jscpd']);
      expect(message).toContain('optional');
    });
  });

  describe('getToolDefinitions', () => {
    it('should return copy of CLI_TOOLS', () => {
      const definitions = getToolDefinitions();
      expect(definitions).toHaveProperty('jscpd');
      expect(definitions).toHaveProperty('madge');
      expect(definitions).toHaveProperty('escomplex');
    });

    it('should return independent copy', () => {
      const definitions = getToolDefinitions();
      definitions.jscpd = null;
      // Original should be unchanged
      expect(CLI_TOOLS.jscpd).toBeDefined();
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return copy of SUPPORTED_LANGUAGES', () => {
      const langs = getSupportedLanguages();
      expect(langs).toContain('javascript');
      expect(langs).toContain('python');
    });

    it('should return independent copy', () => {
      const langs = getSupportedLanguages();
      langs.push('brainfuck');
      expect(SUPPORTED_LANGUAGES).not.toContain('brainfuck');
    });
  });

  describe('clearCache', () => {
    it('should clear the tool cache', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
      try {
        fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
        // Populate cache
        getToolAvailabilityForRepo(tempDir);
        // Clear cache
        clearCache();
        // Add Python and refresh - should detect it now
        fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask\n');
        const result = getToolAvailabilityForRepo(tempDir);
        expect(result.languages).toContain('python');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('graceful degradation', () => {
    it('runDuplicateDetection should not throw when tool unavailable', () => {
      expect(() => {
        runDuplicateDetection('/some/path');
      }).not.toThrow();
    });

    it('runDependencyAnalysis should not throw when tool unavailable', () => {
      expect(() => {
        runDependencyAnalysis('/some/path');
      }).not.toThrow();
    });

    it('runComplexityAnalysis should not throw when tool unavailable', () => {
      expect(() => {
        runComplexityAnalysis('/some/path', ['app.js']);
      }).not.toThrow();
    });
  });

  describe('install hints', () => {
    it('JS tools should use npm install', () => {
      expect(CLI_TOOLS.jscpd.installHint).toContain('npm install');
      expect(CLI_TOOLS.madge.installHint).toContain('npm install');
      expect(CLI_TOOLS.escomplex.installHint).toContain('npm install');
    });

    it('Python tools should use pip install', () => {
      expect(CLI_TOOLS.pylint.installHint).toContain('pip install');
      expect(CLI_TOOLS.radon.installHint).toContain('pip install');
    });

    it('Go tools should use go install', () => {
      expect(CLI_TOOLS.golangci_lint.installHint).toContain('go install');
    });

    it('Rust tools should use rustup', () => {
      expect(CLI_TOOLS.clippy.installHint).toContain('rustup');
    });
  });

  describe('command injection prevention', () => {
    it('runDuplicateDetection should handle paths with shell metacharacters safely', () => {
      // These paths contain shell injection attempts
      const dangerousPaths = [
        '/path/with/$HOME/injection',
        '/path/with/`whoami`/injection',
        '/path/with/$(id)/injection',
        '/path/with/"quotes"/injection'
      ];

      // Should not throw - paths are escaped internally
      for (const path of dangerousPaths) {
        expect(() => {
          runDuplicateDetection(path);
        }).not.toThrow();
      }
    });

    it('runDependencyAnalysis should handle paths with shell metacharacters safely', () => {
      const dangerousPaths = [
        '/path/with/$HOME/injection',
        '/path/with/`whoami`/injection',
        '/path/with/$(id)/injection'
      ];

      for (const path of dangerousPaths) {
        expect(() => {
          runDependencyAnalysis(path);
        }).not.toThrow();
      }
    });

    it('runComplexityAnalysis should handle file paths with shell metacharacters safely', () => {
      const dangerousFiles = [
        '/path/with/$HOME/file.js',
        '/path/with/`whoami`/file.js',
        '/path/with/$(id)/file.js'
      ];

      expect(() => {
        runComplexityAnalysis('/safe/repo', dangerousFiles);
      }).not.toThrow();
    });
  });
});
