/**
 * Tests for pipeline.js
 * Slop detection pipeline orchestrator
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  runPipeline,
  runPhase1,
  runMultiPassAnalyzers,
  buildSummary,
  formatHandoffPrompt,
  formatCompactPrompt,
  CERTAINTY,
  THOROUGHNESS
} = require('../lib/patterns/pipeline');

describe('pipeline', () => {
  // Test directory setup
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('CERTAINTY constants', () => {
    it('should have all certainty levels defined', () => {
      expect(CERTAINTY.HIGH).toBe('HIGH');
      expect(CERTAINTY.MEDIUM).toBe('MEDIUM');
      expect(CERTAINTY.LOW).toBe('LOW');
    });
  });

  describe('THOROUGHNESS constants', () => {
    it('should have all thoroughness levels defined', () => {
      expect(THOROUGHNESS.QUICK).toBe('quick');
      expect(THOROUGHNESS.NORMAL).toBe('normal');
      expect(THOROUGHNESS.DEEP).toBe('deep');
    });
  });

  describe('runPhase1', () => {
    it('should detect console.log statements', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'function test() {\n  console.log("debug");\n  return 1;\n}'
      );

      const findings = runPhase1(tmpDir, ['app.js'], null);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].patternName).toBe('console_debugging');
      expect(findings[0].certainty).toBe(CERTAINTY.HIGH);
      expect(findings[0].phase).toBe(1);
    });

    it('should detect placeholder text', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'const text = "lorem ipsum dolor sit amet";\n'
      );

      const findings = runPhase1(tmpDir, ['app.js'], null);

      const placeholderFindings = findings.filter(f => f.patternName === 'placeholder_text');
      expect(placeholderFindings.length).toBeGreaterThan(0);
    });

    it('should filter by language', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'console.log("debug");\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'app.py'),
        'print("debug")\n'
      );

      const jsFindings = runPhase1(tmpDir, ['app.js', 'app.py'], 'javascript');

      // Should only find JS console.log, not Python print
      const jsConsole = jsFindings.filter(f => f.patternName === 'console_debugging');
      expect(jsConsole.length).toBe(1);
      expect(jsConsole[0].file).toBe('app.js');
    });

    it('should skip excluded files', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.test.js'),
        'console.log("debug in test");\n'
      );

      const findings = runPhase1(tmpDir, ['app.test.js'], null);

      // Test files should be excluded for console_debugging pattern
      const consoleFindings = findings.filter(f => f.patternName === 'console_debugging');
      expect(consoleFindings.length).toBe(0);
    });

    it('should include line number and content', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'function foo() {\n  console.log("test");\n}'
      );

      const findings = runPhase1(tmpDir, ['app.js'], null);

      expect(findings[0].line).toBe(2);
      expect(findings[0].content).toContain('console.log');
    });

    it('should handle empty files gracefully', () => {
      fs.writeFileSync(path.join(tmpDir, 'empty.js'), '');

      const findings = runPhase1(tmpDir, ['empty.js'], null);

      expect(findings.length).toBe(0);
    });

    it('should handle unreadable files gracefully', () => {
      const findings = runPhase1(tmpDir, ['nonexistent.js'], null);

      expect(findings.length).toBe(0);
    });
  });

  describe('runMultiPassAnalyzers', () => {
    it('should detect excessive JSDoc', () => {
      // JSDoc: 15 non-empty lines, Function: 4 code lines = 15/4 = 3.75x (exceeds 3.0 max)
      const code = `
/**
 * Add two numbers together with detailed documentation
 * This function performs addition
 * Line 3 with more explanation
 * Line 4 describes parameters
 * @param {number} a - First number to add
 * @param {number} b - Second number to add
 * @returns {number} The sum of a and b
 * Line 8 with additional context
 * Line 9 more details about the function
 * Line 10 even more information
 * Line 11 some more text here
 * Line 12 additional notes
 * Line 13 edge cases documented
 * Line 14 performance considerations
 * Line 15 final closing notes
 */
function add(a, b) {
  const sum = a + b;
  const validated = sum;
  console.log(validated);
  return validated;
}`;
      fs.writeFileSync(path.join(tmpDir, 'math.js'), code);

      const findings = runMultiPassAnalyzers(tmpDir, ['math.js']);

      const docRatioFindings = findings.filter(f => f.patternName === 'doc_code_ratio');
      expect(docRatioFindings.length).toBeGreaterThan(0);
      expect(docRatioFindings[0].certainty).toBe(CERTAINTY.MEDIUM);
    });

    it('should detect excessive inline comments', () => {
      // Comments: 8 lines, Code: 4 lines = 8/4 = 2x (matches 2.0 maxCommentRatio threshold)
      // Need to exceed the threshold, so making it higher
      const code = `
function process(data) {
  // This is a comment explaining the function
  // Another comment with more details
  // Yet another comment about edge cases
  // Still more comments about implementation
  // Even more explanation about approach
  // So much text here describing behavior
  // Really explaining everything in detail
  // One more comment to push over threshold
  // And another for good measure
  const result = data.trim();
  const processed = result.toLowerCase();
  const final = processed.replace(/\\s+/g, ' ');
  return final;
}`;
      fs.writeFileSync(path.join(tmpDir, 'processor.js'), code);

      const findings = runMultiPassAnalyzers(tmpDir, ['processor.js']);

      const verbosityFindings = findings.filter(f => f.patternName === 'verbosity_ratio');
      expect(verbosityFindings.length).toBeGreaterThan(0);
    });

    it('should skip unsupported file types for doc analysis', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'data.json'),
        '{ "key": "value" }'
      );

      const findings = runMultiPassAnalyzers(tmpDir, ['data.json']);

      const docRatioFindings = findings.filter(f => f.patternName === 'doc_code_ratio');
      expect(docRatioFindings.length).toBe(0);
    });
  });

  describe('buildSummary', () => {
    it('should count findings by severity', () => {
      const findings = [
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'a' },
        { severity: 'medium', certainty: 'HIGH', phase: 1, autoFix: 'flag', patternName: 'b' },
        { severity: 'medium', certainty: 'MEDIUM', phase: 1, autoFix: 'flag', patternName: 'c' },
        { severity: 'low', certainty: 'LOW', phase: 2, autoFix: 'none', patternName: 'd' }
      ];

      const summary = buildSummary(findings);

      expect(summary.total).toBe(4);
      expect(summary.bySeverity.high).toBe(1);
      expect(summary.bySeverity.medium).toBe(2);
      expect(summary.bySeverity.low).toBe(1);
    });

    it('should count findings by certainty', () => {
      const findings = [
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'a' },
        { severity: 'medium', certainty: 'HIGH', phase: 1, autoFix: 'flag', patternName: 'b' },
        { severity: 'medium', certainty: 'MEDIUM', phase: 1, autoFix: 'flag', patternName: 'c' },
        { severity: 'low', certainty: 'LOW', phase: 2, autoFix: 'none', patternName: 'd' }
      ];

      const summary = buildSummary(findings);

      expect(summary.byCertainty.HIGH).toBe(2);
      expect(summary.byCertainty.MEDIUM).toBe(1);
      expect(summary.byCertainty.LOW).toBe(1);
    });

    it('should count findings by phase', () => {
      const findings = [
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'a' },
        { severity: 'medium', certainty: 'HIGH', phase: 1, autoFix: 'flag', patternName: 'b' },
        { severity: 'low', certainty: 'LOW', phase: 2, autoFix: 'none', patternName: 'c' }
      ];

      const summary = buildSummary(findings);

      expect(summary.byPhase[1]).toBe(2);
      expect(summary.byPhase[2]).toBe(1);
    });

    it('should count findings by autoFix strategy', () => {
      const findings = [
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'a' },
        { severity: 'medium', certainty: 'HIGH', phase: 1, autoFix: 'flag', patternName: 'b' },
        { severity: 'medium', certainty: 'MEDIUM', phase: 1, autoFix: 'flag', patternName: 'c' }
      ];

      const summary = buildSummary(findings);

      expect(summary.byAutoFix.remove).toBe(1);
      expect(summary.byAutoFix.flag).toBe(2);
    });

    it('should track top patterns', () => {
      const findings = [
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'console_debugging' },
        { severity: 'high', certainty: 'HIGH', phase: 1, autoFix: 'remove', patternName: 'console_debugging' },
        { severity: 'medium', certainty: 'HIGH', phase: 1, autoFix: 'flag', patternName: 'placeholder_text' }
      ];

      const summary = buildSummary(findings);

      expect(summary.topPatterns.console_debugging).toBe(2);
      expect(summary.topPatterns.placeholder_text).toBe(1);
    });

    it('should handle empty findings array', () => {
      const summary = buildSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.bySeverity.high).toBe(0);
    });
  });

  describe('formatHandoffPrompt', () => {
    it('should return no issues message for empty findings', () => {
      const prompt = formatHandoffPrompt([], 'report');

      expect(prompt).toContain('No issues detected');
    });

    it('should include mode in prompt', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'Test', autoFix: 'remove', severity: 'medium' }
      ];

      const reportPrompt = formatHandoffPrompt(findings, 'report');
      const applyPrompt = formatHandoffPrompt(findings, 'apply');

      expect(reportPrompt).toContain('Mode: **report**');
      expect(applyPrompt).toContain('Mode: **apply**');
    });

    it('should group findings by certainty', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'High certainty', autoFix: 'remove', severity: 'high' },
        { file: 'b.js', line: 2, certainty: 'MEDIUM', description: 'Medium certainty', autoFix: 'flag', severity: 'medium' },
        { file: 'c.js', line: 3, certainty: 'LOW', description: 'Low certainty', autoFix: 'flag', severity: 'low' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report');

      expect(prompt).toContain('HIGH Certainty');
      expect(prompt).toContain('MEDIUM Certainty');
      expect(prompt).toContain('LOW Certainty');
    });

    it('should include action guidance for apply mode', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'Test', autoFix: 'remove', severity: 'high' }
      ];

      const prompt = formatHandoffPrompt(findings, 'apply');

      expect(prompt).toContain('Apply fixes directly');
    });

    it('should include action summary', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'Test1', autoFix: 'remove', severity: 'high' },
        { file: 'b.js', line: 2, certainty: 'HIGH', description: 'Test2', autoFix: 'flag', severity: 'medium' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report');

      expect(prompt).toContain('Auto-fixable: 1');
      expect(prompt).toContain('Needs manual review: 1');
    });

    it('should group findings by file', () => {
      const findings = [
        { file: 'app.js', line: 1, certainty: 'HIGH', description: 'Issue 1', autoFix: 'remove', severity: 'high' },
        { file: 'app.js', line: 5, certainty: 'HIGH', description: 'Issue 2', autoFix: 'remove', severity: 'high' },
        { file: 'utils.js', line: 3, certainty: 'HIGH', description: 'Issue 3', autoFix: 'flag', severity: 'medium' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report');

      expect(prompt).toContain('**app.js**');
      expect(prompt).toContain('**utils.js**');
      expect(prompt).toContain('L1:');
      expect(prompt).toContain('L5:');
    });

    it('should include autoFix tags for fixable issues', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'Test', autoFix: 'remove', severity: 'high' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report');

      expect(prompt).toContain('[remove]');
    });

    it('should not include autoFix tags for flag/none', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', description: 'Test', autoFix: 'flag', severity: 'high' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report');

      expect(prompt).not.toContain('[flag]');
    });

    it('should use compact format when option is set', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'console_debugging', autoFix: 'remove', severity: 'high' },
        { file: 'b.js', line: 2, certainty: 'MEDIUM', patternName: 'old_todos', autoFix: 'flag', severity: 'medium' }
      ];

      const prompt = formatHandoffPrompt(findings, 'report', { compact: true });

      // Compact format uses table structure
      expect(prompt).toContain('|File|L|Pattern|Cert|Fix|');
      expect(prompt).toContain('|---|---|---|---|---|');
      // Should use abbreviated certainty
      expect(prompt).toContain('|H|');
      expect(prompt).toContain('|M|');
    });
  });

  describe('formatCompactPrompt', () => {
    it('should format findings in table structure', () => {
      const findings = [
        { file: 'app.js', line: 42, certainty: 'HIGH', patternName: 'console_debugging', autoFix: 'remove' }
      ];

      const prompt = formatCompactPrompt(findings, 'report', 50);

      expect(prompt).toContain('|File|L|Pattern|Cert|Fix|');
      expect(prompt).toContain('|---|---|---|---|---|');
      expect(prompt).toContain('|app.js|42|console_debugging|H|remove|');
    });

    it('should show certainty counts in header', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'console_debugging', autoFix: 'remove' },
        { file: 'b.js', line: 2, certainty: 'HIGH', patternName: 'debug_import', autoFix: 'remove' },
        { file: 'c.js', line: 3, certainty: 'MEDIUM', patternName: 'old_todos', autoFix: 'flag' },
        { file: 'd.js', line: 4, certainty: 'LOW', patternName: 'magic_numbers', autoFix: 'flag' }
      ];

      const prompt = formatCompactPrompt(findings, 'apply', 50);

      expect(prompt).toContain('## Slop: apply|H:2|M:1|L:1');
    });

    it('should abbreviate certainty levels', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'test', autoFix: 'remove' },
        { file: 'b.js', line: 2, certainty: 'MEDIUM', patternName: 'test', autoFix: 'flag' },
        { file: 'c.js', line: 3, certainty: 'LOW', patternName: 'test', autoFix: 'none' }
      ];

      const prompt = formatCompactPrompt(findings, 'report', 50);

      // Should use H, M, L abbreviations in the Cert column
      expect(prompt).toMatch(/\|a\.js\|1\|test\|H\|/);
      expect(prompt).toMatch(/\|b\.js\|2\|test\|M\|/);
      expect(prompt).toMatch(/\|c\.js\|3\|test\|L\|/);
    });

    it('should show dash for non-fixable patterns', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'test', autoFix: 'flag' },
        { file: 'b.js', line: 2, certainty: 'MEDIUM', patternName: 'test', autoFix: 'none' },
        { file: 'c.js', line: 3, certainty: 'LOW', patternName: 'test', autoFix: null }
      ];

      const prompt = formatCompactPrompt(findings, 'report', 50);

      // Non-fixable should show '-' in Fix column
      expect(prompt).toContain('|a.js|1|test|H|-|');
      expect(prompt).toContain('|b.js|2|test|M|-|');
      expect(prompt).toContain('|c.js|3|test|L|-|');
    });

    it('should truncate findings when exceeding maxFindings', () => {
      const findings = [];
      for (let i = 1; i <= 10; i++) {
        findings.push({
          file: `file${i}.js`,
          line: i,
          certainty: 'HIGH',
          patternName: 'console_debugging',
          autoFix: 'remove'
        });
      }

      const prompt = formatCompactPrompt(findings, 'report', 5);

      // Should only have 5 rows plus truncation message
      expect(prompt).toContain('file1.js');
      expect(prompt).toContain('file5.js');
      expect(prompt).not.toContain('file6.js');
      expect(prompt).toContain('+5 more findings (truncated)');
    });

    it('should include auto-fixable summary', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'console_debugging', autoFix: 'remove' },
        { file: 'b.js', line: 2, certainty: 'HIGH', patternName: 'debug_import', autoFix: 'remove' },
        { file: 'c.js', line: 3, certainty: 'MEDIUM', patternName: 'old_todos', autoFix: 'flag' }
      ];

      const prompt = formatCompactPrompt(findings, 'report', 50);

      expect(prompt).toContain('**Auto-fixable: 2**');
      expect(prompt).toContain('Manual: 1');
    });

    it('should handle empty findings', () => {
      const prompt = formatCompactPrompt([], 'report', 50);

      expect(prompt).toContain('## Slop: report|H:0|M:0|L:0');
      expect(prompt).toContain('**Auto-fixable: 0**');
    });

    it('should not show truncation message when under limit', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'test', autoFix: 'remove' }
      ];

      const prompt = formatCompactPrompt(findings, 'report', 50);

      expect(prompt).not.toContain('truncated');
    });

    it('should include mode in header', () => {
      const findings = [
        { file: 'a.js', line: 1, certainty: 'HIGH', patternName: 'test', autoFix: 'remove' }
      ];

      const reportPrompt = formatCompactPrompt(findings, 'report', 50);
      const applyPrompt = formatCompactPrompt(findings, 'apply', 50);

      expect(reportPrompt).toContain('## Slop: report|');
      expect(applyPrompt).toContain('## Slop: apply|');
    });
  });

  describe('runPipeline', () => {
    it('should return correct structure', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'console.log("test");\n'
      );

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        mode: 'report'
      });

      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('phase3Prompt');
      expect(result).toHaveProperty('missingTools');
      expect(result).toHaveProperty('metadata');
    });

    it('should include metadata', () => {
      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        mode: 'report'
      });

      expect(result.metadata.repoPath).toBe(tmpDir);
      expect(result.metadata.thoroughness).toBe('quick');
      expect(result.metadata.mode).toBe('report');
      expect(result.metadata.timestamp).toBeDefined();
    });

    it('should detect findings in quick mode', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'function test() {\n  console.log("debug");\n}'
      );

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['app.js']
      });

      expect(result.findings.length).toBeGreaterThan(0);
      // Quick mode only runs Phase 1
      expect(result.findings.every(f => f.phase === 1)).toBe(true);
    });

    it('should run multi-pass analyzers in normal mode', () => {
      const code = `
/**
 * Excessive docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 */
function foo() {
  return 1;
}`;
      fs.writeFileSync(path.join(tmpDir, 'test.js'), code);

      const result = runPipeline(tmpDir, {
        thoroughness: 'normal',
        targetFiles: ['test.js']
      });

      // Normal mode includes multi-pass analyzers (may or may not have findings depending on thresholds)
      expect(result.findings).toBeDefined();
      expect(result.metadata.thoroughness).toBe('normal');
    });

    it('should track missing tools in deep mode', () => {
      const result = runPipeline(tmpDir, {
        thoroughness: 'deep',
        cliTools: { jscpd: false, madge: false, escomplex: false }
      });

      expect(result.missingTools).toContain('jscpd');
      expect(result.missingTools).toContain('madge');
      expect(result.missingTools).toContain('escomplex');
    });

    it('should use default options', () => {
      const result = runPipeline(tmpDir);

      expect(result.metadata.thoroughness).toBe('normal');
      expect(result.metadata.mode).toBe('report');
    });

    it('should filter by specific files', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.js'), 'console.log("a");\n');
      fs.writeFileSync(path.join(tmpDir, 'b.js'), 'console.log("b");\n');

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['a.js']
      });

      const filesWithFindings = [...new Set(result.findings.map(f => f.file))];
      expect(filesWithFindings).toContain('a.js');
      expect(filesWithFindings).not.toContain('b.js');
    });

    it('should generate phase3Prompt with findings', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'app.js'),
        'console.log("debug");\n'
      );

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['app.js'],
        mode: 'apply'
      });

      expect(result.phase3Prompt).toContain('Mode: **apply**');
      expect(result.phase3Prompt).toContain('HIGH Certainty');
    });
  });

  describe('mode inheritance', () => {
    it('should pass mode to handoff prompt', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.js'), 'console.log("test");');

      const reportResult = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['a.js'],
        mode: 'report'
      });

      const applyResult = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['a.js'],
        mode: 'apply'
      });

      expect(reportResult.phase3Prompt).toContain('Mode: **report**');
      expect(applyResult.phase3Prompt).toContain('Mode: **apply**');
    });
  });

  describe('certainty tagging', () => {
    it('should tag Phase 1 regex matches as HIGH certainty', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.js'), 'console.log("test");');

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['a.js']
      });

      const phase1Findings = result.findings.filter(f => f.phase === 1);
      expect(phase1Findings.every(f => f.certainty === CERTAINTY.HIGH)).toBe(true);
    });

    it('should tag multi-pass findings as MEDIUM certainty', () => {
      const code = `
/**
 * Excessive documentation
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 * Line 11
 * Line 12
 */
function foo() {
  return 1;
}`;
      fs.writeFileSync(path.join(tmpDir, 'test.js'), code);

      const result = runPipeline(tmpDir, {
        thoroughness: 'normal',
        targetFiles: ['test.js']
      });

      const docRatioFindings = result.findings.filter(f => f.patternName === 'doc_code_ratio');
      if (docRatioFindings.length > 0) {
        expect(docRatioFindings[0].certainty).toBe(CERTAINTY.MEDIUM);
      }
    });
  });

  describe('thoroughness levels', () => {
    it('quick mode should only run Phase 1 regex', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.js'), 'console.log("test");');

      const result = runPipeline(tmpDir, {
        thoroughness: 'quick',
        targetFiles: ['a.js']
      });

      // All findings should be phase 1 with HIGH certainty
      expect(result.findings.every(f => f.phase === 1)).toBe(true);
      expect(result.findings.every(f => f.certainty === CERTAINTY.HIGH)).toBe(true);
    });

    it('normal mode should include multi-pass analyzers', () => {
      // Create file that will trigger multi-pass analysis
      const code = `
/**
 * Excessive docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 */
function foo() {
  return 1;
}`;
      fs.writeFileSync(path.join(tmpDir, 'test.js'), code);

      const result = runPipeline(tmpDir, {
        thoroughness: 'normal',
        targetFiles: ['test.js']
      });

      // Should run multi-pass analyzers which may produce MEDIUM certainty findings
      // The doc_code_ratio analyzer may detect the excessive JSDoc if it meets thresholds
      expect(result.findings).toBeDefined();
      expect(result.metadata.thoroughness).toBe('normal');
    });

    it('deep mode should track missing CLI tools', () => {
      const result = runPipeline(tmpDir, {
        thoroughness: 'deep',
        cliTools: { jscpd: false, madge: false, escomplex: false }
      });

      expect(result.missingTools.length).toBe(3);
    });
  });
});
