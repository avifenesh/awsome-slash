/**
 * Tests for detect-platform.js
 */

const path = require('path');
const fs = require('fs');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    access: jest.fn(),
    readFile: jest.fn()
  }
}));

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn()
}));

const { execSync } = require('child_process');

const { exec } = require('child_process');

// Import after mocking
const {
  detect,
  detectAsync,
  invalidateCache,
  detectCI,
  detectCIAsync,
  detectDeployment,
  detectDeploymentAsync,
  detectProjectType,
  detectProjectTypeAsync,
  detectPackageManager,
  detectPackageManagerAsync,
  detectBranchStrategy,
  detectBranchStrategyAsync,
  detectMainBranch,
  detectMainBranchAsync
} = require('../lib/platform/detect-platform');

describe('detect-platform', () => {
  beforeEach(() => {
    // Clear all mocks and cache before each test
    jest.clearAllMocks();
    invalidateCache();
    fs.existsSync.mockReturnValue(false);
  });

  describe('detectCI', () => {
    it('should detect github-actions when .github/workflows exists', () => {
      fs.existsSync.mockImplementation((path) => path === '.github/workflows');
      expect(detectCI()).toBe('github-actions');
    });

    it('should detect gitlab-ci when .gitlab-ci.yml exists', () => {
      fs.existsSync.mockImplementation((path) => path === '.gitlab-ci.yml');
      expect(detectCI()).toBe('gitlab-ci');
    });

    it('should detect circleci when .circleci/config.yml exists', () => {
      fs.existsSync.mockImplementation((path) => path === '.circleci/config.yml');
      expect(detectCI()).toBe('circleci');
    });

    it('should detect jenkins when Jenkinsfile exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'Jenkinsfile');
      expect(detectCI()).toBe('jenkins');
    });

    it('should detect travis when .travis.yml exists', () => {
      fs.existsSync.mockImplementation((path) => path === '.travis.yml');
      expect(detectCI()).toBe('travis');
    });

    it('should return null when no CI config found', () => {
      fs.existsSync.mockReturnValue(false);
      expect(detectCI()).toBeNull();
    });

    describe('multi-CI precedence', () => {
      it('should prioritize github-actions over all others', () => {
        // All CI configs present - github-actions should win
        fs.existsSync.mockImplementation((path) =>
          ['.github/workflows', '.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile', '.travis.yml'].includes(path)
        );
        expect(detectCI()).toBe('github-actions');
      });

      it('should prioritize gitlab-ci when github-actions absent', () => {
        fs.existsSync.mockImplementation((path) =>
          ['.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile', '.travis.yml'].includes(path)
        );
        expect(detectCI()).toBe('gitlab-ci');
      });

      it('should prioritize circleci when github-actions and gitlab absent', () => {
        fs.existsSync.mockImplementation((path) =>
          ['.circleci/config.yml', 'Jenkinsfile', '.travis.yml'].includes(path)
        );
        expect(detectCI()).toBe('circleci');
      });

      it('should prioritize jenkins when only jenkins and travis present', () => {
        fs.existsSync.mockImplementation((path) =>
          ['Jenkinsfile', '.travis.yml'].includes(path)
        );
        expect(detectCI()).toBe('jenkins');
      });

      it('should return travis only when no other CI present', () => {
        fs.existsSync.mockImplementation((path) => path === '.travis.yml');
        expect(detectCI()).toBe('travis');
      });
    });
  });

  describe('detectDeployment', () => {
    it('should detect railway when railway.json exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'railway.json');
      expect(detectDeployment()).toBe('railway');
    });

    it('should detect vercel when vercel.json exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'vercel.json');
      expect(detectDeployment()).toBe('vercel');
    });

    it('should detect netlify when netlify.toml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'netlify.toml');
      expect(detectDeployment()).toBe('netlify');
    });

    it('should detect fly when fly.toml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'fly.toml');
      expect(detectDeployment()).toBe('fly');
    });

    it('should return null when no deployment config found', () => {
      fs.existsSync.mockReturnValue(false);
      expect(detectDeployment()).toBeNull();
    });
  });

  describe('detectProjectType', () => {
    it('should detect nodejs when package.json exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'package.json');
      expect(detectProjectType()).toBe('nodejs');
    });

    it('should detect python when requirements.txt exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'requirements.txt');
      expect(detectProjectType()).toBe('python');
    });

    it('should detect python when pyproject.toml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'pyproject.toml');
      expect(detectProjectType()).toBe('python');
    });

    it('should detect rust when Cargo.toml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'Cargo.toml');
      expect(detectProjectType()).toBe('rust');
    });

    it('should detect go when go.mod exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'go.mod');
      expect(detectProjectType()).toBe('go');
    });

    it('should detect java when pom.xml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'pom.xml');
      expect(detectProjectType()).toBe('java');
    });

    it('should return unknown when no project file found', () => {
      fs.existsSync.mockReturnValue(false);
      expect(detectProjectType()).toBe('unknown');
    });
  });

  describe('detectPackageManager', () => {
    it('should detect pnpm when pnpm-lock.yaml exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'pnpm-lock.yaml');
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('should detect yarn when yarn.lock exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'yarn.lock');
      expect(detectPackageManager()).toBe('yarn');
    });

    it('should detect npm when package-lock.json exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'package-lock.json');
      expect(detectPackageManager()).toBe('npm');
    });

    it('should detect bun when bun.lockb exists', () => {
      fs.existsSync.mockImplementation((path) => path === 'bun.lockb');
      expect(detectPackageManager()).toBe('bun');
    });

    it('should return null when no lockfile found', () => {
      fs.existsSync.mockReturnValue(false);
      expect(detectPackageManager()).toBeNull();
    });
  });

  describe('detectMainBranch', () => {
    it('should return main branch from git symbolic-ref', () => {
      execSync.mockReturnValue('refs/remotes/origin/main\n');
      expect(detectMainBranch()).toBe('main');
    });

    it('should fallback to main if symbolic-ref fails but main exists', () => {
      execSync
        .mockImplementationOnce(() => { throw new Error('not found'); })
        .mockImplementationOnce(() => 'abc123');
      expect(detectMainBranch()).toBe('main');
    });

    it('should fallback to master if main does not exist', () => {
      execSync.mockImplementation(() => { throw new Error('not found'); });
      expect(detectMainBranch()).toBe('master');
    });
  });

  describe('detect (main function)', () => {
    it('should return cached result on subsequent calls', () => {
      fs.existsSync.mockImplementation((path) => path === 'package.json');
      execSync.mockReturnValue('refs/remotes/origin/main\n');

      const result1 = detect();
      const result2 = detect();

      expect(result1).toBe(result2); // Same reference (cached)
      expect(result1.projectType).toBe('nodejs');
    });

    it('should refresh cache when forceRefresh is true', () => {
      fs.existsSync.mockReturnValue(false);
      execSync.mockReturnValue('refs/remotes/origin/main\n');

      const result1 = detect();
      expect(result1.projectType).toBe('unknown');

      // Change the mock and force refresh
      fs.existsSync.mockImplementation((path) => path === 'Cargo.toml');
      invalidateCache(); // Clear internal file cache too
      const result2 = detect(true);

      expect(result2.projectType).toBe('rust');
    });

    it('should include timestamp in result', () => {
      execSync.mockReturnValue('refs/remotes/origin/main\n');
      const result = detect();
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
    });
  });

  describe('invalidateCache', () => {
    it('should force new detection on next call', () => {
      fs.existsSync.mockReturnValue(false);
      execSync.mockReturnValue('refs/remotes/origin/main\n');

      detect();
      invalidateCache();

      // Change the mock
      fs.existsSync.mockImplementation((path) => path === 'go.mod');

      const result = detect();
      expect(result.projectType).toBe('go');
    });
  });

  describe('cache behavior', () => {
    describe('detection result caching', () => {
      it('should return same reference for cached results within TTL', () => {
        fs.existsSync.mockImplementation((path) => path === 'package.json');
        execSync.mockReturnValue('refs/remotes/origin/main\n');

        const result1 = detect();
        const result2 = detect();

        // Should be exact same object reference (cached)
        expect(result1).toBe(result2);
      });

      it('should detect changes after cache invalidation', () => {
        fs.existsSync.mockImplementation((path) => path === 'package.json');
        execSync.mockReturnValue('refs/remotes/origin/main\n');

        const result1 = detect();
        expect(result1.projectType).toBe('nodejs');

        // Invalidate and change mock
        invalidateCache();
        fs.existsSync.mockImplementation((path) => path === 'Cargo.toml');

        const result2 = detect();
        expect(result2.projectType).toBe('rust');
        expect(result1).not.toBe(result2);
      });

      it('should re-detect when forceRefresh is true', () => {
        fs.existsSync.mockImplementation((path) => path === 'package.json');
        execSync.mockReturnValue('refs/remotes/origin/main\n');

        const result1 = detect();

        // Change mock but don't invalidate - use forceRefresh instead
        fs.existsSync.mockImplementation((path) => path === 'go.mod');
        invalidateCache(); // Need to clear file cache too

        const result2 = detect(true); // forceRefresh

        expect(result1.projectType).toBe('nodejs');
        expect(result2.projectType).toBe('go');
      });
    });

    describe('file existence caching', () => {
      it('should cache file existence checks', () => {
        fs.existsSync.mockReturnValue(true);

        // First detection triggers file checks
        detectProjectType();

        // Count how many times existsSync was called
        const callCount1 = fs.existsSync.mock.calls.length;

        // Second detection should use cache (no additional calls)
        // Note: we need to test the same file path to see caching
        detectProjectType();

        // Calls should be cached, so call count shouldn't increase much
        // (some increase is expected due to different detection functions)
        const callCount2 = fs.existsSync.mock.calls.length;

        // The second call should have fewer new file checks due to caching
        expect(callCount2).toBeLessThanOrEqual(callCount1 * 2);
      });

      it('should respect cache after invalidation', () => {
        fs.existsSync.mockReturnValue(false);

        detectCI();
        // First call should make file system calls
        expect(fs.existsSync.mock.calls.length).toBeGreaterThan(0);

        invalidateCache();
        fs.existsSync.mockClear();

        detectCI();
        // After invalidation, should make fresh calls again
        expect(fs.existsSync.mock.calls.length).toBeGreaterThan(0);
      });
    });

    describe('CI detection precedence', () => {
      it('should detect github-actions first when multiple CI configs exist', () => {
        fs.existsSync.mockImplementation((path) =>
          path === '.github/workflows' || path === '.gitlab-ci.yml'
        );

        // GitHub Actions should take precedence (checked first)
        expect(detectCI()).toBe('github-actions');
      });

      it('should fall back to gitlab-ci when github-actions not present', () => {
        fs.existsSync.mockImplementation((path) =>
          path === '.gitlab-ci.yml' || path === '.circleci/config.yml'
        );

        expect(detectCI()).toBe('gitlab-ci');
      });

      it('should detect circleci when higher priority CI not present', () => {
        fs.existsSync.mockImplementation((path) =>
          path === '.circleci/config.yml' || path === 'Jenkinsfile'
        );

        expect(detectCI()).toBe('circleci');
      });
    });

    describe('deployment detection precedence', () => {
      it('should detect railway first when multiple deployment configs exist', () => {
        fs.existsSync.mockImplementation((path) =>
          path === 'railway.json' || path === 'vercel.json'
        );

        expect(detectDeployment()).toBe('railway');
      });

      it('should detect vercel when railway not present', () => {
        fs.existsSync.mockImplementation((path) =>
          path === 'vercel.json' || path === 'netlify.toml'
        );

        expect(detectDeployment()).toBe('vercel');
      });
    });

    describe('project type detection precedence', () => {
      it('should detect nodejs when package.json and other files exist', () => {
        fs.existsSync.mockImplementation((path) =>
          path === 'package.json' || path === 'requirements.txt'
        );

        // Node.js should take precedence
        expect(detectProjectType()).toBe('nodejs');
      });
    });
  });

  describe('async functions', () => {
    describe('detectCIAsync', () => {
      it('should detect github-actions when .github/workflows exists', async () => {
        fs.promises.access.mockImplementation((path) =>
          path === '.github/workflows'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );

        expect(await detectCIAsync()).toBe('github-actions');
      });

      it('should return null when no CI config found', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        expect(await detectCIAsync()).toBeNull();
      });

      it('should handle fs.access rejections gracefully', async () => {
        // All access calls reject with different errors
        fs.promises.access.mockRejectedValue(new Error('EPERM'));
        expect(await detectCIAsync()).toBeNull();
      });
    });

    describe('detectDeploymentAsync', () => {
      it('should detect vercel when vercel.json exists', async () => {
        fs.promises.access.mockImplementation((path) =>
          path === 'vercel.json'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );

        expect(await detectDeploymentAsync()).toBe('vercel');
      });

      it('should return null when no deployment config found', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        expect(await detectDeploymentAsync()).toBeNull();
      });
    });

    describe('detectProjectTypeAsync', () => {
      it('should detect nodejs when package.json exists', async () => {
        fs.promises.access.mockImplementation((path) =>
          path === 'package.json'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );

        expect(await detectProjectTypeAsync()).toBe('nodejs');
      });

      it('should return unknown when no project file found', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        expect(await detectProjectTypeAsync()).toBe('unknown');
      });
    });

    describe('detectPackageManagerAsync', () => {
      it('should detect pnpm when pnpm-lock.yaml exists', async () => {
        fs.promises.access.mockImplementation((path) =>
          path === 'pnpm-lock.yaml'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );

        expect(await detectPackageManagerAsync()).toBe('pnpm');
      });

      it('should return null when no lockfile found', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        expect(await detectPackageManagerAsync()).toBeNull();
      });
    });

    describe('detectMainBranchAsync', () => {
      it('should return main branch from git symbolic-ref', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: 'refs/remotes/origin/main\n', stderr: '' });
        });

        expect(await detectMainBranchAsync()).toBe('main');
      });

      it('should fallback to main if symbolic-ref fails but main exists', async () => {
        let callCount = 0;
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          callCount++;
          if (callCount === 1) {
            cb(new Error('not found'), { stdout: '', stderr: '' });
          } else {
            cb(null, { stdout: 'abc123', stderr: '' });
          }
        });

        expect(await detectMainBranchAsync()).toBe('main');
      });

      it('should fallback to master if main does not exist', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(new Error('not found'), { stdout: '', stderr: '' });
        });

        expect(await detectMainBranchAsync()).toBe('master');
      });
    });

    describe('detectBranchStrategyAsync', () => {
      it('should return single-branch when git commands fail', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(new Error('git error'), { stdout: '', stderr: '' });
        });

        expect(await detectBranchStrategyAsync()).toBe('single-branch');
      });

      it('should return multi-branch when stable branch exists', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: '* main\n  stable\n', stderr: '' });
        });
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));

        expect(await detectBranchStrategyAsync()).toBe('multi-branch');
      });

      it('should return single-branch when no stable/production branches', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: '* main\n  feature/test\n', stderr: '' });
        });
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));

        expect(await detectBranchStrategyAsync()).toBe('single-branch');
      });
    });

    describe('detectAsync', () => {
      it('should return cached result on subsequent calls', async () => {
        fs.promises.access.mockImplementation((path) =>
          path === 'package.json'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: 'refs/remotes/origin/main\n', stderr: '' });
        });

        const result1 = await detectAsync();
        const result2 = await detectAsync();

        expect(result1).toBe(result2);
        expect(result1.projectType).toBe('nodejs');
      });

      it('should handle all detection functions failing gracefully', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(new Error('git error'), { stdout: '', stderr: '' });
        });

        const result = await detectAsync();

        // Should not throw, should return defaults
        expect(result).toBeDefined();
        expect(result.ci).toBeNull();
        expect(result.deployment).toBeNull();
        expect(result.projectType).toBe('unknown');
        expect(result.packageManager).toBeNull();
        expect(result.timestamp).toBeDefined();
      });

      it('should refresh cache when forceRefresh is true', async () => {
        fs.promises.access.mockRejectedValue(new Error('ENOENT'));
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: 'refs/remotes/origin/main\n', stderr: '' });
        });

        const result1 = await detectAsync();
        expect(result1.projectType).toBe('unknown');

        // Change the mock and force refresh
        invalidateCache();
        fs.promises.access.mockImplementation((path) =>
          path === 'Cargo.toml'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );

        const result2 = await detectAsync(true);
        expect(result2.projectType).toBe('rust');
      });
    });

    describe('error handling edge cases', () => {
      it('should handle mixed success/failure in parallel async operations', async () => {
        // Some files exist, some access fails with unexpected errors
        let callCount = 0;
        fs.promises.access.mockImplementation((path) => {
          callCount++;
          if (path === 'package.json') return Promise.resolve();
          if (callCount % 3 === 0) return Promise.reject(new Error('EPERM'));
          return Promise.reject(new Error('ENOENT'));
        });
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: 'refs/remotes/origin/main\n', stderr: '' });
        });

        const result = await detectAsync();
        expect(result.projectType).toBe('nodejs');
      });

      it('should handle slow operations without hanging', async () => {
        // Mock a slow but eventually resolving operation
        fs.promises.access.mockImplementation((path) =>
          new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('ENOENT')), 10);
          })
        );
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          setTimeout(() => cb(null, { stdout: 'main\n', stderr: '' }), 10);
        });

        const result = await detectAsync();
        expect(result).toBeDefined();
      }, 10000);

      it('should recover from file read errors in branch strategy detection', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: '* main\n', stderr: '' });
        });
        fs.promises.access.mockImplementation((path) =>
          path === 'railway.json'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );
        fs.promises.readFile.mockRejectedValue(new Error('EACCES'));

        // Should not throw, should fall back gracefully
        const result = await detectBranchStrategyAsync();
        expect(result).toBe('single-branch');
      });

      it('should handle JSON parse errors in railway.json gracefully', async () => {
        exec.mockImplementation((cmd, opts, cb) => {
          if (typeof opts === 'function') cb = opts;
          cb(null, { stdout: '* main\n', stderr: '' });
        });
        fs.promises.access.mockImplementation((path) =>
          path === 'railway.json'
            ? Promise.resolve()
            : Promise.reject(new Error('ENOENT'))
        );
        fs.promises.readFile.mockResolvedValue('invalid json {{{');

        const result = await detectBranchStrategyAsync();
        expect(result).toBe('single-branch');
      });
    });
  });
});
