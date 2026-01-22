/**
 * Agent Analyzer Tests
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import modules under test
const agentPatterns = require('../../lib/enhance/agent-patterns');
const agentAnalyzer = require('../../lib/enhance/agent-analyzer');
const fixer = require('../../lib/enhance/fixer');

describe('Agent Patterns', () => {
  describe('missing_frontmatter', () => {
    it('should detect missing frontmatter', () => {
      const content = '# My Agent\n\nThis is an agent without frontmatter.';
      const pattern = agentPatterns.agentPatterns.missing_frontmatter;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('frontmatter');
    });

    it('should not flag when frontmatter exists', () => {
      const content = '---\nname: test\n---\n\n# Agent';
      const pattern = agentPatterns.agentPatterns.missing_frontmatter;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_name', () => {
    it('should detect missing name in frontmatter', () => {
      const frontmatter = {
        description: 'Test agent'
      };
      const pattern = agentPatterns.agentPatterns.missing_name;
      const result = pattern.check(frontmatter);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('name');
    });

    it('should not flag when name exists', () => {
      const frontmatter = {
        name: 'test-agent',
        description: 'Test'
      };
      const pattern = agentPatterns.agentPatterns.missing_name;
      const result = pattern.check(frontmatter);

      expect(result).toBeNull();
    });
  });

  describe('missing_description', () => {
    it('should detect missing description', () => {
      const frontmatter = {
        name: 'test-agent'
      };
      const pattern = agentPatterns.agentPatterns.missing_description;
      const result = pattern.check(frontmatter);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('description');
    });

    it('should not flag when description exists', () => {
      const frontmatter = {
        name: 'test',
        description: 'Test agent'
      };
      const pattern = agentPatterns.agentPatterns.missing_description;
      const result = pattern.check(frontmatter);

      expect(result).toBeNull();
    });
  });

  describe('missing_role', () => {
    it('should detect missing role section', () => {
      const content = '# Agent\n\nThis agent does things.';
      const pattern = agentPatterns.agentPatterns.missing_role;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('role');
    });

    it('should not flag when "You are" exists', () => {
      const content = 'You are an agent that does things.';
      const pattern = agentPatterns.agentPatterns.missing_role;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });

    it('should not flag when role section exists', () => {
      const content = '## Your Role\n\nAgent description.';
      const pattern = agentPatterns.agentPatterns.missing_role;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_output_format', () => {
    it('should detect missing output format', () => {
      const content = '# Agent\n\nDoes things.';
      const pattern = agentPatterns.agentPatterns.missing_output_format;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('output format');
    });

    it('should not flag when output format exists', () => {
      const content = '## Output Format\n\nReturn JSON.';
      const pattern = agentPatterns.agentPatterns.missing_output_format;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_constraints', () => {
    it('should detect missing constraints', () => {
      const content = '# Agent\n\nDoes things.';
      const pattern = agentPatterns.agentPatterns.missing_constraints;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('constraints');
    });

    it('should not flag when constraints exist', () => {
      const content = '## Constraints\n\nDo not do X.';
      const pattern = agentPatterns.agentPatterns.missing_constraints;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('unrestricted_tools', () => {
    it('should detect missing tools field', () => {
      const frontmatter = {
        name: 'test',
        description: 'Test'
      };
      const pattern = agentPatterns.agentPatterns.unrestricted_tools;
      const result = pattern.check(frontmatter);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('tools');
    });

    it('should not flag when tools field exists', () => {
      const frontmatter = {
        name: 'test',
        tools: 'Read, Grep'
      };
      const pattern = agentPatterns.agentPatterns.unrestricted_tools;
      const result = pattern.check(frontmatter);

      expect(result).toBeNull();
    });
  });

  describe('unrestricted_bash', () => {
    it('should detect unrestricted Bash', () => {
      const frontmatter = {
        tools: 'Read, Bash, Grep'
      };
      const pattern = agentPatterns.agentPatterns.unrestricted_bash;
      const result = pattern.check(frontmatter);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('Bash');
    });

    it('should not flag restricted Bash', () => {
      const frontmatter = {
        tools: 'Read, Bash(git:*), Grep'
      };
      const pattern = agentPatterns.agentPatterns.unrestricted_bash;
      const result = pattern.check(frontmatter);

      expect(result).toBeNull();
    });
  });

  describe('missing_xml_structure', () => {
    it('should suggest XML for complex prompts', () => {
      const content = `
## Section 1
Content

## Section 2
Content

## Section 3
Content

## Section 4
Content

## Section 5
Content

- List item
- List item

\`\`\`javascript
code
\`\`\`
      `;
      const pattern = agentPatterns.agentPatterns.missing_xml_structure;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('XML');
    });

    it('should not suggest XML for simple prompts', () => {
      const content = '## Section\n\nSimple content.';
      const pattern = agentPatterns.agentPatterns.missing_xml_structure;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });

    it('should not flag if XML already exists', () => {
      const content = `
## Section 1
## Section 2
## Section 3
## Section 4
## Section 5

<rules>
- Rule 1
</rules>

\`\`\`code\`\`\`
      `;
      const pattern = agentPatterns.agentPatterns.missing_xml_structure;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('unnecessary_cot', () => {
    it('should detect CoT on simple tasks', () => {
      const content = 'Think step-by-step:\n1. Do simple thing';
      const pattern = agentPatterns.agentPatterns.unnecessary_cot;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('chain-of-thought');
    });

    it('should not flag CoT on complex tasks', () => {
      // Complex = many words (> 500) AND many sections (>= 4)
      const content = `## Section 1
Think step-by-step through this analysis.
## Section 2
More detailed content here.
## Section 3
Even more complex material.
## Section 4
Final section with conclusions.
` + 'Additional detailed analysis content. '.repeat(50);
      const pattern = agentPatterns.agentPatterns.unnecessary_cot;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('missing_cot', () => {
    it('should detect missing CoT on complex tasks', () => {
      // Missing CoT requires: wordCount > 1000, sectionCount >= 5, hasAnalysis keywords
      // Must NOT contain: step-by-step, <thinking>, reasoning, think through
      const longContent = `
## Section 1
Analyze this complex topic thoroughly with multiple considerations.
## Section 2
Evaluate the data in great detail and depth here.
## Section 3
Assess all the parameters carefully and methodically.
## Section 4
Review the findings completely and comprehensively.
## Section 5
Complex logical work is absolutely necessary in this section.
` + 'Detailed analysis content for this complex evaluation task with careful consideration. '.repeat(100);

      const pattern = agentPatterns.agentPatterns.missing_cot;
      const result = pattern.check(longContent);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('reasoning');
    });

    it('should not flag simple tasks', () => {
      const content = 'Simple task.';
      const pattern = agentPatterns.agentPatterns.missing_cot;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('example_count_suboptimal', () => {
    it('should detect too few examples', () => {
      const content = '## Example\n\nOne example.';
      const pattern = agentPatterns.agentPatterns.example_count_suboptimal;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('examples');
    });

    it('should detect too many examples', () => {
      const content = '## Example\n'.repeat(7);
      const pattern = agentPatterns.agentPatterns.example_count_suboptimal;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
    });

    it('should not flag optimal count', () => {
      const content = '## Example 1\n## Example 2\n## Example 3';
      const pattern = agentPatterns.agentPatterns.example_count_suboptimal;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('vague_instructions', () => {
    it('should detect vague language', () => {
      const content = 'Usually do this. Sometimes do that. Often check. Maybe try.';
      const pattern = agentPatterns.agentPatterns.vague_instructions;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('vague');
    });

    it('should not flag definitive language', () => {
      const content = 'Always do this. Never do that. Must check.';
      const pattern = agentPatterns.agentPatterns.vague_instructions;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });

  describe('prompt_bloat', () => {
    it('should detect bloated prompts', () => {
      const content = 'Word '.repeat(2500); // ~10000 chars = ~2500 tokens
      const pattern = agentPatterns.agentPatterns.prompt_bloat;
      const result = pattern.check(content);

      expect(result).toBeTruthy();
      expect(result.issue).toContain('token');
    });

    it('should not flag reasonable prompts', () => {
      const content = 'Word '.repeat(500);
      const pattern = agentPatterns.agentPatterns.prompt_bloat;
      const result = pattern.check(content);

      expect(result).toBeNull();
    });
  });
});

describe('Agent Analyzer', () => {
  describe('parseMarkdownFrontmatter', () => {
    it('should parse valid frontmatter', () => {
      const content = `---
name: test-agent
description: Test
tools: Read, Grep
model: sonnet
---

# Agent Content`;

      const { frontmatter, body } = agentAnalyzer.parseMarkdownFrontmatter(content);

      expect(frontmatter).toBeTruthy();
      expect(frontmatter.name).toBe('test-agent');
      expect(frontmatter.description).toBe('Test');
      expect(frontmatter.tools).toBe('Read, Grep');
      expect(frontmatter.model).toBe('sonnet');
      expect(body).toContain('# Agent Content');
    });

    it('should handle missing frontmatter', () => {
      const content = '# Agent\n\nNo frontmatter.';
      const { frontmatter, body } = agentAnalyzer.parseMarkdownFrontmatter(content);

      expect(frontmatter).toBeNull();
      expect(body).toBe(content);
    });

    it('should handle malformed frontmatter', () => {
      const content = '---\nmalformed\n\nBody';
      const { frontmatter } = agentAnalyzer.parseMarkdownFrontmatter(content);

      expect(frontmatter).toBeNull();
    });
  });

  describe('analyzeAgent', () => {
    let tempDir;
    let tempFile;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
      tempFile = path.join(tempDir, 'test-agent.md');
    });

    afterEach(() => {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    it('should analyze a valid agent', () => {
      const content = `---
name: test-agent
description: Test agent
tools: Read, Grep
model: sonnet
---

## Your Role

You are a test agent.

## Output Format

Return results.

## Constraints

Do not break things.
      `;

      fs.writeFileSync(tempFile, content, 'utf8');

      const results = agentAnalyzer.analyzeAgent(tempFile);

      expect(results.agentName).toBe('test-agent');
      expect(results.structureIssues).toHaveLength(0);
      expect(results.toolIssues).toHaveLength(0);
    });

    it('should detect multiple issues', () => {
      const content = `# Agent without frontmatter

Just some content.
      `;

      fs.writeFileSync(tempFile, content, 'utf8');

      const results = agentAnalyzer.analyzeAgent(tempFile);

      expect(results.structureIssues.length).toBeGreaterThan(0);
    });

    it('should handle missing file', () => {
      const results = agentAnalyzer.analyzeAgent('/nonexistent/file.md');

      expect(results.structureIssues.length).toBeGreaterThan(0);
      expect(results.structureIssues[0].issue).toContain('not found');
    });
  });
});

describe('Fixer - Markdown', () => {
  describe('fixMissingFrontmatter', () => {
    it('should add frontmatter to content without it', () => {
      const content = '# Agent\n\nContent.';
      const fixed = fixer.fixMissingFrontmatter(content);

      expect(fixed).toContain('---');
      expect(fixed).toContain('name:');
      expect(fixed).toContain('description:');
      expect(fixed).toContain('# Agent');
    });
  });

  describe('fixUnrestrictedBash', () => {
    it('should replace unrestricted Bash', () => {
      const content = `---
name: test
tools: Read, Bash, Grep
---`;

      const fixed = fixer.fixUnrestrictedBash(content);

      expect(fixed).toContain('Bash(git:*)');
      expect(fixed).not.toContain('tools: Read, Bash, Grep');
    });

    it('should not affect already restricted Bash', () => {
      const content = `---
name: test
tools: Read, Bash(git:*), Grep
---`;

      const fixed = fixer.fixUnrestrictedBash(content);

      expect(fixed).toBe(content);
    });
  });

  describe('fixMissingRole', () => {
    it('should add role section after frontmatter', () => {
      const content = `---
name: test
---

# Agent`;

      const fixed = fixer.fixMissingRole(content);

      expect(fixed).toContain('## Your Role');
      expect(fixed).toContain('You are an agent');
    });

    it('should add role at beginning if no frontmatter', () => {
      const content = '# Agent\n\nContent.';
      const fixed = fixer.fixMissingRole(content);

      expect(fixed).toContain('## Your Role');
    });
  });
});

describe('Integration', () => {
  it('should get patterns by certainty', () => {
    const highPatterns = agentPatterns.getPatternsByCertainty('HIGH');
    expect(Object.keys(highPatterns).length).toBeGreaterThan(0);
  });

  it('should get patterns by category', () => {
    const structurePatterns = agentPatterns.getPatternsByCategory('structure');
    expect(Object.keys(structurePatterns).length).toBeGreaterThan(0);
  });

  it('should get auto-fixable patterns', () => {
    const autoFixable = agentPatterns.getAutoFixablePatterns();
    expect(Object.keys(autoFixable).length).toBeGreaterThan(0);

    // All should have autoFix: true
    for (const pattern of Object.values(autoFixable)) {
      expect(pattern.autoFix).toBe(true);
    }
  });
});
