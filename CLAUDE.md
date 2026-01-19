# Project Memory: awesome-slash

This file contains critical instructions for AI assistants working in this repository.

See @README.md for project overview and @CONTRIBUTING.md for guidelines.

---

## ⚠️ Production Project Notice

**This project has real users and GitHub stars.** Every change impacts developers relying on this plugin for their workflows.

**Exercise extra caution:**
- Test thoroughly before pushing
- Consider backwards compatibility
- Don't break existing functionality
- Security vulnerabilities affect all users
- Breaking changes require major version bumps

---

## Version Update Checklist

When releasing a new version, update **ALL** these locations:

| File | Location | Example |
|------|----------|---------|
| `package.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `README.md` | Version badge | `version-2.5.0-blue` |
| `README.md` | "What's New" section | Add new version section |
| `.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `.claude-plugin/marketplace.json` | `"version"` (appears 6x) | All version fields |
| `plugins/next-task/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `plugins/ship/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `plugins/deslop-around/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `plugins/project-review/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `plugins/reality-check/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` | `"version": "2.5.0"` |
| `CHANGELOG.md` | New entry at top | `## [2.5.0] - YYYY-MM-DD` |

**Version Types:**
- **Patch (x.x.X)**: Bug fixes, security patches, docs updates
- **Minor (x.X.0)**: New features, non-breaking changes
- **Major (X.0.0)**: Breaking changes, API changes

---

## Project Purpose & Development Philosophy

### What This Project Is

**awesome-slash is a plugin for OTHER projects** - it provides workflow automation for developers using Claude Code, Codex CLI, and OpenCode in their own repositories.

This is NOT a project where we optimize for internal development convenience. Every decision must be evaluated through the lens of: **"How does this improve the experience for users of the plugin?"**

### Core Priorities (In Order)

1. **User DX** - The developer experience when using this plugin in external projects
2. **Controlled, worry-free automation** - Users should trust the plugin to run autonomously
3. **Minimal context/token consumption** - Agents should be efficient, not verbose
4. **Quality agent output** - Code written by agents must be production-ready
5. **Simplicity over features** - Remove complexity that doesn't serve users

### Development Approach

When working on this codebase, always ask:

- **"Does this help plugin users?"** - Not internal tooling, not developer convenience here
- **"Is this simple enough?"** - If it feels overengineered, it probably is
- **"Will agents using this consume fewer tokens?"** - Efficiency matters
- **"Does this make the automation more reliable?"** - Trust is everything

### What To Avoid

- **Overengineering** - No config systems nobody asked for, no schemas for the sake of schemas
- **Internal tooling focus** - We don't optimize for developing THIS repo
- **Complexity creep** - Every abstraction must justify its existence
- **Summary files** - Don't create audit/completion/summary files (see Work Guidelines)

### State Management Philosophy

State should be **simple and flat**:
- `tasks.json` in main project - tracks active worktree/task
- `flow.json` in worktree - tracks workflow progress
- No history arrays, no nested objects, no cached settings
- Policy is per-task, not global

---

## Release Process

All releases include **both npm publish and GitHub tag**:

```bash
npm version patch && git push origin main --tags && npm publish
gh release create vX.Y.Z --title "vX.Y.Z" --notes "See CHANGELOG.md"
```

---

## PR Auto-Review Process

> **CRITICAL**: Every PR receives automatic reviews from **4 agents**:
> - **Copilot** - GitHub's AI reviewer
> - **Claude** - Anthropic's AI reviewer
> - **Gemini** - Google's AI reviewer
> - **Codex** - OpenAI's AI reviewer

**Mandatory workflow:**
1. After PR creation, wait **at least 3 minutes** for first review round
2. Read **ALL comments** from all 4 reviewers
3. Address **EVERY comment** - no exceptions
4. Iterate until **zero unresolved threads** (typically 2-4 rounds)

**Rules:**
- ALWAYS address all comments, including "minor" or "nit" suggestions
- NEVER skip a comment unless factually wrong or user-approved
- Treat all feedback as **required changes**, not suggestions

---

## Agent Responsibilities & Required Tools

### /next-task - Master Workflow Orchestrator

The main orchestrator **MUST spawn these agents in order**:

| Phase | Agent | Model | Required Tools | Purpose |
|-------|-------|-------|----------------|---------|
| 1 | *(orchestrator)* | - | AskUserQuestion | Configure workflow policy (direct questions) |
| 2 | `task-discoverer` | sonnet | Bash(gh:*), Bash(glab:*), Read | Find and prioritize tasks |
| 3 | `worktree-manager` | haiku | Bash(git:*) | Create isolated worktree |
| 4 | `exploration-agent` | opus | Read, Grep, Glob, LSP, Task | Deep codebase analysis |
| 5 | `planning-agent` | opus | Read, Grep, Glob, Bash(git:*), Task | Design implementation plan |
| 6 | **USER APPROVAL** | - | - | Last human touchpoint |
| 7 | `implementation-agent` | opus | Read, Write, Edit, Bash | Execute plan |
| 8 | `deslop-work` | sonnet | Read, Grep, Task(simple-fixer) | Clean AI slop |
| 8 | `test-coverage-checker` | sonnet | Bash(npm:*), Read, Grep | Validate test coverage |
| 9 | `review-orchestrator` | opus | Task(*-reviewer) | Multi-agent review loop |
| 10 | `delivery-validator` | sonnet | Bash(npm:*), Read | Validate completion |
| 11 | `docs-updater` | sonnet | Read, Edit, Task(simple-fixer) | Update documentation |
| 12 | `/ship` command | - | - | PR creation and merge |

### MUST-CALL Agents (Cannot Skip)

- **`exploration-agent`** - Required for understanding codebase before planning
- **`planning-agent`** - Required for creating implementation plan
- **`review-orchestrator`** - Required for code review before shipping
- **`delivery-validator`** - Required before calling /ship

### /ship - PR Workflow

The ship command **MUST execute these phases**:

| Phase | Responsibility | Required Tools |
|-------|----------------|----------------|
| 1-3 | Pre-flight, commit, create PR | Bash(git:*), Bash(gh:*) |
| 4 | **CI & Review Monitor Loop** | Bash(gh:*), Task(ci-fixer) |
| 5 | Internal review (standalone only) | Task(*-reviewer) |
| 6 | Merge PR | Bash(gh:*) |
| 7-10 | Deploy & validate | Bash(deployment:*) |

> **Phase 4 is MANDATORY** - even when called from /next-task.
> External auto-reviewers (Copilot, Claude, Gemini, Codex) comment AFTER PR creation.

### ci-monitor Agent

**Responsibility:** Monitor CI and PR comments, delegate fixes.

**Required Tools:**
- `Bash(gh:*)` - Check CI status and PR comments
- `Task(ci-fixer)` - Delegate fixes to ci-fixer agent

**Must Follow:**
1. Wait 3 minutes for auto-reviews on first iteration
2. Check ALL 4 reviewers (Copilot, Claude, Gemini, Codex)
3. Iterate until zero unresolved threads

### ci-fixer Agent

**Responsibility:** Fix CI failures and address PR comments.

**Required Tools:**
- `Read` - Read failing files
- `Edit` - Apply fixes
- `Bash(npm:*)` - Run tests
- `Bash(git:*)` - Commit and push fixes

**Must Follow:**
1. Address EVERY comment, including minor/nit suggestions
2. Reply to each comment explaining the fix
3. Resolve thread only after addressing

---

## Agent Tool Restrictions

| Agent | Allowed Tools | Disallowed |
|-------|---------------|------------|
| worktree-manager | Bash(git:*) | Write, Edit |
| ci-monitor | Bash(gh:*), Read, Task | Write, Edit |
| simple-fixer | Read, Edit, Bash(git:*) | Task |

---

## Code Quality

- Maintain **80%+ test coverage**
- Run `npm test` before commits
- Update CHANGELOG.md with every PR

---

## Work Guidelines

### No Summary Files

**CRITICAL**: Do NOT create summary, audit, or completion files unless explicitly part of the documented workflow.

**Prohibited files**:
- `*_FIXES_APPLIED.md`
- `*_AUDIT.md`
- `*_SUMMARY.md`
- `*_COMPLETION.md`
- Any other summary/report files

**Why**:
- Summary files clutter the repository
- Information should be in CHANGELOG.md or commit messages
- User doesn't want post-task summaries
- Focus on the work, not documentation about the work

**When summary files ARE allowed**:
- Explicitly requested by user
- Part of documented workflow (e.g., CHANGELOG.md)
- Required by process (e.g., PLAN.md in plan mode)

**If you complete a task**: Report completion verbally, update CHANGELOG.md if appropriate, but do NOT create a summary file.

---

## Key Files

| Component | Location |
|-----------|----------|
| Next-task agents | `plugins/next-task/agents/*.md` |
| Ship command | `plugins/ship/commands/ship.md` |
| CI review loop | `plugins/ship/commands/ship-ci-review-loop.md` |
| State management | `lib/state/workflow-state.js` |
| Plugin manifest | `.claude-plugin/plugin.json` |

