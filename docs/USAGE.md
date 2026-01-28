# Usage Guide

You shouldn't have to repeat the same requests every session. These commands handle entire workflows—from picking a task to merging a PR—with just a few interactions. You approve the plan, then the system runs autonomously.

**For deep dives:** See [workflow documentation](./workflows/) for phase-by-phase breakdowns.

---

## Quick Navigation

| Section | Jump to |
|---------|---------|
| [Command Overview](#command-overview) | What each command does |
| [When to Use](#when-to-use-each-command) | Quick decision guide |
| [Command Reference](#command-reference) | Detailed usage for each |
| [Real-World Examples](#real-world-examples) | See it in action |
| [Common Workflows](#common-workflows) | Typical usage patterns |
| [Tips](#tips-for-success) | Get the most out of it |

---

## Command Overview

| Command | Purpose | Scope |
|---------|---------|-------|
| `/next-task` | Find and implement prioritized tasks | Full autonomous workflow |
| `/ship` | Complete PR workflow to production | CI, deployment, validation |
| `/deslop` | Clean up debugging code, TODOs | Fast codebase scan |
| `/audit-project` | Multi-agent code review | Thorough analysis |
| `/drift-detect` | Compare docs to actual code | Plan drift detection |
| `/repo-map` | Build cached AST repo map | Faster analysis & symbol lookup |
| `/enhance` | Analyze prompts, plugins, docs | Quality improvement |
| `/sync-docs` | Sync docs with code changes | Documentation sync |

---

## When to Use Each Command

**Starting Your Day:**
```bash
/next-task
# Shows prioritized tasks from GitHub issues
```

**Before Committing:**
```bash
/deslop apply
# Cleans up debugging code
```

**Before Creating PR:**
```bash
/audit-project
# Catches issues early
```

**Ready to Deploy:**
```bash
/ship
# Handles everything: PR, CI, merge, deploy, validate
```

---

## Command Reference

### `/deslop`

Remove debugging code, old TODOs, and AI slop from your codebase with a 3-phase detection pipeline.

```bash
/deslop                    # Report mode (safe, no changes)
/deslop apply              # Apply fixes automatically
/deslop apply src/ 10      # Fix 10 issues in src/ only
```

**Architecture:**
- **Phase 1** - Built-in regex patterns (HIGH certainty) - always runs
- **Phase 2** - Multi-pass analyzers (MEDIUM certainty) - context-aware
- **Phase 3** - Optional CLI tools (LOW certainty) - graceful degradation
  - JavaScript/TypeScript: jscpd, madge, escomplex
  - Python: pylint, radon
  - Go: golangci-lint
  - Rust: clippy

**Thoroughness levels:**
- `quick` - Phase 1 only (fastest)
- `normal` - Phase 1 + Phase 2 (default, recommended)
- `deep` - All phases if tools available (most thorough)

**Detects:**
- Console debugging (`console.log`, `print()`, `dbg!()`)
- Old TODOs and commented code
- Placeholder text, magic numbers
- Empty catch blocks, disabled linters
- Placeholder functions
- Excessive documentation
- Phantom references
- Buzzword inflation
- Code smells and over-engineering patterns

---

### `/next-task`

Complete task-to-production automation with state management.

```bash
/next-task                        # Start new workflow with policy selection
/next-task --status               # Check current workflow state
/next-task --resume               # Resume from last checkpoint
/next-task --abort                # Cancel workflow and cleanup
/next-task bug                    # Filter by task type
/next-task --implement            # Start implementing selected task
```

**12-Phase Workflow:**
1. Policy Selection → Choose task source, priority, stopping point
2. Task Discovery → Find and prioritize tasks, you pick one
3. Worktree Setup → Create isolated branch and directory
4. Exploration → Deep codebase analysis
5. Planning → Design implementation plan
6. **User Approval → Approve the plan (LAST human interaction)**
7. Implementation → Execute the plan
8. Pre-Review → Clean AI slop, check test coverage
9. Review Loop → Multi-agent review until clean
10. Delivery Validation → Verify tests, build, requirements
11. Docs Update → Sync documentation
12. Ship → Create PR, monitor CI, address comments, merge

Phase 9 uses the `orchestrate-review` skill to define review passes and signal thresholds.

[Full workflow documentation →](./workflows/NEXT-TASK.md)

---

### `/audit-project`

Comprehensive multi-agent code review that adapts to your project.

```bash
/audit-project                   # Full review with all agents
/audit-project --quick           # Single-pass review
/audit-project --domain security # Security review only
/audit-project --recent          # Only recent changes
```

**8 Specialized Roles (2 always active, 6 conditional):**

| Agent | When Active | Focus Area |
|-------|-------------|------------|
| security-expert | Always | Vulnerabilities, auth, secrets |
| performance-engineer | Always | N+1 queries, memory, blocking ops |
| test-quality-guardian | If tests exist | Coverage, edge cases, mocking |
| architecture-reviewer | If 50+ files | Modularity, patterns, SOLID |
| database-specialist | If DB detected | Queries, indexes, transactions |
| api-designer | If API detected | REST, errors, pagination |
| frontend-specialist | If frontend detected | Components, state, UX |
| devops-reviewer | If CI/CD detected | Pipelines, configs, secrets |

Only relevant agents run based on your codebase - no wasted analysis.

---

### `/sync-docs`

Sync documentation with actual code state. Find outdated references, update CHANGELOG, flag stale examples.

```bash
/sync-docs                    # Report mode (safe, no changes)
/sync-docs apply              # Apply auto-fixable issues
/sync-docs report src/        # Check docs related to src/
/sync-docs --all              # Full codebase scan
```

**Phases:**
1. Get changed files (since last commit to main, or all with `--all`)
2. Find related documentation (references to changed files)
3. Analyze issues (outdated imports, removed exports, version mismatches)
4. Check CHANGELOG (undocumented commits)
5. Report findings or apply fixes

**Auto-fixable (apply mode):**
- Outdated version numbers
- CHANGELOG entries for undocumented commits

**Flagged for manual review:**
- Removed exports referenced in docs
- Code examples that may need context updates

---

### `/ship`

Complete PR workflow from commit to production.

```bash
/ship                             # Full workflow
/ship --dry-run                   # Preview without executing
/ship --strategy rebase           # Use rebase instead of squash
/ship --state-file PATH           # Integrate with next-task workflow
```

**Stages:**
1. Pre-flight checks and platform detection
2. Commit with AI-generated message
3. Create PR with context
4. Wait for CI and address PR feedback
5. Multi-agent review (standalone mode only)
6. Merge PR
7. Deploy to development (if configured)
8. Validate development deployment
9. Deploy to production (if configured)
10. Validate production deployment
11. Cleanup
12. Completion report

---

## Real-World Examples

### Example 1: Clean Up Debugging Code

**Scenario**: Console.log statements and TODOs scattered in your code.

```text
You: /deslop

Claude:
Detected: Node.js project, single-branch workflow

Found 8 issues:
1. src/app.js:15 - console.log("User logged in")
2. src/app.js:42 - // TODO: Add validation
3. src/utils.js:8 - console.log("Debug:", data)
4. src/api.js:23 - // FIXME: This is hacky
5. src/api.js:67 - empty catch block
...

Would you like me to apply fixes?

You: Apply fixes, but keep the console.log in tests

Claude:
✓ Removed 5 console.log statements
✓ Removed 2 old TODO comments
✓ Added logging to empty catch block
✓ Kept test console.logs

Running tests... ✓ All tests pass
Ready to commit!
```

---

### Example 2: Find What to Work On Next

**Scenario**: 20 GitHub issues, need to prioritize.

```text
You: /next-task

Claude:
Analyzing tasks from GitHub Issues...
Found 20 open issues

Top 5 Priority Tasks:

1. [P1] Fix authentication timeout bug (#142)
   Status: Not implemented
   Priority Score: 85
   Estimated effort: Small
   Files: src/auth/session.ts

2. [P2] Add dark mode to settings (#89)
   Status: Partially done
   Priority Score: 60
   Estimated effort: Medium
   Files: src/components/Settings.tsx

Which task would you like to work on?

You: /next-task --implement

Claude:
Creating branch: fix/auth-timeout-bug-142
Investigating implementation...
Found issue: Session timeout hardcoded to 5 minutes

Implementing fix...
✓ Fix implemented
✓ Tests written and passing
✓ Ready to ship
```

---

### Example 3: Get Code Review Before PR

**Scenario**: Finished login feature, want thorough review.

```text
You: /audit-project

Claude:
Detected: React + TypeScript project
Launching specialized review agents...

Review Complete! Found 4 issues:

CRITICAL (1):
1. Security: src/api/auth.ts:45
   Issue: Password sent in URL parameters
   Fix: Use POST body instead

HIGH (2):
2. React: src/components/LoginForm.tsx:23
   Issue: Missing useCallback (causes re-renders)

3. Testing: tests/login.test.tsx:15
   Issue: Missing test for failed login

MEDIUM (1):
4. Performance: src/hooks/useAuth.ts:10
   Issue: Expensive calculation every render

Would you like me to fix these?

You: Yes, fix all review issues

Claude:
Round 1: ✓ Fixed security issue
Round 2: ✓ Fixed React performance + added tests
Round 3: ✓ Re-verified - no open issues remain

Code is ready to ship!
```

---

### Example 4: Ship Feature to Production

**Scenario**: Feature finished, want to deploy.

```text
You: /ship

Claude:
Starting complete PR workflow...

Phase 1: Pre-flight checks
✓ Detected: GitHub Actions CI
✓ Detected: Railway deployment
✓ On branch: feature/add-dark-mode

Phase 2: Committing
Generated commit: "feat(ui): add dark mode toggle"
✓ Committed as: abc123f

Phase 3: Creating PR
✓ Created PR #156
URL: https://github.com/youruser/repo/pull/156

Phase 4: Waiting for CI...
✓ All checks passed

Phase 5: Review passes...
✓ code quality: approved
✓ test coverage: approved (95% coverage)

Phase 6: Merging
✓ Merged PR #156 to main

Phase 7-8: Deploying to development...
✓ Deployed to: https://app-dev.railway.app
✓ Validation passed

Phase 9-10: Deploying to production...
✓ Deployed to: https://app.railway.app
✓ Production healthy

✓ DEPLOYMENT COMPLETE!
```

---

### Example 5: Quick Security Audit

**Scenario**: Quick security check before release.

```text
You: /audit-project --domain security --quick

Claude:
Running focused security review...

Found 2 security issues:

CRITICAL:
1. src/api/users.js:34 - SQL Injection
   Code: db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)
   Fix: Use parameterized queries

HIGH:
2. src/middleware/auth.js:12 - Weak JWT secret
   Code: jwt.sign(payload, 'secret123')
   Fix: Use env variable

Would you like me to fix these?

You: Yes, fix both

Claude:
✓ Fixed SQL injection
✓ Fixed JWT secret
✓ Added JWT_SECRET to .env.example

Security issues resolved!
```

---

## Common Workflows

### Starting New Feature

```text
1. /next-task --implement    # Pick task and start
2. *develop feature*
3. /deslop apply      # Clean up
4. /audit-project           # Get feedback
5. /ship                     # Deploy
```

### Code Review Flow

```text
1. /audit-project --quick   # Quick check
2. Fix issues
3. /audit-project           # Full review
4. Iterate until clean
5. /ship                     # Deploy
```

### Maintenance Day

```text
1. /deslop report     # See all slop
2. /deslop apply      # Clean it up
3. /next-task                # See priorities
4. /audit-project           # Full audit
```

### Ship Your Work

```text
1. /ship --dry-run           # Preview
2. /ship                     # Full workflow
```

---

## Tips for Success

### Tip 1: Start Small

Don't start with `/ship` on production immediately!

**Try this order:**
1. `/deslop report` - Just look, no changes
2. `/next-task` - See task prioritization
3. `/deslop apply` - Make safe changes
4. `/audit-project --quick` - Quick feedback
5. `/ship --dry-run` - Preview the workflow
6. `/ship` - Full deployment

### Tip 2: Let Claude Explain

```text
You: Can you explain what /ship will do in my project?

Claude: *analyzes your project*
I see you have:
- GitHub Actions CI
- Railway deployment
- Single-branch workflow

Here's what /ship will do:
1. Commit your changes
2. Create PR to main
3. Wait for GitHub Actions
4. Run code review
5. Merge to main
6. Railway auto-deploys
7. Validate deployment
```

### Tip 3: Combine Commands

```text
You: Run /deslop, then /audit-project, then /ship

Claude:
1. Cleaning up slop... ✓ Removed 5 issues
2. Running review... ✓ Fixed 2 issues
3. Shipping to production... ✓ Complete!

Your code is cleaned, reviewed, and deployed!
```

### Tip 4: Use Filters

```bash
/next-task bug              # Focus on bugs only
/audit-project --domain security   # Security review only
/deslop apply src/ 10        # Limit scope
```

---

## Diagnostics (Local)

When working in this repo directly, you can sanity-check detection and tooling:

```bash
npm run detect   # Platform detection (CI, deploy, project type)
npm run verify   # Tool availability + versions
```

## What Makes This Plugin Special

### Zero Configuration

No setup files. No config. Just install and use.

### Auto-Adapts to Your Project

- Detects: Node.js, Python, Rust, Go
- Detects: GitHub Actions, GitLab CI, CircleCI, Jenkins
- Detects: Railway, Vercel, Netlify, Fly.io
- Uses what you have, skips what you don't

### Evidence-Based

Every finding includes:
- File path and line number
- Actual code quote
- Specific fix suggestion
- Why it matters

### Comprehensive Validation

- Runs tests
- Checks types
- Validates deployments
- Monitors errors
- **Automatic rollback** if production fails

---

## Platform Support

### CI Platforms
- GitHub Actions
- GitLab CI
- CircleCI
- Jenkins
- Travis CI

### Deployment Platforms
- Railway
- Vercel
- Netlify
- Fly.io
- Platform.sh
- Render

---

## Next Steps

- **Start with**: `/deslop report` - safest command, immediate value
- **For issues**: https://github.com/avifenesh/awesome-slash/issues
- **Contributing**: See [CONTRIBUTING.md](../CONTRIBUTING.md)
