---
description: Analyze plugin structures, MCP tools, agent prompts, general prompts, documentation, and security patterns
argument-hint: "[target-path] [--apply] [--focus=TYPE] [--verbose]"
---

# /enhance - Master Enhancement Orchestrator

Run all enhancement analyzers in parallel and generate a unified report.

## Overview

The master `/enhance` command orchestrates all 5 specialized enhancers:
- **plugin** - Plugin structures, MCP tools, security patterns
- **agent** - Agent prompts, frontmatter, tool restrictions
- **claudemd** - CLAUDE.md/AGENTS.md project memory files
- **docs** - Documentation structure and RAG optimization
- **prompt** - General prompt quality and clarity

## Arguments

Parse from $ARGUMENTS:
- **target-path**: Directory or file to analyze (default: current directory)
- **--apply**: Apply auto-fixes for HIGH certainty issues after report
- **--focus=TYPE**: Run only specified enhancer(s): plugin, agent, claudemd, docs, prompt
- **--verbose**: Include LOW certainty issues in report

## Workflow

1. **Discovery** - Detect what content types exist in target path
2. **Launch** - Start all relevant enhancers in parallel via Task()
3. **Aggregate** - Collect and deduplicate findings from all enhancers
4. **Report** - Generate unified report via enhancement-reporter agent
5. **Fix** - Apply auto-fixes if --apply flag is present

## Implementation

This command invokes the `enhancement-orchestrator` agent:

```javascript
// Invoke orchestrator agent with arguments
await Task({
  subagent_type: "enhance:enhancement-orchestrator",
  prompt: `Run enhancement analysis.

Target: ${targetPath || '.'}
Options:
- apply: ${args.includes('--apply')}
- focus: ${focusType || 'all'}
- verbose: ${args.includes('--verbose')}

Discover content, launch enhancers in parallel, aggregate results, and generate report.`
});
```

## Output Format

```markdown
# Enhancement Analysis Report

**Target**: {targetPath}
**Date**: {timestamp}
**Enhancers Run**: plugin, agent, docs

## Executive Summary

| Enhancer | HIGH | MEDIUM | LOW | Auto-Fixable |
|----------|------|--------|-----|--------------|
| plugin | 2 | 3 | 1 | 1 |
| agent | 1 | 2 | 0 | 1 |
| docs | 0 | 4 | 2 | 0 |
| **Total** | **3** | **9** | **3** | **2** |

## HIGH Certainty Issues (3)

[Grouped by enhancer, sorted by file]

## MEDIUM Certainty Issues (9)

[...]

## Auto-Fix Summary

2 issues can be automatically fixed with `--apply` flag.
```

## Example Usage

```bash
# Full analysis of current directory
/enhance

# Focus on specific enhancer type
/enhance --focus=agent

# Apply auto-fixes for HIGH certainty issues
/enhance --apply

# Analyze specific path with verbose output
/enhance plugins/next-task --verbose

# Combined flags
/enhance --focus=plugin --apply --verbose
```

## Success Criteria

- All relevant enhancers run in parallel
- Findings deduplicated and sorted by certainty
- Clear executive summary with counts
- Auto-fixable issues highlighted
- Fixes applied only with explicit --apply flag

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
2. **Load patterns** - Import from `${PLUGIN_ROOT}/lib/enhance/`
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
const { pluginAnalyzer } = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/enhance');

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
2. **Load patterns** - Import from `${PLUGIN_ROOT}/lib/enhance/agent-patterns`
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
const { agentAnalyzer } = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/enhance');

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

# /enhance:docs - Documentation Optimizer

Analyze documentation files for readability and RAG optimization.

## Arguments

Parse from $ARGUMENTS:
- **doc**: Specific doc path or directory (default: docs/)
- **--ai**: AI-only mode (aggressive RAG optimization for agent-docs)
- **--both**: Both audiences mode (default, balance readability + AI)
- **--fix**: Apply auto-fixes for HIGH certainty issues
- **--verbose**: Show all issues including LOW certainty

## Optimization Modes

### AI-Only Mode (`--ai`)
For agent-docs and RAG-optimized documentation:
- Aggressive token reduction
- Dense information packing
- Self-contained sections for retrieval
- Minimal prose, maximum data

### Both Mode (`--both`, default)
For user-facing documentation:
- Balance readability with AI-friendliness
- Clear structure for both humans and retrievers
- Explanatory text where helpful

## Workflow

1. **Discover docs** - Find all .md files in target directory
2. **Load patterns** - Import from `${PLUGIN_ROOT}/lib/enhance/docs-patterns`
3. **Analyze each doc**:
   - Validate structure (headings, links, code blocks)
   - Check for RAG-friendly chunking (AI mode)
   - Identify token inefficiencies (AI mode)
   - Assess content organization (both mode)
4. **Generate report** - Markdown table grouped by category
5. **Apply fixes** - If --fix flag, apply HIGH certainty auto-fixes

## Detection Categories

### HIGH Certainty (auto-fixable)

| Pattern | Description | Mode | Auto-Fix |
|---------|-------------|------|----------|
| Broken internal link | Link to non-existent file/anchor | shared | No |
| Inconsistent headings | H1 -> H3 without H2 | shared | Yes |
| Missing code language | Code block without language hint | shared | No |
| Unnecessary prose | Filler text like "In this document..." | ai | No |
| Verbose explanations | "in order to" -> "to" | ai | Yes |

### MEDIUM Certainty

| Pattern | Description | Mode |
|---------|-------------|------|
| Section too long | >1000 tokens in single section | shared |
| Suboptimal chunking | Content not structured for RAG | ai |
| Poor semantic boundaries | Mixed topics in single section | ai |
| Missing context anchors | Sections start with "It", "This" | ai |
| Missing section headers | Long content without structure | both |
| Poor context ordering | Important info buried late | both |

### LOW Certainty (advisory)

| Pattern | Description | Mode |
|---------|-------------|------|
| Token inefficiency | Optimization opportunities | ai |
| Readability/RAG balance | Balance suggestions | both |
| Structure recommendations | General structure advice | both |

## Output Format

```markdown
## Documentation Analysis: {doc-name}

**File**: {path}
**Mode**: {AI-only | Both audiences}
**Token Count**: ~{tokens}
**Analyzed**: {timestamp}

### Summary
- HIGH: {count} issues
- MEDIUM: {count} issues
- LOW: {count} issues

### Link Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Broken anchor: #missing | Fix or remove link | HIGH |

### Structure Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Heading level jumps H1 to H3 | Fix heading hierarchy | HIGH |

### Efficiency Issues ({n}) [AI mode]
| Issue | Fix | Certainty |
|-------|-----|-----------|
| 5 instances of unnecessary prose | Remove filler text | HIGH |

### RAG Optimization Issues ({n}) [AI mode]
| Issue | Fix | Certainty |
|-------|-----|-----------|
| 3 sections exceed 1000 tokens | Break into subsections | MEDIUM |

### Balance Suggestions ({n}) [Both mode]
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Long content without headers | Add section structure | MEDIUM |
```

## Implementation

```javascript
const { docsAnalyzer } = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const docPath = args.find(a => !a.startsWith('--'));
const mode = args.includes('--ai') ? 'ai' : 'both';
const applyFixes = args.includes('--fix');
const verbose = args.includes('--verbose');

// Run analysis
const results = await docsAnalyzer.analyze({
  doc: docPath,
  docsDir: docPath || 'docs',
  mode,
  verbose
});

// Generate report
const report = docsAnalyzer.generateReport(results);
console.log(report);

// Apply fixes if requested
if (applyFixes) {
  const fixed = await docsAnalyzer.applyFixes(results);
  console.log(`\nApplied ${fixed.applied.length} fixes`);
  if (fixed.errors.length > 0) {
    console.log(`Errors: ${fixed.errors.length}`);
  }
}
```

## Example Usage

```bash
# Analyze docs with default mode (both audiences)
/enhance:docs

# Analyze with AI-only mode (aggressive RAG optimization)
/enhance:docs --ai

# Analyze specific directory
/enhance:docs agent-docs/ --ai

# Analyze specific file
/enhance:docs docs/getting-started.md

# Apply auto-fixes
/enhance:docs --fix

# Verbose output (includes LOW certainty)
/enhance:docs --verbose
```

## Pattern Statistics

- Total patterns: 14
- HIGH certainty: 5 (2 auto-fixable)
- MEDIUM certainty: 6
- LOW certainty: 3

## Success Criteria

- All documentation files validated
- Links checked for validity
- Structure analyzed for consistency
- Token efficiency assessed (AI mode)
- RAG chunking evaluated (AI mode)
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
2. **Load patterns** - Import from `${PLUGIN_ROOT}/lib/enhance/projectmemory-patterns`
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
const { projectmemoryAnalyzer } = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/enhance');

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

---

# /enhance:prompt - Prompt Quality Analyzer

Analyze prompt files for prompt engineering best practices and optimization opportunities.

## Differentiation from /enhance:agent

| Analyzer | Focus | Use When |
|----------|-------|----------|
| `/enhance:prompt` | Prompt quality (clarity, structure, examples) | General prompts, system prompts, templates |
| `/enhance:agent` | Agent config (frontmatter, tools, model selection) | Agent files with YAML frontmatter |

## Arguments

Parse from $ARGUMENTS:
- **prompt**: Specific prompt file or directory (default: prompts/, agents/, commands/)
- **--fix**: Apply auto-fixes for HIGH certainty issues
- **--verbose**: Show all issues including LOW certainty
- **--dry-run**: Preview fixes without applying

## Workflow

1. **Discover prompts** - Find all .md and .txt files in target
2. **Classify** - Detect prompt type from path/content
3. **Load patterns** - Import from `${PLUGIN_ROOT}/lib/enhance/prompt-patterns`
4. **Analyze each prompt**:
   - Check clarity (vague language, negative-only constraints)
   - Validate structure (XML tags, heading hierarchy)
   - Evaluate examples (few-shot patterns)
   - Assess context (WHY explanations, priority order)
   - Check output format specification
   - Detect anti-patterns (redundant CoT, bloat)
5. **Generate report** - Markdown table grouped by category
6. **Apply fixes** - If --fix flag, apply HIGH certainty auto-fixes

## Detection Categories

### HIGH Certainty (7 patterns)

| Pattern | Description | Auto-Fix |
|---------|-------------|----------|
| vague_instructions | "usually", "sometimes", "try to" | No |
| negative_only_constraints | "don't" without positive alternatives | No |
| missing_output_format | No format specification in substantial prompt | No |
| aggressive_emphasis | Excessive CAPS, !!, CRITICAL | Yes |
| missing_xml_structure | Complex prompt without XML tags | No |
| missing_examples | Complex prompt without few-shot examples | No |
| redundant_cot | "Think step by step" with modern models | No |

### MEDIUM Certainty (8 patterns)

| Pattern | Description |
|---------|-------------|
| inconsistent_sections | Mixed heading styles, skipped levels |
| critical_info_buried | Important instructions in middle (lost-in-the-middle) |
| suboptimal_example_count | Not 2-5 examples (too few or too many) |
| examples_without_contrast | No good/bad labeling |
| missing_context_why | Rules without explanations |
| missing_instruction_priority | No conflict resolution order |
| overly_prescriptive | Too many numbered steps, micro-managing |
| json_without_schema | Requests JSON but no schema/example |

### LOW Certainty (advisory)

| Pattern | Description |
|---------|-------------|
| prompt_bloat | Over 2500 tokens |

## Output Format

```markdown
## Prompt Analysis: {prompt-name}

**File**: {path}
**Type**: {agent|command|skill|prompt|markdown}
**Token Count**: ~{tokens}
**Analyzed**: {timestamp}

### Summary
- HIGH: {count} issues
- MEDIUM: {count} issues
- LOW: {count} issues (verbose only)

### Clarity Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Found 6 vague terms | Replace with specific instructions | HIGH |

### Structure Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Complex prompt without XML structure | Use XML tags | HIGH |

### Example Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Only 1 example (optimal: 2-5) | Add more examples | MEDIUM |

### Context Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| 12 rules but few explanations | Add WHY context | MEDIUM |

### Output Format Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| Requests JSON but no schema | Add JSON schema/example | MEDIUM |

### Anti-Pattern Issues ({n})
| Issue | Fix | Certainty |
|-------|-----|-----------|
| 3 "step-by-step" instructions | Remove redundant CoT | HIGH |
```

## Implementation

```javascript
const { promptAnalyzer } = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const promptPath = args.find(a => !a.startsWith('--'));
const applyFixes = args.includes('--fix');
const verbose = args.includes('--verbose');
const dryRun = args.includes('--dry-run');

// Run analysis
const results = await promptAnalyzer.analyze({
  prompt: promptPath,
  verbose
});

// Generate report
const report = promptAnalyzer.generateReport(results);
console.log(report);

// Apply fixes if requested
if (applyFixes) {
  const fixed = await promptAnalyzer.applyFixes(results, { dryRun });
  console.log(`\nApplied ${fixed.applied.length} fixes`);
  if (fixed.errors.length > 0) {
    console.log(`Errors: ${fixed.errors.length}`);
  }
}
```

## Example Usage

```bash
# Analyze prompts in current directory
/enhance:prompt

# Analyze specific prompt file
/enhance:prompt my-prompt.md

# Analyze prompts directory
/enhance:prompt prompts/

# Apply auto-fixes (HIGH certainty only)
/enhance:prompt --fix

# Verbose output (includes LOW certainty)
/enhance:prompt --verbose

# Dry run fixes
/enhance:prompt --fix --dry-run
```

## Pattern Statistics

- Total patterns: 16
- HIGH certainty: 7 (1 auto-fixable)
- MEDIUM certainty: 8
- LOW certainty: 1

## Success Criteria

- All prompt files analyzed
- Clarity issues detected and reported
- Structure validated
- Examples assessed for few-shot effectiveness
- Context/motivation gaps identified
- Anti-patterns flagged
- Clear, actionable report
- Auto-fix available for HIGH certainty issues

