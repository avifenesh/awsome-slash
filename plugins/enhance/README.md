# enhance

Master enhancement orchestrator for plugins, agents, prompts, and documentation.

## Overview

The enhance plugin provides specialized analyzers for different content types, identifying issues and suggesting improvements based on prompt engineering best practices.

## Architecture

```
/enhance
    │
    ├─→ /enhance:agent   → Agent-specific analysis (frontmatter, tool restrictions)
    ├─→ /enhance:prompt  → General prompt patterns (clarity, structure, examples)
    ├─→ /enhance:docs    → Documentation analysis (RAG optimization, readability)
    ├─→ /enhance:plugin  → Plugin structure (MCP tools, security patterns)
    └─→ /enhance:claudemd → Project memory optimization (CLAUDE.md/AGENTS.md)
```

**Analysis depth**: Certainty-based findings (HIGH, MEDIUM, LOW)
**Auto-fix**: Available for HIGH certainty issues with `--fix` flag
**Model selection**: Opus for quality-critical analyzers, Sonnet for pattern-based checks

## Commands

### `/enhance`

Run all applicable enhancers on current directory.

```
/enhance                    # Auto-detect and run all relevant analyzers
/enhance --fix              # Apply HIGH certainty auto-fixes
/enhance --verbose          # Include LOW certainty issues
```

### `/enhance:agent [target]`

Analyze agent prompt files for configuration and structure issues.

```
/enhance:agent                     # All agents in directory
/enhance:agent my-agent.md         # Specific agent
/enhance:agent --fix               # Apply auto-fixes
```

**Detects**: Missing frontmatter, unrestricted Bash, missing role section, tool configuration issues

### `/enhance:prompt [target]`

Analyze prompts for prompt engineering best practices.

```
/enhance:prompt                    # All prompts in directory
/enhance:prompt system-prompt.md   # Specific prompt
/enhance:prompt --fix              # Apply auto-fixes
```

**Detects**: Vague instructions, missing examples, aggressive emphasis, structural issues

### `/enhance:docs [target]`

Analyze documentation for readability and RAG optimization.

```
/enhance:docs                      # All docs in directory
/enhance:docs --ai                 # AI-only mode (aggressive optimization)
/enhance:docs agent-docs/ --ai     # Specific directory
```

**Detects**: Verbose phrases, poor chunking, broken links, token inefficiency

### `/enhance:plugin [target]`

Analyze plugin structure and MCP tool definitions.

```
/enhance:plugin                    # All plugins
/enhance:plugin my-plugin          # Specific plugin
/enhance:plugin --fix              # Apply auto-fixes
```

**Detects**: Missing schema fields, security patterns, version mismatches

### `/enhance:claudemd`

Analyze project memory files (CLAUDE.md, AGENTS.md).

```
/enhance:claudemd                  # Find and analyze project memory
/enhance:claudemd --fix            # Apply auto-fixes
```

**Detects**: Missing sections, broken references, README duplication, cross-platform issues

## Agents

| Agent | Purpose | Model |
|-------|---------|-------|
| `agent-enhancer` | Frontmatter, tool restrictions, agent structure | opus |
| `prompt-enhancer` | Clarity, examples, structure, anti-patterns | opus |
| `docs-enhancer` | RAG optimization, readability, token efficiency | opus |
| `plugin-enhancer` | MCP schemas, security patterns, structure | sonnet |
| `claudemd-enhancer` | Project memory validation, cross-platform | opus |

## Certainty Levels

| Level | Meaning | Auto-Fixable |
|-------|---------|--------------|
| HIGH | Definite issues | Some |
| MEDIUM | Likely improvements | No |
| LOW | Advisory suggestions | No |

LOW certainty issues only shown with `--verbose` flag.

## Common Flags

| Flag | Description |
|------|-------------|
| `--fix` | Apply HIGH certainty auto-fixes |
| `--verbose` | Include LOW certainty issues |
| `--dry-run` | Show what would be fixed without applying |
| `--ai` | AI-only mode (docs analyzer) |
| `--both` | Both audiences mode (docs analyzer, default) |

## Output Format

Each analyzer generates a markdown report:

```markdown
## Analysis: {name}

**File**: {path}
**Analyzed**: {timestamp}

### Summary
- HIGH: {count} issues
- MEDIUM: {count} issues
- LOW: {count} issues (verbose only)

### {Category} Issues ({n})

| Issue | Fix | Certainty |
|-------|-----|-----------|
| Description | Suggested fix | HIGH |
```

## Integration

Can be invoked by:
- Direct command: `/enhance:*`
- Phase 9 review loop during workflow
- `delivery-validator` before shipping
- Individual analysis workflows

## Requirements

- Claude Code
- Node.js (for lib functions)

## License

MIT
