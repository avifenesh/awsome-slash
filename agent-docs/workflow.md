# Workflow Agent Reference

Detailed agent responsibilities and tool requirements for /next-task and /ship workflows.

**Related Checklists:**
- [New Agent Checklist](../checklists/new-agent.md)
- [New Command Checklist](../checklists/new-command.md)

**Best Practices:**
- [Multi-Agent Systems](./MULTI-AGENT-SYSTEMS-REFERENCE.md)
- [Prompt Engineering](./PROMPT-ENGINEERING-REFERENCE.md)

## /next-task - Master Workflow Orchestrator

The main orchestrator **MUST spawn these agents in order**:

| Phase | Agent | Model | Required Tools | Purpose |
|-------|-------|-------|----------------|---------|
| 1 | *(orchestrator)* | - | AskUserQuestion | Configure workflow policy |
| 2 | `task-discoverer` | sonnet | Bash(gh:*), Bash(glab:*), Read | Find and prioritize tasks |
| 3 | `worktree-manager` | haiku | Bash(git:*), Read, Write | Create isolated worktree |
| 4 | `exploration-agent` | opus | Read, Grep, Glob, LSP, Task | Deep codebase analysis |
| 5 | `planning-agent` | opus | Read, Grep, Glob, Bash(git:*), Task | Design implementation plan |
| 6 | **USER APPROVAL** | - | - | Last human touchpoint |
| 7 | `implementation-agent` | opus | Read, Write, Edit, Bash | Execute plan |
| 8 | `deslop-work` | sonnet | Read, Grep, Edit, Bash(git:*) | Clean AI slop (uses pipeline.js) |
| 8 | `test-coverage-checker` | sonnet | Bash(npm:*), Read, Grep | Validate test coverage |
| 9 | `review-orchestrator` | opus | Task(review) | Multi-pass review loop |
| 10 | `delivery-validator` | sonnet | Bash(npm:*), Read | Validate completion |
| 11 | `docs-updater` | sonnet | Read, Edit, Task(simple-fixer) | Update documentation |
| 12 | `/ship` command | - | - | PR creation and merge |

### MUST-CALL Agents (Cannot Skip)

- **`exploration-agent`** - Required for understanding codebase before planning
- **`planning-agent`** - Required for creating implementation plan
- **`review-orchestrator`** - Required for code review before shipping
- **`delivery-validator`** - Required before calling /ship

### Review Decision Gate

If review-orchestrator reports `blocked: true` (iteration limit or stall), /next-task must decide:
- Re-run review-orchestrator with `--resume`, or
- Override and continue if issues are non-blocking (clear the queue file).

---

## /ship - PR Workflow

| Phase | Responsibility | Required Tools |
|-------|----------------|----------------|
| 1-3 | Pre-flight, commit, create PR | Bash(git:*), Bash(gh:*) |
| 4 | **CI & Review Monitor Loop** | Bash(gh:*), Task(ci-fixer) |
| 5 | Internal review (standalone only) | Task(review) |
| 6 | Merge PR | Bash(gh:*) |
| 7-10 | Deploy & validate | Bash(deployment:*) |

> **Phase 4 is MANDATORY** - even when called from /next-task.
> External auto-reviewers (Copilot, Claude, Gemini, Codex) comment AFTER PR creation.

---

## ci-monitor Agent

**Responsibility:** Monitor CI and PR comments, delegate fixes.

**Required Tools:**
- `Bash(gh:*)` - Check CI status and PR comments
- `Task(ci-fixer)` - Delegate fixes to ci-fixer agent

**Must Follow:**
1. Wait 3 minutes for auto-reviews on first iteration
2. Check ALL 4 reviewers (Copilot, Claude, Gemini, Codex)
3. Iterate until zero unresolved threads

---

## ci-fixer Agent

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
| worktree-manager | Bash(git:*), Read, Write | Edit |
| ci-monitor | Bash(gh:*), Read, Task | Write, Edit |
| simple-fixer | Read, Edit, Bash(git:*) | Task |
| deslop-work | Read, Grep, Edit, Bash(git:*) | Task |

---

## Quality Gates (Pre-Review)

Agents that run in parallel after implementation, before review:

| Agent | Purpose | Key Files |
|-------|---------|-----------|
| `deslop-work` | Clean AI slop from committed work | `lib/patterns/pipeline.js` |
| `test-coverage-checker` | Validate new code has tests | Advisory only |

**deslop-work** uses the 3-phase pipeline:
- Phase 1: Regex patterns (HIGH certainty, auto-fix)
- Phase 2: Multi-pass analyzers (MEDIUM certainty, verify)
- Phase 3: CLI tools (LOW certainty, advisory)

---

## State Files

| File | Location | Purpose |
|------|----------|---------|
| `tasks.json` | `{state-dir}/` | Active worktree/task registry |
| `flow.json` | `{state-dir}/` (worktree) | Workflow progress |
| `preference.json` | `{state-dir}/sources/` | Cached task source |

State directory varies by platform:
- Claude Code: `.claude/`
- OpenCode: `.opencode/`
- Codex CLI: `.codex/`
