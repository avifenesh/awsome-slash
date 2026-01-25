# awesome-slash

[![npm version](https://img.shields.io/npm/v/awesome-slash.svg)](https://www.npmjs.com/package/awesome-slash)
[![CI](https://github.com/avifenesh/awesome-slash/actions/workflows/ci.yml/badge.svg)](https://github.com/avifenesh/awesome-slash/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI models can write code. That's not the hard part anymore. The hard part is everything else—picking what to work on, managing branches, reviewing output, cleaning up artifacts, handling CI, addressing comments, deploying. **awesome-slash automates the entire workflow**, not just the coding.

**Works with:** Claude Code | OpenCode | Codex CLI

---

## Quick Navigation

| Section | What's there |
|---------|--------------|
| [Commands](#commands) | All 7 commands with jump links |
| [What This Does](#what-this-project-does) | The problem and how this solves it |
| [What's Different](#what-makes-this-different) | Why this isn't just another AI tool |
| [Design Philosophy](#design-philosophy) | The thinking behind the architecture |
| [Command Details](#command-details) | Deep dive into each command |
| [Installation](#installation) | Get started in 2 commands |
| [Documentation](#documentation) | Links to detailed docs |

---

## Commands

| Command | What it does | Details |
|---------|--------------|---------|
| [`/next-task`](#next-task) | Picks a task, implements it, reviews it, ships it | [→](#next-task) |
| [`/ship`](#ship) | Creates PR, monitors CI, addresses reviews, merges | [→](#ship) |
| [`/deslop`](#deslop) | Finds and removes debug code, TODOs, AI artifacts | [→](#deslop) |
| [`/audit-project`](#audit-project) | Multi-agent code review until issues resolved | [→](#audit-project) |
| [`/drift-detect`](#drift-detect) | Compares your docs to actual code state | [→](#drift-detect) |
| [`/enhance`](#enhance) | Analyzes prompts, plugins, docs for improvements | [→](#enhance) |
| [`/sync-docs`](#sync-docs) | Syncs documentation with code changes | [→](#sync-docs) |

---

## What This Project Does

You have AI coding assistants. They can write code. But the full workflow—picking what to work on, setting up branches, implementing, reviewing, fixing issues, creating PRs, monitoring CI, addressing reviewer comments, merging—still requires you to babysit every step.

**awesome-slash automates the entire workflow.** Not just code generation, but the complete process from "I have 50 issues" to "PR merged and deployed."

### The Core Idea

Most AI tools generate code and stop. You still have to:
- Decide what to work on
- Create branches
- Run the implementation
- Review the output
- Clean up AI artifacts
- Create PRs
- Wait for CI
- Address review comments
- Merge and deploy

This plugin handles all of that. You approve a plan, then it runs autonomously until there's a merged PR (or until something genuinely needs your input).

---

## What Makes This Different

### 1. Certainty-Based Detection

Every finding is tagged with a certainty level:
- **HIGH** - Definitely a problem. Safe to auto-fix.
- **MEDIUM** - Probably a problem. Needs context.
- **LOW** - Might be a problem. Needs human judgment.

This means you can run `/deslop apply` and trust that it won't break things.

### 2. Review Loops Without Limits

The review-orchestrator agent runs core review passes (code quality, security, performance, test coverage) plus conditional specialists until there are no open issues. Then it runs deslop-work on its own fixes to catch any AI artifacts it introduced.

### 3. Workflow Enforcement

A SubagentStop hook prevents agents from skipping phases. You can't push to remote before `/ship` is invoked. You can't skip the review loop. The workflow literally enforces the quality gates.

### 4. Resume From Any Point

State is tracked in two files:
- `tasks.json` - Which task you're working on (in your main repo)
- `flow.json` - Which phase you're in (in your worktree)

If your session dies, `/next-task --resume` picks up exactly where you left off.

### 5. Token Efficiency

- Compact output modes reduce tokens by 60-70%
- `/drift-detect` uses JavaScript collectors + a single LLM call (77% reduction vs multi-agent approaches)
- Pre-indexed pattern maps give O(1) lookups instead of scanning

### 6. Cross-Platform

Same workflows work on Claude Code, OpenCode, and Codex CLI. State directories adapt automatically (`.claude/`, `.opencode/`, `.codex/`).

---

## Design Philosophy

<details>
<summary><strong>Why build this? What's the thinking?</strong> (click to expand)</summary>

### The Actual Problem

Frontier models write good code. That's solved. What's not solved:

- **Context management** - Models forget what they're doing mid-session
- **Compaction amnesia** - Long sessions get summarized, losing critical state
- **Task drift** - Without structure, agents wander from the actual goal
- **Skipped steps** - Agents skip reviews, tests, or cleanup when not enforced
- **Token waste** - Using LLM calls for work that static analysis can do faster
- **Babysitting** - Manually orchestrating each phase of development
- **Repetitive requests** - Asking for the same workflow every single session

### How This Addresses It

**1. One agent, one job, done extremely well**

Same principle as good code: single responsibility. The exploration-agent explores. The implementation-agent implements. The review-orchestrator coordinates reviews. No agent tries to do everything. 29 specialized agents, each with narrow scope and clear success criteria.

**2. Pipeline with gates, not a monolith**

Same principle as DevOps. Each step must pass before the next begins. Can't push before review. Can't merge before CI passes. Hooks enforce this—agents literally cannot skip phases.

**3. Tools do tool work, agents do agent work**

If static analysis, regex, or a shell command can do it, don't ask an LLM. Pattern detection uses pre-indexed regex. File discovery uses glob. Platform detection uses file existence checks. The LLM only handles what requires judgment. Finding console.log statements? Code does it better and faster.

**4. Agents don't need to know how tools work**

The slop detector returns findings with certainty levels. The agent doesn't need to understand the three-phase pipeline, the regex patterns, or the analyzer heuristics. Good tool design means the consumer doesn't need implementation details.

**5. Build tools where tools don't exist**

Many tasks lack existing tools. JavaScript collectors for drift-detect. Multi-pass analyzers for slop detection. The result: agents receive structured data, not raw problems to figure out.

**6. Research-backed prompt engineering**

Documented techniques that measurably improve results:
- **Progressive disclosure** - Agents see only what's needed for the current step
- **Structured output** - JSON between delimiters, XML tags for sections
- **Explicit constraints** - What agents MUST NOT do matters as much as what they do
- **Few-shot examples** - Where patterns aren't obvious
- **Tool calling over generation** - Let the model use tools rather than generate tool-like output

**7. Validate plan and results, not every step**

Approve the plan. See the results. The middle is automated. One plan approval unlocks autonomous execution through implementation, review, cleanup, and shipping.

**8. Right model for the task**

opus for everything wastes money. haiku for everything produces poor results. Match model capability to task complexity:
- **opus** - Exploration, planning, implementation, review orchestration
- **sonnet** - Pattern matching, validation, discovery
- **haiku** - Git operations, file moves, CI polling

Quality compounds. Poor exploration → poor plan → poor implementation → review cycles. Early phases deserve the best model.

**9. Persistent state survives sessions**

Two JSON files track everything: what task, what phase. Sessions can die and resume. Multiple sessions run in parallel on different tasks using separate worktrees. State files prevent collisions.

**10. Delegate everything automatable**

Agents don't just write code. They:
- Clean their own output (deslop-work)
- Update documentation (docs-updater)
- Fix CI failures (ci-fixer)
- Respond to review comments
- Check for plan drift (drift-detect)
- Analyze their own prompts (/enhance)

If it can be specified, it can be delegated.

**11. Orchestrator stays high-level**

The main workflow orchestrator doesn't read files, search code, or write implementations. It launches specialized agents and receives their outputs. Keeps the orchestrator's context window available for coordination rather than filled with file contents.

**12. Leverage existing platforms**

Claude Code, OpenCode, and Codex CLI have excellent built-in tooling. Read, Write, Edit, Glob, Grep, Bash, Task. The platforms handle file operations, terminal access, sub-agent coordination. This project adds workflow logic on top.

**13. Composable, not monolithic**

Every command works standalone. `/deslop` cleans code without needing `/next-task`. `/ship` merges PRs without needing the full workflow. Pieces compose together, but each piece is useful on its own.

### What This Gets You

- **Run multiple sessions** - Different tasks in different worktrees, no interference
- **Fast iteration** - Approve plan, check results, repeat
- **Stay in the interesting parts** - Policy decisions, architecture choices, edge cases
- **Minimal review burden** - Most issues caught and fixed before you see the output
- **No repetitive requests** - The workflow you want, without asking each time
- **Scale horizontally** - More sessions, more tasks, same oversight level

### The Bet

With proper workflow structure, context management, and quality gates, AI agents can handle the complete development cycle autonomously—from task selection through merged PR. The limiting factor isn't model capability. It's orchestration.

</details>

---

## Command Details

### /next-task

**Purpose:** Complete task-to-production automation.

**What happens when you run it:**

1. **Policy Selection** - You choose task source (GitHub issues, GitLab, local file), priority filter, and stopping point
2. **Task Discovery** - Shows top 5 prioritized tasks, you pick one
3. **Worktree Setup** - Creates isolated branch and working directory
4. **Exploration** - Analyzes codebase to understand context
5. **Planning** - Designs implementation approach
6. **User Approval** - You review and approve the plan (last human interaction)
7. **Implementation** - Executes the plan
8. **Pre-Review** - Runs deslop-work and test-coverage-checker
9. **Review Loop** - Multi-agent review iterates until clean
10. **Delivery Validation** - Verifies tests pass, build passes, requirements met
11. **Docs Update** - Updates CHANGELOG and related documentation
12. **Ship** - Creates PR, monitors CI, addresses comments, merges

**Agents involved:**

| Agent | Model | Role |
|-------|-------|------|
| task-discoverer | sonnet | Finds and ranks tasks from your source |
| worktree-manager | haiku | Creates git worktrees and branches |
| exploration-agent | opus | Deep codebase analysis before planning |
| planning-agent | opus | Designs step-by-step implementation plan |
| implementation-agent | opus | Writes the actual code |
| deslop-work | sonnet | Removes AI artifacts before review |
| test-coverage-checker | sonnet | Validates tests exist and are meaningful |
| review-orchestrator | opus | Coordinates parallel review agents |
| delivery-validator | sonnet | Final checks before shipping |
| docs-updater | sonnet | Updates documentation |
| ci-monitor | haiku | Watches CI status |
| ci-fixer | sonnet | Fixes CI failures and review comments |
| simple-fixer | haiku | Executes mechanical edits |

**Usage:**

```bash
/next-task              # Start new workflow
/next-task --resume     # Resume interrupted workflow
/next-task --status     # Check current state
/next-task --abort      # Cancel and cleanup
```

[Full workflow documentation →](./docs/workflows/NEXT-TASK.md)

---

### /ship

**Purpose:** Takes your current branch from "ready to commit" to "merged PR."

**What happens when you run it:**

1. **Pre-flight** - Detects CI platform, deployment platform, branch strategy
2. **Commit** - Stages and commits with generated message (if uncommitted changes)
3. **Push & PR** - Pushes branch, creates pull request
4. **CI Monitor** - Waits for CI, retries on transient failures
5. **Review Wait** - Waits 3 minutes for auto-reviewers (Copilot, Claude, Gemini, Codex)
6. **Address Comments** - Handles every comment from every reviewer
7. **Merge** - Merges when all comments resolved and CI passes
8. **Deploy** - Deploys and validates (if multi-branch workflow)
9. **Cleanup** - Removes worktree, closes issue, deletes branch

**Platform Detection:**

| Type | Detected |
|------|----------|
| CI | GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis |
| Deploy | Railway, Vercel, Netlify, Fly.io, Render |
| Project | Node.js, Python, Rust, Go, Java |

**Review Comment Handling:**

Every comment gets addressed. No exceptions. The workflow categorizes comments and handles each:
- Code fixes get implemented
- Style suggestions get applied
- Questions get answered
- False positives get explained

If something can't be fixed, the workflow replies explaining why and resolves the thread.

**Usage:**

```bash
/ship                       # Full workflow
/ship --dry-run             # Preview without executing
/ship --strategy rebase     # Use rebase instead of squash
```

[Full workflow documentation →](./docs/workflows/SHIP.md)

---

### /deslop

**Purpose:** Finds AI slop—debug statements, placeholder text, verbose comments, TODOs—and removes it.

**How detection works:**

Three phases run in sequence:

1. **Phase 1: Regex Patterns** (HIGH certainty)
   - `console.log`, `print()`, `dbg!()`, `println!()`
   - `// TODO`, `// FIXME`, `// HACK`
   - Empty catch blocks, disabled linters
   - Hardcoded secrets (API keys, tokens)

2. **Phase 2: Multi-Pass Analyzers** (MEDIUM certainty)
   - Doc-to-code ratio (excessive comments)
   - Verbosity ratio (AI preambles)
   - Over-engineering patterns
   - Buzzword inflation
   - Dead code detection
   - Stub functions

3. **Phase 3: CLI Tools** (LOW certainty, optional)
   - jscpd, madge, escomplex (JS/TS)
   - pylint, radon (Python)
   - golangci-lint (Go)
   - clippy (Rust)

**Languages supported:** JavaScript/TypeScript, Python, Rust, Go, Java

**Usage:**

```bash
/deslop              # Report only (safe)
/deslop apply        # Fix HIGH certainty issues
/deslop apply src/ 10  # Fix 10 issues in src/
```

**Thoroughness levels:**

- `quick` - Phase 1 only
- `normal` - Phase 1 + Phase 2 (default)
- `deep` - All phases if tools available

[Pattern reference →](./docs/reference/SLOP-PATTERNS.md)

---

### /audit-project

**Purpose:** Multi-agent code review that iterates until issues are resolved.

**What happens when you run it:**

Up to 10 specialized role-based agents run based on your project: <!-- AGENT_COUNT_ROLE_BASED: 10 -->

| Agent | When Active | Focus Area |
|-------|-------------|------------|
| code-quality-reviewer | Always | Code quality, error handling |
| security-expert | Always | Vulnerabilities, auth, secrets |
| performance-engineer | Always | N+1 queries, memory, blocking ops |
| test-quality-guardian | Always | Coverage, edge cases, mocking |
| architecture-reviewer | If 50+ files | Modularity, patterns, SOLID |
| database-specialist | If DB detected | Queries, indexes, transactions |
| api-designer | If API detected | REST, errors, pagination |
| frontend-specialist | If frontend detected | Components, state, UX |
| backend-specialist | If backend detected | Services, domain logic |
| devops-reviewer | If CI/CD detected | Pipelines, configs, secrets |

Findings are collected and categorized by severity (critical/high/medium/low). All non-false-positive issues get fixed automatically. The loop repeats until no open issues remain.

**Usage:**

```bash
/audit-project                   # Full review
/audit-project --quick           # Single pass
/audit-project --resume          # Resume from queue file
/audit-project --domain security # Security focus only
/audit-project --recent          # Only recent changes
```

[Agent reference →](./docs/reference/AGENTS.md#audit-project-plugin-agents)

---

### /drift-detect

**Purpose:** Compares your documentation and plans to what's actually in the code.

**The problem it solves:**

Your roadmap says "user authentication: done." But is it actually implemented? Your GitHub issue says "add dark mode." Is it already in the codebase? Plans drift from reality. This command finds the drift.

**How it works:**

1. **JavaScript collectors** gather data (fast, token-efficient)
   - GitHub issues and their labels
   - Documentation files
   - Actual code exports and implementations

2. **Single Opus call** performs semantic analysis
   - Matches concepts, not strings ("user auth" matches `auth/`, `login.js`, `session.ts`)
   - Identifies implemented but not documented
   - Identifies documented but not implemented
   - Finds stale issues that should be closed

**Why this approach:**

Multi-agent collection wastes tokens on coordination. JavaScript collectors are fast and deterministic. One well-prompted LLM call does the actual analysis. Result: 77% token reduction.

**Usage:**

```bash
/drift-detect              # Full analysis
/drift-detect --depth quick  # Quick scan
```

---

### /enhance

**Purpose:** Analyzes your prompts, plugins, agents, and docs for improvement opportunities.

**Five analyzers run in parallel:**

| Analyzer | What it checks |
|----------|----------------|
| plugin-enhancer | Plugin structure, MCP tool definitions, security patterns |
| agent-enhancer | Agent frontmatter, tool restrictions, prompt quality |
| claudemd-enhancer | CLAUDE.md/AGENTS.md structure, token efficiency |
| docs-enhancer | Documentation readability, RAG optimization |
| prompt-enhancer | Prompt engineering patterns, clarity, examples |

**Each finding includes:**
- Certainty level (HIGH/MEDIUM/LOW)
- Specific location (file:line)
- What's wrong
- How to fix it
- Whether it can be auto-fixed

**Usage:**

```bash
/enhance                    # Run all analyzers
/enhance --focus=agent      # Just agent prompts
/enhance --apply            # Apply HIGH certainty fixes
```

---

### /sync-docs

**Purpose:** Sync documentation with actual code changes—find outdated refs, update CHANGELOG, flag stale examples.

**The problem it solves:**

You refactor `auth.js` into `auth/index.js`. Your README still says `import from './auth'`. You rename a function. Three docs still reference the old name. You ship a feature. CHANGELOG doesn't mention it. Documentation drifts from code. This command finds the drift.

**What happens when you run it:**

1. **Get Changed Files** - Finds files changed since last commit to main (or use `--all` for full scan)
2. **Find Related Docs** - Searches docs that reference changed files (imports, filenames, paths)
3. **Analyze Issues** - Checks for outdated imports, removed exports, version mismatches
4. **Check CHANGELOG** - Identifies commits that may need CHANGELOG entries
5. **Report/Apply** - Shows findings (report mode) or fixes safe issues (apply mode)

**What it detects:**

| Category | Examples |
|----------|----------|
| Broken references | Imports to moved/renamed files, deleted exports |
| Version mismatches | Doc says v2.0, package.json says v2.1 |
| Stale code examples | Import paths that no longer exist |
| Missing CHANGELOG | `feat:` and `fix:` commits without entries |

**Auto-fixable vs flagged:**

| Auto-fixable (apply mode) | Flagged for review |
|---------------------------|-------------------|
| Version number updates | Removed exports referenced in docs |
| CHANGELOG entries for commits | Code examples needing context |
| | Function renames |

**Usage:**

```bash
/sync-docs              # Check what docs need updates (safe)
/sync-docs apply        # Apply safe fixes
/sync-docs report src/  # Check docs related to src/
/sync-docs --all        # Full codebase scan
```

**Scope options:**

- `--recent` (default) - Files changed since last commit to main
- `--all` - Scan all docs against all code
- `path` - Specific file or directory

---

## How Commands Work Together

**Standalone use:**

```bash
/deslop apply       # Just clean up your code
/sync-docs        # Just check if docs need updates
/ship                      # Just ship this branch
```

**Integrated workflow:**

When you run `/next-task`, it orchestrates everything:

```
/next-task picks task → explores codebase → plans implementation
    ↓
implementation-agent writes code
    ↓
deslop-work cleans AI artifacts
    ↓
review-orchestrator iterates until approved
    ↓
delivery-validator checks requirements
    ↓
docs-updater syncs documentation
    ↓
/ship creates PR → monitors CI → merges
```

The workflow tracks state so you can resume from any point.

---

## Installation

### Claude Code (Recommended)

```bash
/plugin marketplace add avifenesh/awesome-slash
/plugin install next-task@awesome-slash
/plugin install ship@awesome-slash
```

### All Platforms (npm)

```bash
npm install -g awesome-slash && awesome-slash
```

Interactive installer for Claude Code, OpenCode, and Codex CLI.

[Full installation guide →](./docs/INSTALLATION.md)

---

## Requirements

**Required:**
- Git
- Node.js 18+

**For GitHub workflows:**
- GitHub CLI (`gh`) authenticated

**For GitLab workflows:**
- GitLab CLI (`glab`) authenticated

---

## Documentation

| Topic | Link |
|-------|------|
| Installation | [docs/INSTALLATION.md](./docs/INSTALLATION.md) |
| Cross-Platform Setup | [docs/CROSS_PLATFORM.md](./docs/CROSS_PLATFORM.md) |
| Usage Examples | [docs/USAGE.md](./docs/USAGE.md) |
| Architecture | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

### Workflow Deep-Dives

| Workflow | Link |
|----------|------|
| /next-task Flow | [docs/workflows/NEXT-TASK.md](./docs/workflows/NEXT-TASK.md) |
| /ship Flow | [docs/workflows/SHIP.md](./docs/workflows/SHIP.md) |

### Reference

| Topic | Link |
|-------|------|
| Slop Patterns | [docs/reference/SLOP-PATTERNS.md](./docs/reference/SLOP-PATTERNS.md) |
| Agent Reference | [docs/reference/AGENTS.md](./docs/reference/AGENTS.md) |
| MCP Tools | [docs/reference/MCP-TOOLS.md](./docs/reference/MCP-TOOLS.md) |

---

## Support

- **Issues:** [github.com/avifenesh/awesome-slash/issues](https://github.com/avifenesh/awesome-slash/issues)
- **Discussions:** [github.com/avifenesh/awesome-slash/discussions](https://github.com/avifenesh/awesome-slash/discussions)

---

MIT License | Made by [Avi Fenesh](https://github.com/avifenesh)
