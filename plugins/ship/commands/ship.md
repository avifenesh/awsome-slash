---
description: Complete PR workflow from commit to production with validation
argument-hint: "[--strategy STRATEGY] [--skip-tests] [--dry-run] [--state-file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task
---

# /ship - Complete PR Workflow

End-to-end workflow: commit → PR → CI → review → merge → deploy → validate → production.

Auto-adapts to your project's CI platform, deployment platform, and branch strategy.

## Quick Reference

| Phase | Description | Details |
|-------|-------------|---------|
| 1-3 | Pre-flight, Commit, Create PR | This file |
| 4 | CI & Review Monitor Loop | See `ship-ci-review-loop.md` |
| 5 | Subagent Review (standalone) | This file |
| 6 | Merge PR | This file |
| 7-10 | Deploy & Validate | See `ship-deployment.md` |
| 11-12 | Cleanup & Report | This file |
| Errors | Error handling & rollback | See `ship-error-handling.md` |

## Integration with /next-task

When called from `/next-task` workflow (via `--state-file`):
- **SKIPS Phase 5** internal review agents (already done by review-orchestrator)
- **SKIPS deslop/docs** (already done by deslop-work, docs-updater)
- **Trusts** that all quality gates passed

**CRITICAL: Phase 4 ALWAYS runs** - even from /next-task. External auto-reviewers (Gemini, Copilot, CodeRabbit) comment AFTER PR creation and must be addressed.

When called standalone, runs full workflow including review.

## Arguments

Parse from $ARGUMENTS:
- **--strategy**: Merge strategy: `squash` (default) | `merge` | `rebase`
- **--skip-tests**: Skip test validation (dangerous)
- **--dry-run**: Show what would happen without executing
- **--state-file**: Path to workflow state file (for /next-task integration)

## State Integration

```javascript
const args = '$ARGUMENTS'.split(' ');
const stateIdx = args.indexOf('--state-file');
const workflowState = stateIdx >= 0 ? require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/state/workflow-state.js') : null;

function updatePhase(phase, result) {
  if (!workflowState) return;
  workflowState.startPhase(phase);
  if (result) workflowState.completePhase(result);
}
```

## Phase 1: Pre-flight Checks

```bash
# Detect platform and project configuration
PLATFORM=$(node ${PLUGIN_ROOT}/lib/platform/detect-platform.js)
TOOLS=$(node ${PLUGIN_ROOT}/lib/platform/verify-tools.js)

# Extract critical info
CI_PLATFORM=$(echo $PLATFORM | jq -r '.ci')
DEPLOYMENT=$(echo $PLATFORM | jq -r '.deployment')
BRANCH_STRATEGY=$(echo $PLATFORM | jq -r '.branchStrategy')
MAIN_BRANCH=$(echo $PLATFORM | jq -r '.mainBranch')

# Check required tools
GH_AVAILABLE=$(echo $TOOLS | jq -r '.gh.available')
if [ "$GH_AVAILABLE" != "true" ]; then
  echo "ERROR: GitHub CLI (gh) required for PR workflow"
  exit 1
fi

# Determine workflow type
if [ "$BRANCH_STRATEGY" = "multi-branch" ]; then
  WORKFLOW="dev-prod"
  PROD_BRANCH="stable"
else
  WORKFLOW="single-branch"
fi
```

### Verify Git Status

```bash
# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  NEEDS_COMMIT="true"
else
  NEEDS_COMMIT="false"
fi

# Must be on feature branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
  echo "ERROR: Cannot ship from $MAIN_BRANCH, must be on feature branch"
  exit 1
fi
```

### Dry Run Mode

If `--dry-run` provided, show plan and exit:
```markdown
## Dry Run: What Would Happen
**Branch**: ${CURRENT_BRANCH} → **Target**: ${MAIN_BRANCH}
**Workflow**: ${WORKFLOW} | **CI**: ${CI_PLATFORM} | **Deploy**: ${DEPLOYMENT}
```

## Phase 2: Commit Current Work

Only if `NEEDS_COMMIT=true`:

```bash
# Stage relevant files (exclude secrets)
git status --porcelain | awk '{print $2}' | grep -v '\.env' | xargs git add

# Generate semantic commit message
# Format: <type>(<scope>): <subject>
# Types: feat, fix, docs, refactor, test, chore

git commit -m "$(cat <<'EOF'
${COMMIT_MESSAGE}
EOF
)"

COMMIT_SHA=$(git rev-parse HEAD)
echo "✓ Committed: $COMMIT_SHA"
```

## Phase 3: Create Pull Request

```bash
# Push to remote
git push -u origin $CURRENT_BRANCH

# Create PR
PR_URL=$(gh pr create \
  --base "$MAIN_BRANCH" \
  --title "$PR_TITLE" \
  --body "$(cat <<'EOF'
## Summary
- Bullet points of changes

## Test Plan
- How to test

## Related Issues
Closes #X
EOF
)")

PR_NUMBER=$(echo $PR_URL | grep -oP '/pull/\K\d+')
echo "✓ Created PR #$PR_NUMBER: $PR_URL"
```

## Phase 4: CI & Review Monitor Loop

**This is the most critical phase.** See `ship-ci-review-loop.md` for full details.

### Summary

The monitor loop waits for:
1. CI to pass
2. ALL comments resolved (addressed or replied to)
3. No "changes requested" reviews remain

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    EVERY COMMENT MUST BE ADDRESSED                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║  • Critical/High issues → Fix immediately                                ║
║  • Medium/Minor issues → Fix (shows quality)                             ║
║  • Questions → Answer with explanation                                   ║
║  • False positives → Reply explaining why, then resolve                  ║
║  NEVER ignore a comment. NEVER leave comments unresolved.                ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Loop Structure

```bash
MAX_ITERATIONS=10
INITIAL_WAIT=${SHIP_INITIAL_WAIT:-180}  # 3 min for auto-reviews

while [ $iteration -lt $MAX_ITERATIONS ]; do
  # 1. Wait for CI
  wait_for_ci || { fix_ci_failures; continue; }

  # 2. First iteration: wait for auto-reviews
  [ $iteration -eq 1 ] && sleep $INITIAL_WAIT

  # 3. Check feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')

  [ "$UNRESOLVED" -eq 0 ] && break  # Ready to merge!

  # 4. Address all feedback (see ship-ci-review-loop.md)
  # 5. Commit and push fixes
  # 6. Sleep before next check
done
```

## Phase 5: Review Loop (Standalone Only)

**Skip if called from /next-task** (review already done).

```javascript
if (workflowState) {
  const state = workflowState.readState();
  const reviewPhase = state?.phases?.history?.find(p => p.phase === 'review-loop');
  if (reviewPhase?.result?.approved) {
    SKIP_REVIEW = true;  // Skip to Phase 6
  }
}
```

When running standalone, launch core review passes in parallel (error handling is part of code quality):

```javascript
const reviewPasses = [
  { id: 'code-quality', role: 'code quality reviewer' },
  { id: 'security', role: 'security reviewer' },
  { id: 'performance', role: 'performance reviewer' },
  { id: 'test-coverage', role: 'test coverage reviewer' }
];

// Add specialists based on repo signals (db, architecture, api, frontend, backend, devops)
// Then launch in parallel:
reviewPasses.map(pass => Task({
  subagent_type: "review",
  prompt: `Role: ${pass.role}. Review PR #${PR_NUMBER} and return JSON findings.`
}));
```

Iterate until no open (non-false-positive) issues remain (max 3 iterations if running standalone).

## Phase 6: Merge PR

**MANDATORY PRE-MERGE CHECKS** - Do NOT skip these:

```bash
# 1. Verify mergeable status
MERGEABLE=$(gh pr view $PR_NUMBER --json mergeable --jq '.mergeable')
[ "$MERGEABLE" != "MERGEABLE" ] && { echo "✗ PR not mergeable"; exit 1; }

# 2. MANDATORY: Verify ALL comments resolved (zero unresolved threads)
# Use separate gh calls for cleaner extraction (avoids cut parsing issues)
OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO=$(gh repo view --json name --jq '.name')

# NOTE: Fetches first 100 threads. For PRs with >100 comment threads (rare),
# implement pagination using pageInfo.hasNextPage and pageInfo.endCursor.
# This covers 99.9% of PRs - pagination is left as a future enhancement.
UNRESOLVED=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { isResolved }
        }
      }
    }
  }
' -f owner="$OWNER" -f repo="$REPO" -F pr=$PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

if [ "$UNRESOLVED" -gt 0 ]; then
  echo "✗ CANNOT MERGE: $UNRESOLVED unresolved comment threads"
  echo "Go back to Phase 4 and address ALL comments"
  exit 1
fi

echo "✓ All comments resolved"

# 3. Merge with strategy (default: squash)
STRATEGY=${STRATEGY:-squash}
gh pr merge $PR_NUMBER --$STRATEGY --delete-branch

# Update local
git checkout $MAIN_BRANCH
git pull origin $MAIN_BRANCH

# Update repo-map if it exists (non-blocking)
node -e "const pluginPath = '${PLUGIN_ROOT}'.replace(/\\\\/g, '/'); const repoMap = require(`${pluginPath}/lib/repo-map`); if (repoMap.exists(process.cwd())) { repoMap.update(process.cwd(), {}).then(() => console.log('✓ Repo-map updated')).catch((e) => console.log('⚠️ Repo-map update failed: ' + e.message)); } else { console.log('Repo-map not found, skipping'); }" || true
MERGE_SHA=$(git rev-parse HEAD)
echo "✓ Merged PR #$PR_NUMBER at $MERGE_SHA"
```

## Phases 7-10: Deploy & Validate

**Skip if `WORKFLOW="single-branch"`**

See `ship-deployment.md` for platform-specific details:
- Phase 7: Deploy to Development (Railway, Vercel, Netlify)
- Phase 8: Validate Development (health checks, smoke tests)
- Phase 9: Deploy to Production (merge to prod branch)
- Phase 10: Validate Production (with auto-rollback on failure)

## Phase 11: Cleanup

```bash
# Clean up worktrees
git worktree list --porcelain | grep "worktree" | grep -v "$(git rev-parse --show-toplevel)" | while read -r wt; do
  WORKTREE_PATH=$(echo $wt | awk '{print $2}')
  git worktree remove $WORKTREE_PATH --force 2>/dev/null || true
done
```

### Close GitHub Issue (if applicable)

If the task came from a GitHub issue, close it with a completion comment:

```bash
if [ -n "$TASK_ID" ] && [ "$TASK_SOURCE" = "github" ]; then
  # Post completion comment
  gh issue comment "$TASK_ID" --body "$(cat <<'EOF'
✅ **Task Completed Successfully**

**PR**: #${PR_NUMBER}
**Status**: Merged to ${MAIN_BRANCH}
**Commit**: ${MERGE_SHA}

### Summary
- Implementation completed as planned
- All review comments addressed
- CI checks passed
- Merged successfully

---
_This issue was automatically processed by awesome-slash /next-task workflow._
_Closing issue as the work has been completed and merged._
EOF
)"

  # Close the issue
  gh issue close "$TASK_ID" --reason completed

  echo "✓ Closed issue #$TASK_ID with completion comment"
fi
```

### Remove Task from Registry

```javascript
// Remove completed task from ${STATE_DIR}/tasks.json
if (workflowState) {
  const state = workflowState.readState();
  const mainRepoPath = state?.git?.mainRepoPath || process.cwd();
  const taskId = state?.task?.id;

  if (taskId) {
    const registryPath = path.join(mainRepoPath, '.claude', 'tasks.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.tasks = registry.tasks.filter(t => t.id !== taskId);
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`✓ Removed task #${taskId} from registry`);
  }
}
```

### Local Branch Cleanup

```bash
git checkout $MAIN_BRANCH
# Feature branch already deleted by --delete-branch
git branch -D $CURRENT_BRANCH 2>/dev/null || true
```

## Phase 12: Completion Report

```markdown
# Deployment Complete

## Pull Request
**Number**: #${PR_NUMBER} | **Status**: Merged to ${MAIN_BRANCH}

## Review Results
- Code Quality: ✓ | Error Handling: ✓ | Test Coverage: ✓ | CI: ✓

## Deployments
${WORKFLOW === 'dev-prod' ?
  `Development: ${DEV_URL} ✓ | Production: ${PROD_URL} ✓` :
  `Production: Deployed to ${MAIN_BRANCH}`}

✓ Successfully shipped!
```

## Error Handling

See `ship-error-handling.md` for detailed error handling:
- GitHub CLI not available
- CI failures
- Merge conflicts
- Deployment failures
- Production validation failures with rollback

## Important Notes

- Requires GitHub CLI (gh) for PR workflow
- Auto-adapts to single-branch or multi-branch workflow
- Platform-specific CI and deployment monitoring
- Automatic rollback on production failures
- Respects project conventions (commit style, PR format)

Begin Phase 1 now.

