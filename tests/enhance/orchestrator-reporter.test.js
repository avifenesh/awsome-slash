/**
 * Orchestrator Reporter Tests
 * Tests for generateOrchestratorReport and deduplicateOrchestratorFindings
 */

const reporter = require('../../lib/enhance/reporter');

describe('Orchestrator Reporter', () => {
  describe('generateOrchestratorReport', () => {
    it('should generate report with HIGH certainty issues', () => {
      const results = {
        findings: [
          { file: 'test.md', line: 10, issue: 'Missing docs', fix: 'Add docs', certainty: 'HIGH', source: 'docs', autoFixable: false }
        ],
        byEnhancer: { docs: { high: 1, medium: 0, low: 0 } },
        totals: { high: 1, medium: 0, low: 0 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('Enhancement Analysis Report');
      expect(report).toContain('HIGH Certainty Issues (1)');
      expect(report).toContain('Missing docs');
      expect(report).toContain('Add docs');
    });

    it('should generate report with MEDIUM certainty issues', () => {
      const results = {
        findings: [
          { file: 'agent.md', line: 5, issue: 'Consider XML tags', fix: 'Add XML', certainty: 'MEDIUM', source: 'agent' }
        ],
        byEnhancer: { agent: { high: 0, medium: 1, low: 0 } },
        totals: { high: 0, medium: 1, low: 0 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('MEDIUM Certainty Issues (1)');
      expect(report).toContain('Consider XML tags');
    });

    it('should exclude LOW certainty when verbose=false', () => {
      const results = {
        findings: [
          { file: 'test.md', issue: 'Low priority', certainty: 'LOW', source: 'docs' }
        ],
        byEnhancer: { docs: { high: 0, medium: 0, low: 1 } },
        totals: { high: 0, medium: 0, low: 1 }
      };

      const report = reporter.generateOrchestratorReport(results, { verbose: false });

      expect(report).not.toContain('LOW Certainty Issues');
      expect(report).not.toContain('Low priority');
    });

    it('should include LOW certainty when verbose=true', () => {
      const results = {
        findings: [
          { file: 'test.md', issue: 'Low priority', certainty: 'LOW', source: 'docs' }
        ],
        byEnhancer: { docs: { high: 0, medium: 0, low: 1 } },
        totals: { high: 0, medium: 0, low: 1 }
      };

      const report = reporter.generateOrchestratorReport(results, { verbose: true });

      expect(report).toContain('LOW Certainty Issues (1)');
      expect(report).toContain('Low priority');
    });

    it('should show "No issues found" for empty findings', () => {
      const results = {
        findings: [],
        byEnhancer: {},
        totals: { high: 0, medium: 0, low: 0 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('Status: Clean');
      expect(report).toContain('No issues found');
    });

    it('should count auto-fixable issues correctly', () => {
      const results = {
        findings: [
          { file: 'a.md', issue: 'Issue 1', certainty: 'HIGH', source: 'plugin', autoFixable: true },
          { file: 'b.md', issue: 'Issue 2', certainty: 'HIGH', source: 'plugin', autoFixable: true },
          { file: 'c.md', issue: 'Issue 3', certainty: 'HIGH', source: 'agent', autoFixable: false }
        ],
        byEnhancer: { plugin: { high: 2 }, agent: { high: 1 } },
        totals: { high: 3, medium: 0, low: 0 }
      };

      const report = reporter.generateOrchestratorReport(results, { showAutoFixable: true });

      expect(report).toContain('Auto-Fix Summary');
      expect(report).toContain('2 issues can be automatically fixed');
    });

    it('should show auto-fix summary when showAutoFixable=true', () => {
      const results = {
        findings: [
          { file: 'test.md', issue: 'Fixable', certainty: 'HIGH', source: 'docs', autoFixable: true, category: 'structure' }
        ],
        byEnhancer: { docs: { high: 1 } },
        totals: { high: 1 }
      };

      const report = reporter.generateOrchestratorReport(results, { showAutoFixable: true });

      expect(report).toContain('Auto-Fix Summary');
      expect(report).toContain('Run `/enhance --apply`');
    });

    it('should not show auto-fix summary when no auto-fixable issues', () => {
      const results = {
        findings: [
          { file: 'test.md', issue: 'Not fixable', certainty: 'HIGH', source: 'docs', autoFixable: false }
        ],
        byEnhancer: { docs: { high: 1 } },
        totals: { high: 1 }
      };

      const report = reporter.generateOrchestratorReport(results, { showAutoFixable: true });

      expect(report).not.toContain('Auto-Fix Summary');
    });

    it('should group findings by source enhancer', () => {
      const results = {
        findings: [
          { file: 'a.md', issue: 'Plugin issue', certainty: 'HIGH', source: 'plugin' },
          { file: 'b.md', issue: 'Agent issue', certainty: 'HIGH', source: 'agent' }
        ],
        byEnhancer: { plugin: { high: 1 }, agent: { high: 1 } },
        totals: { high: 2 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('### Plugin Issues (1)');
      expect(report).toContain('### Agent Issues (1)');
    });

    it('should generate executive summary table', () => {
      const results = {
        findings: [
          { file: 'a.md', issue: 'Issue', certainty: 'HIGH', source: 'plugin' },
          { file: 'b.md', issue: 'Issue', certainty: 'MEDIUM', source: 'agent' }
        ],
        byEnhancer: { plugin: { high: 1 }, agent: { medium: 1 } },
        totals: { high: 1, medium: 1, low: 0 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('Executive Summary');
      expect(report).toContain('| Enhancer | HIGH | MEDIUM | LOW | Auto-Fixable |');
      expect(report).toContain('| plugin |');
      expect(report).toContain('| agent |');
    });

    it('should handle mixed certainty levels correctly', () => {
      const results = {
        findings: [
          { file: 'a.md', issue: 'High issue', certainty: 'HIGH', source: 'docs' },
          { file: 'b.md', issue: 'Medium issue', certainty: 'MEDIUM', source: 'docs' },
          { file: 'c.md', issue: 'Low issue', certainty: 'LOW', source: 'docs' }
        ],
        byEnhancer: { docs: { high: 1, medium: 1, low: 1 } },
        totals: { high: 1, medium: 1, low: 1 }
      };

      const report = reporter.generateOrchestratorReport(results, { verbose: true });

      expect(report).toContain('HIGH Certainty Issues (1)');
      expect(report).toContain('MEDIUM Certainty Issues (1)');
      expect(report).toContain('LOW Certainty Issues (1)');
    });

    it('should include target path in header', () => {
      const results = { findings: [], byEnhancer: {}, totals: {} };

      const report = reporter.generateOrchestratorReport(results, { targetPath: 'plugins/enhance/' });

      expect(report).toContain('**Target**: plugins/enhance/');
    });

    it('should handle null/undefined aggregatedResults gracefully', () => {
      const report1 = reporter.generateOrchestratorReport({});
      expect(report1).toContain('Enhancement Analysis Report');
      expect(report1).toContain('No issues found');

      const report2 = reporter.generateOrchestratorReport({ findings: null, byEnhancer: null });
      expect(report2).toContain('No issues found');
    });

    it('should handle findings without optional fields', () => {
      const results = {
        findings: [
          { issue: 'Issue without file', certainty: 'HIGH', source: 'plugin' }
        ],
        byEnhancer: { plugin: { high: 1 } },
        totals: { high: 1 }
      };

      const report = reporter.generateOrchestratorReport(results);

      expect(report).toContain('Issue without file');
      expect(report).toContain('| - |'); // file should show as -
    });
  });

  describe('deduplicateOrchestratorFindings', () => {
    it('should deduplicate identical findings', () => {
      const findings = [
        { file: 'test.md', line: 10, issue: 'Same issue', certainty: 'HIGH', source: 'plugin' },
        { file: 'test.md', line: 10, issue: 'Same issue', certainty: 'HIGH', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(1);
      expect(result[0].issue).toBe('Same issue');
    });

    it('should merge sources for duplicate findings', () => {
      const findings = [
        { file: 'test.md', line: 10, issue: 'Same issue', source: 'plugin' },
        { file: 'test.md', line: 10, issue: 'Same issue', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result[0].sources).toContain('plugin');
      expect(result[0].sources).toContain('agent');
    });

    it('should prefer auto-fixable version in deduplication', () => {
      const findings = [
        { file: 'test.md', line: 10, issue: 'Issue', source: 'plugin', autoFixable: false },
        { file: 'test.md', line: 10, issue: 'Issue', source: 'agent', autoFixable: true }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result[0].autoFixable).toBe(true);
    });

    it('should handle case-insensitive and whitespace differences', () => {
      const findings = [
        { file: 'test.md', line: 10, issue: 'Same Issue', source: 'plugin' },
        { file: 'test.md', line: 10, issue: '  same issue  ', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(1);
    });

    it('should preserve unique findings', () => {
      const findings = [
        { file: 'a.md', line: 10, issue: 'Issue A', source: 'plugin' },
        { file: 'b.md', line: 20, issue: 'Issue B', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(2);
    });

    it('should handle empty findings array', () => {
      const result = reporter.deduplicateOrchestratorFindings([]);
      expect(result).toEqual([]);
    });

    it('should treat different lines as different findings', () => {
      const findings = [
        { file: 'test.md', line: 10, issue: 'Same issue', source: 'plugin' },
        { file: 'test.md', line: 20, issue: 'Same issue', source: 'plugin' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(2);
    });

    it('should treat different files as different findings', () => {
      const findings = [
        { file: 'a.md', line: 10, issue: 'Same issue', source: 'plugin' },
        { file: 'b.md', line: 10, issue: 'Same issue', source: 'plugin' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(2);
    });

    it('should handle missing line (defaults to 0)', () => {
      const findings = [
        { file: 'test.md', issue: 'Issue', source: 'plugin' },
        { file: 'test.md', issue: 'Issue', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(1);
    });

    it('should handle missing file field', () => {
      const findings = [
        { line: 10, issue: 'Issue', source: 'plugin' },
        { line: 10, issue: 'Issue', source: 'agent' }
      ];

      const result = reporter.deduplicateOrchestratorFindings(findings);

      expect(result.length).toBe(1);
    });
  });
});
