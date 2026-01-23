---
description: Analyze plugin structures, MCP tools, agent prompts, and security patterns
argument-hint: "[target-name] [--fix] [--verbose]"
---

# /enhance:plugin - Plugin Structure Analyzer

Analyze plugin structures, MCP tool definitions, and security patterns against best practices.

## Arguments

Parse from $ARGUMENTS:
- **plugin**: Specific plugin to analyze (default: all)
- **--fix**: Apply auto-fixes for HIGH certainty issues
- **--verbose**: Show all issues including LOW certainty

## Workflow

1. **Discover plugins** - Find all plugins in `plugins/` directory
2. **Load patterns** - Import from `${CLAUDE_PLUGIN_ROOT}/lib/enhance/`
3. **Analyze each plugin**:
   - Validate plugin.json structure
   - Check MCP tool definitions
   - Scan for security patterns
4. **Generate report** - Markdown table grouped by certainty
5. **Apply fixes** - If --fix flag, apply HIGH certainty auto-fixes

## Detection Categories

### HIGH Certainty

| Pattern | Description | Auto-Fix |
|---------|-------------|----------|
| Missing additionalProperties | Schema allows extra fields | Add `"additionalProperties": false` |
| Missing required fields | Parameters not marked required | Add to `required` array |
| Version mismatch | plugin.json vs package.json | Sync versions |
| Missing tool description | Tool has no description | Manual fix required |

### MEDIUM Certainty (verify context)

| Pattern | Description |
|---------|-------------|
| Broad permissions | Agent has `Bash` without restrictions |
| Deep nesting | Parameter schema >2 levels deep |
| Long description | Tool description >500 chars |
| Missing param descriptions | Parameters lack descriptions |

### LOW Certainty (advisory)

| Pattern | Description |
|---------|-------------|
| Tool over-exposure | Many tools in single plugin |
| Optimization hints | Suggested simplifications |

## Output Format

```markdown
## Plugin Analysis: {plugin-name}

### Tool Definitions ({n} issues)
| Tool | Issue | Fix | Certainty |
|------|-------|-----|-----------|
| workflow_start | Missing additionalProperties | Add to schema | HIGH |

### Structure ({n} issues)
- Version mismatch: plugin.json (2.6.1) vs package.json (2.7.0)

### Security ({n} issues)
- `ci-fixer` agent has unrestricted Bash access
```

## Implementation

```javascript
const { pluginAnalyzer } = require('${CLAUDE_PLUGIN_ROOT}/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const pluginName = args.find(a => !a.startsWith('--'));
const applyFixes = args.includes('--fix');
const verbose = args.includes('--verbose');

// Run analysis
const results = await pluginAnalyzer.analyze({
  plugin: pluginName,
  verbose
});

// Generate report
const report = pluginAnalyzer.generateReport(results);
console.log(report);

// Apply fixes if requested
if (applyFixes) {
  const fixed = await pluginAnalyzer.applyFixes(results);
  console.log(`Applied ${fixed.applied.length} fixes`);
}
```

## Success Criteria

- All plugin.json files validated
- MCP tool definitions checked against best practices
- Security patterns scanned
- Clear report with actionable items
- Auto-fix available for HIGH certainty issues

---

# /enhance:agent - Agent Prompt Optimizer

Analyze agent prompt files for prompt engineering best practices and optimization opportunities.

## Arguments

Parse from $ARGUMENTS:
- **agent**: Specific agent to analyze (default: all in plugins/enhance/agents)
- **--fix**: Apply auto-fixes for HIGH certainty issues
- **--verbose**: Show all issues including LOW certainty

## Workflow

1. **Discover agents** - Find all .md files in agents directory
2. **Load patterns** - Import from `${CLAUDE_PLUGIN_ROOT}/lib/enhance/agent-patterns`
3. **Analyze each agent**:
   - Parse YAML frontmatter
   - Check structure (role, output format, constraints)
   - Validate tool restrictions
   - Assess XML structure usage
   - Evaluate chain-of-thought appropriateness
   - Detect anti-patterns and bloat
4. **Generate report** - Markdown table grouped by category
5. **Apply fixes** - If --fix flag, apply HIGH certainty auto-fixes

## Detection Categories

### HIGH Certainty (auto-fixable)

| Pattern | Description | Auto-Fix |
|---------|-------------|----------|
| Missing frontmatter | No YAML frontmatter | Add minimal template |
| Missing name | No name in frontmatter | Manual fix required |
| Missing description | No description in frontmatter | Manual fix required |
| Missing role | No role section | Add "## Your Role" section |
| Missing output format | No output format specification | Manual fix required |
| Missing constraints | No constraints section | Manual fix required |
| Unrestricted tools | No tools field in frontmatter | Manual fix required |
| Unrestricted Bash | Has "Bash" without scope | Replace with "Bash(git:*)" |

### MEDIUM Certainty

| Pattern | Description |
|---------|-------------|
| Missing XML structure | Complex prompt without XML tags |
| Unnecessary CoT | Step-by-step on simple tasks |
| Missing CoT | Complex reasoning without guidance |
| Vague instructions | Fuzzy language like "usually", "sometimes" |

### LOW Certainty (advisory)

| Pattern | Description |
|---------|-------------|
| Example count suboptimal | Not 2-5 examples |
| Prompt bloat | Token count > 2000 |

## Output Format

```markdown
## Agent Analysis: {agent-name}

**File**: {path}
**Analyzed**: {timestamp}

### Summary
- HIGH: {count} issues
- MEDIUM: {count} issues
- LOW: {count} issues

### Structure Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Missing role section | Add role definition | HIGH |

### Tool Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Unrestricted Bash | Replace with Bash(git:*) | HIGH |

### XML Structure Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Complex prompt without XML | Consider XML tags | MEDIUM |

### Chain-of-Thought Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Missing CoT guidance | Add reasoning instructions | MEDIUM |

### Example Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Found 7 examples | Reduce to 2-5 | LOW |

### Anti-Pattern Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Vague language detected | Use definitive instructions | MEDIUM |
```

## Implementation

```javascript
const { agentAnalyzer } = require('${CLAUDE_PLUGIN_ROOT}/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const agentName = args.find(a => !a.startsWith('--'));
const applyFixes = args.includes('--fix');
const verbose = args.includes('--verbose');

// Run analysis
const results = await agentAnalyzer.analyze({
  agent: agentName,
  agentsDir: 'plugins/enhance/agents',
  verbose
});

// Generate report
const report = agentAnalyzer.generateReport(results);
console.log(report);

// Apply fixes if requested
if (applyFixes) {
  const fixed = await agentAnalyzer.applyFixes(results);
  console.log(`\nApplied ${fixed.applied.length} fixes`);
  if (fixed.errors.length > 0) {
    console.log(`Errors: ${fixed.errors.length}`);
  }
}
```

## Example Usage

```bash
# Analyze all agents
/enhance:agent

# Analyze specific agent
/enhance:agent exploration-agent

# Apply auto-fixes
/enhance:agent exploration-agent --fix

# Verbose output (includes LOW certainty)
/enhance:agent --verbose

# Dry run
/enhance:agent --fix --dry-run
```

## Pattern Statistics

- Total patterns: 14
- HIGH certainty: 8 (3 auto-fixable)
- MEDIUM certainty: 5
- LOW certainty: 1

## Success Criteria

- All agent frontmatter validated
- Prompt structure checked
- Tool restrictions verified
- CoT appropriateness assessed
- Clear, actionable report
- Auto-fix available for HIGH certainty issues

---

# /enhance:claudemd - Project Memory Optimizer

Analyze CLAUDE.md/AGENTS.md project memory files for optimization opportunities.

## Arguments

Parse from $ARGUMENTS:
- **path**: Project directory or specific file (default: current directory)
- **--verbose**: Show all issues including LOW certainty

Note: Reference validation (file paths, npm commands) is always enabled.

## Workflow

1. **Find file** - Locate CLAUDE.md or AGENTS.md
2. **Load patterns** - Import from `${CLAUDE_PLUGIN_ROOT}/lib/enhance/projectmemory-patterns`
3. **Analyze structure**:
   - Check for critical rules section
   - Verify architecture/structure section
   - Validate key commands section
4. **Validate references**:
   - Check file paths exist
   - Verify npm commands exist in package.json
5. **Measure efficiency**:
   - Calculate token count
   - Detect README duplication
   - Flag verbosity issues
6. **Check quality**:
   - WHY explanations for rules
   - Nesting depth
7. **Cross-platform**:
   - State directory hardcoding
   - Claude-specific terminology
   - AGENTS.md compatibility mention
8. **Generate report** - Markdown table grouped by category

## Detection Categories

### HIGH Certainty

| Pattern | Description |
|---------|-------------|
| missing_critical_rules | No critical/priority rules section |
| missing_architecture | No architecture/structure overview |
| missing_key_commands | No commands/scripts section |
| broken_file_reference | Referenced file does not exist |
| broken_command_reference | npm command not in package.json |
| hardcoded_state_dir | Hardcoded .claude/ without alternatives |

### MEDIUM Certainty

| Pattern | Description |
|---------|-------------|
| readme_duplication | >40% overlap with README.md |
| excessive_token_count | Exceeds 1500 token recommendation |
| verbose_instructions | Long paragraphs, high avg line length |
| missing_why | Rules without WHY explanations |
| claude_only_terminology | Uses "Claude Code" without alternatives |
| missing_agents_md_mention | CLAUDE.md doesn't note AGENTS.md compat |

### LOW Certainty (advisory)

| Pattern | Description |
|---------|-------------|
| example_overload | >10 code blocks/examples |
| deep_nesting | >3 levels of hierarchy |

## Output Format

```markdown
# Project Memory Analysis: CLAUDE.md

**File**: /path/to/CLAUDE.md
**Type**: CLAUDE.md
**Analyzed**: 2026-01-23T...

## Metrics

| Metric | Value |
|--------|-------|
| Estimated Tokens | 1250 |
| Characters | 5000 |
| Lines | 120 |
| Words | 850 |
| README Overlap | 15% |

## Summary

| Certainty | Count |
|-----------|-------|
| HIGH | 2 |
| MEDIUM | 3 |
| **Total** | **5** |

### Structure Issues (1)

| Issue | Fix | Certainty |
|-------|-----|-----------|
| Missing key commands section | Add "## Key Commands" | HIGH |

### Reference Issues (1)

| Issue | Fix | Certainty |
|-------|-----|-----------|
| Broken file: docs/old.md | Update or remove | HIGH |

### Efficiency Issues (2)

| Issue | Fix | Certainty |
|-------|-----|-----------|
| 45% README overlap | Reference instead of duplicate | MEDIUM |
| Estimated 1800 tokens | Condense to under 1500 | MEDIUM |

### Cross-Platform Issues (1)

| Issue | Fix | Certainty |
|-------|-----|-----------|
| Hardcoded .claude/ | Add platform variations note | HIGH |
```

## Implementation

```javascript
const { projectmemoryAnalyzer } = require('${CLAUDE_PLUGIN_ROOT}/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const targetPath = args.find(a => !a.startsWith('--')) || '.';
const verbose = args.includes('--verbose');

// Run analysis
const results = await projectmemoryAnalyzer.analyze(targetPath, {
  verbose,
  checkReferences: true
});

// Generate report
const report = projectmemoryAnalyzer.generateReport(results);
console.log(report);
```

## Example Usage

```bash
# Analyze current project
/enhance:claudemd

# Analyze specific directory
/enhance:claudemd /path/to/project

# Analyze specific file
/enhance:claudemd /path/to/AGENTS.md

# Verbose output (includes LOW certainty)
/enhance:claudemd --verbose
```

## Cross-Tool Support

Searches for project memory files in this order:
1. CLAUDE.md (Claude Code)
2. AGENTS.md (OpenCode, Codex)
3. .github/CLAUDE.md
4. .github/AGENTS.md

## Pattern Statistics

- Total patterns: 14
- HIGH certainty: 6
- MEDIUM certainty: 6
- LOW certainty: 2
- Auto-fixable: 0 (requires human judgment)

## Success Criteria

- Project memory file found and analyzed
- All references validated against filesystem
- Token efficiency measured
- Cross-platform compatibility checked
- Clear, actionable report generated
