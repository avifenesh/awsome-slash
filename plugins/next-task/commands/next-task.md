---
description: Master workflow orchestrator with autonomous task-to-production automation
argument-hint: "[filter] [--status] [--resume] [--abort] [--implement]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

# /next-task - Master Workflow Orchestrator

Discover what to work on next and execute the complete implementation workflow.

## Default Behavior (No Arguments)

**When you run `/next-task` with NO arguments**:
1. Goes to Phase 1: Policy Selection
2. Policy selector checks for existing tasks in `.claude/tasks.json`
3. If existing tasks found, **ASKS USER** what to do:
   - Start new task (recommended - leaves existing task untouched)
   - Resume existing task
   - Abort existing task
   - View status only
4. Then continues with normal policy configuration

**CRITICAL**: The workflow NEVER auto-resumes existing tasks. It ALWAYS asks first.

## ⚠️ QUESTION LABEL LIMIT (OpenCode Compatibility)

**All AskUserQuestion option labels MUST be ≤30 characters.** This is enforced by OpenCode.

When asking about existing tasks, use these short labels:

```javascript
// CORRECT - Labels under 30 chars
AskUserQuestion({
  questions: [{
    header: "Existing Task",
    question: `Task #${taskId} is at ${phase}. What to do?`,
    options: [
      { label: "Start new task", description: "Leave existing task, start fresh" },
      { label: "Resume task", description: `Continue #${taskId} from ${phase}` },
      { label: "Abort task", description: "Cancel existing and start new" },
      { label: "View status only", description: "Just show current state" }
    ],
    multiSelect: false
  }]
});

// WRONG - Labels too long (will error in OpenCode)
// { label: "Resume and ship #220 (ProfileScreen)", ... }  // 38 chars - TOO LONG
// { label: "Start a completely new task", ... }           // 28 chars - OK but borderline
```

Put details in the `description` field, not the `label`.

## Workflow Overview

```
Policy Selection → Task Discovery → Worktree Setup → Exploration → Planning
       ↓                                                              ↓
   (User input)                                              (User approval)
                                                                      ↓
                    ← ← ← AUTONOMOUS FROM HERE → → →
                                                                      ↓
Implementation → Pre-Review Gates → Review Loop → Delivery Validation
                                                                      ↓
                                                        Docs Update → /ship
```

**Human interaction points (ONLY THESE):**
1. Policy selection via checkboxes
2. Task selection from ranked list
3. Plan approval (EnterPlanMode/ExitPlanMode)

**After plan approval, everything runs autonomously until delivery validation passes.**

## ⛔ WORKFLOW ENFORCEMENT - CRITICAL

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         MANDATORY WORKFLOW GATES                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  Each phase MUST complete and approve before the next can start:         ║
║                                                                          ║
║  1. implementation-agent completes                                       ║
║           ↓ MUST trigger                                                 ║
║  2. deslop-work + test-coverage-checker (parallel)                       ║
║           ↓ MUST trigger                                                 ║
║  3. Phase 9 review loop (MUST approve - no open issues or override)      ║
║           ↓ MUST trigger (only if approved)                              ║
║  4. delivery-validator (MUST approve - tests pass, build passes)         ║
║           ↓ MUST trigger (only if approved)                              ║
║  5. docs-updater                                                         ║
║           ↓ MUST EXPLICITLY invoke /ship (NOT rely on hooks alone)       ║
║  6. /ship command (creates PR, monitors CI, merges, CLEANS UP)           ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  ⛔ NO AGENT may create a PR - only /ship creates PRs                    ║
║  ⛔ NO AGENT may push to remote - only /ship pushes                      ║
║  ⛔ NO AGENT may skip the Phase 9 review loop                            ║
║  ⛔ NO AGENT may skip the delivery-validator                             ║
║  ⛔ NO AGENT may skip the docs-updater                                   ║
║  ⛔ NO AGENT may skip workflow-status.json updates after each phase      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## Review Decision Gate (Blocked/Resume)

If Phase 9 review loop exits with `reviewResult.blocked: true`, the orchestrator MUST decide the next action (no user prompt).

Use the review queue file (`flow.reviewQueue.path`) to inspect open items and their `pass` values.

Decision rules:
1. **If any open issue is critical/high OR any open issue is from security/performance/devops/database/api/backend/architecture** → re-run Phase 9 review loop.
2. **If all open issues are medium/low and only code-quality/test-coverage** → you may override and continue if the issues are non-blocking.
3. **If unclear** → re-run Phase 9 review loop.

When overriding, update flow:
```javascript
const fs = require('fs');

if (flow.reviewQueue?.path && fs.existsSync(flow.reviewQueue.path)) {
  try {
    fs.unlinkSync(flow.reviewQueue.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

workflowState.updateFlow({
  reviewResult: {
    approved: true,
    override: true,
    overrideReason: 'issues deemed non-blocking',
    reviewQueuePath: flow.reviewQueue?.path
  },
  reviewQueue: {
    path: flow.reviewQueue?.path,
    status: 'override-cleared',
    updatedAt: new Date().toISOString()
  }
});
```

## ⚠️ MANDATORY STATE UPDATES - EVERY AGENT

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    EVERY AGENT MUST UPDATE STATE                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  After EACH phase completion, agents MUST:                               ║
║                                                                          ║
║  1. Update .claude/workflow-status.json in the WORKTREE with:            ║
║     - Current step name and status                                       ║
║     - Timestamp of completion                                            ║
║     - Any relevant result data                                           ║
║                                                                          ║
║  2. Update .claude/tasks.json in the MAIN REPO with:                     ║
║     - lastActivityAt timestamp                                           ║
║     - Current status                                                     ║
║                                                                          ║
║  FAILURE TO UPDATE STATE = WORKFLOW CANNOT RESUME                        ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### State Update Code (Use in EVERY agent)

```javascript
// MANDATORY: Call this at the END of every agent's work
function recordStepCompletion(stepName, result = {}) {
  const fs = require('fs');
  const path = require('path');

  // 1. Update worktree's workflow-status.json
  const worktreeStatusPath = '.claude/workflow-status.json';
  if (fs.existsSync(worktreeStatusPath)) {
    const status = JSON.parse(fs.readFileSync(worktreeStatusPath, 'utf8'));

    status.steps.push({
      step: stepName,
      status: 'completed',
      startedAt: status.workflow.lastActivityAt,
      completedAt: new Date().toISOString(),
      result: result
    });

    status.workflow.lastActivityAt = new Date().toISOString();
    status.workflow.currentPhase = stepName;
    status.resume.resumeFromStep = stepName;

    fs.writeFileSync(worktreeStatusPath, JSON.stringify(status, null, 2));
    console.log(`✓ Updated workflow-status.json: ${stepName}`);
  }

  // 2. Update main repo's tasks.json (if accessible)
  const mainRepoTasksPath = status?.git?.mainRepoPath
    ? path.join(status.git.mainRepoPath, '.claude', 'tasks.json')
    : null;

  if (mainRepoTasksPath && fs.existsSync(mainRepoTasksPath)) {
    const registry = JSON.parse(fs.readFileSync(mainRepoTasksPath, 'utf8'));
    const taskIdx = registry.tasks.findIndex(t => t.id === status.task.id);

    if (taskIdx >= 0) {
      registry.tasks[taskIdx].lastActivityAt = new Date().toISOString();
      registry.tasks[taskIdx].currentStep = stepName;
      fs.writeFileSync(mainRepoTasksPath, JSON.stringify(registry, null, 2));
      console.log(`✓ Updated tasks.json registry: ${stepName}`);
    }
  }
}
```

### SubagentStop Hook Enforcement

The `hooks/hooks.json` SubagentStop hook enforces this sequence. When any agent
completes, the hook determines and triggers the next mandatory phase. Agents
MUST NOT invoke subsequent phases themselves - they STOP and let the hook handle it.

## Arguments

Parse from $ARGUMENTS:
- `--status`: Show current workflow state and exit
- `--resume [task/branch/worktree]`: Continue from last checkpoint
- `--abort`: Cancel workflow and cleanup
- `--implement`: Skip to implementation after task selection
- `[filter]`: Task filter (bug, feature, security, test)

### Resume Syntax

```
/next-task --resume                     # Resume active worktree (if only one)
/next-task --resume 123                 # Resume by task ID
/next-task --resume feature/my-task-123 # Resume by branch name
/next-task --resume ../worktrees/my-task-123  # Resume by worktree path
```

### ⚠️ EXISTING SESSION vs STALE SESSION - IMPORTANT

```
╔══════════════════════════════════════════════════════════════════════════╗
║              UNDERSTANDING "EXISTING SESSION" SEMANTICS                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  "Existing session" means AN ACTIVE AGENT IS CURRENTLY RUNNING:          ║
║                                                                          ║
║  ✓ An agent is in the middle of processing                               ║
║  ✓ The workflow was interrupted (context limit, crash, user cancel)      ║
║  ✓ workflow-status.json shows recent lastActivityAt (< 1 hour)           ║
║                                                                          ║
║  This is DIFFERENT from a "stale session":                               ║
║                                                                          ║
║  ✗ Worktree exists but no agent is running                               ║
║  ✗ lastActivityAt is old (> 24 hours)                                    ║
║  ✗ User abandoned the task without cleanup                               ║
║                                                                          ║
║  BEHAVIOR:                                                               ║
║  - Existing session: --resume continues from last checkpoint             ║
║  - Stale session: Ask user - resume or abort/cleanup?                    ║
║  - No session: Start fresh workflow                                      ║
║                                                                          ║
║  CHECK BEFORE STARTING NEW WORKFLOW:                                     ║
║  1. Read .claude/tasks.json in main repo                                 ║
║  2. If tasks exist, check lastActivityAt for each                        ║
║  3. Recent activity (< 1 hour) = active session, DO NOT start new        ║
║  4. Old activity (> 24 hours) = stale, ask user                          ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## ⛔ CRITICAL: NO AUTO-RESUME GATE

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         ⛔ NO AUTO-RESUME ⛔                              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  MANDATORY RULE: DO NOT automatically resume existing tasks/worktrees   ║
║                                                                          ║
║  ✅ CORRECT BEHAVIOR:                                                    ║
║  - No arguments → Go to Phase 1 (Policy Selection)                      ║
║  - Policy selector WILL ask about existing tasks                         ║
║  - User explicitly chooses: resume, start fresh, or view status          ║
║                                                                          ║
║  ❌ INCORRECT BEHAVIOR (NEVER DO THIS):                                 ║
║  - Seeing .claude/tasks.json with existing task → Auto-resume it        ║
║  - Finding a worktree → Auto-resume it                                  ║
║  - Detecting "in_progress" status → Auto-resume it                      ║
║  - Assuming "user wants to continue" → Auto-resume it                   ║
║                                                                          ║
║  THE ONLY VALID WAYS TO RESUME:                                         ║
║  1. User explicitly passes --resume flag                                ║
║  2. Policy selector asks and user chooses "Resume"                      ║
║                                                                          ║
║  EXISTING TASKS ARE USUALLY NOT STALE - THEY MAY BE:                    ║
║  - Running in another terminal/session                                  ║
║  - Running by another agent                                             ║
║  - Paused for user review                                               ║
║  - Waiting for external CI/deployment                                   ║
║                                                                          ║
║  AUTO-RESUMING = CORRUPTING PARALLEL WORKFLOWS                          ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## Pre-flight: Handle Arguments

```javascript
const workflowState = require('${CLAUDE_PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/state/workflow-state.js');
const args = '$ARGUMENTS'.split(' ').filter(Boolean);

// ⛔ CRITICAL CHECK: If no flags provided, DO NOT check for existing tasks here
// That check happens in policy-selector, which will ASK the user
if (args.length === 0 || (!args.includes('--resume') && !args.includes('--status') && !args.includes('--abort'))) {
  console.log("No arguments provided - starting Phase 1 (Policy Selection)");
  console.log("Policy selector will check for existing tasks and ask user what to do.");
  // SKIP to Phase 1 below
}

// Handle --status
if (args.includes('--status')) {
  const summary = workflowState.getWorkflowSummary();
  if (!summary) { console.log("No active workflow."); return; }
  console.log(`## Status: ${summary.status} | Phase: ${summary.currentPhase} | Task: ${summary.task?.title || 'None'}`);
  return;
}

// Handle --abort
if (args.includes('--abort')) {
  workflowState.abortWorkflow('User requested abort');
  console.log("✓ Workflow aborted.");
  return;
}

// Handle --resume
if (args.includes('--resume')) {
  const resumeArg = args[args.indexOf('--resume') + 1];
  const worktree = await findWorktreeToResume(resumeArg);

  if (!worktree) {
    console.log("No worktree found to resume. Specify task ID, branch, or worktree path.");
    return;
  }

  // Read workflow-status.json from the worktree
  const statusPath = path.join(worktree.path, '.claude', 'workflow-status.json');
  if (!fs.existsSync(statusPath)) {
    console.log(`No workflow-status.json found in ${worktree.path}`);
    return;
  }

  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const lastStep = status.steps[status.steps.length - 1];

  console.log(`
## Resuming Workflow

**Task**: #${status.task.id} - ${status.task.title}
**Worktree**: ${worktree.path}
**Branch**: ${status.git.branch}
**Last Step**: ${lastStep.step} (${lastStep.status})
**Last Activity**: ${status.workflow.lastActivityAt}
  `);

  // Change to worktree
  process.chdir(worktree.path);

  // Determine resume phase from last completed step
  const resumePhase = mapStepToPhase(lastStep.step);
  console.log(`Resuming from phase: ${resumePhase}`);

  // Continue workflow from that phase...
}

async function findWorktreeToResume(arg) {
  const registryPath = '.claude/tasks.json';
  if (!fs.existsSync(registryPath)) return null;

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  // No argument - if only one active task, use it
  if (!arg && registry.tasks.length === 1) {
    return { path: registry.tasks[0].worktreePath, task: registry.tasks[0] };
  }

  // Search by task ID
  const byId = registry.tasks.find(t => t.id === arg);
  if (byId) return { path: byId.worktreePath, task: byId };

  // Search by branch name
  const byBranch = registry.tasks.find(t => t.branch === arg || t.branch.endsWith(arg));
  if (byBranch) return { path: byBranch.worktreePath, task: byBranch };

  // Direct path
  if (arg && fs.existsSync(arg)) {
    return { path: arg, task: null };
  }

  return null;
}

function mapStepToPhase(step) {
  const stepToPhase = {
    'worktree-created': 'exploration',
    'exploration-completed': 'planning',
    'plan-approved': 'implementation',
    'implementation-completed': 'pre-review-gates',
    'deslop-work-completed': 'review-loop',
    'review-approved': 'delivery-validation',
    'delivery-validation-passed': 'docs-update',
    'docs-updated': 'ship',
    'ready-to-ship': 'ship'
  };
  return stepToPhase[step] || 'exploration';
}
```

## Phase 1: Policy Selection (Direct Questions)

No agent needed - call `sources.getPolicyQuestions()` and use AskUserQuestion.

```javascript
const { sources } = require('${CLAUDE_PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib');

// Get questions with cache-aware options (cached preference shown first if exists)
const { questions, cachedPreference } = sources.getPolicyQuestions();

// Ask all 3 questions at once
AskUserQuestion({ questions });

// After user responds, check if follow-up needed
if (sources.needsCustomFollowUp(sourceAnswer)) {
  // Custom: ask type (CLI/MCP/Skill/File)
  AskUserQuestion(sources.getCustomTypeQuestions());

  // Then ask for name/path
  const typeInternal = sources.mapTypeSelection(typeAnswer);
  AskUserQuestion(sources.getCustomNameQuestion(typeInternal));
}

if (sources.needsOtherDescription(sourceAnswer)) {
  // Other: user types free description (via "Other" option in AskUserQuestion)
}

// Parse responses and cache preference
const policy = sources.parseAndCachePolicy({
  source: sourceAnswer,
  priority: priorityAnswer,
  stopPoint: stopPointAnswer,
  custom: { type: typeAnswer, name: nameAnswer, description: otherDescription }
});

workflowState.updateFlow({ policy, phase: 'task-discovery', status: 'in_progress' });
```

**What the lib function handles:**
- Reads cache from `.claude/sources/preference.json`
- If cached, shows it as first option with "(last used)" label
- Returns ready-to-use AskUserQuestion structure
- `parseAndCachePolicy()` saves preference for next time

## Phase 2: Task Discovery

→ **Agent**: `next-task:task-discoverer` (sonnet)

The task-discoverer receives the source configuration from policy and handles:
- **github**: Uses `gh issue list`
- **gitlab**: Uses `glab issue list`
- **local**: Reads `tasks.md`, `PLAN.md`, or `TODO.md`
- **custom**: Uses cached tool capabilities (e.g., `tea issues list` for Gitea)
- **other**: Agent interprets user's description and figures out how to list tasks

```javascript
workflowState.startPhase('task-discovery');

// Pass full source config to task-discoverer
const sourceConfig = policy.taskSource;

await Task({
  subagent_type: "next-task:task-discoverer",
  prompt: `Discover tasks from source: ${JSON.stringify(sourceConfig)}. Filter by: ${policy.priorityFilter}. Present top 5 to user for selection.`
});

// Selected task now in state.task
```

## Phase 3: Worktree Setup

→ **Agent**: `next-task:worktree-manager` (haiku)

```javascript
workflowState.startPhase('worktree-setup');

await Task({
  subagent_type: "next-task:worktree-manager",
  prompt: `Create worktree for task #${state.task.id} - ${state.task.title}. Anchor pwd to worktree.`
});

// All subsequent operations happen in worktree
```

## Phase 4: Exploration

→ **Agent**: `next-task:exploration-agent` (opus)

```javascript
workflowState.startPhase('exploration');

await Task({
  subagent_type: "next-task:exploration-agent",
  model: "opus",
  prompt: `Deep codebase analysis for task #${state.task.id}. Find key files, patterns, dependencies.`
});

// Exploration results in state for planning
```

## Phase 5: Planning

→ **Agent**: `next-task:planning-agent` (opus)

```javascript
workflowState.startPhase('planning');

const planOutput = await Task({
  subagent_type: "next-task:planning-agent",
  model: "opus",
  prompt: `Design implementation plan for task #${state.task.id}. Output structured JSON plan between === PLAN_START === and === PLAN_END === markers.`
});

// Parse the plan from agent output
const planMatch = planOutput.match(/=== PLAN_START ===([\s\S]*?)=== PLAN_END ===/);
if (!planMatch) {
  console.error("ERROR: Planning agent did not output structured plan");
  return;
}

const plan = JSON.parse(planMatch[1].trim());
console.log(`✓ Plan received: ${plan.steps.length} steps, ${plan.complexity.overall} complexity`);
```

## Phase 6: User Approval (Plan Mode)

**This is the LAST human interaction point.**

The orchestrator enters plan mode and presents the structured plan:

```javascript
// Convert plan to markdown for presentation
const planMarkdown = `# Implementation Plan: ${plan.task.title}

## Overview
${plan.overview}

## Architecture Decision
${plan.architecture}

${plan.steps.map((step, i) => `
## Step ${i + 1}: ${step.title}

**Goal**: ${step.goal}

**Files to modify**:
${step.files.map(f => `- \`${f.path}\` - ${f.changes}`).join('\n')}

**Implementation**:
${step.details.map(d => `- ${d}`).join('\n')}

${step.risks?.length ? `**Risks**: ${step.risks.join(', ')}` : ''}
`).join('\n')}

## Critical Paths

**High Risk**: ${plan.critical.highRisk.join(', ') || 'None'}
**Needs Review**: ${plan.critical.needsReview.join(', ') || 'None'}
${plan.critical.performance?.length ? `**Performance**: ${plan.critical.performance.join(', ')}` : ''}
${plan.critical.security?.length ? `**Security**: ${plan.critical.security.join(', ')}` : ''}

## Complexity Assessment

**Overall**: ${plan.complexity.overall}
**Confidence**: ${plan.complexity.confidence}
**Reasoning**: ${plan.complexity.reasoning}
`;

console.log("✓ Entering plan mode for user approval...");

// Enter plan mode with the formatted plan
EnterPlanMode();

// When we reach here, user has approved via ExitPlanMode
console.log("✓ Plan approved by user");
console.log("✓ Proceeding to implementation...");

// Save approved plan to state
workflowState.completePhase({
  planApproved: true,
  plan: plan,
  approvedAt: new Date().toISOString()
});
```

**What happens in plan mode**:
1. User sees the formatted plan
2. User reviews and can request changes
3. User approves via ExitPlanMode
4. Control returns here to Phase 7 (Implementation)

## Phase 7: Implementation

→ **Agent**: `next-task:implementation-agent` (opus)

```javascript
workflowState.startPhase('implementation');

await Task({
  subagent_type: "next-task:implementation-agent",
  model: "opus",
  prompt: `Execute approved plan for task #${state.task.id}. Commit changes incrementally.`
});

// → SubagentStop hook triggers pre-review gates
```

## Phase 8: Pre-Review Gates

→ **Agents** (parallel): `next-task:deslop-work` (sonnet) + `next-task:test-coverage-checker` (sonnet)

Triggered automatically by SubagentStop hook after implementation.

```javascript
workflowState.startPhase('pre-review-gates');

await Promise.all([
  Task({ subagent_type: "next-task:deslop-work", prompt: `Clean AI slop from new work.` }),
  Task({ subagent_type: "next-task:test-coverage-checker", prompt: `Validate test coverage (advisory).` })
]);

// → Proceeds to review loop
```

## Phase 9: Review Loop

MANDATORY: Follow the orchestrate-review skill exactly. DO NOT skip. DO NOT improvise.

The skill contains all implementation details:
- Review pass definitions
- Signal detection patterns
- Task spawning logic
- Finding aggregation
- Iteration loop algorithm
- Stall detection

```javascript
workflowState.startPhase('review-loop');

// FOLLOW THE ORCHESTRATE-REVIEW SKILL EXACTLY
// All implementation details are in: plugins/next-task/skills/orchestrate-review/SKILL.md

// SubagentStop hook triggers delivery validation when approved (or returns control if blocked)
```

## Phase 10: Delivery Validation

→ **Agent**: `next-task:delivery-validator` (sonnet)

Triggered automatically by SubagentStop hook after review approval.

```javascript
workflowState.startPhase('delivery-validation');

const result = await Task({
  subagent_type: "next-task:delivery-validator",
  prompt: `Validate task completion. Check: tests pass, build passes, requirements met, no regressions.`
});

if (!result.approved) {
  // Return to implementation with fix instructions - automatic retry
  workflowState.failPhase(result.reason, { fixInstructions: result.fixInstructions });
  return; // Workflow retries from implementation
}

workflowState.completePhase({ deliveryApproved: true });
```

## Phase 11: Docs Update

→ **Agent**: `next-task:docs-updater` (sonnet)

Triggered automatically by SubagentStop hook after delivery validation.

```javascript
workflowState.startPhase('docs-update');

await Task({
  subagent_type: "next-task:docs-updater",
  prompt: `Update docs for changed files. CHANGELOG, API docs, code examples.`
});

workflowState.completePhase({ docsUpdated: true });
```

## ⚠️ EXPLICIT HANDOFF TO /ship - CRITICAL

After docs-updater completes, you MUST EXPLICITLY invoke /ship.
**DO NOT rely on SubagentStop hooks alone** - explicitly call the ship skill.

```
╔══════════════════════════════════════════════════════════════════════════╗
║                      /ship RESPONSIBILITIES                               ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  /ship handles ALL of the following (agents must NOT do these):          ║
║                                                                          ║
║  1. CREATE PR - Push branch, create pull request                         ║
║  2. MONITOR CI - Wait for checks to pass                                 ║
║  3. MONITOR COMMENTS - Wait for reviews, address all comments            ║
║  4. MERGE PR - Squash/merge based on policy                              ║
║  5. CLEANUP WORKTREE - Remove worktree after merge                       ║
║  6. UPDATE tasks.json - Remove task from registry after completion       ║
║                                                                          ║
║  AGENTS MUST NOT:                                                        ║
║  - Create PRs                                                            ║
║  - Push to remote                                                        ║
║  - Clean up worktrees                                                    ║
║  - Remove tasks from registry                                            ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Required Handoff Code

```javascript
// AFTER docs-updater completes, EXPLICITLY invoke /ship
console.log(`
## ✓ Implementation Complete - Ready to Ship

Task #${state.task.id} passed all validation checks.
- ✓ Review approved (no open issues or override)
- ✓ Delivery validated (tests pass, build passes)
- ✓ Documentation updated

→ EXPLICITLY invoking /ship for PR creation and merge workflow.
`);

// Update state BEFORE invoking ship
recordStepCompletion('ready-to-ship', {
  readyAt: new Date().toISOString(),
  taskId: state.task.id
});

// EXPLICIT invocation - DO NOT skip this
await Skill({ skill: "ship:ship", args: "--state-file .claude/workflow-status.json" });
```

### /ship Cleanup Responsibilities

When /ship completes successfully, it MUST:

```javascript
// /ship cleanup (happens inside ship command)
function cleanupAfterShip(state) {
  const fs = require('fs');
  const path = require('path');

  // 1. Remove task from main repo's tasks.json
  const mainRepoTasksPath = path.join(state.git.mainRepoPath, '.claude', 'tasks.json');
  if (fs.existsSync(mainRepoTasksPath)) {
    const registry = JSON.parse(fs.readFileSync(mainRepoTasksPath, 'utf8'));
    registry.tasks = registry.tasks.filter(t => t.id !== state.task.id);
    fs.writeFileSync(mainRepoTasksPath, JSON.stringify(registry, null, 2));
    console.log(`✓ Removed task #${state.task.id} from tasks.json registry`);
  }

  // 2. Return to main repo directory
  process.chdir(state.git.mainRepoPath);

  // 3. Remove worktree
  exec(`git worktree remove "${state.git.worktreePath}" --force`);
  console.log(`✓ Removed worktree at ${state.git.worktreePath}`);

  // 4. Prune worktree references
  exec('git worktree prune');
}
```

## Error Handling

```javascript
try {
  // ... workflow phases ...
} catch (error) {
  workflowState.failPhase(error.message, { phase: currentPhase });
  console.log(`
## Workflow Failed at ${currentPhase}

Use \`/next-task --resume\` to retry from checkpoint.
Use \`/next-task --abort\` to cancel.
  `);
}
```

## State Management Architecture

Two-file state management to prevent collisions across parallel workflows:

### Main Repo: `.claude/tasks.json`
```
- Shared registry of claimed tasks
- task-discoverer reads to exclude claimed tasks
- worktree-manager adds entry when creating worktree
- ship removes entry on cleanup
```

### Worktree: `.claude/workflow-status.json`
```
- Local to each worktree
- Tracks all steps with timestamps
- Used for --resume to find last step
- Isolated from other workflows
```

### Step Recording

Each agent MUST record its step in the worktree's workflow-status.json:

```javascript
function recordStep(stepName, status, result = null) {
  const statusPath = '.claude/workflow-status.json';
  const state = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

  state.steps.push({
    step: stepName,
    status: status,
    startedAt: new Date().toISOString(),
    completedAt: status === 'completed' ? new Date().toISOString() : null,
    result: result
  });

  state.workflow.lastActivityAt = new Date().toISOString();
  state.workflow.currentPhase = stepName;
  state.resume.resumeFromStep = stepName;

  fs.writeFileSync(statusPath, JSON.stringify(state, null, 2));
}
```

## Success Criteria

- Policy selection via checkboxes
- **Two-file state management** (main repo registry + worktree status)
- **Resume by task ID, branch, or worktree path**
- Worktree isolation
- Opus for complex tasks (explore, plan, implement, review)
- Sonnet for validation tasks (quality gates, delivery)
- Haiku for simple tasks (policy, worktree)
- Fully autonomous after plan approval
- SubagentStop hooks for phase transitions
- Handoff to /ship for PR workflow

Begin workflow now.
