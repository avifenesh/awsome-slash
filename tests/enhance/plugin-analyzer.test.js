/**
 * Plugin Analyzer Tests
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Import modules under test
const pluginPatterns = require('../../lib/enhance/plugin-patterns');
const toolPatterns = require('../../lib/enhance/tool-patterns');
const securityPatterns = require('../../lib/enhance/security-patterns');
const reporter = require('../../lib/enhance/reporter');
const fixer = require('../../lib/enhance/fixer');

describe('Plugin Patterns', () => {
  describe('missing_additional_properties', () => {
    it('should detect missing additionalProperties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const pattern = pluginPatterns.pluginPatterns.missing_additional_properties;
      const result = pattern.check(schema);

      assert.ok(result, 'Should detect missing additionalProperties');
      assert.ok(result.issue.includes('additionalProperties'));
    });

    it('should not flag when additionalProperties is false', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: false
      };

      const pattern = pluginPatterns.pluginPatterns.missing_additional_properties;
      const result = pattern.check(schema);

      assert.strictEqual(result, null, 'Should not flag when additionalProperties is false');
    });

    it('should provide auto-fix function', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const pattern = pluginPatterns.pluginPatterns.missing_additional_properties;
      const result = pattern.check(schema);

      assert.ok(result.autoFixFn, 'Should have auto-fix function');

      const fixed = result.autoFixFn(schema);
      assert.strictEqual(fixed.additionalProperties, false);
    });
  });

  describe('missing_required_fields', () => {
    it('should detect missing required array', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };

      const pattern = pluginPatterns.pluginPatterns.missing_required_fields;
      const result = pattern.check(schema);

      assert.ok(result, 'Should detect missing required array');
    });

    it('should not flag when required is present', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      };

      const pattern = pluginPatterns.pluginPatterns.missing_required_fields;
      const result = pattern.check(schema);

      assert.strictEqual(result, null);
    });
  });

  describe('version_mismatch', () => {
    it('should detect version mismatch', () => {
      const pluginJson = { version: '1.0.0' };
      const packageJson = { version: '2.0.0' };

      const pattern = pluginPatterns.pluginPatterns.version_mismatch;
      const result = pattern.check(pluginJson, packageJson);

      assert.ok(result, 'Should detect version mismatch');
      assert.ok(result.issue.includes('1.0.0'));
      assert.ok(result.issue.includes('2.0.0'));
    });

    it('should not flag when versions match', () => {
      const pluginJson = { version: '2.0.0' };
      const packageJson = { version: '2.0.0' };

      const pattern = pluginPatterns.pluginPatterns.version_mismatch;
      const result = pattern.check(pluginJson, packageJson);

      assert.strictEqual(result, null);
    });
  });

  describe('deep_nesting', () => {
    it('should detect deeply nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const pattern = pluginPatterns.pluginPatterns.deep_nesting;
      const result = pattern.check(schema);

      assert.ok(result, 'Should detect deep nesting');
      assert.ok(result.issue.includes('nested'));
    });
  });
});

describe('Tool Patterns', () => {
  describe('poor_tool_naming', () => {
    it('should detect non-verb tool names', () => {
      const tool = { name: 'userProfile' };

      const pattern = toolPatterns.toolPatterns.poor_tool_naming;
      const result = pattern.check(tool);

      assert.ok(result, 'Should flag non-verb name');
    });

    it('should accept verb-prefixed names', () => {
      const tool = { name: 'get_user_profile' };

      const pattern = toolPatterns.toolPatterns.poor_tool_naming;
      const result = pattern.check(tool);

      assert.strictEqual(result, null);
    });
  });

  describe('analyzeTool', () => {
    it('should return issues for problematic tool', () => {
      const tool = {
        name: 'data',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      };

      const issues = toolPatterns.analyzeTool(tool);

      assert.ok(issues.length > 0, 'Should find issues');
    });
  });
});

describe('Security Patterns', () => {
  describe('unrestricted_bash', () => {
    it('should detect unrestricted Bash in frontmatter', () => {
      const content = `---
name: my-agent
tools: Read, Bash, Grep
---

# My Agent
`;

      const issues = securityPatterns.checkSecurity(content, 'test.md');

      const bashIssue = issues.find(i => i.patternId === 'unrestricted_bash');
      assert.ok(bashIssue, 'Should detect unrestricted Bash');
    });

    it('should not flag restricted Bash', () => {
      const content = `---
name: my-agent
tools: Read, Bash(git:*), Grep
---

# My Agent
`;

      const issues = securityPatterns.checkSecurity(content, 'test.md');

      const bashIssue = issues.find(i => i.patternId === 'unrestricted_bash');
      assert.strictEqual(bashIssue, undefined, 'Should not flag restricted Bash');
    });
  });

  describe('hardcoded_secrets', () => {
    it('should detect hardcoded API keys', () => {
      const content = `
const config = {
  api_key: "sk_live_abc123def456ghi789"
};
`;

      const issues = securityPatterns.checkSecurity(content, 'config.js');

      const secretIssue = issues.find(i => i.patternId === 'hardcoded_secrets');
      assert.ok(secretIssue, 'Should detect hardcoded secret');
    });
  });
});

describe('Reporter', () => {
  describe('generateReport', () => {
    it('should generate markdown report', () => {
      const results = {
        pluginName: 'test-plugin',
        filesScanned: 5,
        toolIssues: [
          { tool: 'get_data', issue: 'Missing description', certainty: 'HIGH' }
        ],
        structureIssues: [],
        securityIssues: []
      };

      const report = reporter.generateReport(results);

      assert.ok(report.includes('test-plugin'));
      assert.ok(report.includes('get_data'));
      assert.ok(report.includes('HIGH'));
    });

    it('should filter LOW certainty when not verbose', () => {
      const results = {
        pluginName: 'test-plugin',
        filesScanned: 1,
        toolIssues: [
          { tool: 'a', issue: 'Low issue', certainty: 'LOW' },
          { tool: 'b', issue: 'High issue', certainty: 'HIGH' }
        ],
        structureIssues: [],
        securityIssues: []
      };

      const report = reporter.generateReport(results, { verbose: false });

      assert.ok(!report.includes('Low issue'), 'Should not include LOW issues');
      assert.ok(report.includes('High issue'), 'Should include HIGH issues');
    });
  });
});

describe('Fixer', () => {
  describe('fixAdditionalProperties', () => {
    it('should add additionalProperties: false', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const fixed = fixer.fixAdditionalProperties(schema);

      assert.strictEqual(fixed.additionalProperties, false);
    });

    it('should recursively fix nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: { type: 'string' }
            }
          }
        }
      };

      const fixed = fixer.fixAdditionalProperties(schema);

      assert.strictEqual(fixed.additionalProperties, false);
      assert.strictEqual(fixed.properties.nested.additionalProperties, false);
    });
  });

  describe('fixRequiredFields', () => {
    it('should add required array', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };

      const fixed = fixer.fixRequiredFields(schema);

      assert.ok(fixed.required);
      assert.ok(fixed.required.includes('name'));
      assert.ok(fixed.required.includes('age'));
    });

    it('should exclude optional fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nickname: { type: 'string', description: 'Optional nickname' }
        }
      };

      const fixed = fixer.fixRequiredFields(schema);

      assert.ok(fixed.required.includes('name'));
      assert.ok(!fixed.required.includes('nickname'), 'Should not include optional field');
    });
  });

  describe('previewFixes', () => {
    it('should show which fixes will be applied', () => {
      const issues = [
        { certainty: 'HIGH', autoFixFn: () => {}, issue: 'Fix me' },
        { certainty: 'MEDIUM', issue: 'Manual fix' }
      ];

      const previews = fixer.previewFixes(issues);

      assert.strictEqual(previews[0].willApply, true);
      assert.strictEqual(previews[1].willApply, false);
    });
  });
});
