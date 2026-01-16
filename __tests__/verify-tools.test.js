/**
 * Tests for verify-tools.js
 */

// Mock child_process
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  spawnSync: jest.fn(),
  spawn: jest.fn()
}));

const { execFileSync, spawnSync, spawn } = require('child_process');
const { EventEmitter } = require('events');

const {
  checkTool,
  checkToolAsync,
  verifyTools,
  verifyToolsAsync,
  TOOL_DEFINITIONS
} = require('../lib/platform/verify-tools');

describe('verify-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkTool (sync)', () => {
    const isWindows = process.platform === 'win32';

    it('should return available: true with version when tool exists', () => {
      if (isWindows) {
        spawnSync.mockReturnValue({
          stdout: 'git version 2.40.0\n',
          status: 0
        });
      } else {
        execFileSync.mockReturnValue('git version 2.40.0\n');
      }

      const result = checkTool('git');
      expect(result.available).toBe(true);
      expect(result.version).toBe('git version 2.40.0');
    });

    it('should return available: false when tool does not exist', () => {
      if (isWindows) {
        spawnSync.mockReturnValue({
          error: new Error('not found'),
          status: 1
        });
      } else {
        execFileSync.mockImplementation(() => { throw new Error('not found'); });
      }

      const result = checkTool('nonexistent');
      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });

    it('should reject commands with invalid characters', () => {
      const result = checkTool('rm -rf /');
      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it('should reject version flags with invalid characters', () => {
      const result = checkTool('git', '--version; rm -rf /');
      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
      expect(execFileSync).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
    });

    describe('comprehensive command injection patterns', () => {
      const dangerousPatterns = [
        // Newlines
        { pattern: 'cmd\n', name: 'LF newline' },
        { pattern: 'cmd\r', name: 'CR carriage return' },
        { pattern: 'cmd\r\n', name: 'CRLF Windows newline' },
        // Null bytes
        { pattern: 'cmd\x00', name: 'null byte' },
        // Path traversal
        { pattern: '../../../bin/sh', name: 'Unix path traversal' },
        { pattern: '..\\..\\cmd.exe', name: 'Windows path traversal' },
        // Command substitution
        { pattern: 'cmd`whoami`', name: 'backtick command substitution' },
        { pattern: 'cmd$(ls)', name: 'dollar-paren substitution' },
        { pattern: 'cmd"$(ls)"', name: 'quoted command substitution' },
        // Quote escaping
        { pattern: "cmd'test", name: 'single quote' },
        { pattern: 'cmd"test', name: 'double quote' },
        // Additional metacharacters
        { pattern: 'cmd|cat', name: 'pipe' },
        { pattern: 'cmd||true', name: 'OR operator' },
        { pattern: 'cmd&&echo', name: 'AND operator' },
        { pattern: 'cmd>file', name: 'output redirection' },
        { pattern: 'cmd<file', name: 'input redirection' },
        { pattern: 'cmd $VAR', name: 'variable expansion' },
        { pattern: 'cmd*', name: 'glob wildcard' },
        { pattern: 'cmd?', name: 'single char glob' },
      ];

      it.each(dangerousPatterns)(
        'should reject $name: $pattern',
        ({ pattern }) => {
          const result = checkTool(pattern);
          expect(result.available).toBe(false);
          expect(result.version).toBeNull();
          expect(execFileSync).not.toHaveBeenCalled();
          expect(spawnSync).not.toHaveBeenCalled();
        }
      );

      it.each(dangerousPatterns)(
        'should reject $name in version flag: $pattern',
        ({ pattern }) => {
          const result = checkTool('git', pattern);
          expect(result.available).toBe(false);
          expect(result.version).toBeNull();
          expect(execFileSync).not.toHaveBeenCalled();
          expect(spawnSync).not.toHaveBeenCalled();
        }
      );
    });
  });

  describe('checkToolAsync', () => {
    it('should resolve with available: true when tool exists', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.kill = jest.fn();

      spawn.mockReturnValue(mockChild);

      const promise = checkToolAsync('node');

      // Simulate stdout data
      mockChild.stdout.emit('data', Buffer.from('v20.0.0\n'));
      // Simulate successful close
      mockChild.emit('close', 0);

      const result = await promise;
      expect(result.available).toBe(true);
      expect(result.version).toBe('v20.0.0');
    });

    it('should resolve with available: false when tool errors', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.kill = jest.fn();

      spawn.mockReturnValue(mockChild);

      const promise = checkToolAsync('nonexistent');

      // Simulate error
      mockChild.emit('error', new Error('spawn ENOENT'));

      const result = await promise;
      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });

    it('should resolve with available: false on non-zero exit', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.kill = jest.fn();

      spawn.mockReturnValue(mockChild);

      const promise = checkToolAsync('failing-tool');
      mockChild.emit('close', 1);

      const result = await promise;
      expect(result.available).toBe(false);
    });

    it('should reject invalid command characters', async () => {
      const result = await checkToolAsync('rm; cat /etc/passwd');
      expect(result.available).toBe(false);
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe('TOOL_DEFINITIONS', () => {
    it('should be an array of tool definitions', () => {
      expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
      expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should have name and flag for each tool', () => {
      TOOL_DEFINITIONS.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('flag');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.flag).toBe('string');
      });
    });

    it('should include common tools', () => {
      const toolNames = TOOL_DEFINITIONS.map(t => t.name);
      expect(toolNames).toContain('git');
      expect(toolNames).toContain('node');
      expect(toolNames).toContain('npm');
      expect(toolNames).toContain('docker');
    });
  });

  describe('verifyTools (sync)', () => {
    const isWindows = process.platform === 'win32';

    it('should return object with all tool definitions', () => {
      if (isWindows) {
        spawnSync.mockReturnValue({ stdout: 'v1.0.0', status: 0 });
      } else {
        execFileSync.mockReturnValue('v1.0.0');
      }

      const result = verifyTools();

      TOOL_DEFINITIONS.forEach(tool => {
        expect(result).toHaveProperty(tool.name);
        expect(result[tool.name]).toHaveProperty('available');
        expect(result[tool.name]).toHaveProperty('version');
      });
    });
  });

  describe('verifyToolsAsync', () => {
    it('should return object with all tool definitions', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdout = new EventEmitter();
      mockChild.kill = jest.fn();

      spawn.mockImplementation(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.kill = jest.fn();

        // Simulate immediate close
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('v1.0.0'));
          child.emit('close', 0);
        });

        return child;
      });

      const result = await verifyToolsAsync();

      TOOL_DEFINITIONS.forEach(tool => {
        expect(result).toHaveProperty(tool.name);
      });
    });
  });
});
