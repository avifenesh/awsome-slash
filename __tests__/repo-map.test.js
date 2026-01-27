/**
 * Tests for repo-map cache utilities
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const cache = require('../lib/repo-map/cache');
const repoMap = require('../lib/repo-map');

describe('repo-map cache', () => {
  let tempDir;
  const originalStateDir = process.env.AI_STATE_DIR;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-test-'));
    process.env.AI_STATE_DIR = '.test-state';
  });

  afterAll(() => {
    process.env.AI_STATE_DIR = originalStateDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('save and load map', () => {
    const map = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      git: { commit: 'abc123', branch: 'main' },
      project: { languages: ['javascript'] },
      stats: { totalFiles: 0, totalSymbols: 0 },
      files: {},
      dependencies: {}
    };

    cache.save(tempDir, map);
    const loaded = cache.load(tempDir);

    expect(loaded).toBeTruthy();
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.updated).toBeDefined();
  });

  test('mark and clear stale', () => {
    cache.markStale(tempDir);
    expect(cache.isMarkedStale(tempDir)).toBe(true);

    cache.clearStale(tempDir);
    expect(cache.isMarkedStale(tempDir)).toBe(false);
  });

  test('summarizeForDrift and findEvidence', () => {
    const map = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      git: { commit: 'abc123', branch: 'main' },
      project: { languages: ['javascript'] },
      stats: { totalFiles: 2, totalSymbols: 4 },
      files: {
        'src/auth/login.js': {
          symbols: {
            exports: [{ name: 'loginUser' }],
            functions: [{ name: 'loginUser' }],
            classes: [],
            types: [],
            constants: []
          }
        },
        'src/payments/index.js': {
          symbols: {
            exports: [{ name: 'charge' }],
            functions: [{ name: 'charge' }],
            classes: [],
            types: [],
            constants: []
          }
        }
      },
      dependencies: {
        'src/auth/login.js': ['./session'],
        'src/payments/index.js': ['./gateway']
      }
    };

    cache.save(tempDir, map);

    const summary = repoMap.summarizeForDrift(tempDir, {
      maxFiles: 1,
      maxSymbolsPerType: 1,
      maxDependenciesPerFile: 1
    });

    expect(summary.available).toBe(true);
    expect(Object.keys(summary.symbols).length).toBe(1);
    const fileKey = Object.keys(summary.symbols)[0];
    expect(summary.dependencies[fileKey].length).toBeLessThanOrEqual(1);

    const evidence = repoMap.findEvidence(tempDir, ['auth login', 'payment'], {
      maxMatchesPerTerm: 1,
      maxSymbolsPerMatch: 1
    });

    expect(evidence.available).toBe(true);
    expect(evidence.terms.length).toBeGreaterThan(0);
  });

  test('findFeatureEvidence returns def + usage evidence', () => {
    const authDir = path.join(tempDir, 'src', 'auth');
    const appDir = path.join(tempDir, 'src');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(path.join(authDir, 'login.js'), 'function loginUser() {}\nexport { loginUser };', 'utf8');
    fs.writeFileSync(path.join(appDir, 'app.js'), "import { loginUser } from './auth/login';\nloginUser();", 'utf8');

    const map = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      git: { commit: 'abc123', branch: 'main' },
      project: { languages: ['javascript'] },
      stats: { totalFiles: 2, totalSymbols: 2 },
      files: {
        'src/auth/login.js': {
          symbols: {
            exports: [{ name: 'loginUser', line: 1 }],
            functions: [{ name: 'loginUser', line: 1 }],
            classes: [],
            types: [],
            constants: []
          }
        },
        'src/app.js': {
          symbols: {
            exports: [],
            functions: [],
            classes: [],
            types: [],
            constants: []
          }
        }
      },
      dependencies: {
        'src/app.js': ['./auth/login']
      }
    };

    cache.save(tempDir, map);

    const featureEvidence = repoMap.findFeatureEvidence(tempDir, ['login user'], {
      maxDefsPerFeature: 2,
      maxRefsPerFeature: 2
    });

    expect(featureEvidence.available).toBe(true);
    expect(featureEvidence.features.length).toBeGreaterThan(0);
    expect(featureEvidence.features[0].status).toBe('implemented');
  });
});
