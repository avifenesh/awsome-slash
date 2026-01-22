# Checklists

Action-specific checklists to ensure consistency across the codebase.

## Available Checklists

| Checklist | When to Use |
|-----------|-------------|
| [release.md](./release.md) | Preparing a new version release |
| [new-command.md](./new-command.md) | Adding a new slash command |
| [new-agent.md](./new-agent.md) | Adding a new specialist agent |
| [new-lib-module.md](./new-lib-module.md) | Adding a new library module |
| [update-mcp.md](./update-mcp.md) | Adding/updating MCP server tools |

## Knowledge Base References

These checklists reference best practices from:

| Document | Topics |
|----------|--------|
| `agent-docs/PROMPT-ENGINEERING-REFERENCE.md` | Cross-model prompt design |
| `agent-docs/FUNCTION-CALLING-TOOL-USE-REFERENCE.md` | MCP tool patterns |
| `agent-docs/MULTI-AGENT-SYSTEMS-REFERENCE.md` | Agent orchestration |
| `agent-docs/CONTEXT-OPTIMIZATION-REFERENCE.md` | Token efficiency |
| `lib/cross-platform/RESEARCH.md` | Platform comparison |

## File Update Matrix

Quick reference for which files need updating:

| Action | Files to Update |
|--------|-----------------|
| **Release** | package.json, CHANGELOG.md, README.md, all plugin.json files |
| **New Command** | plugin commands/, plugin.json, ARCHITECTURE.md, bin/cli.js |
| **New Agent** | plugin agents/, workflow.md, next-task.md |
| **New Lib Module** | lib/, lib/index.js, sync to plugins/, tests |
| **New MCP Tool** | mcp-server/index.js, marketplace.json, bin/cli.js |
