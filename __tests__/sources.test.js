/**
 * Tests for lib/sources modules
 * - source-cache.js
 * - custom-handler.js
 * - policy-questions.js
 */

const fs = require('fs');
const sourceCache = require('../lib/sources/source-cache');
const customHandler = require('../lib/sources/custom-handler');
const policyQuestions = require('../lib/sources/policy-questions');

const SOURCES_DIR = '.claude/sources';

describe('source-cache', () => {
  beforeEach(() => {
    // Clean up any existing cache
    if (fs.existsSync(SOURCES_DIR)) {
      fs.rmSync(SOURCES_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up after all tests
    if (fs.existsSync(SOURCES_DIR)) {
      fs.rmSync(SOURCES_DIR, { recursive: true });
    }
  });

  describe('getPreference', () => {
    it('should return null when no preference cached', () => {
      expect(sourceCache.getPreference()).toBeNull();
    });

    it('should return cached preference after saving', () => {
      sourceCache.savePreference({ source: 'github' });
      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('github');
    });
  });

  describe('savePreference', () => {
    it('should save simple source preference', () => {
      sourceCache.savePreference({ source: 'gitlab' });
      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('gitlab');
      expect(pref.savedAt).toBeDefined();
    });

    it('should save custom source preference with type and tool', () => {
      sourceCache.savePreference({
        source: 'custom',
        type: 'cli',
        tool: 'tea'
      });
      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('custom');
      expect(pref.type).toBe('cli');
      expect(pref.tool).toBe('tea');
    });

    it('should overwrite existing preference', () => {
      sourceCache.savePreference({ source: 'github' });
      sourceCache.savePreference({ source: 'gitlab' });
      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('gitlab');
    });
  });

  describe('getToolCapabilities', () => {
    it('should return null for unknown tool', () => {
      expect(sourceCache.getToolCapabilities('unknown-tool')).toBeNull();
    });

    it('should return cached capabilities after saving', () => {
      const capabilities = {
        features: ['issues', 'prs'],
        commands: { list_issues: 'tea issues list' }
      };
      sourceCache.saveToolCapabilities('tea', capabilities);
      const cached = sourceCache.getToolCapabilities('tea');
      expect(cached.features).toEqual(['issues', 'prs']);
      expect(cached.commands.list_issues).toBe('tea issues list');
      expect(cached.discoveredAt).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should remove all cached files', () => {
      sourceCache.savePreference({ source: 'github' });
      sourceCache.saveToolCapabilities('tea', { features: [] });
      sourceCache.clearCache();
      expect(sourceCache.getPreference()).toBeNull();
      expect(sourceCache.getToolCapabilities('tea')).toBeNull();
    });
  });

  describe('isPreferred', () => {
    it('should return true for matching source', () => {
      sourceCache.savePreference({ source: 'github' });
      expect(sourceCache.isPreferred('github')).toBe(true);
    });

    it('should return false for non-matching source', () => {
      sourceCache.savePreference({ source: 'github' });
      expect(sourceCache.isPreferred('gitlab')).toBe(false);
    });

    it('should return false when no preference cached', () => {
      expect(sourceCache.isPreferred('github')).toBe(false);
    });
  });
});

describe('custom-handler', () => {
  describe('SOURCE_TYPES', () => {
    it('should define all source types', () => {
      expect(customHandler.SOURCE_TYPES.MCP).toBe('mcp');
      expect(customHandler.SOURCE_TYPES.CLI).toBe('cli');
      expect(customHandler.SOURCE_TYPES.SKILL).toBe('skill');
      expect(customHandler.SOURCE_TYPES.FILE).toBe('file');
    });
  });

  describe('getCustomTypeQuestion', () => {
    it('should return valid question structure', () => {
      const q = customHandler.getCustomTypeQuestion();
      expect(q.header).toBe('Source Type');
      expect(q.question).toContain('type');
      expect(q.options).toHaveLength(4);
      expect(q.multiSelect).toBe(false);
    });

    it('should have all source type options', () => {
      const q = customHandler.getCustomTypeQuestion();
      const labels = q.options.map(o => o.label);
      expect(labels).toContain('CLI Tool');
      expect(labels).toContain('MCP Server');
      expect(labels).toContain('Skill/Plugin');
      expect(labels).toContain('File Path');
    });
  });

  describe('getCustomNameQuestion', () => {
    it('should return CLI-specific question', () => {
      const q = customHandler.getCustomNameQuestion('cli');
      expect(q.header).toBe('CLI Tool');
      expect(q.hint).toContain('tea');
    });

    it('should return MCP-specific question', () => {
      const q = customHandler.getCustomNameQuestion('mcp');
      expect(q.header).toBe('MCP Server');
      expect(q.hint).toContain('mcp');
    });

    it('should return skill-specific question', () => {
      const q = customHandler.getCustomNameQuestion('skill');
      expect(q.header).toBe('Skill Name');
    });

    it('should return file-specific question', () => {
      const q = customHandler.getCustomNameQuestion('file');
      expect(q.header).toBe('File Path');
      expect(q.hint).toContain('backlog');
    });

    it('should default to CLI for unknown type', () => {
      const q = customHandler.getCustomNameQuestion('unknown');
      expect(q.header).toBe('CLI Tool');
    });
  });

  describe('mapTypeSelection', () => {
    it('should map CLI Tool to cli', () => {
      expect(customHandler.mapTypeSelection('CLI Tool')).toBe('cli');
    });

    it('should map MCP Server to mcp', () => {
      expect(customHandler.mapTypeSelection('MCP Server')).toBe('mcp');
    });

    it('should map Skill/Plugin to skill', () => {
      expect(customHandler.mapTypeSelection('Skill/Plugin')).toBe('skill');
    });

    it('should map File Path to file', () => {
      expect(customHandler.mapTypeSelection('File Path')).toBe('file');
    });

    it('should default to cli for unknown selection', () => {
      expect(customHandler.mapTypeSelection('Unknown')).toBe('cli');
    });
  });

  describe('probeCLI', () => {
    it('should return known patterns for gh when installed', () => {
      const caps = customHandler.probeCLI('gh');
      expect(caps.type).toBe('cli');
      expect(caps.tool).toBe('gh');
      // gh is usually installed - if available, check patterns
      if (caps.available) {
        expect(caps.features).toContain('issues');
        expect(caps.features).toContain('prs');
        expect(caps.commands.list_issues).toBe('gh issue list');
        expect(caps.pattern).toBe('known');
      } else {
        // Not installed - just verify structure
        expect(caps.available).toBe(false);
        expect(caps.features).toEqual([]);
      }
    });

    it('should return known patterns for tea when installed', () => {
      const caps = customHandler.probeCLI('tea');
      expect(caps.tool).toBe('tea');
      // tea may not be installed
      if (caps.available) {
        expect(caps.features).toContain('issues');
        expect(caps.commands.list_issues).toBe('tea issues list');
        expect(caps.commands.create_pr).toContain('tea pulls create');
      } else {
        expect(caps.available).toBe(false);
      }
    });

    it('should return known patterns for glab when installed', () => {
      const caps = customHandler.probeCLI('glab');
      expect(caps.tool).toBe('glab');
      // glab may not be installed
      if (caps.available) {
        expect(caps.features).toContain('ci');
        expect(caps.commands.ci_status).toBe('glab ci status');
      } else {
        expect(caps.available).toBe(false);
      }
    });

    it('should return unavailable for unknown tool', () => {
      const caps = customHandler.probeCLI('unknown-cli-xyz-123');
      expect(caps.tool).toBe('unknown-cli-xyz-123');
      expect(caps.available).toBe(false);
      expect(caps.features).toEqual([]);
    });

    it('should have correct structure regardless of availability', () => {
      const caps = customHandler.probeCLI('any-tool');
      expect(caps).toHaveProperty('type', 'cli');
      expect(caps).toHaveProperty('tool');
      expect(caps).toHaveProperty('available');
      expect(caps).toHaveProperty('features');
      expect(caps).toHaveProperty('commands');
    });
  });

  describe('buildCustomConfig', () => {
    beforeEach(() => {
      sourceCache.clearCache();
    });

    afterAll(() => {
      if (fs.existsSync(SOURCES_DIR)) {
        fs.rmSync(SOURCES_DIR, { recursive: true });
      }
    });

    it('should build CLI config and cache capabilities', () => {
      const config = customHandler.buildCustomConfig('cli', 'tea');
      expect(config.source).toBe('custom');
      expect(config.type).toBe('cli');
      expect(config.tool).toBe('tea');
      expect(config.capabilities).toBeDefined();

      // Should have cached the preference
      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('custom');
      expect(pref.tool).toBe('tea');
    });

    it('should build MCP config', () => {
      const config = customHandler.buildCustomConfig('mcp', 'gitea-mcp');
      expect(config.source).toBe('custom');
      expect(config.type).toBe('mcp');
      expect(config.tool).toBe('gitea-mcp');
    });

    it('should build file config', () => {
      const config = customHandler.buildCustomConfig('file', './backlog.md');
      expect(config.source).toBe('custom');
      expect(config.type).toBe('file');
      expect(config.tool).toBe('./backlog.md');
    });
  });
});

describe('policy-questions', () => {
  beforeEach(() => {
    sourceCache.clearCache();
  });

  afterAll(() => {
    if (fs.existsSync(SOURCES_DIR)) {
      fs.rmSync(SOURCES_DIR, { recursive: true });
    }
  });

  describe('getPolicyQuestions', () => {
    it('should return all 3 questions', () => {
      const { questions } = policyQuestions.getPolicyQuestions();
      expect(questions).toHaveLength(3);
      expect(questions[0].header).toBe('Source');
      expect(questions[1].header).toBe('Priority');
      expect(questions[2].header).toBe('Stop Point');
    });

    it('should return null cachedPreference when no cache', () => {
      const { cachedPreference } = policyQuestions.getPolicyQuestions();
      expect(cachedPreference).toBeNull();
    });

    it('should have 5 source options when no cache', () => {
      const { questions } = policyQuestions.getPolicyQuestions();
      const sourceQ = questions[0];
      expect(sourceQ.options).toHaveLength(5);
      expect(sourceQ.options[0].label).toBe('GitHub Issues');
    });

    it('should prepend cached option when preference exists', () => {
      sourceCache.savePreference({ source: 'github' });
      const { questions, cachedPreference } = policyQuestions.getPolicyQuestions();
      const sourceQ = questions[0];

      expect(cachedPreference).not.toBeNull();
      expect(sourceQ.options).toHaveLength(6); // 5 standard + 1 cached
      expect(sourceQ.options[0].label).toContain('last used');
      expect(sourceQ.options[0].label).toContain('GitHub');
    });

    it('should format custom source in cached option', () => {
      sourceCache.savePreference({ source: 'custom', type: 'cli', tool: 'tea' });
      const { questions } = policyQuestions.getPolicyQuestions();
      const sourceQ = questions[0];

      expect(sourceQ.options[0].label).toContain('tea');
      expect(sourceQ.options[0].label).toContain('cli');
      expect(sourceQ.options[0].label).toContain('last used');
    });

    it('should have correct priority options', () => {
      const { questions } = policyQuestions.getPolicyQuestions();
      const priorityQ = questions[1];
      const labels = priorityQ.options.map(o => o.label);

      expect(labels).toContain('All');
      expect(labels).toContain('Bugs');
      expect(labels).toContain('Security');
      expect(labels).toContain('Features');
    });

    it('should have correct stop point options', () => {
      const { questions } = policyQuestions.getPolicyQuestions();
      const stopQ = questions[2];
      const labels = stopQ.options.map(o => o.label);

      expect(labels).toContain('Merged');
      expect(labels).toContain('PR Created');
      expect(labels).toContain('Implemented');
      expect(labels).toContain('Deployed');
      expect(labels).toContain('Production');
    });

    it('should set multiSelect to false for all questions', () => {
      const { questions } = policyQuestions.getPolicyQuestions();
      questions.forEach(q => {
        expect(q.multiSelect).toBe(false);
      });
    });
  });

  describe('getCustomTypeQuestions', () => {
    it('should return questions array with type question', () => {
      const { questions } = policyQuestions.getCustomTypeQuestions();
      expect(questions).toHaveLength(1);
      expect(questions[0].header).toBe('Source Type');
    });
  });

  describe('getCustomNameQuestion', () => {
    it('should return questions array with name question', () => {
      const { questions } = policyQuestions.getCustomNameQuestion('cli');
      expect(questions).toHaveLength(1);
      expect(questions[0].header).toBe('CLI Tool');
    });
  });

  describe('parseAndCachePolicy', () => {
    it('should map GitHub Issues correctly', () => {
      const policy = policyQuestions.parseAndCachePolicy({
        source: 'GitHub Issues',
        priority: 'Bugs',
        stopPoint: 'PR Created'
      });

      expect(policy.taskSource.source).toBe('github');
      expect(policy.priorityFilter).toBe('bugs');
      expect(policy.stoppingPoint).toBe('pr-created');
    });

    it('should map GitLab Issues correctly', () => {
      const policy = policyQuestions.parseAndCachePolicy({
        source: 'GitLab Issues',
        priority: 'Security',
        stopPoint: 'Merged'
      });

      expect(policy.taskSource.source).toBe('gitlab');
      expect(policy.priorityFilter).toBe('security');
      expect(policy.stoppingPoint).toBe('merged');
    });

    it('should map Local tasks.md correctly', () => {
      const policy = policyQuestions.parseAndCachePolicy({
        source: 'Local tasks.md',
        priority: 'Features',
        stopPoint: 'Implemented'
      });

      expect(policy.taskSource.source).toBe('local');
      expect(policy.priorityFilter).toBe('features');
      expect(policy.stoppingPoint).toBe('implemented');
    });

    it('should handle cached option selection', () => {
      sourceCache.savePreference({ source: 'github' });
      const policy = policyQuestions.parseAndCachePolicy({
        source: 'GitHub (last used)',
        priority: 'All',
        stopPoint: 'Merged'
      });

      expect(policy.taskSource.source).toBe('github');
    });

    it('should handle Other source with description', () => {
      const policy = policyQuestions.parseAndCachePolicy({
        source: 'Other',
        priority: 'All',
        stopPoint: 'Merged',
        custom: { description: 'My Jira board' }
      });

      expect(policy.taskSource.source).toBe('other');
      expect(policy.taskSource.description).toBe('My Jira board');
    });

    it('should cache preference for standard sources', () => {
      sourceCache.clearCache();
      policyQuestions.parseAndCachePolicy({
        source: 'GitHub Issues',
        priority: 'All',
        stopPoint: 'Merged'
      });

      const pref = sourceCache.getPreference();
      expect(pref.source).toBe('github');
    });

    it('should NOT cache preference for Other source', () => {
      sourceCache.clearCache();
      policyQuestions.parseAndCachePolicy({
        source: 'Other',
        priority: 'All',
        stopPoint: 'Merged',
        custom: { description: 'Ad-hoc source' }
      });

      const pref = sourceCache.getPreference();
      expect(pref).toBeNull();
    });
  });

  describe('helper functions', () => {
    describe('isUsingCached', () => {
      it('should return true for cached selection', () => {
        expect(policyQuestions.isUsingCached('GitHub (last used)')).toBe(true);
        expect(policyQuestions.isUsingCached('tea (cli) (last used)')).toBe(true);
      });

      it('should return false for standard selection', () => {
        expect(policyQuestions.isUsingCached('GitHub Issues')).toBe(false);
        expect(policyQuestions.isUsingCached('Custom')).toBe(false);
      });
    });

    describe('needsCustomFollowUp', () => {
      it('should return true for Custom', () => {
        expect(policyQuestions.needsCustomFollowUp('Custom')).toBe(true);
      });

      it('should return false for other options', () => {
        expect(policyQuestions.needsCustomFollowUp('GitHub Issues')).toBe(false);
        expect(policyQuestions.needsCustomFollowUp('Other')).toBe(false);
      });
    });

    describe('needsOtherDescription', () => {
      it('should return true for Other', () => {
        expect(policyQuestions.needsOtherDescription('Other')).toBe(true);
      });

      it('should return false for other options', () => {
        expect(policyQuestions.needsOtherDescription('GitHub Issues')).toBe(false);
        expect(policyQuestions.needsOtherDescription('Custom')).toBe(false);
      });
    });
  });
});

describe('integration', () => {
  beforeEach(() => {
    sourceCache.clearCache();
  });

  afterAll(() => {
    if (fs.existsSync(SOURCES_DIR)) {
      fs.rmSync(SOURCES_DIR, { recursive: true });
    }
  });

  it('should handle full workflow: first run with GitHub', () => {
    // First run - no cache
    const { questions, cachedPreference } = policyQuestions.getPolicyQuestions();
    expect(cachedPreference).toBeNull();
    expect(questions[0].options[0].label).toBe('GitHub Issues');

    // User selects GitHub
    const policy = policyQuestions.parseAndCachePolicy({
      source: 'GitHub Issues',
      priority: 'All',
      stopPoint: 'Merged'
    });

    expect(policy.taskSource.source).toBe('github');
    expect(policy.priorityFilter).toBe('all');
    expect(policy.stoppingPoint).toBe('merged');

    // Verify cached
    expect(sourceCache.getPreference().source).toBe('github');
  });

  it('should handle full workflow: second run with cached preference', () => {
    // Setup: first run cached GitHub
    sourceCache.savePreference({ source: 'github' });

    // Second run - should see cached option first
    const { questions, cachedPreference } = policyQuestions.getPolicyQuestions();
    expect(cachedPreference.source).toBe('github');
    expect(questions[0].options[0].label).toContain('last used');

    // User selects cached option
    const policy = policyQuestions.parseAndCachePolicy({
      source: 'GitHub (last used)',
      priority: 'Bugs',
      stopPoint: 'PR Created'
    });

    expect(policy.taskSource.source).toBe('github');
  });

  it('should handle full workflow: custom CLI source', () => {
    // User selects Custom
    expect(policyQuestions.needsCustomFollowUp('Custom')).toBe(true);

    // Get type question
    const typeQ = policyQuestions.getCustomTypeQuestions();
    expect(typeQ.questions[0].options.map(o => o.label)).toContain('CLI Tool');

    // User selects CLI, map it
    const typeInternal = customHandler.mapTypeSelection('CLI Tool');
    expect(typeInternal).toBe('cli');

    // Get name question
    const nameQ = policyQuestions.getCustomNameQuestion(typeInternal);
    expect(nameQ.questions[0].header).toBe('CLI Tool');

    // Build config
    const config = customHandler.buildCustomConfig('cli', 'tea');
    expect(config.source).toBe('custom');
    expect(config.type).toBe('cli');
    expect(config.tool).toBe('tea');

    // Parse policy with custom
    const policy = policyQuestions.parseAndCachePolicy({
      source: 'Custom',
      priority: 'All',
      stopPoint: 'Merged',
      custom: { type: 'cli', name: 'tea' }
    });

    // Custom config should be built via buildCustomConfig internally
    expect(policy.taskSource.source).toBe('custom');
  });

  it('should handle full workflow: Other source (ad-hoc)', () => {
    // User selects Other
    expect(policyQuestions.needsOtherDescription('Other')).toBe(true);

    // Parse policy with description
    const policy = policyQuestions.parseAndCachePolicy({
      source: 'Other',
      priority: 'All',
      stopPoint: 'Merged',
      custom: { description: 'Tasks are in Linear' }
    });

    expect(policy.taskSource.source).toBe('other');
    expect(policy.taskSource.description).toBe('Tasks are in Linear');

    // Should NOT be cached (ad-hoc)
    expect(sourceCache.getPreference()).toBeNull();
  });
});

describe('security', () => {
  beforeEach(() => {
    sourceCache.clearCache();
  });

  afterAll(() => {
    if (fs.existsSync(SOURCES_DIR)) {
      fs.rmSync(SOURCES_DIR, { recursive: true });
    }
  });

  describe('command injection prevention', () => {
    it('should reject tool names with shell metacharacters', () => {
      const caps = customHandler.probeCLI('; ls -la');
      expect(caps.available).toBe(false);
      expect(caps.features).toEqual([]);
    });

    it('should reject tool names with command substitution', () => {
      const caps = customHandler.probeCLI('$(whoami)');
      expect(caps.available).toBe(false);
    });

    it('should reject tool names with pipes', () => {
      const caps = customHandler.probeCLI('echo test | cat');
      expect(caps.available).toBe(false);
    });

    it('should reject tool names with backticks', () => {
      const caps = customHandler.probeCLI('`whoami`');
      expect(caps.available).toBe(false);
    });

    it('should validate tool name format', () => {
      expect(customHandler.isValidToolName('gh')).toBe(true);
      expect(customHandler.isValidToolName('tea')).toBe(true);
      expect(customHandler.isValidToolName('jira-cli')).toBe(true);
      expect(customHandler.isValidToolName('my_tool')).toBe(true);
      expect(customHandler.isValidToolName('; rm -rf /')).toBe(false);
      expect(customHandler.isValidToolName('../../../etc/passwd')).toBe(false);
      expect(customHandler.isValidToolName('tool;evil')).toBe(false);
    });
  });

  describe('path traversal prevention', () => {
    it('should reject tool names with path traversal in getToolCapabilities', () => {
      const result = sourceCache.getToolCapabilities('../../etc/passwd');
      expect(result).toBeNull();
    });

    it('should reject tool names with forward slashes', () => {
      const result = sourceCache.getToolCapabilities('some/path/tool');
      expect(result).toBeNull();
    });

    it('should reject tool names with backslashes', () => {
      const result = sourceCache.getToolCapabilities('some\\path\\tool');
      expect(result).toBeNull();
    });

    it('should reject tool names with double dots', () => {
      const result = sourceCache.getToolCapabilities('..foo');
      expect(result).toBeNull();
    });

    it('should not save capabilities for invalid tool names', () => {
      const capabilities = { features: ['test'] };
      sourceCache.saveToolCapabilities('../malicious', capabilities);
      // Should not have created file outside sources dir
      expect(sourceCache.getToolCapabilities('malicious')).toBeNull();
    });

    it('should allow valid tool names', () => {
      const capabilities = { features: ['issues'] };
      sourceCache.saveToolCapabilities('valid-tool', capabilities);
      const result = sourceCache.getToolCapabilities('valid-tool');
      expect(result).not.toBeNull();
      expect(result.features).toEqual(['issues']);
    });
  });
});
