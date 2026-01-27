# /next-task Workflow

Complete technical reference for the `/next-task` workflow.

**TL;DR:** 12 phases, 13 agents, 3 human interactions (policy, task selection, plan approval). After plan approval, fully autonomous until merged PR.

---

## Quick Navigation

| Section | Jump to |
|---------|---------|
| [Workflow Phases](#workflow-phases) | All 12 phases explained |
| [State Management](#state-management) | tasks.json, flow.json, resume |
| [Workflow Enforcement](#workflow-enforcement) | How gates are enforced |
| [Agent Model Allocation](#agent-model-allocation) | Why opus/sonnet/haiku |
| [Cleanup](#cleanup) | Success and abort handling |
| [Example Flow](#example-flow) | Full walkthrough |

**Related docs:**
- [Agent Reference](../reference/AGENTS.md) - Detailed agent documentation
- [/ship Workflow](./SHIP.md) - The shipping phase in detail
- [Slop Patterns](../reference/SLOP-PATTERNS.md) - What deslop-work detects

---

## Overview

`/next-task` is a master orchestrator that takes a task from discovery to merged PR. It coordinates 13 specialized agents across 12 phases with 3 human interaction points.

**Why this design:** You shouldn't have to ask for the same workflow every session. The orchestrator handles the coordination—launching agents, tracking state, enforcing gates—so you can approve a plan and walk away. Human judgment is only required at meaningful decision points: what to work on, whether the plan is correct, and reviewing the final output. Everything between is automated.

---

## Workflow Phases

### Phase 1: Policy Selection

**Human interaction: Yes**

You configure how the workflow will run:

| Question | Options |
|----------|---------|
| Task Source | GitHub Issues, GitLab Issues, Local `tasks.md`, Custom source |
| Priority Filter | Bugs, Security, Features, All |
| Stopping Point | Implemented, PR Created, All Green, Merged, Deployed, Production |

Your selection is cached in `{state-dir}/sources/preference.json` so subsequent runs skip this step.

---

### Phase 2: Task Discovery

**Agent:** task-discoverer (sonnet)
**Human interaction: Yes**

The agent:
1. Loads `tasks.json` to find already-claimed tasks (excludes them)
2. Fetches tasks from your configured source
3. Applies priority scoring based on:
   - Labels (bug, security, priority)
   - Blockers (blocking other issues)
   - Age (older issues score higher)
   - Reactions (engagement signals importance)
4. Validates tasks against codebase (filters out already-implemented)
5. Presents top 5 as checkboxes via AskUserQuestion
6. Posts "Workflow Started" comment to the selected GitHub issue

---

### Phase 3: Worktree Setup

**Agent:** worktree-manager (haiku)
**Human interaction: No**

The agent:
1. Creates `../worktrees/{task-slug}/` directory
2. Creates `feature/{task-slug}` branch from main
3. **Claims task in `tasks.json`** (prevents parallel workflows on same task)
4. Creates `flow.json` in worktree for state tracking
5. Changes working directory to worktree

---

### Phase 4: Exploration

**Agent:** exploration-agent (opus)
**Human interaction: No**

The agent:
1. Extracts keywords from task title and description
2. Searches codebase for related files using Grep and Glob
3. Traces dependency graphs
4. Analyzes existing patterns and conventions
5. Outputs exploration report with:
   - Key files identified
   - Patterns discovered
   - Risks and considerations
   - Suggested approach

---

### Phase 5: Planning

**Agent:** planning-agent (opus)
**Human interaction: No**

The agent:
1. Synthesizes exploration findings
2. Creates step-by-step implementation plan
3. Identifies critical paths and risks
4. Outputs structured JSON between delimiters:

```
=== PLAN_START ===
{
  "steps": [...],
  "files": [...],
  "risks": [...],
  "complexity": "medium"
}
=== PLAN_END ===
```

5. Posts plan summary to GitHub issue as comment

---

### Phase 6: User Approval

**Human interaction: Yes (last one)**

The workflow:
1. Enters Plan Mode
2. Presents formatted plan from planning-agent
3. You can request changes or ask questions
4. You approve via ExitPlanMode

**After this point, the workflow runs autonomously until delivery.**

---

### Phase 7: Implementation

**Agent:** implementation-agent (opus)
**Human interaction: No**

The agent:
1. Executes approved plan step-by-step
2. Creates atomic commits per logical step
3. Runs type checks, linting, and tests after each step
4. Updates `flow.json` after each step (for resume capability)

**Restrictions enforced:**
- MUST NOT create PR
- MUST NOT push to remote
- MUST NOT invoke review agents (handled by workflow)

---

### Phase 8: Pre-Review Gates

**Agents:** deslop-work (sonnet), test-coverage-checker (sonnet)
**Human interaction: No**
**Triggered by:** SubagentStop hook after implementation

Both agents run in parallel:

**deslop-work:**
- Analyzes git diff (only new changes)
- Invokes `/deslop` pipeline
- Applies HIGH certainty fixes automatically
- Flags LOW certainty for manual review

**test-coverage-checker:**
- Validates tests exist for new code
- Checks tests are meaningful (not just path matching)
- Advisory only - does not block workflow

---

### Phase 9: Review Loop

**Execution:** Inline in main orchestrator (uses orchestrate-review skill)
**Human interaction: No**

The orchestrator:
1. Reads orchestrate-review skill for guidance
2. Detects content signals (database, API, frontend, backend, devops, architecture)
3. Spawns parallel Task agents (general-purpose, sonnet) - one per review pass:
   - Core (always): code quality, security, performance, test coverage
   - Conditional: database, architecture, api, frontend, backend, devops
4. Aggregates findings by severity (critical/high/medium/low)
5. Fixes all non-false-positive issues
6. Commits fixes
7. Runs deslop-work after each iteration
8. Re-reviews changed files
9. Repeats until no open issues remain
10. Stops early if iteration limit or stall detected

The loop continues until clean, but stops early if iteration limits or stall detection trigger.

**Restrictions enforced:**
- MUST NOT create PR
- MUST NOT push to remote
- MUST NOT skip review loop

---

### Phase 10: Delivery Validation

**Agent:** delivery-validator (sonnet)
**Human interaction: No**

Five checks run:
1. Review status - no open issues remaining (or explicit override)
2. Tests pass
3. Build passes
4. Task requirements met (extracts from task description, maps to changes)
5. No regressions

**On failure:** Returns to implementation with fix instructions (automatic retry)

**Restrictions enforced:**
- MUST NOT create PR
- MUST NOT push
- MUST NOT skip docs-updater

---

### Phase 11: Documentation Update

**Agent:** docs-updater (sonnet)
**Helper:** simple-fixer (haiku)
**Human interaction: No**

The agent:
1. Finds documentation referencing changed files
2. Updates CHANGELOG with entry
3. Updates outdated imports/versions
4. Delegates simple mechanical edits to simple-fixer
5. **Explicitly invokes `/ship`** (does not rely on hooks alone)

---

### Phase 12: Ship

**Command:** `/ship`
**Agents:** ci-monitor (haiku), ci-fixer (sonnet)
**Human interaction: No**

Full shipping workflow:
1. Pushes branch to remote
2. Creates pull request
3. Monitors CI status (polls every 15 seconds)
4. Waits 3 minutes for auto-reviewers
5. Addresses ALL comments from ALL reviewers
6. Merges when CI passes and all threads resolved
7. Cleanup:
   - Removes worktree
   - Removes task from `tasks.json`
   - Closes GitHub issue with completion comment
   - Deletes feature branch

---

## State Management

### Two-File Architecture

| File | Location | Purpose |
|------|----------|---------|
| `tasks.json` | Main project `{state-dir}/` | Active task registry |
| `flow.json` | Worktree `{state-dir}/` | Workflow phase progress |

### Platform State Directories

| Platform | State Directory |
|----------|-----------------|
| Claude Code | `.claude/` |
| OpenCode | `.opencode/` |
| Codex CLI | `.codex/` |

Override with `AI_STATE_DIR` environment variable.

### Resume Capability

```bash
/next-task --resume              # Resume active worktree
/next-task --resume 123          # Resume by task ID
/next-task --resume feature/xyz  # Resume by branch name
```

The workflow:
1. Reads `tasks.json` to find worktree path
2. Reads `flow.json` in worktree for last completed step
3. Maps step to phase and continues

**Step-to-phase mapping:**

| Step | Resumes at |
|------|------------|
| worktree-created | exploration |
| exploration-completed | planning |
| plan-approved | implementation |
| implementation-completed | pre-review-gates |
| deslop-work-completed | review-loop |
| review-approved | delivery-validation |
| delivery-validation-passed | docs-update |
| docs-updated | ship |

---

## Workflow Enforcement

A SubagentStop hook enforces the workflow sequence. When any agent completes, the hook determines what runs next.

**Enforced rules:**
- Cannot skip deslop-work or test-coverage-checker
- Cannot skip Phase 9 review loop
- Cannot skip delivery-validator
- Cannot skip docs-updater
- Cannot create PR before `/ship` is invoked
- Cannot push to remote before `/ship` is invoked

---

## Agent Model Allocation

| Model | Agents | Why |
|-------|--------|-----|
| **opus** | exploration-agent, planning-agent, implementation-agent | Complex reasoning, quality-critical phases |
| **sonnet** | task-discoverer, deslop-work, test-coverage-checker, delivery-validator, docs-updater, ci-fixer | Moderate reasoning, structured tasks |
| **haiku** | worktree-manager, simple-fixer, ci-monitor | Mechanical execution, no judgment needed |

---

## Cleanup

### On Success

`/ship` handles cleanup:
- Removes worktree directory
- Removes task entry from `tasks.json`
- Closes GitHub issue with completion comment
- Deletes feature branch (via `--delete-branch` on merge)

### On Abort

```bash
/next-task --abort
```

The abort:
- Updates `flow.json` status to 'aborted'
- Clears active task from `tasks.json`
- Worktree remains (manual cleanup or run worktree-manager)

---

## Example Flow

```
User: /next-task

[Policy Selection]
→ Task source? GitHub Issues
→ Priority? Bugs
→ Stop at? Merged

[Task Discovery]
→ Analyzing 47 open issues...
→ Top 5:
  1. Fix authentication timeout (#142)
  2. Handle empty state in dashboard (#89)
  ...
→ Which task? [1]

[Worktree Setup]
→ Creating ../worktrees/fix-auth-timeout-142/
→ Branch: feature/fix-auth-timeout-142

[Exploration]
→ Found: src/auth/session.ts, src/middleware/auth.ts
→ Pattern: JWT with 5-minute hardcoded timeout
→ Risk: Tests mock the timeout value

[Planning]
→ Step 1: Extract timeout to config
→ Step 2: Update session.ts
→ Step 3: Update tests
→ Step 4: Add documentation

[User Approval]
→ Plan looks good? [approve]

[Implementation]
→ Implementing step 1... ✓
→ Implementing step 2... ✓
→ Implementing step 3... ✓
→ Implementing step 4... ✓

[Pre-Review Gates]
→ deslop-work: Removed 2 console.logs
→ test-coverage-checker: 94% coverage ✓

[Review Loop]
→ Round 1: Found 3 issues (1 high, 2 medium)
→ Fixing high issue... ✓
→ deslop-work: Clean ✓
→ Round 2: Found 0 open issues ✓

[Delivery Validation]
→ Tests pass ✓
→ Build passes ✓
→ Requirements met ✓

[Docs Update]
→ Updated CHANGELOG.md ✓

[Ship]
→ Creating PR #156...
→ Waiting for CI...
→ Waiting for reviewers...
→ Addressing 2 comments...
→ Merging PR #156... ✓
→ Cleanup complete ✓

Done! PR #156 merged to main.
```

---

## Navigation

[← Back to Documentation Index](../README.md) | [Main README](../../README.md)

**Related:**
- [/ship Workflow](./SHIP.md) - The shipping phase in detail
- [Agent Reference](../reference/AGENTS.md) - All agent documentation
- [Slop Patterns](../reference/SLOP-PATTERNS.md) - What gets detected and cleaned
