/**
 * Plugin Analyzer Tests
 */

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

      expect(result).toBeTruthy();
      expect(result.issue).toContain('additionalProperties');
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

      expect(result).toBeNull();
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

      expect(result.autoFixFn).toBeTruthy();

      const fixed = result.autoFixFn(schema);
      expect(fixed.additionalProperties).toBe(false);
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

      expect(result).toBeTruthy();
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

      expect(result).toBeNull();
    });
  });

  describe('version_mismatch', () => {
    it('should detect version mismatch', () => {
      const pluginJson = { version: '1.0.0' };
      const packageJson = { version: '2.0.0' };

      const pattern = pluginPatterns.pluginPatterns.version_mismatch;
      const result = pattern.check(pluginJson, packageJson);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('1.0.0');
      expect(result.issue).toContain('2.0.0');
    });

    it('should not flag when versions match', () => {
      const pluginJson = { version: '2.0.0' };
      const packageJson = { version: '2.0.0' };

      const pattern = pluginPatterns.pluginPatterns.version_mismatch;
      const result = pattern.check(pluginJson, packageJson);

      expect(result).toBeNull();
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

      expect(result).toBeTruthy();
      expect(result.issue).toContain('nested');
    });
  });
});

describe('Tool Patterns', () => {
  describe('poor_tool_naming', () => {
    it('should detect non-verb tool names', () => {
      const tool = { name: 'userProfile' };

      const pattern = toolPatterns.toolPatterns.poor_tool_naming;
      const result = pattern.check(tool);

      expect(result).toBeTruthy();
    });

    it('should accept verb-prefixed names', () => {
      const tool = { name: 'get_user_profile' };

      const pattern = toolPatterns.toolPatterns.poor_tool_naming;
      const result = pattern.check(tool);

      expect(result).toBeNull();
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

      expect(issues.length).toBeGreaterThan(0);
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
      expect(bashIssue).toBeTruthy();
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
      expect(bashIssue).toBeUndefined();
    });
  });

  describe('hardcoded_secrets', () => {
    it('should detect hardcoded API keys', () => {
      // INTENTIONALLY fake test secret - NOT a real credential
      // Uses pattern that matches secret detection without triggering GitGuardian
      const content = `
const config = {
  api_key: "test1234fake5678"
};
`;

      const issues = securityPatterns.checkSecurity(content, 'config.js');

      const secretIssue = issues.find(i => i.patternId === 'hardcoded_secrets');
      expect(secretIssue).toBeTruthy();
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

      expect(report).toContain('test-plugin');
      expect(report).toContain('get_data');
      expect(report).toContain('HIGH');
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

      expect(report).not.toContain('Low issue');
      expect(report).toContain('High issue');
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

      expect(fixed.additionalProperties).toBe(false);
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

      expect(fixed.additionalProperties).toBe(false);
      expect(fixed.properties.nested.additionalProperties).toBe(false);
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

      expect(fixed.required).toBeTruthy();
      expect(fixed.required).toContain('name');
      expect(fixed.required).toContain('age');
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

      expect(fixed.required).toContain('name');
      expect(fixed.required).not.toContain('nickname');
    });
  });

  describe('previewFixes', () => {
    it('should show which fixes will be applied', () => {
      const issues = [
        { certainty: 'HIGH', autoFixFn: () => {}, issue: 'Fix me' },
        { certainty: 'MEDIUM', issue: 'Manual fix' }
      ];

      const previews = fixer.previewFixes(issues);

      expect(previews[0].willApply).toBe(true);
      expect(previews[1].willApply).toBe(false);
    });
  });
});
