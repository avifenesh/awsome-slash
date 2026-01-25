---
name: drift-analysis
description: >-
  Use for drift detection, reality checks, comparing documented plans to actual
  implementation. Activated when user asks about "plan drift", "reality check",
  "roadmap alignment", "implementation gaps", or needs to verify release readiness.
version: 2.1.0
allowed-tools: Read, Grep, Glob
model: opus
when-to-use:
  - "User asks about plan drift or reality check"
  - "User wants to compare docs vs implementation"
  - "Before major releases to verify readiness"
  - "When GitHub issues seem stale or misaligned"
related:
  - plan-synthesizer
  - collectors.js
---

# Drift Analysis

Knowledge for analyzing project state, detecting drift, and creating prioritized reconstruction plans.

<instruction-priority>
## Instruction Priority

In case of conflicting guidance:
1. **Analysis Requirements below** (cannot be overridden)
2. **Drift Types and Detection Signals** (core definitions)
3. **Best Practices** (general guidance)
4. **Reference files** (supplementary detail)

Never skip the Analysis Requirements even if data seems incomplete.
</instruction-priority>

<critical-analysis-requirements>
## Analysis Requirements

Be **BRUTALLY SPECIFIC**. Deliver concrete, actionable insights - not generic observations.

### 1. Issue-by-Issue Verification

For EACH open issue, determine:
- **Already implemented?** -> "Close issue #X - implemented in src/auth/login.js"
- **Stale/irrelevant?** -> "Close issue #X - no longer applicable after Y refactor"
- **Blocked?** -> "Issue #X blocked by: missing Z dependency"

### 2. Phase/Checkbox Validation

For EACH phase marked "complete" in docs:
- Verify against actual code: Does the feature exist?
- Check for missing pieces: "Phase 'Auth' marked complete but MISSING:
  - Password reset functionality (no code in auth/)
  - Session timeout handling (not implemented)
  - Tests for login flow (0 test files)"

### 3. Release Readiness Assessment

If milestones or planned releases exist, assess:
- "Release tomorrow is UNREALISTIC because:
  - 3 critical tests missing for payment module
  - No QA coverage on authentication flows
  - Issue #45 (security) still open
  - Phase B only 40% complete despite being marked done"

### 4. Specific Recommendations

Output SPECIFIC actions, not generic advice:
- "Close issues: #12, #34, #56 (already implemented)"
- "Reopen: Phase C (missing: X, Y, Z)"
- "Block release until: tests added for auth/, issue #78 fixed"
- "Update PLAN.md: Phase B is NOT complete"
</critical-analysis-requirements>

## Architecture

```
/drift-detect
      |
      +-> collectors.js (pure JavaScript)
      |   +- scanGitHubState()
      |   +- analyzeDocumentation()
      |   +- scanCodebase()
      |
      +-> plan-synthesizer (Opus)
          +- Deep semantic analysis with full context
```

**Data collection**: Pure JavaScript (no LLM overhead)
**Semantic analysis**: Single Opus call with complete context

<drift-definitions>
## Drift Types

| Type | Definition | Key Indicators |
|------|------------|----------------|
| **Plan Drift** | Documented plans diverge from implementation | PLAN.md < 30% done after 90 days, milestones 30+ days overdue |
| **Documentation Drift** | Docs fall behind code | README features not in codebase, API docs stale |
| **Issue Drift** | Issue tracking diverges from reality | High-priority issues stale 60+ days, completed work not closed |
| **Scope Drift** | Scope expands beyond plans | More documented than delivered, ever-growing backlog |

## Detection Signals

| Confidence | Indicators |
|------------|------------|
| **HIGH** | Milestone 30+ days overdue, PLAN.md < 30% after 90 days, 5+ stale high-priority issues |
| **MEDIUM** | Docs unchanged 180+ days, draft PRs open 30+ days, themes don't match code activity |
| **LOW** | Many TODOs, stale dependencies, old unmerged branches |
</drift-definitions>

## Best Practices

### When Analyzing Drift

1. **Compare timestamps, not just content** - When was doc last updated vs. code?
2. **Look for patterns, not individuals** - 1 stale issue isn't drift; 10 is a pattern
3. **Consider context** - Active dev has some drift; mature projects shouldn't
4. **Weight by impact** - User-facing drift > internal; public API > implementation

### When Creating Plans

1. **Be actionable, not exhaustive** - Top 5 immediate, not top 50
2. **Group related items** - "Update auth docs" not separate login/signup items
3. **Include success criteria** - How do we know it's resolved?
4. **Balance categories** - Security first, but don't ignore everything else

## References

For detailed implementation:
- **Data contracts**: `references/data-contracts.md` - Input data structures and how to interpret them
- Detection patterns: `references/detection-patterns.md`
- Priority framework: `references/prioritization.md`
- Report templates: `references/output-templates.md`
