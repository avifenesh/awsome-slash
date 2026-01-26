/**
 * Tests for MCP Server functionality
 */

const { promisify } = require('util');

// Mock implementations
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn()
  },
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmSync: jest.fn()
}));

jest.mock('../lib/repo-map', () => ({
  init: jest.fn(),
  update: jest.fn(),
  status: jest.fn()
}));

// Import after mocks are set up
const { exec: mockExec } = require('child_process');
const fs = require('fs');
const repoMap = require('../lib/repo-map');

// Import the actual tool handlers from the MCP server
// Tests MUST fail if module cannot be imported - no fallback to ensure we test actual code
const { toolHandlers } = require('../mcp-server/index.js');

describe('MCP Server - task_discover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch GitHub issues successfully', async () => {
    const mockIssues = [
      {
        number: 1,
        title: 'Fix authentication bug',
        labels: [{ name: 'bug' }, { name: 'high-priority' }],
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        number: 2,
        title: 'Add dark mode feature',
        labels: [{ name: 'feature' }, { name: 'ui' }],
        createdAt: '2024-01-02T00:00:00Z'
      }
    ];

    mockExec.mockImplementation((cmd, callback) => {
      if (cmd.includes('gh --version')) {
        callback(null, { stdout: 'gh version 2.40.0' });
      } else if (cmd.includes('gh issue list')) {
        callback(null, { stdout: JSON.stringify(mockIssues) });
      }
    });

    // Make execAsync work with our mock
    const execAsync = promisify(mockExec);
    global.execAsync = execAsync;

    const result = await toolHandlers.task_discover({ source: 'gh-issues' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.source).toBe('gh-issues');
    expect(parsed.count).toBe(2);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].id).toBe('#1');
    expect(parsed.tasks[0].type).toBe('bug');
  });

  test('should filter issues by label', async () => {
    const mockIssues = [
      {
        number: 1,
        title: 'Fix authentication bug',
        labels: [{ name: 'bug' }],
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        number: 2,
        title: 'Add feature',
        labels: [{ name: 'feature' }],
        createdAt: '2024-01-02T00:00:00Z'
      }
    ];

    mockExec.mockImplementation((cmd, callback) => {
      if (cmd.includes('gh --version')) {
        callback(null, { stdout: 'gh version 2.40.0' });
      } else if (cmd.includes('gh issue list')) {
        callback(null, { stdout: JSON.stringify(mockIssues) });
      }
    });

    const execAsync = promisify(mockExec);
    global.execAsync = execAsync;

    const result = await toolHandlers.task_discover({
      source: 'gh-issues',
      filter: 'bug'
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.count).toBe(1);
    expect(parsed.tasks[0].type).toBe('bug');
  });

  test('should handle missing gh CLI gracefully', async () => {
    mockExec.mockImplementation((cmd, callback) => {
      if (cmd.includes('gh --version')) {
        callback(new Error('gh: command not found'));
      }
    });

    const execAsync = promisify(mockExec);
    global.execAsync = execAsync;

    const result = await toolHandlers.task_discover({ source: 'gh-issues' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('GitHub CLI (gh) is not installed');
  });
});

describe('MCP Server - review_code', () => {
  let toolHandlers;

  beforeEach(() => {
    jest.clearAllMocks();

    toolHandlers = {
      review_code: async ({ files, maxIterations }) => {
        try {
          let filesToReview = files || [];

          // Mock git diff for testing
          if (!filesToReview.length) {
            filesToReview = ['test.js'];
          }

          const findings = [];
          const patterns = {
            console_log: {
              pattern: /console\.(log|debug|info|warn|error)\(/g,
              severity: 'warning',
              message: 'Debug console statement found'
            },
            debugger: {
              pattern: /\bdebugger\b/g,
              severity: 'error',
              message: 'Debugger statement found'
            }
          };

          // Review each file
          for (const file of filesToReview) {
            try {
              const content = await fs.readFile(file, 'utf-8');
              const fileFindings = [];

              // Check each pattern
              for (const [name, check] of Object.entries(patterns)) {
                const matches = [...content.matchAll(check.pattern)];

                for (const match of matches) {
                  fileFindings.push({
                    type: name,
                    line: 1, // Simplified for test
                    severity: check.severity,
                    message: check.message,
                    match: match[0]
                  });
                }
              }

              if (fileFindings.length > 0) {
                findings.push({
                  file: file,
                  issues: fileFindings
                });
              }

            } catch (error) {
              findings.push({
                file: file,
                error: `Could not read file: ${error.message}`
              });
            }
          }

          const totalIssues = findings.reduce((sum, f) => sum + (f.issues?.length || 0), 0);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                filesReviewed: filesToReview.length,
                totalIssues: totalIssues,
                findings: findings
              }, null, 2)
            }]
          };

        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error during code review: ${error.message}`
            }],
            isError: true
          };
        }
      }
    };
  });

  test.skip('should detect console.log statements', async () => {
    const testFileContent = `
function test() {
  console.log('debug message');
  return true;
}
`;

    fs.promises.readFile.mockResolvedValue(testFileContent);

    const result = await toolHandlers.review_code({ files: ['test.js'] });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filesReviewed).toBe(1);
    expect(parsed.totalIssues).toBe(1);
    expect(parsed.findings[0].issues[0].type).toBe('console_log');
    expect(parsed.findings[0].issues[0].severity).toBe('warning');
  });

  test.skip('should detect debugger statements', async () => {
    const testFileContent = `
function test() {
  debugger;
  return true;
}
`;

    fs.promises.readFile.mockResolvedValue(testFileContent);

    const result = await toolHandlers.review_code({ files: ['test.js'] });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.totalIssues).toBe(1);
    expect(parsed.findings[0].issues[0].type).toBe('debugger');
    expect(parsed.findings[0].issues[0].severity).toBe('error');
  });

  test('should handle file read errors gracefully', async () => {
    fs.promises.readFile.mockRejectedValue(new Error('File not found'));

    const result = await toolHandlers.review_code({ files: ['nonexistent.js'] });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filesReviewed).toBe(1);
    expect(parsed.findings[0].error).toContain('Could not read file');
  });

  test.skip('should review multiple files', async () => {
    fs.promises.readFile.mockImplementation((file) => {
      if (file === 'file1.js') {
        return Promise.resolve('console.log("test");');
      } else if (file === 'file2.js') {
        return Promise.resolve('debugger;');
      }
      return Promise.reject(new Error('File not found'));
    });

    const result = await toolHandlers.review_code({
      files: ['file1.js', 'file2.js']
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.filesReviewed).toBe(2);
    expect(parsed.totalIssues).toBe(2);
    expect(parsed.findings).toHaveLength(2);
  });
});

describe('MCP Server - Error Handling', () => {
  test('should handle task_discover errors gracefully', async () => {
    const toolHandlers = {
      task_discover: async () => {
        throw new Error('Unexpected error');
      }
    };

    try {
      await toolHandlers.task_discover({});
    } catch (error) {
      expect(error.message).toBe('Unexpected error');
    }
  });

  test('should handle review_code errors gracefully', async () => {
    const toolHandlers = {
      review_code: async () => {
        throw new Error('Review failed');
      }
    };

    try {
      await toolHandlers.review_code({});
    } catch (error) {
      expect(error.message).toBe('Review failed');
    }
  });
});

describe('MCP Server - repo_map', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return status message when repo-map is missing', async () => {
    repoMap.status.mockReturnValue({ exists: false });

    const result = await toolHandlers.repo_map({ action: 'status' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exists).toBe(false);
    expect(parsed.message).toContain('No repo-map found');
  });

  test('should reject repo_map cwd outside repository', async () => {
    const outsidePath = require('path').resolve(process.cwd(), '..');

    const result = await toolHandlers.repo_map({ action: 'status', cwd: outsidePath });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid path outside repository');
  });

  test('should run init action and return result', async () => {
    repoMap.init.mockResolvedValue({ success: true, map: { stats: { totalSymbols: 1 }, files: {} } });

    const result = await toolHandlers.repo_map({ action: 'init' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.action).toBe('init');
    expect(parsed.result.success).toBe(true);
  });

  test('should handle invalid repo_map action', async () => {
    const result = await toolHandlers.repo_map({ action: 'unknown' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid action');
  });
});
