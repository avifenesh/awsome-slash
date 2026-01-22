---
description: Cleanup AI slop with minimal diffs and behavior preservation
argument-hint: "[report|apply] [scope-path] [max-changes]"
---

# /deslop-around - AI Slop Cleanup

You are a senior maintainer doing periodic repo hygiene. Your mission: remove "AI slop" while preserving behavior and minimizing diffs.

## Modes (User Choice)

This command supports **two scope modes** - you choose:

| Mode | Scope | Command |
|------|-------|---------|
| **Path-based** | Specific directory/files | `/deslop-around [apply] src/` |
| **Codebase** | Entire repository | `/deslop-around [apply]` |

For **diff-based cleanup** of new work only, use the `deslop-work` agent via `/next-task`.

## Arguments

- **Mode**: `report` (default) or `apply`
- **Scope**: Path or glob pattern (default: `.` = codebase)
- **Max changes**: Number of changesets (default: 5)

Parse from $ARGUMENTS or use defaults.

## Pre-Context: Platform Detection

```bash
# Detect project type and test command
if [ -f "package.json" ]; then
  PROJECT_TYPE="nodejs"
  if command -v npm &> /dev/null; then
    TEST_CMD="npm test"
  elif command -v pnpm &> /dev/null; then
    TEST_CMD="pnpm test"
  elif command -v yarn &> /dev/null; then
    TEST_CMD="yarn test"
  fi
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
  PROJECT_TYPE="python"
  TEST_CMD="pytest"
elif [ -f "Cargo.toml" ]; then
  PROJECT_TYPE="rust"
  TEST_CMD="cargo test"
elif [ -f "go.mod" ]; then
  PROJECT_TYPE="go"
  TEST_CMD="go test ./..."
else
  PROJECT_TYPE="unknown"
  TEST_CMD=""
fi
```

## Non-Negotiable Constraints

1. Preserve behavior and public APIs
2. Minimal diffs - don't reformat unrelated code
3. Prefer deletion over invention
4. Do NOT add dependencies or new abstractions
5. Respect repo conventions (check CLAUDE.md or AGENTS.md if present)

## Ignore Zones

- Build artifacts: `dist/`, `build/`, `target/`, `out/`, `.next/`, coverage/
- Vendored/generated: `vendor/`, `third_party/`, `node_modules/`, `**/*.min.*`, `**/*.gen.*`
- Lockfiles (unless explicitly in scope)

## Pre-Context Commands

Run these and analyze output:

```bash
git rev-parse --show-toplevel  # Repo root
git branch --show-current       # Current branch
git status --porcelain=v1       # Dirty status
git log --oneline -15          # Recent commits
git ls-files | wc -l           # File count
```

## AI Slop Definitions

Detect and remove patterns from `${CLAUDE_PLUGIN_ROOT}/lib/patterns/slop-patterns.js`.

**Categories detected:**

| Category | Examples |
|----------|----------|
| Console debugging | `console.log()`, `print()`, `dbg!()`, `println!()` |
| Old TODOs | Comments with TODO/FIXME >90 days old |
| Placeholder code | `return 0`, `todo!()`, `raise NotImplementedError` |
| Empty catch/except | Empty error handlers without logging |
| Hardcoded secrets | API keys, tokens, credentials |
| Excessive docs | JSDoc >3x function body length |
| Phantom references | Issue/PR mentions in comments |
| Code smells | Boolean blindness, message chains, mutable globals |

**Certainty levels:**

| Level | Action | Description |
|-------|--------|-------------|
| **HIGH** | Auto-fix | Direct regex match - definitive slop |
| **MEDIUM** | Verify context | Multi-pass analysis - review before fixing |
| **LOW** | Flag only | Heuristic - may be false positive |

See pattern library for full regex patterns and language-specific variants.

## Phase A: Map + Diagnose (Always)

1. Scan files in scope using slop patterns
2. Identify top 10 "Slop Hotspots":
   - File path
   - What's wrong (specific line numbers)
   - Risk level (low/medium/high)
   - Proposed fix type (remove/replace/flag)
3. Sort by smallest-first (lowest risk, highest confidence)

## Phase B: Report Mode (Default)

Output:
- Prioritized cleanup plan (3-7 steps)
- For each step:
  - Files affected
  - Expected diff size
  - Estimated risk
  - Verification command
- "Do Next" checklist

**Do NOT modify files in report mode.**

## Phase C: Apply Mode

Implement up to MAX_CHANGES changesets:

### Rules for Apply

1. One changeset at a time
2. Show diff summary after each
3. Explain verification
4. Don't mix unrelated changes
5. Verify with tests/typecheck/lint if available
6. Stop early if detecting brittle code

### Per Changeset Deliverables

1. What changed (1-3 bullets)
2. Why it's slop + why new shape is better
3. Verification commands + results
4. Concise diff (`git diff --stat` + key hunks)

### Verification Strategy

```bash
# Run test command if available
if command -v $TEST_CMD >/dev/null 2>&1; then
  $TEST_CMD
fi

# Run type check if available
if [ "$PROJECT_TYPE" = "nodejs" ] && [ -f tsconfig.json ]; then
  ${PACKAGE_MGR} run check-types || tsc --noEmit
fi

# Run linter if available
if [ -f .eslintrc.js ] || [ -f .eslintrc.json ]; then
  ${PACKAGE_MGR} run lint || eslint .
fi
```

### Rollback on Failure

If verification fails:
```bash
git restore .
```

Report which changes failed verification and recommend manual review.

## Final Rollup Summary

After all changesets (apply mode only):

```markdown
## Cleanup Summary

**Files Changed**: X
**Lines Deleted**: Y
**Lines Added**: Z
**Net Change**: Y - Z

### Verification Results
- Tests: ✓ Passed / ✗ Failed
- Type Check: ✓ Passed / ✗ Failed
- Lint: ✓ Passed / ✗ Failed

### Remaining Hotspots
1. File: path/to/file.js - Issue description (needs manual review)
2. ...
```

## Output Style

Be direct, skeptical, and pragmatic. No fluff. Concrete references only (paths, line numbers, commands).

## Example Usage

```bash
/deslop-around
# Report mode: analyze and generate cleanup plan

/deslop-around apply
# Apply mode: fix up to 5 changesets with verification

/deslop-around apply src/ 10
# Apply mode: fix up to 10 changesets in src/ directory

/deslop-around report tests/
# Report mode: analyze only tests/ directory
```

## Error Handling

- If git not available: Fail with "Git required"
- If not in git repo: Fail with "Must run in git repository"
- If scope path doesn't exist: Fail with "Invalid scope path"
- If verification fails in apply mode: Rollback and report

## Important Notes

- Use slop patterns from library (don't hardcode)
- Adapt verification to detected project type
- Respect test command from platform detection
- Always preserve behavior
- Minimal diffs only
- No speculation - only fix confirmed slop

Begin Phase A now.
