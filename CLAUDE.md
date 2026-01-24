# Project Memory: awesome-slash

> **Cross-tool compatible**: This file works as CLAUDE.md (Claude Code) and can be copied to AGENTS.md for OpenCode, Codex, and other AI tools.

Quick reference for AI assistants. Follow links for details.

<critical-rules>
## Critical Rules (Priority Order)

1. **Production project** - Real users depend on this. Test thoroughly, don't break things.
   *WHY: Breaking changes affect all plugin users immediately.*

2. **Plugin for OTHER projects** - Optimize for plugin users, not internal dev convenience.
   *WHY: Every decision should improve the experience for developers using this in their repos.*

3. **No summary files** - No `*_AUDIT.md`, `*_SUMMARY.md`, `*_COMPLETION.md`. Use CHANGELOG.md.
   *WHY: Summary files clutter repos and add no value. Report completion verbally.*

4. **PR reviews** - Wait 3 min for auto-reviewers, address ALL comments (Copilot, Claude, Gemini, Codex).
   *WHY: Skipping comments leads to merged issues. Every comment must be addressed or explained.*

5. **Read checklists BEFORE multi-file changes** - MUST read the relevant checklist before starting:
   - **Cross-platform work → `checklists/cross-platform-compatibility.md`** (MASTER REF)
   - Release → `checklists/release.md`
   - New command → `checklists/new-command.md`
   - New agent → `checklists/new-agent.md`
   - New lib module → `checklists/new-lib-module.md`
   - MCP server update → `checklists/update-mcp.md`
   - OpenCode plugin update → `checklists/update-opencode-plugin.md`
   *WHY: Multi-file changes have hidden dependencies. Checklists prevent missed updates.*
</critical-rules>

## Architecture

```
lib/                    # Shared library (canonical source)
├── cross-platform/     # Platform detection, MCP helpers
├── patterns/           # Slop detection pipeline
├── state/              # Workflow state management
└── index.js            # Main exports

plugins/                # Claude Code plugins
├── next-task/          # Master workflow (14 agents)
├── ship/               # PR workflow
├── deslop-around/      # AI slop cleanup
├── project-review/     # Multi-agent review
└── reality-check/      # Plan drift detection

adapters/               # Platform-specific adapters
├── opencode-plugin/    # Native OpenCode plugin (auto-thinking, hooks)
├── opencode/           # OpenCode install script
└── codex/              # Codex install script

mcp-server/             # Cross-platform MCP server
bin/cli.js              # npm CLI installer
checklists/             # Action checklists
agent-docs/             # Knowledge base
docs/                   # User documentation
```

## Key Commands

```bash
npm test                     # Run tests (do before commits)
./scripts/sync-lib.sh        # Sync lib/ to plugins/
npm pack                     # Build package
awesome-slash                # Run installer
```

## State Files

| File | Location | Purpose |
|------|----------|---------|
| `tasks.json` | `.claude/` | Active task registry |
| `flow.json` | `.claude/` (worktree) | Workflow progress |
| `preference.json` | `.claude/sources/` | Cached task source |

Platform-aware: `.claude/` (Claude), `.opencode/` (OpenCode), `.codex/` (Codex)

## Workflow Agents (MUST-CALL)

Cannot skip in /next-task:
- `exploration-agent` → before planning
- `planning-agent` → before implementation
- `review-orchestrator` → before shipping
- `delivery-validator` → before /ship

## PR Auto-Review

4 reviewers: Copilot, Claude, Gemini, Codex

1. Wait 3 min after PR creation (initial auto-reviews)
2. Claude-review may take 10+ min - wait for it
3. Read ALL comments
4. Address EVERY comment
5. Iterate until zero unresolved

## Core Priorities

1. User DX (plugin users)
2. Worry-free automation
3. Token efficiency
4. Quality output
5. Simplicity

<end-reminder>
**REMEMBER**:
- No summary files (`*_AUDIT.md`, `*_SUMMARY.md`) - use CHANGELOG.md
- Multi-file changes → Read checklist FIRST (`checklists/*.md`)
</end-reminder>

## Model Selection Guidelines

Choose the appropriate model based on task complexity and quality multiplier effects:

| Complexity | Model | When to Use |
|------------|-------|-------------|
| **Opus** | Major components requiring real reasoning | Enhancers, reviewers, analyzers where imperfection compounds |
| **Inherit** | In-between complexity | Most agents, follow parent context |
| **Sonnet** | Side tasks, simple work | Straightforward pattern matching, validation |
| **Haiku** | No thinking, just execution | Very specified prompts, simple operations |

**Key Insight**: For enhancers/analyzers, the quality loss is exponential - imperfections multiply across all items reviewed.

**Examples**:
- `/enhance:agent` uses opus - false positives damage agent quality across entire codebase
- `simple-fixer` uses haiku - mechanically applies pre-defined fixes with no judgment
- `review-orchestrator` uses opus - review quality affects entire workflow
- `worktree-manager` uses haiku - scripted git commands with no decision-making

