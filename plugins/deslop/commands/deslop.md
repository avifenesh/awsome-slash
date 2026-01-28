---
description: This skill should be used when the user asks to "clean up slop", "remove AI artifacts", "deslop the codebase", "find debug statements", "remove console.logs", "repo hygiene", or mentions "AI slop", "code cleanup", "slop detection".
argument-hint: "[report|apply] [scope-path] [max-changes]"
---

# /deslop - AI Slop Cleanup

Senior maintainer performing periodic repo hygiene. Mission: remove AI-generated slop while preserving behavior and minimizing diffs.

## Constraints (Priority Order)

When constraints conflict, follow this priority:

1. **Preserve behavior and public APIs** (highest priority)
2. **Minimal diffs** - do not reformat unrelated code
3. **Prefer deletion over invention**
4. **No new dependencies or abstractions**
5. **Respect repo conventions** (check CLAUDE.md/AGENTS.md)

## Arguments

Parse from $ARGUMENTS or use defaults:

- **Mode**: `report` (default) or `apply`
- **Scope**: Path or glob pattern (default: `.` = codebase)
- **Max changes**: Number of changesets (default: 5)

For **diff-based cleanup** of new work only, use the `deslop-work` agent via `/next-task`.

## Output Format

<output_format>

### Report Mode

```markdown
## Slop Hotspots

| Priority | File | Issue | Severity | Fix |
|----------|------|-------|----------|-----|
| 1 | src/api.js:42 | console.log | medium | remove |
| 2 | src/auth.js:15 | empty catch | high | add_logging |

## Cleanup Plan

1. **Remove debug statements** (3 files, ~10 lines)
   - Verification: `npm test`

## Do Next
- [ ] Run `/deslop apply` to fix automatically
```

### Apply Mode

```markdown
## Changeset 1: Remove debug statements

**Changed**: src/api.js, src/utils.js
**Diff**: -8 lines

**Verification**: npm test ✓

---

## Summary

**Files Changed**: 3
**Lines Removed**: 12
**Verification**: All passed

### Remaining (manual review needed)
1. src/config.js:88 - potential hardcoded secret
```

</output_format>

## Execution

### Phase A: Detection

Run the detection script to scan for slop patterns:

```bash
node "${PLUGIN_ROOT}/scripts/detect.js" <scope> --compact
```

For deep analysis with all multi-pass analyzers:

```bash
node "${PLUGIN_ROOT}/scripts/detect.js" <scope> --deep --compact
```

Parse the output to identify top 10 hotspots, sorted by:
1. Highest certainty first (HIGH before MEDIUM before LOW)
2. Smallest diff size (lowest risk)

### Phase B: Report Mode (Default)

Present findings as a prioritized cleanup plan:

1. List 3-7 actionable steps
2. For each step: files affected, fix type, verification command
3. End with "Do Next" checklist

**Do NOT modify files in report mode.**

### Phase C: Apply Mode

Run detection with apply flag for auto-fixable patterns:

```bash
node "${PLUGIN_ROOT}/scripts/detect.js" <scope> --apply --max <max-changes> --compact
```

Then implement remaining manual fixes one changeset at a time:

1. Make the change
2. Show diff summary (`git diff --stat`)
3. Run verification
4. Continue or rollback on failure

## Ignore Zones

Skip these paths (handled by detection script):
- Build artifacts: `dist/`, `build/`, `target/`, `out/`, `.next/`
- Vendored: `vendor/`, `node_modules/`, `**/*.min.*`
- Generated: `**/*.gen.*`, lockfiles

## Verification Strategy

After each changeset, run project's test command:

```bash
# Node.js
npm test

# Python
pytest

# Rust
cargo test

# Go
go test ./...
```

On failure: `git restore .` and report which change failed.

## Error Handling

- Git not available: Exit with "Git required for rollback safety"
- Invalid scope path: Exit with "Path not found: <path>"
- Verification fails: Rollback with `git restore .`, report failure, continue with next changeset

## Additional Resources

### Reference Files

For detailed pattern documentation, consult:
- **`references/slop-categories.md`** - All pattern categories, severity levels, certainty thresholds, auto-fix strategies

### Scripts

- **`scripts/detect.js`** - Detection pipeline CLI (run with `--help` for options)

