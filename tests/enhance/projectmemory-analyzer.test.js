/**
 * Project Memory Analyzer Tests
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import modules under test
const projectmemoryPatterns = require('../../lib/enhance/projectmemory-patterns');
const projectmemoryAnalyzer = require('../../lib/enhance/projectmemory-analyzer');
const reporter = require('../../lib/enhance/reporter');

describe('Project Memory Patterns', () => {
  describe('missing_critical_rules', () => {
    it('should detect missing critical rules section', () => {
      const content = `# Project Memory

## Architecture
Some content here.

## Commands
npm test
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_critical_rules;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('critical rules');
    });

    it('should not flag when critical rules exist', () => {
      const content = `# Project Memory

## Critical Rules
1. Do this
2. Never do that
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_critical_rules;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });

    it('should recognize XML-wrapped critical rules', () => {
      const content = `# Project

<critical-rules>
## Rules
- Rule 1
</critical-rules>
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_critical_rules;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_architecture', () => {
    it('should detect missing architecture section', () => {
      const content = `# Project

## Rules
Some rules here.
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_architecture;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('architecture');
    });

    it('should not flag when architecture exists', () => {
      const content = `# Project

## Architecture
\`\`\`
src/
├── index.js
└── utils/
\`\`\`
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_architecture;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });

    it('should recognize directory tree as architecture', () => {
      const content = `# Project

\`\`\`
lib/
├── index.js
└── helpers/
\`\`\`
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_architecture;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_key_commands', () => {
    it('should detect missing commands section', () => {
      const content = `# Project

## Architecture
Some content.
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_key_commands;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('commands');
    });

    it('should not flag when commands exist', () => {
      const content = `# Project

## Key Commands

\`\`\`bash
npm test
npm run build
\`\`\`
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_key_commands;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('broken_file_reference', () => {
    it('should report broken files from context', () => {
      const content = 'Some content';
      const context = { brokenFiles: ['docs/old.md', 'lib/missing.js'] };
      const pattern = projectmemoryPatterns.projectMemoryPatterns.broken_file_reference;
      const result = pattern.check(content, context);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('docs/old.md');
      expect(result.files).toEqual(['docs/old.md', 'lib/missing.js']);
    });

    it('should not flag when no broken files', () => {
      const content = 'Some content';
      const context = { brokenFiles: [] };
      const pattern = projectmemoryPatterns.projectMemoryPatterns.broken_file_reference;
      const result = pattern.check(content, context);

      expect(result).toBeNull();
    });
  });

  describe('broken_command_reference', () => {
    it('should report broken commands from context', () => {
      const content = 'Some content';
      const context = { brokenCommands: ['old-script', 'missing-cmd'] };
      const pattern = projectmemoryPatterns.projectMemoryPatterns.broken_command_reference;
      const result = pattern.check(content, context);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('old-script');
    });
  });

  describe('readme_duplication', () => {
    it('should flag high duplication ratio', () => {
      const content = 'Some content';
      const context = { duplicationRatio: 0.5 };
      const pattern = projectmemoryPatterns.projectMemoryPatterns.readme_duplication;
      const result = pattern.check(content, context);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('50%');
    });

    it('should not flag low duplication', () => {
      const content = 'Some content';
      const context = { duplicationRatio: 0.2 };
      const pattern = projectmemoryPatterns.projectMemoryPatterns.readme_duplication;
      const result = pattern.check(content, context);

      expect(result).toBeNull();
    });
  });

  describe('excessive_token_count', () => {
    it('should flag content over 1500 tokens', () => {
      // 1500 tokens ~ 6000 characters
      const content = 'Word '.repeat(1600);
      const pattern = projectmemoryPatterns.projectMemoryPatterns.excessive_token_count;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('token');
    });

    it('should not flag reasonable content', () => {
      const content = 'Word '.repeat(500);
      const pattern = projectmemoryPatterns.projectMemoryPatterns.excessive_token_count;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_why', () => {
    it('should detect rules without WHY explanations', () => {
      const content = `## Rules
You must always do X.
Never do Y.
Required to check Z.
Always verify A.
Must ensure B.
Important to maintain C.
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_why;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('WHY');
    });

    it('should not flag when WHY explanations present', () => {
      const content = `## Rules
You must always do X.
*WHY: Because of reason A.*

Never do Y.
*WHY: Because of reason B.*

Required to check Z.
*WHY: Because of reason C.*
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.missing_why;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('hardcoded_state_dir', () => {
    it('should detect hardcoded .claude/ without alternatives', () => {
      const content = `## State Files
Files are stored in .claude/tasks.json
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.hardcoded_state_dir;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('.claude/');
    });

    it('should not flag when platform variations mentioned', () => {
      const content = `## State Files
Platform-aware: .claude/ (Claude), .opencode/ (OpenCode), .codex/ (Codex)
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.hardcoded_state_dir;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('deep_nesting', () => {
    it('should detect deep header nesting', () => {
      const content = `# H1
## H2
### H3
#### H4
##### H5
###### H6
##### H5 again
##### H5 yet again
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.deep_nesting;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('nesting');
    });

    it('should not flag shallow structure', () => {
      const content = `# H1
## H2
### H3
## Another H2
`;
      const pattern = projectmemoryPatterns.projectMemoryPatterns.deep_nesting;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });
});

describe('Project Memory Analyzer', () => {
  describe('findProjectMemoryFile', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
    });

    afterEach(() => {
      // Clean up
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    });

    it('should find CLAUDE.md', () => {
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Project', 'utf8');

      const result = projectmemoryAnalyzer.findProjectMemoryFile(tempDir);

      expect(result).toBeTruthy();
      expect(result.name).toBe('CLAUDE.md');
      expect(result.type).toBe('claude');
    });

    it('should find AGENTS.md', () => {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Project', 'utf8');

      const result = projectmemoryAnalyzer.findProjectMemoryFile(tempDir);

      expect(result).toBeTruthy();
      expect(result.name).toBe('AGENTS.md');
      expect(result.type).toBe('agents');
    });

    it('should prefer CLAUDE.md over AGENTS.md', () => {
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Claude', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents', 'utf8');

      const result = projectmemoryAnalyzer.findProjectMemoryFile(tempDir);

      expect(result.name).toBe('CLAUDE.md');
    });

    it('should return null if no file found', () => {
      const result = projectmemoryAnalyzer.findProjectMemoryFile(tempDir);

      expect(result).toBeNull();
    });
  });

  describe('extractFileReferences', () => {
    it('should extract markdown links', () => {
      const content = `
See [the docs](docs/guide.md) for more info.
Also check [config](config/settings.json).
`;
      const refs = projectmemoryAnalyzer.extractFileReferences(content);

      expect(refs).toContain('docs/guide.md');
      expect(refs).toContain('config/settings.json');
    });

    it('should extract backtick paths', () => {
      const content = `
The config is in \`config/app.json\`.
Check \`lib/utils.js\` for helpers.
`;
      const refs = projectmemoryAnalyzer.extractFileReferences(content);

      expect(refs).toContain('config/app.json');
      expect(refs).toContain('lib/utils.js');
    });

    it('should ignore URLs', () => {
      const content = `
See [website](https://example.com) and [docs](http://docs.example.com).
`;
      const refs = projectmemoryAnalyzer.extractFileReferences(content);

      expect(refs).not.toContain('https://example.com');
      expect(refs).not.toContain('http://docs.example.com');
    });

    it('should deduplicate references', () => {
      const content = `
See [file](docs/guide.md) and also [file again](docs/guide.md).
`;
      const refs = projectmemoryAnalyzer.extractFileReferences(content);

      expect(refs.filter(r => r === 'docs/guide.md').length).toBe(1);
    });
  });

  describe('extractCommandReferences', () => {
    it('should extract npm run commands', () => {
      const content = `
Run \`npm run test\` and \`npm run build\`.
`;
      const cmds = projectmemoryAnalyzer.extractCommandReferences(content);

      expect(cmds).toContain('test');
      expect(cmds).toContain('build');
    });

    it('should extract npm shorthand commands', () => {
      const content = `
Run \`npm test\` and \`npm start\`.
`;
      const cmds = projectmemoryAnalyzer.extractCommandReferences(content);

      expect(cmds).toContain('test');
      expect(cmds).toContain('start');
    });
  });

  describe('calculateTokenMetrics', () => {
    it('should calculate metrics correctly', () => {
      const content = 'Hello world. This is a test.\nSecond line here.';

      const metrics = projectmemoryAnalyzer.calculateTokenMetrics(content);

      expect(metrics.characterCount).toBe(content.length);
      expect(metrics.lineCount).toBe(2);
      expect(metrics.wordCount).toBeGreaterThan(0);
      expect(metrics.estimatedTokens).toBeGreaterThan(0);
    });

    it('should handle empty content', () => {
      const metrics = projectmemoryAnalyzer.calculateTokenMetrics('');

      expect(metrics.estimatedTokens).toBe(0);
    });
  });

  describe('calculateTextOverlap', () => {
    it('should detect high overlap', () => {
      const text1 = 'This is a test sentence. Another sentence here. Third one too.';
      const text2 = 'This is a test sentence. Another sentence here. Third one too.';

      const overlap = projectmemoryAnalyzer.calculateTextOverlap(text1, text2);

      expect(overlap).toBeGreaterThan(0.8);
    });

    it('should detect low overlap', () => {
      const text1 = 'This is completely different content with unique words and phrases.';
      const text2 = 'Nothing similar at all in this text which discusses other topics.';

      const overlap = projectmemoryAnalyzer.calculateTextOverlap(text1, text2);

      expect(overlap).toBeLessThan(0.3);
    });
  });

  describe('analyzeFile', () => {
    let tempDir;
    let tempFile;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
      tempFile = path.join(tempDir, 'CLAUDE.md');
    });

    afterEach(() => {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      // Clean up any other files
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const fp = path.join(tempDir, file);
        if (fs.existsSync(fp)) {
          fs.unlinkSync(fp);
        }
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    it('should analyze a well-structured file', () => {
      const content = `# Project Memory

<critical-rules>
## Critical Rules

1. Rule one
   *WHY: Reason one*

2. Rule two
   *WHY: Reason two*
</critical-rules>

## Architecture

\`\`\`
lib/
├── index.js
└── utils/
\`\`\`

## Key Commands

\`\`\`bash
npm test
npm run build
\`\`\`

Platform-aware: .claude/ (Claude), .opencode/ (OpenCode)

This file also works as AGENTS.md for cross-platform compatibility.
`;

      fs.writeFileSync(tempFile, content, 'utf8');

      const results = projectmemoryAnalyzer.analyzeFile(tempFile, { checkReferences: false });

      expect(results.fileName).toBe('CLAUDE.md');
      expect(results.fileType).toBe('claude');
      expect(results.structureIssues).toHaveLength(0);
      expect(results.crossPlatformIssues).toHaveLength(0);
    });

    it('should detect multiple issues', () => {
      const content = `# Project

Some content without structure.
`;

      fs.writeFileSync(tempFile, content, 'utf8');

      const results = projectmemoryAnalyzer.analyzeFile(tempFile, { checkReferences: false });

      expect(results.structureIssues.length).toBeGreaterThan(0);
    });

    it('should handle missing file', () => {
      const results = projectmemoryAnalyzer.analyzeFile('/nonexistent/CLAUDE.md');

      expect(results.structureIssues.length).toBeGreaterThan(0);
      expect(results.structureIssues[0].issue).toContain('not found');
    });
  });

  describe('analyze', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
    });

    afterEach(() => {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    });

    it('should find and analyze project memory in directory', () => {
      fs.writeFileSync(path.join(tempDir, 'CLAUDE.md'), '# Project\n\n## Architecture\n```\nlib/\n```', 'utf8');

      const results = projectmemoryAnalyzer.analyze(tempDir, { checkReferences: false });

      expect(results.fileName).toBe('CLAUDE.md');
      expect(results.filePath).toBe(path.join(tempDir, 'CLAUDE.md'));
    });

    it('should return error when no file found', () => {
      const results = projectmemoryAnalyzer.analyze(tempDir);

      expect(results.error).toBeTruthy();
      expect(results.error).toContain('No project memory file found');
    });

    it('should analyze specific file path', () => {
      const filePath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(filePath, '# Agents\n\n## Overview\nContent', 'utf8');

      const results = projectmemoryAnalyzer.analyze(filePath, { checkReferences: false });

      expect(results.fileName).toBe('AGENTS.md');
      expect(results.fileType).toBe('agents');
    });
  });
});

describe('Reporter - Project Memory', () => {
  describe('generateProjectMemoryReport', () => {
    it('should generate report for valid results', () => {
      const results = {
        fileName: 'CLAUDE.md',
        filePath: '/test/CLAUDE.md',
        fileType: 'claude',
        metrics: {
          estimatedTokens: 500,
          characterCount: 2000,
          lineCount: 50,
          wordCount: 400
        },
        structureIssues: [{
          issue: 'Missing critical rules',
          fix: 'Add critical rules section',
          certainty: 'HIGH'
        }],
        referenceIssues: [],
        efficiencyIssues: [],
        qualityIssues: [],
        crossPlatformIssues: []
      };

      const report = reporter.generateProjectMemoryReport(results);

      expect(report).toContain('CLAUDE.md');
      expect(report).toContain('Estimated Tokens');
      expect(report).toContain('500');
      expect(report).toContain('Missing critical rules');
    });

    it('should handle error results', () => {
      const results = {
        error: 'No project memory file found',
        searchedPaths: ['/test/CLAUDE.md', '/test/AGENTS.md']
      };

      const report = reporter.generateProjectMemoryReport(results);

      expect(report).toContain('Error');
      expect(report).toContain('No project memory file found');
      expect(report).toContain('/test/CLAUDE.md');
    });

    it('should include all issue categories', () => {
      const results = {
        fileName: 'CLAUDE.md',
        filePath: '/test/CLAUDE.md',
        fileType: 'claude',
        metrics: { estimatedTokens: 500, characterCount: 2000, lineCount: 50, wordCount: 400 },
        structureIssues: [{ issue: 'Structure issue', certainty: 'HIGH' }],
        referenceIssues: [{ issue: 'Reference issue', certainty: 'HIGH' }],
        efficiencyIssues: [{ issue: 'Efficiency issue', certainty: 'MEDIUM' }],
        qualityIssues: [{ issue: 'Quality issue', certainty: 'MEDIUM' }],
        crossPlatformIssues: [{ issue: 'Cross-platform issue', certainty: 'HIGH' }]
      };

      const report = reporter.generateProjectMemoryReport(results);

      expect(report).toContain('Structure Issues');
      expect(report).toContain('Reference Issues');
      expect(report).toContain('Efficiency Issues');
      expect(report).toContain('Quality Issues');
      expect(report).toContain('Cross-Platform Issues');
    });
  });

  describe('generateProjectMemorySummaryReport', () => {
    it('should generate summary for multiple files', () => {
      const allResults = [
        {
          fileName: 'CLAUDE.md',
          filePath: '/test1/CLAUDE.md',
          metrics: { estimatedTokens: 500 },
          structureIssues: [{ certainty: 'HIGH' }],
          referenceIssues: [],
          efficiencyIssues: [],
          qualityIssues: [],
          crossPlatformIssues: []
        },
        {
          fileName: 'AGENTS.md',
          filePath: '/test2/AGENTS.md',
          metrics: { estimatedTokens: 300 },
          structureIssues: [],
          referenceIssues: [],
          efficiencyIssues: [{ certainty: 'MEDIUM' }],
          qualityIssues: [],
          crossPlatformIssues: []
        }
      ];

      const report = reporter.generateProjectMemorySummaryReport(allResults);

      expect(report).toContain('Project Memory Analysis Summary');
      expect(report).toContain('Analyzed**: 2 files');
      expect(report).toContain('Total Tokens');
      expect(report).toContain('800'); // 500 + 300
      expect(report).toContain('CLAUDE.md');
      expect(report).toContain('AGENTS.md');
    });
  });
});

describe('Integration', () => {
  it('should export from index.js correctly', () => {
    const enhance = require('../../lib/enhance');

    expect(enhance.projectmemoryAnalyzer).toBeDefined();
    expect(enhance.projectmemoryPatterns).toBeDefined();
    expect(enhance.analyzeProjectMemory).toBeDefined();
    expect(enhance.analyzeClaudeMd).toBeDefined();
    expect(enhance.findProjectMemoryFile).toBeDefined();
  });

  it('should get patterns by certainty', () => {
    const highPatterns = projectmemoryPatterns.getPatternsByCertainty('HIGH');
    expect(Object.keys(highPatterns).length).toBeGreaterThan(0);

    for (const pattern of Object.values(highPatterns)) {
      expect(pattern.certainty).toBe('HIGH');
    }
  });

  it('should get patterns by category', () => {
    const structurePatterns = projectmemoryPatterns.getPatternsByCategory('structure');
    expect(Object.keys(structurePatterns).length).toBeGreaterThan(0);

    for (const pattern of Object.values(structurePatterns)) {
      expect(pattern.category).toBe('structure');
    }
  });

  it('should get all patterns', () => {
    const allPatterns = projectmemoryPatterns.getAllPatterns();
    expect(Object.keys(allPatterns).length).toBeGreaterThan(10);
  });
});
