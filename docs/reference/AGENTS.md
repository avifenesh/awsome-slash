# Agent Reference

Complete reference for all agents in awesome-slash.

**TL;DR:** 29 agents across 4 plugins, plus 3 external agents from pr-review-toolkit. opus for reasoning, sonnet for patterns, haiku for execution. Each agent does one thing well. <!-- AGENT_COUNT_TOTAL: 29 -->

---

## Quick Navigation

| Plugin | Agents | Jump to |
|--------|--------|---------|
| next-task | 13 | [task-discoverer](#task-discoverer), [worktree-manager](#worktree-manager), [exploration-agent](#exploration-agent), [planning-agent](#planning-agent), [implementation-agent](#implementation-agent), [deslop-work](#deslop-work), [test-coverage-checker](#test-coverage-checker), [review-orchestrator](#review-orchestrator), [delivery-validator](#delivery-validator), [docs-updater](#docs-updater), [simple-fixer](#simple-fixer), [ci-monitor](#ci-monitor), [ci-fixer](#ci-fixer) |
| audit-project | 8 | [security-expert](#security-expert), [performance-engineer](#performance-engineer), [test-quality-guardian](#test-quality-guardian), [architecture-reviewer](#architecture-reviewer), [database-specialist](#database-specialist), [api-designer](#api-designer), [frontend-specialist](#frontend-specialist), [devops-reviewer](#devops-reviewer) |
| enhance | 7 | [enhancement-orchestrator](#enhancement-orchestrator), [plugin-enhancer](#plugin-enhancer), [agent-enhancer](#agent-enhancer), [claudemd-enhancer](#claudemd-enhancer), [docs-enhancer](#docs-enhancer), [prompt-enhancer](#prompt-enhancer), [enhancement-reporter](#enhancement-reporter) |
| drift-detect | 1 | [plan-synthesizer](#plan-synthesizer) |
| External (pr-review-toolkit) | 3 | [code-reviewer](#external-agents), [silent-failure-hunter](#external-agents), [pr-test-analyzer](#external-agents) |

**Design principle:** Each agent has a single responsibility. Complex work is decomposed into specialized agents that do one thing extremely well, then orchestrated together.

**Related docs:**
- [/next-task Workflow](../workflows/NEXT-TASK.md) - How agents work together
- [MCP Tools](./MCP-TOOLS.md) - Tools agents use

---

## Overview

awesome-slash uses 29 specialized agents across 4 plugins, plus 3 external agents from pr-review-toolkit. Each agent is optimized for a specific task and assigned a model based on complexity:

| Model | Use Case | Cost |
|-------|----------|------|
| opus | Complex reasoning, quality-critical work | High |
| sonnet | Moderate reasoning, pattern matching | Medium |
| haiku | Mechanical execution, no judgment | Low |

**Agent types:**
- **File-based agents** (21) - Defined in `plugins/*/agents/*.md` with frontmatter <!-- AGENT_COUNT_FILE_BASED: 21 -->
- **Role-based agents** (8) - Defined inline via Task tool with specialized prompts <!-- AGENT_COUNT_ROLE_BASED: 8 -->
- **External agents** (3) - From pr-review-toolkit, invoked by review-orchestrator

---

## next-task Plugin Agents

### task-discoverer

**Model:** sonnet
**Purpose:** Find and prioritize tasks from configured sources.

**What it does:**
1. Loads claimed tasks from `tasks.json` (excludes them)
2. Fetches from GitHub/GitLab/local files/custom CLI
3. Applies priority scoring (labels, blockers, age, reactions)
4. Validates tasks against codebase
5. Presents top 5 via AskUserQuestion checkboxes
6. Posts "Workflow Started" comment to GitHub issue

**Tools available:**
- Bash (gh, glab, git)
- Grep, Read
- AskUserQuestion

---

### worktree-manager

**Model:** haiku
**Purpose:** Create git worktrees for isolated development.

**What it does:**
1. Creates `../worktrees/{task-slug}/` directory
2. Creates `feature/{task-slug}` branch
3. Claims task in `tasks.json`
4. Creates `flow.json` in worktree

**Tools available:**
- Bash (git only)
- Read, Write

---

### exploration-agent

**Model:** opus
**Purpose:** Deep codebase analysis before planning.

**What it does:**
1. Extracts keywords from task description
2. Searches for related files
3. Traces dependency graphs
4. Analyzes existing patterns
5. Outputs exploration report

**Tools available:**
- Read, Glob, Grep
- Bash (git only)
- LSP
- Task (for sub-exploration)

**Why opus:** Exploration quality directly impacts planning quality. Poor exploration = poor plan = poor implementation. The compound effect justifies the cost.

---

### planning-agent

**Model:** opus
**Purpose:** Design step-by-step implementation plans.

**What it does:**
1. Synthesizes exploration findings
2. Creates implementation steps
3. Identifies risks and critical paths
4. Outputs structured JSON
5. Posts summary to GitHub issue

**Tools available:**
- Read, Glob, Grep
- Bash (git only)
- Task (for research)

**Output format:**

```json
{
  "steps": [
    { "action": "modify", "file": "src/auth.ts", "description": "..." }
  ],
  "risks": ["..."],
  "complexity": "medium"
}
```

**Why opus:** Planning is the leverage point. A good plan makes implementation straightforward. A bad plan causes rework cycles.

---

### implementation-agent

**Model:** opus
**Purpose:** Execute approved plans with production-quality code.

**What it does:**
1. Executes plan step-by-step
2. Creates atomic commits per step
3. Runs type checks, linting, tests after each step
4. Updates `flow.json` for resume capability

**Tools available:**
- Read, Write, Edit
- Glob, Grep
- Bash (git, npm, node)
- Task (for sub-tasks)
- LSP

**Restrictions:**
- MUST NOT create PR
- MUST NOT push to remote
- MUST NOT invoke review agents

**Why opus:** Implementation quality matters. Bad code gets caught in review but wastes cycles. Good code flows through.

---

### deslop-work

**Model:** sonnet
**Purpose:** Clean AI artifacts from new code before review.

**What it does:**
1. Analyzes git diff (only new changes)
2. Invokes `/deslop` pipeline
3. Applies HIGH certainty fixes
4. Flags LOW certainty for review

**Tools available:**
- Bash (git only)
- Skill (for /deslop)
- Read, Edit

**Why sonnet:** Slop detection is pattern-based. Sonnet handles patterns well and is faster/cheaper than opus.

---

### test-coverage-checker

**Model:** sonnet
**Purpose:** Validate test quality for new code.

**What it does:**
1. Identifies new/modified functions
2. Checks if tests exist
3. Checks if tests are meaningful (not just path matching)
4. Reports coverage status

**Tools available:**
- Bash (git, npm)
- Read, Grep, Glob

**Advisory only:** Does not block workflow. Reports findings but continues.

---

### review-orchestrator

**Model:** opus
**Purpose:** Coordinate multi-agent review until clean.

**What it does:**
1. Launches review agents in parallel:
   - code-reviewer
   - silent-failure-hunter
   - pr-test-analyzer
2. Aggregates findings by severity
3. Auto-fixes critical/high issues
4. Runs deslop-work after each iteration
5. Loops until no critical/high issues

**Tools available:**
- Task (for sub-agents)
- Bash (git)
- Read, Edit

**Restrictions:**
- MUST NOT create PR
- MUST NOT push
- MUST NOT invoke delivery-validator

**Why opus:** Review coordination requires judgment. Which findings are real? Which can be auto-fixed? How to prioritize? Opus handles this well.

---

### delivery-validator

**Model:** sonnet
**Purpose:** Final validation before shipping.

**Checks:**
1. Review status - all critical/high resolved
2. Tests pass
3. Build passes
4. Task requirements met (extracts from task, maps to changes)
5. No regressions

**Tools available:**
- Bash (git, npm)
- Read, Grep, Glob

**On failure:** Returns to implementation with fix instructions.

**Restrictions:**
- MUST NOT create PR
- MUST NOT push
- MUST NOT skip docs-updater

---

### docs-updater

**Model:** sonnet
**Purpose:** Update documentation for recent changes.

**What it does:**
1. Finds docs referencing changed files
2. Updates CHANGELOG entry
3. Fixes outdated imports/versions
4. Delegates simple edits to simple-fixer
5. Invokes `/ship` when complete

**Tools available:**
- Bash (git)
- Read, Grep, Glob
- Task (for simple-fixer)

---

### simple-fixer

**Model:** haiku
**Purpose:** Execute mechanical edits without judgment.

**What it does:**
- Receives structured fix list from parent
- Executes each fix: remove-line, replace, insert
- No decision-making, just execution

**Tools available:**
- Read, Edit
- Bash (git)

**Why haiku:** Pure execution. No reasoning needed. Haiku is fast and cheap.

---

### ci-monitor

**Model:** haiku
**Purpose:** Poll CI status with sleep/check loops.

**What it does:**
1. Polls `gh pr checks` every 15 seconds
2. Reports status changes
3. On failure: delegates to ci-fixer
4. On success: continues workflow

**Tools available:**
- Bash (gh, git)
- Read
- Task (for ci-fixer)

**Why haiku:** Polling is mechanical. No judgment needed.

---

### ci-fixer

**Model:** sonnet
**Purpose:** Fix CI failures and review comments.

**What it does:**
1. Analyzes CI logs to diagnose failure
2. Applies fixes:
   - Lint auto-fix
   - Type error resolution
   - Test failure fixes
3. Addresses PR review comments
4. Commits and pushes fixes

**Tools available:**
- Bash (git, npm)
- Read, Edit
- Grep, Glob

---

## enhance Plugin Agents

### enhancement-orchestrator

**Model:** opus
**Purpose:** Coordinate all enhancement analyzers.

**What it does:**
1. Parses arguments (focus, apply mode)
2. Discovers content to analyze
3. Launches enhancers in parallel
4. Aggregates results
5. Coordinates auto-fixes

**Tools available:**
- Task (for sub-agents)
- Read, Glob, Grep

---

### plugin-enhancer

**Model:** sonnet
**Purpose:** Analyze plugin structures.

**Checks:**
- plugin.json manifest validity
- MCP tool definitions (additionalProperties, required array)
- Security patterns (unrestricted Bash, command injection)
- Component organization

**Tools available:**
- Read, Glob, Grep
- Bash (git)

---

### agent-enhancer

**Model:** opus
**Purpose:** Analyze agent prompts.

**Checks (14 patterns):**
- Frontmatter validity
- Tool restrictions
- XML structure
- Chain-of-thought appropriateness
- Example quality
- Anti-patterns (vague language, prompt bloat)

**Tools available:**
- Read, Glob, Grep
- Bash (git)

**Why opus:** Agent quality compounds. Bad agent prompts = bad agent outputs across all uses.

---

### claudemd-enhancer

**Model:** opus
**Purpose:** Analyze CLAUDE.md/AGENTS.md files.

**Checks:**
- Structure (critical rules, architecture, commands)
- References to actual files
- Token efficiency
- README duplication
- Cross-platform compatibility

**Tools available:**
- Read, Glob, Grep
- Bash (git)

---

### docs-enhancer

**Model:** opus
**Purpose:** Analyze documentation quality.

**Modes:**
- AI-only: Aggressive token reduction
- Both: Balance readability with AI-friendliness

**Checks:**
- Link validity
- Structure and chunking
- Semantic boundaries
- Heading hierarchy

**Tools available:**
- Read, Glob, Grep
- Bash (git)

---

### prompt-enhancer

**Model:** opus
**Purpose:** Analyze prompt engineering patterns.

**Checks (16 patterns):**
- Clarity (vague instructions)
- Structure (XML, headings)
- Examples (few-shot patterns)
- Context/WHY presence
- Output format specification
- Anti-patterns (redundant CoT)

**Tools available:**
- Read, Glob, Grep
- Bash (git)

---

### enhancement-reporter

**Model:** sonnet
**Purpose:** Format unified enhancement reports.

**What it does:**
1. Deduplicates findings
2. Sorts by certainty
3. Groups by category
4. Generates actionable markdown
5. Creates executive summary table

**Tools available:**
- Read

---

## drift-detect Plugin Agent

### plan-synthesizer

**Model:** opus
**Purpose:** Deep semantic analysis for drift detection.

**What it does:**
1. Receives data from JavaScript collectors
2. Performs semantic matching (not string matching)
3. Identifies:
   - Issues that should be closed (already done)
   - "Done" phases that aren't done
   - Release blockers
4. Outputs prioritized reconstruction plan

**Tools available:**
- Read, Write

**Why opus:** Semantic matching requires deep understanding. "user authentication" must match `auth/`, `login.js`, `session.ts`. Opus handles this.

---

## audit-project Plugin Agents

These are role-based agents invoked via Task tool with specialized prompts. They use the built-in Explore subagent type with domain-specific instructions.

### security-expert

**Activation:** Always active
**Purpose:** Find security vulnerabilities.

**Focuses on:**
- SQL injection, XSS, CSRF vulnerabilities
- Authentication and authorization flaws
- Secrets exposure, insecure configurations
- Input validation, output encoding

---

### performance-engineer

**Activation:** Always active
**Purpose:** Find performance bottlenecks.

**Focuses on:**
- N+1 queries, inefficient algorithms
- Memory leaks, unnecessary allocations
- Blocking operations, missing async
- Bundle size, lazy loading

---

### test-quality-guardian

**Activation:** Conditional (if tests exist)
**Purpose:** Validate test quality.

**Focuses on:**
- Test coverage for new code
- Edge case coverage
- Test design and maintainability
- Mocking appropriateness

---

### architecture-reviewer

**Activation:** Conditional (if FILE_COUNT > 50)
**Purpose:** Review code organization.

**Focuses on:**
- Code organization and modularity
- Design pattern violations
- Dependency management
- SOLID principles

---

### database-specialist

**Activation:** Conditional (if database detected)
**Purpose:** Review database operations.

**Focuses on:**
- Query optimization, N+1 queries
- Missing indexes
- Transaction handling
- Connection pooling

---

### api-designer

**Activation:** Conditional (if API detected)
**Purpose:** Review API design.

**Focuses on:**
- REST best practices
- Error handling and status codes
- Rate limiting, pagination
- API versioning

---

### frontend-specialist

**Activation:** Conditional (if React/Vue/Angular)
**Purpose:** Review frontend code.

**Focuses on:**
- Component design and composition
- State management patterns
- Performance (memoization, virtualization)
- Accessibility

---

### devops-reviewer

**Activation:** Conditional (if CI/CD detected)
**Purpose:** Review infrastructure and CI/CD.

**Focuses on:**
- Pipeline configuration
- Secret management
- Docker best practices
- Deployment strategies

---

## External Agents

These agents are from **pr-review-toolkit**, a separate plugin. They're invoked by review-orchestrator during the review loop.

### code-reviewer

**Source:** pr-review-toolkit
**Purpose:** General code quality review.

Reviews code for adherence to project guidelines, style guides, and best practices. Checks for style violations, potential issues, and ensures code follows established patterns.

---

### silent-failure-hunter

**Source:** pr-review-toolkit
**Purpose:** Find hidden error handling issues.

Identifies silent failures, inadequate error handling, and inappropriate fallback behavior. Catches empty catch blocks, swallowed promises, and error suppression patterns.

---

### pr-test-analyzer

**Source:** pr-review-toolkit
**Purpose:** Analyze test coverage quality.

Reviews pull requests for test coverage quality and completeness. Ensures tests adequately cover new functionality and edge cases.

**Why external:** These are specialized review agents maintained separately. Using them avoids duplicating well-tested review logic.

---

## Model Selection Rationale

| Agent Type | Model | Reasoning |
|------------|-------|-----------|
| Analysis/reasoning | opus | Quality compounds - errors propagate |
| Pattern matching | sonnet | Good at structured tasks, fast |
| Mechanical execution | haiku | No judgment needed, cheapest |

**Key insight:** For enhancers and analyzers, quality loss is exponential. Each imperfection in analysis creates downstream problems.

---

## Tool Restrictions

Agents have restricted tool access for safety:

| Agent | Restricted From | Why |
|-------|-----------------|-----|
| implementation-agent | PR creation, git push | Workflow enforces order |
| review-orchestrator | PR creation, git push | Must complete review first |
| delivery-validator | PR creation, git push | Must pass validation first |
| worktree-manager | Most tools | Only needs git |
| simple-fixer | Most tools | Only needs edit |

---

## Navigation

[← Back to Documentation Index](../README.md) | [Main README](../../README.md)

**Related:**
- [/next-task Workflow](../workflows/NEXT-TASK.md) - How agents orchestrate together
- [/ship Workflow](../workflows/SHIP.md) - Shipping agents in action
- [MCP Tools](./MCP-TOOLS.md) - Tools available to agents
