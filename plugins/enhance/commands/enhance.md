---
description: Analyze plugin structures, MCP tools, agent prompts, documentation, and security patterns
argument-hint: "[target-name] [--fix] [--verbose] [--ai]"
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
2. **Load patterns** - Import from `${CLAUDE_PLUGIN_ROOT}/lib/enhance/docs-patterns`
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
const { docsAnalyzer } = require('${CLAUDE_PLUGIN_ROOT}/lib/enhance');

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

# Dry run fixes
/enhance:docs --fix --dry-run
```

## Pattern Statistics

- Total patterns: 13
- HIGH certainty: 5 (2 auto-fixable)
- MEDIUM certainty: 6
- LOW certainty: 2

## Success Criteria

- All documentation files validated
- Links checked for validity
- Structure analyzed for consistency
- Token efficiency assessed (AI mode)
- RAG chunking evaluated (AI mode)
- Clear, actionable report
- Auto-fix available for HIGH certainty issues
