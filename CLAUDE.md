# Project Memory: awesome-slash

This file contains critical instructions for AI assistants working in this repository.

See @README.md for project overview and @CONTRIBUTING.md for guidelines.

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
| 1 | `policy-selector` | haiku | AskUserQuestion | Configure workflow policy |
| 2 | `task-discoverer` | sonnet | Bash(gh:*), Read | Find and prioritize tasks |
| 3 | `worktree-manager` | haiku | Bash(git:*) | Create isolated worktree |
| 4 | `exploration-agent` | opus | Read, Grep, Glob, LSP | Deep codebase analysis |
| 5 | `planning-agent` | opus | Read, Grep, EnterPlanMode | Design implementation plan |
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
| policy-selector | AskUserQuestion | Write, Edit |
| worktree-manager | Bash(git:*) | Write, Edit |
| ci-monitor | Bash(gh:*), Read, Task | Write, Edit |
| simple-fixer | Read, Edit, Bash(git:*) | Task |

---

## Code Quality

- Maintain **80%+ test coverage**
- Run `npm test` before commits
- Update CHANGELOG.md with every PR

---

## Key Files

| Component | Location |
|-----------|----------|
| Next-task agents | `plugins/next-task/agents/*.md` |
| Ship command | `plugins/ship/commands/ship.md` |
| CI review loop | `plugins/ship/commands/ship-ci-review-loop.md` |
| State management | `lib/state/workflow-state.js` |
| Plugin manifest | `.claude-plugin/plugin.json` |
