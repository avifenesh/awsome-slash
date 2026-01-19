# Awesome Slash Commands

> Professional-grade workflow automation for AI coding assistants

A cross-platform plugin providing powerful, zero-configuration slash commands for development workflows. Works with **Claude Code**, **Codex CLI**, and **OpenCode**.

[![npm](https://img.shields.io/npm/v/awesome-slash?color=red)](https://www.npmjs.com/package/awesome-slash)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.4.8-blue)](https://github.com/avifenesh/awesome-slash/releases)
[![GitHub stars](https://img.shields.io/github/stars/avifenesh/awesome-slash?style=flat&color=yellow)](https://github.com/avifenesh/awesome-slash/stargazers)
[![Claude Code](https://img.shields.io/badge/Claude-Code%20Plugin-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex CLI](https://img.shields.io/badge/Codex-CLI%20Compatible-green)](https://developers.openai.com/codex/cli)
[![OpenCode](https://img.shields.io/badge/OpenCode-Compatible-orange)](https://opencode.ai)

## What's New in v2.4.8

- **Multi-Source Task Discovery** - Support for GitHub, GitLab, local files, custom CLI tools, and ad-hoc sources
- **Source Preference Caching** - Your last-used source appears first on subsequent runs
- **Security Hardening** - Fixed command injection and path traversal vulnerabilities
- **Large Backlog Handling** - Intelligent pagination and priority filtering for repos with many issues

## What's New in v2.4.7

- **Simplified State Management** - Rewrote workflow-state.js, removed 9,000+ lines of overengineered code
- **Removed Config System** - Deleted unused schemas and config system
- **Tasks Lifecycle Wiring** - tasks.json now auto-registers/clears with workflow lifecycle
- **Project Philosophy** - Added development guidelines to CLAUDE.md
- **Agent Model Updates** - task-discoverer and code-explorer upgraded to opus

---

## Quick Install

```bash
# npm (recommended)
npm install awesome-slash

# Claude Code
claude plugin add npm:awesome-slash

# OpenCode / Codex CLI
git clone https://github.com/avifenesh/awesome-slash.git
./scripts/install/opencode.sh  # or codex.sh
```

**See [docs/INSTALLATION.md](./docs/INSTALLATION.md) for all options, prerequisites, and troubleshooting.**

---

## Available Commands

### `/next-task` - Master Workflow Orchestrator

Complete task-to-production automation with state management and resume capability.

```bash
/next-task                        # Start new workflow with policy selection
/next-task --status               # Check current workflow state
/next-task --resume               # Resume from last checkpoint
/next-task --abort                # Cancel workflow and cleanup
/next-task bug                    # Filter by task type
```

**Workflow phases (tracked in `.claude/flow.json`):**
- policy-selection
- task-discovery
- worktree-setup
- exploration
- planning
- user-approval
- implementation
- review-loop
- delivery-approval
- ship-prep
- create-pr
- ci-wait
- comment-fix
- merge
- production-ci
- deploy
- production-release
- complete

**Quality gates:**
- deslop-work
- test-coverage-checker
- review-orchestrator
- delivery-validator
- docs-updater

**Task Sources:**
- **GitHub Issues** - Uses `gh` CLI (handles large backlogs with priority filtering)
- **GitLab Issues** - Uses `glab` CLI
- **Local files** - Reads from PLAN.md, tasks.md, or TODO.md
- **Custom CLI** - Any CLI tool (tea, jira-cli, etc.) with auto-discovery
- **Other** - Describe your source and the agent figures it out

Your source preference is cached in `.claude/sources/preference.json` for fast subsequent runs.

**Notes:**
- Fully autonomous after plan approval
- Resume capability with `.claude/flow.json`
- Policy-based stopping points (pr-created, merged, deployed, production)
- /ship handles PR creation, CI monitoring, merge, and cleanup

---

### `/ship` - Complete PR Workflow

Ship your code from commit to production with full validation and state integration.

```bash
/ship                             # Default workflow
/ship --strategy rebase           # Rebase before merge
/ship --dry-run                   # Show plan without executing
/ship --state-file PATH           # Integrate with next-task workflow
```

**Stages:**
- Pre-flight checks and platform detection
- Commit and PR creation
- CI wait and review loop
- Merge and (optional) deploy validation
- Cleanup and completion report

**Platform Support:**
- **CI:** GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI
- **Deployment:** Railway, Vercel, Netlify, Fly.io, Platform.sh, Render

---

### `/deslop-around` - AI Slop Cleanup

Remove debugging code, old TODOs, and AI slop from your codebase.

```bash
/deslop-around                    # Report mode - analyze only
/deslop-around apply              # Apply fixes with verification
/deslop-around apply src/ 10      # Fix up to 10 issues in src/
```

**Detects:**
- Console debugging (`console.log`, `print()`, `dbg!()`)
- Old TODOs and commented code
- Placeholder text, magic numbers
- Empty catch blocks, disabled linters

---

### `/project-review` - Multi-Agent Code Review

Comprehensive code review with specialized agents that iterate until zero issues.

```bash
/project-review                   # Full codebase review
/project-review --recent          # Only recent changes
/project-review --domain security # Domain-focused review
```

**Review domains:**
Security, Performance, Architecture, Testing, Error Handling, Code Quality, Type Safety, Documentation

---

### `/update-docs-around` - Documentation Sync

Sync documentation with actual code state across the repository.

```bash
/update-docs-around               # Report mode - analyze only
/update-docs-around --apply       # Apply safe fixes
/update-docs-around docs/ --apply # Sync specific directory
```

**Checks:**
- Outdated code references in documentation
- Invalid syntax in code examples
- Missing CHANGELOG entries
- Version mismatches
- Broken file/import paths

---

### `/delivery-approval` - Delivery Validation

Validate task completion and approve for shipping (standalone or part of workflow).

```bash
/delivery-approval                # Validate current work
/delivery-approval --task-id 142  # Validate specific task
/delivery-approval --verbose      # Show detailed check output
```

**Validation checks:**
- Tests pass
- Build passes
- Lint passes
- Type check passes
- Task requirements met

---

### `/reality-check:scan` - Plan Drift Detection

Deep repository analysis to identify where documented plans diverge from actual code reality.

```bash
/reality-check:scan           # Full reality check scan
/reality-check:set            # Configure scan settings
```

**Multi-agent parallel scan:**
1. Issue scanner - analyzes GitHub issues, PRs, milestones
2. Doc analyzer - examines README, PLAN.md, CLAUDE.md, docs/
3. Code explorer - deep codebase structure and feature analysis
4. Plan synthesizer - combines findings into prioritized plan

---

## Cross-Platform Integration

All platforms share the same workflow tools via MCP (Model Context Protocol):

| Tool | Description |
|------|-------------|
| `workflow_status` | Get current workflow state |
| `workflow_start` | Start a new workflow |
| `workflow_resume` | Resume from checkpoint |
| `workflow_abort` | Cancel and cleanup |
| `task_discover` | Find and prioritize tasks |
| `review_code` | Run pattern-based code review | 

See [docs/CROSS_PLATFORM.md](./docs/CROSS_PLATFORM.md) for details.

---

## Architecture

### State Management

Simple state tracking with two files:

**Main project: `.claude/tasks.json`** - Tracks active worktree/task:
```json
{
  "active": {
    "worktree": "../project-task-123",
    "branch": "feature/123-fix-auth",
    "taskId": "123",
    "taskTitle": "Fix auth timeout"
  }
}
```

**Worktree: `.claude/flow.json`** - Tracks workflow progress:
```json
{
  "task": { "id": "123", "title": "Fix auth timeout" },
  "policy": { "stoppingPoint": "merged" },
  "phase": "implementation",
  "status": "in_progress",
  "exploration": { "keyFiles": [...] },
  "plan": { "steps": [...] },
  "pr": { "number": 456, "url": "..." }
}
```

### Specialist Agents (18 Total)

**Core Workflow (Opus - Complex Tasks):**
| Agent | Purpose |
|-------|---------|
| exploration-agent | Deep codebase analysis |
| planning-agent | Design implementation plans |
| implementation-agent | Execute plans with quality code |
| review-orchestrator | Multi-agent code review with iteration |

**Quality Gates (Sonnet - Side Reviewers):**
| Agent | Purpose |
|-------|---------|
| deslop-work | Clean AI slop from new work (committed but unpushed) |
| test-coverage-checker | Validate new work has test coverage |
| delivery-validator | Autonomous delivery validation (not manual) |
| docs-updater | Update docs related to changes |

**Operational (Sonnet - Infrastructure):**
| Agent | Purpose |
|-------|---------|
| policy-selector | Configure workflow policy |
| task-discoverer | Find and prioritize tasks |
| worktree-manager | Create isolated worktrees |
| ci-monitor | Monitor CI/PR status with sleep loops |
| ci-fixer | Fix CI failures and review comments |
| simple-fixer | Execute predefined code fixes |

**Reality Check (Sonnet + Opus - Plan Drift Detection):**
| Agent | Purpose |
|-------|---------|
| issue-scanner | Analyze GitHub issues, PRs, milestones |
| doc-analyzer | Examine documentation for plans and roadmaps |
| code-explorer | Deep codebase structure analysis |
| plan-synthesizer | Combine findings into prioritized plan (opus) |

---

## Repository Structure

```
awesome-slash/
|-- .claude-plugin/
|   |-- marketplace.json      # Claude Code marketplace manifest
|-- plugins/
|   |-- next-task/             # Master workflow orchestrator
|   |   |-- commands/          # next-task, update-docs-around, delivery-approval
|   |   |-- agents/            # Specialist agents
|   |   |-- hooks/             # SubagentStop hooks for workflow automation
|   |-- ship/                  # PR workflow
|   |-- deslop-around/         # AI slop cleanup
|   |-- project-review/        # Multi-agent review
|   |-- reality-check/         # Plan drift detection
|-- lib/
|   |-- config/                # Configuration management
|   |-- state/                 # Workflow state management
|   |-- platform/              # Auto-detection
|   |-- patterns/              # Code analysis patterns
|   |-- utils/                 # Shell escaping and context optimization
|-- mcp-server/                # Cross-platform MCP server
|-- scripts/install/           # Platform installers
|-- docs/
```

---

## Requirements

**Required:**
- Git
- Node.js 18+

**Required for GitHub-backed workflows:**
- GitHub CLI (`gh`) with authentication

**For Claude Code:**
- Claude Code CLI

**For OpenCode:**
- OpenCode CLI (`opencode`)

**For Codex CLI:**
- Codex CLI (`codex`)

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT - [Avi Fenesh](https://github.com/avifenesh)

## Support

- **Issues:** https://github.com/avifenesh/awesome-slash/issues
- **Discussions:** https://github.com/avifenesh/awesome-slash/discussions

---

Made with care for the AI coding community
