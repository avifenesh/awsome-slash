# Cross-Platform Integration Guide

Build tools once, run everywhere. The core workflows are the same regardless of which AI assistant you use. Platform differences are abstracted away—state files, configuration paths, and command syntax adapt automatically. You get the same automation whether you're using Claude Code, OpenCode, or Codex CLI.

---

## Quick Navigation

| Section | Jump to |
|---------|---------|
| [Supported Platforms](#supported-platforms) | Which platforms work |
| [Claude Code](#claude-code-native) | Native plugin installation |
| [OpenCode](#opencode) | MCP + agent setup |
| [Codex CLI](#codex-cli) | Skills + MCP setup |
| [State Directories](#state-directories) | Where state files live |
| [Troubleshooting](#troubleshooting) | Common issues |

---

## Supported Platforms

| Platform | Integration Method | Command Prefix | Status |
|----------|-------------------|----------------|--------|
| Claude Code | Native plugins | `/` (slash) | ✅ Full support |
| OpenCode | MCP + Agent configs | `/` (slash) | ✅ Supported |
| Codex CLI | MCP + Skills | `$` (dollar) | ✅ Supported |

> **Note:** Codex CLI uses `$` prefix for skills (e.g., `$next-task`, `$ship`) instead of `/` slash commands.

## Common Architecture

All three platforms share:

1. **MCP (Model Context Protocol)** - Universal tool interface
2. **Agent/Subagent systems** - Specialized assistants with tool restrictions
3. **Slash commands** - User-invoked actions
4. **Configuration files** - JSON/YAML/Markdown formats

## Claude Code (Native)

### Option 1: Marketplace (Recommended)

```bash
# Add the marketplace
/plugin marketplace add avifenesh/awesome-slash

# Install plugins
/plugin install next-task@awesome-slash
/plugin install ship@awesome-slash
```

### Option 2: npm Global Install

```bash
npm install -g awesome-slash@latest
awesome-slash  # Select option 1 for Claude Code
```

### Option 3: Plugin Directory (Development)

```bash
claude --plugin-dir /path/to/awesome-slash/plugins/next-task
```

### Available Commands
- `/next-task` - Master workflow orchestrator
- `/ship` - Complete PR workflow
- `/deslop` - AI slop cleanup
- `/audit-project` - Multi-agent code review
- `/drift-detect` - Plan drift detection
- `/repo-map` - AST repo map generation
- `/enhance` - Enhancement analyzer suite
- `/sync-docs` - Documentation sync

### Available Agents (22 Total)

**next-task: Core Workflow (13 agents)**

| Agent | Model | Purpose |
|-------|-------|---------|
| exploration-agent | opus | Deep codebase analysis |
| planning-agent | opus | Design implementation plans |
| implementation-agent | opus | Execute plans with quality code |
| Phase 9 review loop | sonnet reviewers | Multi-pass review with parallel agents |
| deslop-work | sonnet | Clean AI slop from changes |
| test-coverage-checker | sonnet | Validate test coverage |
| delivery-validator | sonnet | Autonomous delivery validation |
| docs-updater | sonnet | Update related documentation |
| task-discoverer | sonnet | Find and prioritize tasks |
| worktree-manager | haiku | Create isolated worktrees |
| ci-monitor | haiku | Monitor CI status |
| ci-fixer | sonnet | Fix CI failures and PR comments |
| simple-fixer | haiku | Execute pre-defined fixes |

**enhance: Quality Analyzers (7 agents)**

| Agent | Model | Purpose |
|-------|-------|---------|
| enhancement-orchestrator | opus | Coordinate all analyzers |
| plugin-enhancer | opus | Analyze plugin structures |
| agent-enhancer | opus | Review agent prompts |
| docs-enhancer | opus | Documentation quality |
| claudemd-enhancer | opus | Project memory optimization |
| prompt-enhancer | opus | General prompt quality |
| enhancement-reporter | sonnet | Format unified reports |

**drift-detect: Drift Detection (1 agent)**

| Agent | Model | Purpose |
|-------|-------|---------|
| plan-synthesizer | opus | Deep semantic analysis |

*Data collection uses JavaScript collectors (77% token reduction vs multi-agent)*

**repo-map: Repo Mapping (1 agent)**

| Agent | Model | Purpose |
|-------|-------|---------|
| map-validator | haiku | Validate repo-map output |

## OpenCode Integration

### Option 1: npm Global Install (Recommended)

```bash
npm install -g awesome-slash@latest
awesome-slash  # Select option 2 for OpenCode
```

This installs:
- MCP server for tools (`workflow_status`, `slop_detect`, etc.)
- Slash commands (`/next-task`, `/ship`, `/deslop`, `/audit-project`, `/drift-detect`, `/repo-map`, `/sync-docs`)
- **Native OpenCode plugin** with advanced features:

### Native Plugin Features

The native plugin (`~/.opencode/plugins/awesome-slash/`) provides deep integration:

| Feature | Description |
|---------|-------------|
| **Auto-thinking selection** | Adjusts thinking budget per agent complexity (0-20k tokens) |
| **Workflow enforcement** | Blocks `git push`/`gh pr create` until `/ship` |
| **Session compaction** | Preserves workflow state when context overflows |
| **Activity tracking** | Updates `flow.json` on significant tool executions |

**Agent Thinking Tiers:**

| Tier | Budget | Agents |
|------|--------|--------|
| Execution | 0 | worktree-manager, simple-fixer, ci-monitor |
| Discovery | 8k | task-discoverer, docs-updater |
| Analysis | 12k | exploration-agent, deslop-work, ci-fixer |
| Reasoning | 16k | planning-agent, implementation-agent |
| Synthesis | 20k | plan-synthesizer, enhancement-orchestrator |

**Provider-Specific Thinking:**

The plugin auto-detects your model provider and applies the correct thinking config:

```typescript
// Anthropic → thinking.budgetTokens
// OpenAI → reasoningEffort ("high"/"medium"/"low")
// Google → thinkingConfig.thinkingBudget
```

### Option 2: Manual MCP Config

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "/path/to/awesome-slash/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "/path/to/awesome-slash",
        "AI_STATE_DIR": ".opencode"
      },
      "enabled": true
    }
  }
}
```

### Option 3: Agent Configuration

Create agent definitions in OpenCode format:

```bash
# Global agents
mkdir -p ~/.config/opencode/agent/

# Agent files follow OpenCode markdown format (see below)
```

**OpenCode Agent Format** (`.opencode/agent/workflow.md`):

```markdown
---
name: workflow-orchestrator
model: claude-sonnet-4-20250514
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
---

You are a workflow orchestrator that manages development tasks.

When invoked, you should:
1. Check for existing workflow state in .claude/workflow-state.json
2. Continue from the last checkpoint if resuming
3. Follow the 18-phase workflow from policy selection to completion
```

## Codex CLI Integration

> **Note:** Codex uses `$` prefix for skills instead of `/` slash commands (e.g., `$next-task`, `$ship`).

### Option 1: npm Global Install (Recommended)

```bash
npm install -g awesome-slash@latest
awesome-slash  # Select option 3 for Codex CLI
```

This installs MCP server config in `~/.codex/config.toml` and skills (`$next-task`, `$ship`, `$deslop`, `$audit-project`, `$repo-map`, `$sync-docs`).

### Option 2: Manual MCP Config

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.awesome-slash]
command = "node"
args = ["/path/to/awesome-slash/mcp-server/index.js"]
env = { PLUGIN_ROOT = "/path/to/awesome-slash", AI_STATE_DIR = ".codex" }
enabled = true
```

### Option 3: Custom Skills

Create Codex skills in `~/.codex/skills/<name>/SKILL.md`:

```markdown
---
name: next-task
description: Master workflow orchestrator for task automation
---

# Next Task Workflow

Use the awesome-slash MCP tools:
- `workflow_status` - Check current state
- `workflow_start` - Start new workflow
- `task_discover` - Find tasks
```

## MCP Server Tools

When using the MCP server integration, these tools become available:

| Tool | Description |
|------|-------------|
| `workflow_status` | Get current workflow state |
| `workflow_start` | Start a new workflow with policy settings |
| `workflow_resume` | Resume from last checkpoint |
| `workflow_abort` | Cancel workflow and cleanup resources |
| `task_discover` | Find and prioritize tasks from gh-issues, linear, or tasks-md |
| `review_code` | Run pattern-based code review on changed files |
| `slop_detect` | Detect AI slop with certainty levels (HIGH/MEDIUM/LOW) |
| `enhance_analyze` | Analyze plugins, agents, docs, prompts for improvements |
| `repo_map` | Generate or update cached AST repo map |

## Shared Libraries

All integrations use the same core libraries:

```
lib/
├── config/                    # Configuration management
├── cross-platform/            # Platform detection, MCP helpers
├── enhance/                   # Quality analyzer logic
├── patterns/                  # 3-phase slop detection pipeline
│   ├── pipeline.js            # Orchestrates phases
│   ├── slop-patterns.js       # Regex patterns (HIGH certainty)
│   └── slop-analyzers.js      # Multi-pass analyzers (MEDIUM)
├── platform/                  # Project type detection
├── drift-detect/             # Drift detection collectors
├── repo-map/                 # AST repo map generation
├── schemas/                   # JSON schemas for validation
├── sources/                   # Task source discovery
├── state/                     # Workflow state management
├── types/                     # TypeScript-style type definitions
└── utils/                     # Shell escape, context optimization
```

## Platform-Aware State Directories

State files are stored in platform-specific directories:

| Platform | State Directory |
|----------|-----------------|
| Claude Code | `.claude/` |
| OpenCode | `.opencode/` |
| Codex CLI | `.codex/` |

The plugin auto-detects the platform and uses the appropriate directory. Override with `AI_STATE_DIR` environment variable.

**Files stored in state directory:**
- `tasks.json` - Active task tracking (main project)
- `flow.json` - Workflow progress (worktree)
- `sources/preference.json` - Task source preferences

## Platform-Specific Considerations

### Claude Code
- Full plugin support with hooks, agents, commands
- State directory: `.claude/`
- Native state management integration
- Best experience with opus model for complex tasks

### OpenCode
- Works with any model provider (Claude, OpenAI, Google, local)
- State directory: `.opencode/`
- Slash commands in `~/.opencode/commands/awesome-slash/`
- Native plugin in `~/.opencode/plugins/awesome-slash/`
- **Native plugin features:**
  - Auto-thinking selection (adjusts budget per agent)
  - Workflow enforcement (blocks git push until /ship)
  - Session compaction with state preservation
  - Provider-agnostic thinking config (Anthropic, OpenAI, Google)
- Custom tools via MCP

### Codex CLI
- OpenAI-native with GPT-5-Codex
- State directory: `.codex/`
- Skills in `~/.codex/skills/` (invoked with `$` prefix, e.g., `$next-task`)
- MCP config in `~/.codex/config.toml`

## Migration Guide

### From Claude Code to OpenCode

1. Run: `npm install -g awesome-slash && awesome-slash` (select option 2)
2. State files will be created fresh in `.opencode/`
3. Or copy state: `cp -r .claude/* .opencode/`

### From Claude Code to Codex

1. Run: `npm install -g awesome-slash && awesome-slash` (select option 3)
2. State files will be created fresh in `.codex/`
3. Or copy state: `cp -r .claude/* .codex/`

### Using Multiple Platforms

If you use multiple AI assistants on the same project, set `AI_STATE_DIR` to share state:

```bash
export AI_STATE_DIR=".ai-state"
```

## Contributing

To add support for a new platform:

1. Create installation script in `scripts/install/<platform>.sh`
2. Add platform-specific configuration examples
3. Test MCP server integration with the target platform
4. Submit PR with documentation
