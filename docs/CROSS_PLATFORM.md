# Cross-Platform Integration Guide

This document describes how to use awesome-slash-commands with different AI coding assistants.

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

### Option 2: Local Clone

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./scripts/install/claude.sh
```

### Option 3: Plugin Directory (Development)

```bash
claude --plugin-dir /path/to/awesome-slash/plugins/next-task
```

### Available Commands
- `/next-task` - Master workflow orchestrator
- `/ship` - Complete PR workflow
- `/deslop-around` - AI slop cleanup
- `/project-review` - Multi-agent code review
- `/reality-check:scan` - Plan drift detection

### Available Agents (14 Total)

**Core Workflow (Opus):**
- `exploration-agent` - Deep codebase analysis (tools: Read, Grep, Glob, LSP, Task)
- `planning-agent` - Design implementation plans (tools: Read, Grep, Glob, Bash(git:*), Task)
- `implementation-agent` - Execute plans with quality code (tools: Read, Write, Edit, Bash, Task)
- `review-orchestrator` - Multi-agent code review with iteration (tools: Task)

**Quality Gates (Sonnet):**
- `deslop-work` - Clean AI slop from committed but unpushed changes
- `test-coverage-checker` - Validate new work has test coverage
- `delivery-validator` - Autonomous delivery validation
- `docs-updater` - Update docs related to changes

**Operational (Sonnet/Haiku):**
- `task-discoverer` - Find and prioritize tasks [sonnet]
- `worktree-manager` - Create isolated worktrees [haiku]
- `ci-monitor` - Monitor CI status with sleep loops [haiku]
- `ci-fixer` - Fix CI failures and PR comments [sonnet]
- `simple-fixer` - Execute pre-defined code fixes [haiku]

**Reality Check (Opus):**
- `plan-synthesizer` - Deep semantic analysis with full context [opus]

*Data collection handled by JavaScript collectors (lib/reality-check/collectors.js)*

## OpenCode Integration

### Option 1: Automated Install (Recommended)

```bash
cd /path/to/awesome-slash
./scripts/install/opencode.sh
```

This installs MCP server, slash commands (`/next-task`, `/ship`, `/review`, `/deslop`), and agents.

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

### Option 1: Automated Install (Recommended)

```bash
cd /path/to/awesome-slash
./scripts/install/codex.sh
```

This installs MCP server config in `~/.codex/config.toml` and skills (`$next-task`, `$ship`, `$review`, `$deslop`).

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

## Shared Libraries

All integrations use the same core libraries:

```
lib/
├── config/
│   ├── index.js               # Configuration management
│   └── README.md              # Configuration documentation
├── state/
│   ├── workflow-state.js      # State management
│   └── workflow-state.schema.json
├── platform/
│   ├── detect-platform.js     # Auto-detect project type
│   └── verify-tools.js        # Check required tools
├── patterns/
│   ├── review-patterns.js     # Code review patterns
│   └── slop-patterns.js       # AI slop detection
└── utils/
    ├── shell-escape.js        # Safe shell command construction
    └── context-optimizer.js   # Git command optimization
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
- Slash commands in `~/.config/opencode/commands/`
- Agent definitions in `~/.config/opencode/agents/`
- Custom tools via MCP

### Codex CLI
- OpenAI-native with GPT-5-Codex
- State directory: `.codex/`
- Skills in `~/.codex/skills/` (invoked with `$` prefix, e.g., `$next-task`)
- MCP config in `~/.codex/config.toml`

## Migration Guide

### From Claude Code to OpenCode

1. Run the OpenCode installer: `./scripts/install/opencode.sh`
2. State files will be created fresh in `.opencode/`
3. Or copy state: `cp -r .claude/* .opencode/`

### From Claude Code to Codex

1. Run the Codex installer: `./scripts/install/codex.sh`
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
