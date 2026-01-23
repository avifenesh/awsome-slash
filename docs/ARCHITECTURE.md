# Multi-Platform Architecture

> **Status:** Implemented
>
> Cross-platform support is complete with unified CLI installer, MCP server, and shared library.

## Overview

awesome-slash supports three AI coding assistants through a unified architecture:

1. **Claude Code** - Anthropic's official CLI (primary target)
2. **OpenCode** - Multi-model AI coding assistant
3. **Codex CLI** - OpenAI's command-line interface

## Quick Install

```bash
npm install -g awesome-slash
awesome-slash
# Select platforms: 1,2,3 for all
```

## Architecture

### Core Components

```text
awesome-slash/
├── lib/                          # Shared library
│   ├── cross-platform/           # Platform utilities
│   │   ├── index.js              # Platform detection, MCP helpers
│   │   └── RESEARCH.md           # Research documentation
│   ├── enhance/                  # Quality analyzers (agent, plugin, docs)
│   ├── patterns/                 # Code analysis
│   │   ├── pipeline.js           # 3-phase slop detection
│   │   ├── slop-patterns.js      # Pattern definitions
│   │   └── slop-analyzers.js     # Multi-pass analyzers
│   ├── state/                    # Workflow state
│   └── sources/                  # Task source discovery
├── mcp-server/                   # Cross-platform MCP server
│   └── index.js                  # Exposes tools to all platforms
├── plugins/                      # Claude Code plugins
│   ├── next-task/
│   ├── ship/
│   ├── deslop-around/
│   ├── project-review/
│   ├── enhance/                  # Code quality analyzers
│   └── reality-check/
├── bin/                          # CLI installer
│   └── cli.js                    # Interactive installer
├── scripts/
│   ├── setup-hooks.js            # Git hooks installer (npm prepare)
│   └── sync-lib.sh               # Dev: sync lib/ to plugins/
├── docs/                         # User documentation
│   ├── CROSS_PLATFORM.md
│   ├── INSTALLATION.md
│   └── USAGE.md
└── agent-docs/                   # Knowledge base (research)
    ├── KNOWLEDGE-LIBRARY.md      # Index
    └── *-REFERENCE.md            # Research documents
```

### Cross-Platform Library (`lib/cross-platform/`)

Provides unified utilities for all platforms:

```javascript
const { xplat } = require('awesome-slash/lib');

// Platform detection
xplat.detectPlatform();  // 'claude-code' | 'opencode' | 'codex-cli'
xplat.getStateDir();     // '.claude' | '.opencode' | '.codex'

// MCP response helpers
xplat.successResponse({ data: 'result' });
xplat.errorResponse('Something failed', { details: '...' });

// Tool schema creation
xplat.createToolDefinition('my_tool', 'Description', { param: { type: 'string' } });

// Prompt formatting (cross-model compatible)
xplat.formatBlock('context', 'XML tags for Claude');
xplat.formatSection('Title', 'Markdown for GPT-4');
```

### State Directory by Platform

| Platform | State Directory | Override |
|----------|-----------------|----------|
| Claude Code | `.claude/` | `AI_STATE_DIR=.claude` |
| OpenCode | `.opencode/` | `AI_STATE_DIR=.opencode` |
| Codex CLI | `.codex/` | `AI_STATE_DIR=.codex` |

State files:
- `{state-dir}/tasks.json` - Active task registry
- `{state-dir}/flow.json` - Workflow progress (in worktree)
- `{state-dir}/sources/preference.json` - Cached task source

### MCP Server Tools

The MCP server (`mcp-server/index.js`) exposes tools to all platforms:

| Tool | Description |
|------|-------------|
| `workflow_status` | Get current workflow state |
| `workflow_start` | Start a new workflow with policy |
| `workflow_resume` | Resume from checkpoint |
| `workflow_abort` | Cancel and cleanup |
| `task_discover` | Find tasks from configured sources |
| `review_code` | Run pipeline-based code review |
| `slop_detect` | Detect AI slop with certainty levels |

**slop_detect** uses the full 3-phase pipeline:
- Phase 1: Regex patterns (HIGH certainty)
- Phase 2: Multi-pass analyzers (MEDIUM certainty)
- Phase 3: CLI tools (LOW certainty, optional)

## Platform Installation Details

### Claude Code

```bash
# Via marketplace (recommended)
/plugin marketplace add avifenesh/awesome-slash
/plugin install next-task@awesome-slash

# Via CLI installer
awesome-slash  # Select option 1
```

**Location:** `~/.claude/plugins/awesome-slash/`

**Commands:** `/next-task`, `/ship`, `/deslop-around`, `/project-review`, `/reality-check:scan`, `/enhance`

### OpenCode

```bash
awesome-slash  # Select option 2
```

**Locations:**
- Config: `~/.config/opencode/opencode.json`
- Commands: `~/.opencode/commands/awesome-slash/`

**Commands:** `/next-task`, `/ship`, `/deslop-around`, `/project-review`, `/reality-check-scan`, `/enhance`

**MCP Config Added:**
```json
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "~/.awesome-slash/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "~/.awesome-slash",
        "AI_STATE_DIR": ".opencode"
      }
    }
  }
}
```

### Codex CLI

```bash
awesome-slash  # Select option 3
```

**Locations:**
- Config: `~/.codex/config.toml`
- Skills: `~/.codex/skills/`

**Skills:** `$next-task`, `$ship`, `$deslop-around`, `$project-review`, `$reality-check-scan`, `$enhance`

Note: Codex uses `$` prefix instead of `/`.

**SKILL.md Format:**
```yaml
---
name: next-task
description: Master workflow orchestrator for task-to-production automation
---
[skill content]
```

**MCP Config Added:**
```toml
[mcp_servers.awesome-slash]
command = "node"
args = ["~/.awesome-slash/mcp-server/index.js"]
env = { PLUGIN_ROOT = "~/.awesome-slash", AI_STATE_DIR = ".codex" }
enabled = true
```

## Command Compatibility

| Command | Claude Code | OpenCode | Codex CLI | Notes |
|---------|-------------|----------|-----------|-------|
| `/next-task` | ✅ Full | ✅ Full | ✅ Full | MCP tools available |
| `/ship` | ✅ Full | ✅ Full | ✅ Full | Requires `gh` CLI |
| `/deslop-around` | ✅ Full | ✅ Full | ✅ Full | Uses pipeline.js |
| `/project-review` | ✅ Full | ✅ Full | ✅ Full | Multi-agent review |
| `/reality-check:scan` | ✅ Full | ✅ Full | ✅ Full | JS collectors + Opus |
| `/enhance` | ✅ Full | ✅ Full | ✅ Full | Orchestrates all enhancers |

## Knowledge Base

Research documents informing the implementation (in `agent-docs/`):

| Document | Topic |
|----------|-------|
| `CONTEXT-OPTIMIZATION-REFERENCE.md` | Token efficiency strategies |
| `PROMPT-ENGINEERING-REFERENCE.md` | Cross-model prompt design |
| `FUNCTION-CALLING-TOOL-USE-REFERENCE.md` | MCP and tool patterns |
| `MULTI-AGENT-SYSTEMS-REFERENCE.md` | Agent orchestration |
| `LLM-INSTRUCTION-FOLLOWING-RELIABILITY.md` | Instruction adherence |
| `CLAUDE-CODE-REFERENCE.md` | Claude Code specifics |
| `AI-AGENT-ARCHITECTURE-RESEARCH.md` | Agent design patterns |
| `KNOWLEDGE-LIBRARY.md` | Index and overview |
| `lib/cross-platform/RESEARCH.md` | Platform comparison |

## Implementation Status

### Core Infrastructure ✅
- [x] CLI installer (`bin/cli.js`)
- [x] MCP server with pipeline integration
- [x] Cross-platform library (`lib/cross-platform/`)
- [x] Platform-aware state directories
- [x] Knowledge base documentation

### Platform Support ✅
- [x] Claude Code (marketplace + CLI)
- [x] OpenCode (MCP + commands)
- [x] Codex CLI (MCP + skills)

### Testing ✅
- [x] All 1036 tests passing
- [x] npm pack creates valid package (338 KB)
- [x] Interactive installer works for all platforms

## Maintenance

**Update workflow:**
1. Edit files in `lib/` (canonical source)
2. Run `./scripts/sync-lib.sh` to copy to plugins
3. Commit both source and copies
4. Publish: `npm version patch && npm publish`

**User update:**
```bash
npm update -g awesome-slash
awesome-slash  # Re-run installer
```

## Design Decisions

### Why MCP Server?

MCP (Model Context Protocol) provides:
- Standardized tool interface across platforms
- No format translation needed
- Single implementation, multiple consumers
- Platform-specific env vars for state isolation

### Why Shared Library?

Each plugin needs its own `lib/` copy because Claude Code installs plugins separately. The `sync-lib.sh` script maintains consistency.

### Why Research Docs?

The knowledge base documents best practices from official sources, ensuring the implementation follows recommended patterns for each platform.
