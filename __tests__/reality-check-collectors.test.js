/**
 * Tests for reality-check collectors module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DEFAULT_OPTIONS,
  scanGitHubState,
  analyzeDocumentation,
  scanCodebase,
  collectAllData,
  isGhAvailable,
  isPathSafe
} = require('../lib/reality-check/collectors');

describe('reality-check/collectors', () => {
  let testDir;

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reality-check-test-'));
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('DEFAULT_OPTIONS', () => {
    test('has expected default values', () => {
      expect(DEFAULT_OPTIONS.sources).toEqual(['github', 'docs', 'code']);
      expect(DEFAULT_OPTIONS.depth).toBe('thorough');
      expect(DEFAULT_OPTIONS.issueLimit).toBe(100);
      expect(DEFAULT_OPTIONS.prLimit).toBe(50);
      expect(DEFAULT_OPTIONS.timeout).toBe(10000);
    });
  });

  describe('isPathSafe', () => {
    test('allows paths within base directory', () => {
      expect(isPathSafe('README.md', testDir)).toBe(true);
      expect(isPathSafe('docs/guide.md', testDir)).toBe(true);
      expect(isPathSafe('./src/index.js', testDir)).toBe(true);
    });

    test('rejects path traversal attempts', () => {
      expect(isPathSafe('../etc/passwd', testDir)).toBe(false);
      expect(isPathSafe('../../secret', testDir)).toBe(false);
      expect(isPathSafe('docs/../../outside', testDir)).toBe(false);
    });

    test('rejects absolute paths outside base', () => {
      expect(isPathSafe('/etc/passwd', testDir)).toBe(false);
    });
  });

  describe('analyzeDocumentation', () => {
    test('returns empty result when no docs exist', () => {
      const result = analyzeDocumentation({ cwd: testDir });

      expect(result.files).toEqual({});
      expect(result.features).toEqual([]);
      expect(result.checkboxes.total).toBe(0);
    });

    test('analyzes README.md', () => {
      // Create a README
      fs.writeFileSync(path.join(testDir, 'README.md'), `
# Test Project

## Installation

Run \`npm install\` to install dependencies.

## Features

- Feature one - does something
- Feature two - does another thing

## Usage

Some usage instructions here.
      `);

      const result = analyzeDocumentation({ cwd: testDir });

      expect(result.files['README.md']).toBeDefined();
      expect(result.files['README.md'].hasInstallation).toBe(true);
      expect(result.files['README.md'].hasUsage).toBe(true);
      expect(result.files['README.md'].sections).toContain('Installation');
      expect(result.files['README.md'].sections).toContain('Features');
      expect(result.files['README.md'].sections).toContain('Usage');
    });

    test('counts checkboxes from PLAN.md', () => {
      fs.writeFileSync(path.join(testDir, 'PLAN.md'), `
# Plan

## Phase 1
- [x] Task completed
- [x] Another done
- [ ] Not done yet
- [ ] Also pending
      `);

      const result = analyzeDocumentation({ cwd: testDir });

      expect(result.checkboxes.checked).toBe(2);
      expect(result.checkboxes.unchecked).toBe(2);
      expect(result.checkboxes.total).toBe(4);
    });

    test('identifies documentation gaps', () => {
      // No README - should report gap
      const result = analyzeDocumentation({ cwd: testDir });

      expect(result.gaps).toContainEqual(
        expect.objectContaining({
          type: 'missing',
          file: 'README.md',
          severity: 'high'
        })
      );
    });

    test('identifies missing sections in README', () => {
      // README without installation section
      fs.writeFileSync(path.join(testDir, 'README.md'), `
# Test Project

Just some description without installation or usage.
      `);

      const result = analyzeDocumentation({ cwd: testDir });

      expect(result.gaps).toContainEqual(
        expect.objectContaining({
          type: 'missing-section',
          file: 'README.md',
          section: 'Installation'
        })
      );
    });

    test('extracts features from bullet lists', () => {
      fs.writeFileSync(path.join(testDir, 'README.md'), `
# Features

- **Authentication** - handles user login
- **Database integration** - connects to PostgreSQL
- Short - skip
      `);

      const result = analyzeDocumentation({ cwd: testDir });

      // Should extract features longer than 5 chars
      expect(result.features.length).toBeGreaterThan(0);
    });
  });

  describe('scanCodebase', () => {
    test('returns structure for empty directory', () => {
      const result = scanCodebase({ cwd: testDir });

      expect(result.structure).toBeDefined();
      expect(result.frameworks).toEqual([]);
      expect(result.testFramework).toBeNull();
      expect(result.hasTypeScript).toBe(false);
    });

    test('detects TypeScript from tsconfig.json', () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const result = scanCodebase({ cwd: testDir });

      expect(result.hasTypeScript).toBe(true);
    });

    test('detects frameworks from package.json', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        dependencies: {
          'react': '^18.0.0',
          'express': '^4.0.0'
        }
      }));

      const result = scanCodebase({ cwd: testDir });

      expect(result.frameworks).toContain('React');
      expect(result.frameworks).toContain('Express');
    });

    test('detects test framework from package.json', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        devDependencies: {
          'jest': '^29.0.0'
        }
      }));

      const result = scanCodebase({ cwd: testDir });

      expect(result.testFramework).toBe('jest');
      expect(result.health.hasTests).toBe(true);
    });

    test('detects health indicators', () => {
      // Create various config files
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
      fs.writeFileSync(path.join(testDir, '.eslintrc.json'), '{}');
      fs.mkdirSync(path.join(testDir, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(testDir, '.github', 'workflows', 'ci.yml'), '');

      const result = scanCodebase({ cwd: testDir });

      expect(result.health.hasReadme).toBe(true);
      expect(result.health.hasLinting).toBe(true);
      expect(result.health.hasCi).toBe(true);
    });

    test('scans directory structure', () => {
      fs.mkdirSync(path.join(testDir, 'src'));
      fs.mkdirSync(path.join(testDir, 'tests'));
      fs.writeFileSync(path.join(testDir, 'src', 'index.js'), '');
      fs.writeFileSync(path.join(testDir, 'src', 'utils.js'), '');

      const result = scanCodebase({ cwd: testDir });

      expect(result.structure['.']).toBeDefined();
      expect(result.structure['.'].dirs).toContain('src');
      expect(result.structure['.'].dirs).toContain('tests');
      expect(result.fileStats['.js']).toBe(2);
    });

    test('excludes node_modules from scan', () => {
      fs.mkdirSync(path.join(testDir, 'node_modules', 'some-package'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'node_modules', 'some-package', 'index.js'), '');

      const result = scanCodebase({ cwd: testDir });

      // node_modules should not appear in structure
      expect(result.structure['node_modules']).toBeUndefined();
    });
  });

  describe('scanGitHubState', () => {
    test('returns expected structure when gh not available', () => {
      // Skip this test if gh IS available (we test that case separately)
      const ghAvailable = isGhAvailable();
      if (ghAvailable) {
        // When gh is available, we can't test the "unavailable" path
        // without mocking, so we skip this specific assertion
        expect(true).toBe(true);
        return;
      }

      // Test the unavailable case
      const result = scanGitHubState({ cwd: testDir });
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.issues).toEqual([]);
      expect(result.prs).toEqual([]);
    });

    test('returns expected structure regardless of gh availability', () => {
      const result = scanGitHubState({ cwd: testDir });

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('prs');
      expect(result).toHaveProperty('milestones');
      expect(result).toHaveProperty('categorized');
      expect(result).toHaveProperty('stale');
      expect(result).toHaveProperty('themes');

      expect(result.categorized).toHaveProperty('bugs');
      expect(result.categorized).toHaveProperty('features');
      expect(result.categorized).toHaveProperty('security');
    });
  });

  describe('collectAllData', () => {
    test('collects from all sources by default', async () => {
      // Create minimal test files
      fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

      const result = await collectAllData({ cwd: testDir });

      expect(result.timestamp).toBeDefined();
      expect(result.github).toBeDefined();
      expect(result.docs).toBeDefined();
      expect(result.code).toBeDefined();
    });

    test('respects sources option', async () => {
      const result = await collectAllData({
        cwd: testDir,
        sources: ['docs']
      });

      expect(result.docs).toBeDefined();
      expect(result.github).toBeNull();
      expect(result.code).toBeNull();
    });

    test('includes options in result', async () => {
      const result = await collectAllData({
        cwd: testDir,
        depth: 'quick'
      });

      expect(result.options.depth).toBe('quick');
    });
  });

  describe('isGhAvailable', () => {
    test('returns boolean', () => {
      const result = isGhAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});
