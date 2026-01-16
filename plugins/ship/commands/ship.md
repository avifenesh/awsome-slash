---
description: Complete PR workflow from commit to production with validation
argument-hint: "[--strategy STRATEGY] [--skip-tests] [--dry-run] [--state-file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task
---

# /ship - Complete PR Workflow

End-to-end workflow: commit → PR → CI → review → merge → deploy → validate → production.

Auto-adapts to your project's CI platform, deployment platform, and branch strategy.

## Integration with /next-task

When called from the `/next-task` workflow (via `--state-file`), this command:
- **SKIPS review** (already done by review-orchestrator)
- **SKIPS deslop/docs** (already done by deslop-work, docs-updater)
- **Trusts** that all quality gates passed before reaching this point

When called standalone, this command runs the full workflow including review.

## Arguments

Parse from $ARGUMENTS:
- **--strategy**: Merge strategy: `squash` (default) | `merge` | `rebase`
- **--skip-tests**: Skip test validation (dangerous, not recommended)
- **--dry-run**: Show what would happen without executing
- **--state-file**: Path to workflow state file (for integration with /next-task)

## State Integration (Optional)

When called with `--state-file`, integrates with workflow state for resume capability:

```javascript
const args = '$ARGUMENTS'.split(' ');
const stateIdx = args.indexOf('--state-file');
const workflowState = stateIdx >= 0 ? require('${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js') : null;

if (workflowState) {
  const state = workflowState.readState();
  if (state) {
    console.log(`Workflow: ${state.workflow.id} | Task: #${state.task?.id} | Phase: ${state.phases?.current}`);
  }
}

function updatePhase(phase, result) {
  if (!workflowState) return;
  workflowState.startPhase(phase);
  if (result) workflowState.completePhase(result);
}
```

## Phase 1: Pre-flight Checks

### Load Platform Configuration

```bash
# Detect platform and project configuration
PLATFORM=$(node ${CLAUDE_PLUGIN_ROOT}/lib/platform/detect-platform.js)
TOOLS=$(node ${CLAUDE_PLUGIN_ROOT}/lib/platform/verify-tools.js)

# Extract critical info
CI_PLATFORM=$(echo $PLATFORM | jq -r '.ci')
DEPLOYMENT=$(echo $PLATFORM | jq -r '.deployment')
BRANCH_STRATEGY=$(echo $PLATFORM | jq -r '.branchStrategy')
MAIN_BRANCH=$(echo $PLATFORM | jq -r '.mainBranch')
PROJECT_TYPE=$(echo $PLATFORM | jq -r '.projectType')
PACKAGE_MGR=$(echo $PLATFORM | jq -r '.packageManager')

# Check required tools
GH_AVAILABLE=$(echo $TOOLS | jq -r '.gh.available')
if [ "$GH_AVAILABLE" != "true" ]; then
  echo "ERROR: GitHub CLI (gh) required for PR workflow"
  exit 1
fi

# Determine workflow
if [ "$BRANCH_STRATEGY" = "multi-branch" ]; then
  WORKFLOW="dev-prod"
  PROD_BRANCH="stable"  # or detected from platform
  echo "Multi-branch workflow detected: $MAIN_BRANCH → $PROD_BRANCH"
else
  WORKFLOW="single-branch"
  echo "Single-branch workflow detected: $MAIN_BRANCH only"
fi
```

### Verify Git Status

```bash
# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Working directory has uncommitted changes"
  NEEDS_COMMIT="true"
else
  echo "Working directory clean"
  NEEDS_COMMIT="false"
fi

# Check if on feature branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ] || [ "$CURRENT_BRANCH" = "$PROD_BRANCH" ]; then
  echo "ERROR: Cannot ship from $CURRENT_BRANCH, must be on feature branch"
  exit 1
fi

echo "Current branch: $CURRENT_BRANCH"
```

### Dry Run Mode

If `--dry-run` provided:
```markdown
## Dry Run: What Would Happen

**Branch**: ${CURRENT_BRANCH}
**Target**: ${MAIN_BRANCH}
**Workflow**: ${WORKFLOW}
**CI Platform**: ${CI_PLATFORM}
**Deployment**: ${DEPLOYMENT}

**Phases**:
1. ✓ Pre-flight checks (complete)
2. → Commit current work (${NEEDS_COMMIT})
3. → Create PR
4. → Wait for CI (${CI_PLATFORM})
5. → Review loop (3 subagents)
6. → Merge PR
${WORKFLOW === 'dev-prod' ? '7. → Deploy to development\n8. → Validate development\n9. → Deploy to production\n10. → Validate production' : ''}
11. → Cleanup
12. → Completion report

No changes will be made in dry-run mode.
```
Exit after showing plan.

## Phase 2: Commit Current Work

Only if `NEEDS_COMMIT=true`:

### Stage Changes

```bash
# Get modified and untracked files
git status --porcelain | awk '{print $2}' > /tmp/changed_files.txt

# Review files
echo "Files to commit:"
cat /tmp/changed_files.txt

# Stage all relevant files (exclude .env, secrets, etc.)
git add $(cat /tmp/changed_files.txt | grep -v '\.env' | grep -v 'credentials')
```

### Generate Commit Message

```bash
# Get context
git diff --staged --stat
git log --oneline -5

# Analyze changes and generate semantic commit message
# Format: <type>(<scope>): <subject>
# Types: feat, fix, docs, refactor, test, chore
# Examples:
#   feat(auth): add OAuth2 login flow
#   fix(api): resolve race condition in user endpoints
#   refactor(database): optimize query performance
```

Use recent commit style from git log to match repo conventions.

### Commit and Verify

```bash
git commit -m "$(cat <<'EOF'
${COMMIT_MESSAGE}
EOF
)"

# Verify commit succeeded
if [ $? -eq 0 ]; then
  COMMIT_SHA=$(git rev-parse HEAD)
  echo "✓ Committed: $COMMIT_SHA"
else
  echo "✗ Commit failed"
  exit 1
fi
```

```javascript
// Update state with commit info
updatePhase('ship-prep', {
  committed: true,
  commitSha: COMMIT_SHA,
  branch: CURRENT_BRANCH
});
```

## Phase 3: Create Pull Request

### Push Branch

```bash
# Push to remote with upstream tracking
git push -u origin $CURRENT_BRANCH

if [ $? -ne 0 ]; then
  echo "✗ Push failed"
  exit 1
fi

echo "✓ Pushed $CURRENT_BRANCH to origin"
```

### Generate PR Description

Analyze commits since branching:

```bash
# Get commits on this branch
git log $MAIN_BRANCH..HEAD --oneline

# Generate PR description
# Format:
# ## Summary
# - Bullet points of what changed
#
# ## Test Plan
# - How to test the changes
# - Key scenarios covered
#
# ## Related Issues
# Closes #X, Relates to #Y
```

### Create PR

```bash
# Create PR using gh CLI
PR_URL=$(gh pr create \
  --base "$MAIN_BRANCH" \
  --title "$PR_TITLE" \
  --body "$(cat <<'EOF'
$PR_DESCRIPTION
EOF
)" \
  --web 2>&1 | grep -o 'https://[^ ]*')

# Extract PR number
PR_NUMBER=$(echo $PR_URL | grep -oP '/pull/\K\d+')

echo "✓ Created PR #$PR_NUMBER: $PR_URL"
```

```javascript
// Update state with PR info
updatePhase('create-pr', {
  prNumber: PR_NUMBER,
  prUrl: PR_URL,
  baseBranch: MAIN_BRANCH
});

if (workflowState) {
  workflowState.updateState({
    pr: {
      number: PR_NUMBER,
      url: PR_URL,
      ciStatus: 'pending',
      reviewState: 'pending'
    }
  });
}
```

## Phase 4: CI & Review Monitor Loop

**⚠️ CRITICAL: This is the most important phase of the shipping workflow.**

This phase implements a continuous monitoring loop that waits for CI AND addresses ALL PR feedback. The loop continues until:
1. CI passes
2. ALL comments are resolved (addressed or replied to)
3. No "changes requested" reviews remain

### Why ALL Comments Matter

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    EVERY COMMENT MUST BE ADDRESSED                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  • Critical/High issues → Fix immediately                                ║
║  • Medium issues → Fix (don't defer)                                     ║
║  • Minor/Nit issues → Fix (shows attention to quality)                   ║
║  • Style suggestions → Fix (maintains codebase consistency)              ║
║  • Questions → Answer with explanation                                   ║
║  • False positives → Reply explaining why, then resolve                  ║
║  • Not relevant → Reply explaining why, then resolve                     ║
║                                                                          ║
║  NEVER ignore a comment. NEVER leave comments unresolved.                ║
║  A clean PR has ZERO unresolved conversations.                           ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### The Monitor Loop

```javascript
const MAX_ITERATIONS = 10;  // Safety limit
const INITIAL_WAIT_MS = 180000;  // 3 minutes - wait for auto-reviews to arrive
const ITERATION_WAIT_MS = 30000;  // 30 seconds between iterations
let iteration = 0;

while (iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`\n## CI & Review Monitor - Iteration ${iteration}`);

  // Step 1: Wait for CI to complete
  const ciStatus = await waitForCI();

  if (ciStatus === 'failed') {
    console.log("CI failed - fixing issues before checking comments...");
    await fixCIFailures();
    continue;  // Push fix, re-run CI
  }

  // Step 1.5: On first iteration, wait 3 minutes for auto-reviews to arrive
  // (Bots like Gemini Code Assist, CodeRabbit, etc. need time to analyze)
  if (iteration === 1) {
    console.log("First iteration - waiting 3 minutes for auto-reviews to arrive...");
    await sleep(INITIAL_WAIT_MS);
  }

  // Step 2: Check for PR comments and reviews
  const feedback = await checkPRFeedback();

  if (feedback.unresolvedCount === 0 && feedback.changesRequested === false) {
    console.log("✓ CI passed, all comments resolved, no changes requested");
    break;  // Ready to merge!
  }

  // Step 3: Address ALL feedback
  console.log(`Found ${feedback.unresolvedCount} unresolved comments`);
  await addressAllFeedback(feedback);

  // Step 4: Push fixes (triggers new CI run)
  if (feedback.hasCodeChanges) {
    await commitAndPush(`fix: address review feedback (iteration ${iteration})`);
  }

  // Step 5: Sleep before next check (allow reviewers to respond)
  console.log("Waiting 30s for CI and potential new feedback...");
  await sleep(ITERATION_WAIT_MS);
}

if (iteration >= MAX_ITERATIONS) {
  console.log("✗ Max iterations reached - manual intervention required");
  exit(1);
}
```

### Step 1: Wait for CI

```bash
wait_for_ci() {
  echo "Waiting for CI checks..."

  while true; do
    # Get all check runs
    CHECKS=$(gh pr checks $PR_NUMBER --json name,state,conclusion 2>/dev/null || echo "[]")

    PENDING=$(echo "$CHECKS" | jq '[.[] | select(.state | IN("pending", "queued", "in_progress"))] | length')
    FAILED=$(echo "$CHECKS" | jq '[.[] | select(.conclusion | IN("failure", "cancelled"))] | length')
    PASSED=$(echo "$CHECKS" | jq '[.[] | select(.conclusion=="success")] | length')

    if [ "$FAILED" -gt 0 ]; then
      echo "✗ CI failed ($FAILED checks)"
      gh pr checks $PR_NUMBER
      return 1
    elif [ "$PENDING" -eq 0 ]; then
      echo "✓ CI passed ($PASSED checks)"
      return 0
    fi

    echo "  Waiting... ($PENDING pending, $PASSED passed)"
    sleep 15
  done
}
```

### Step 2: Check PR Feedback

```bash
check_pr_feedback() {
  local pr_number=$1

  echo "Checking PR feedback..."

  # Get review state
  REVIEWS=$(gh pr view $pr_number --json reviews --jq '.reviews')
  CHANGES_REQUESTED=$(echo "$REVIEWS" | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')

  # Get unresolved review threads (simplified query - only fetch isResolved)
  UNRESOLVED_THREADS=$(gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
            }
          }
        }
      }
    }
  ' -f owner="{owner}" -f repo="{repo}" -F pr=$pr_number \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

  echo "  Unresolved threads: $UNRESOLVED_THREADS"
  echo "  Changes requested: $CHANGES_REQUESTED"

  # Return structured data
  echo "{\"unresolvedThreads\": $UNRESOLVED_THREADS, \"changesRequested\": $CHANGES_REQUESTED}"
}
```

### Step 3: Address ALL Feedback

**This is where EVERY comment gets addressed - no exceptions.**

```javascript
async function addressAllFeedback(prNumber) {
  // Get all unresolved review threads with full context
  const threads = await getUnresolvedThreads(prNumber);

  console.log(`\nAddressing ${threads.length} unresolved threads...`);

  for (const thread of threads) {
    console.log(`\n--- Thread: ${thread.path}:${thread.line} ---`);
    console.log(`Comment: ${thread.body.substring(0, 200)}...`);

    // Analyze the comment
    const analysis = analyzeComment(thread);

    switch (analysis.type) {
      case 'code_fix_required':
        // Valid issue - fix it
        console.log(`Action: Fixing code issue`);
        await implementFix(thread);
        break;

      case 'style_suggestion':
        // Style/nit - fix it anyway (shows quality)
        console.log(`Action: Applying style fix`);
        await implementFix(thread);
        break;

      case 'question':
        // Question - answer it
        console.log(`Action: Answering question`);
        await replyToComment(thread.id, generateAnswer(thread));
        await resolveThread(thread.id);
        break;

      case 'false_positive':
        // Not a real issue - explain and resolve
        console.log(`Action: Explaining why this is not an issue`);
        await replyToComment(thread.id,
          `This appears to be a false positive because: ${analysis.reason}\n\n` +
          `[Specific explanation of why the current code is correct]\n\n` +
          `Resolving this thread. Please reopen if you disagree.`
        );
        await resolveThread(thread.id);
        break;

      case 'not_relevant':
        // Out of scope - explain and resolve
        console.log(`Action: Explaining why this is out of scope`);
        await replyToComment(thread.id,
          `This suggestion is outside the scope of this PR because: ${analysis.reason}\n\n` +
          `[If valid, mention: "I've created issue #X to track this separately."]\n\n` +
          `Resolving this thread. Please reopen if you feel it should be addressed here.`
        );
        await resolveThread(thread.id);
        break;

      case 'already_addressed':
        // Already fixed - confirm and resolve
        console.log(`Action: Confirming already addressed`);
        await replyToComment(thread.id,
          `This has been addressed in commit ${getLatestCommit()}. ` +
          `[Brief explanation of the fix]`
        );
        await resolveThread(thread.id);
        break;
    }
  }

  // Also check for "changes requested" reviews
  const changesRequestedReviews = await getChangesRequestedReviews(prNumber);

  if (changesRequestedReviews.length > 0) {
    console.log(`\n${changesRequestedReviews.length} reviewers requested changes.`);
    console.log(`All their comments have been addressed above.`);
    console.log(`Requesting re-review...`);

    // Request re-review from those who requested changes
    for (const review of changesRequestedReviews) {
      await requestReReview(prNumber, review.author);
    }
  }
}
```

### Comment Analysis Logic

```javascript
function analyzeComment(thread) {
  const body = thread.body.toLowerCase();
  const path = thread.path;
  const diffHunk = thread.diffHunk;

  // Check for question patterns
  if (body.includes('?') || body.startsWith('why') || body.startsWith('how') ||
      body.startsWith('what') || body.startsWith('could you explain')) {
    return { type: 'question', reason: 'Comment is a question' };
  }

  // Check for suggestion patterns
  if (body.includes('nit:') || body.includes('nitpick') || body.includes('minor:') ||
      body.includes('style:') || body.includes('consider') || body.includes('optional')) {
    return { type: 'style_suggestion', reason: 'Style or minor suggestion' };
  }

  // Check if comment refers to code that doesn't exist in diff
  if (!diffHunk || !isCommentRelevantToChanges(thread)) {
    return { type: 'not_relevant', reason: 'Comment refers to unchanged code' };
  }

  // Check for common false positive patterns
  if (isFalsePositive(thread)) {
    return { type: 'false_positive', reason: getFalsePositiveReason(thread) };
  }

  // Default: treat as code fix required
  return { type: 'code_fix_required', reason: 'Valid code feedback' };
}
```

### Implementing Fixes

Use the ci-fixer agent for code changes:

```javascript
// For each code fix needed
Task({
  subagent_type: "next-task:ci-fixer",
  prompt: `Fix the following review comment:

**File**: ${thread.path}
**Line**: ${thread.line}
**Comment**: ${thread.body}
**Code Context**:
\`\`\`
${thread.diffHunk}
\`\`\`

Requirements:
1. Make the minimal change to address the feedback
2. Do NOT over-engineer or add unrelated changes
3. Ensure tests still pass after the fix
4. If the fix requires a test update, include it

After fixing, the code should satisfy the reviewer's concern.`
});
```

### Resolving Threads

```bash
resolve_thread() {
  local thread_id=$1

  # GraphQL mutation to resolve a review thread
  gh api graphql -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread {
          isResolved
        }
      }
    }
  ' -f threadId="$thread_id"
}

reply_to_comment() {
  local pr_number=$1
  local comment_id=$2
  local body=$3

  gh api repos/{owner}/{repo}/pulls/$pr_number/comments \
    -f body="$body" \
    -f in_reply_to=$comment_id
}
```

### Step 4: Commit and Push

```bash
commit_and_push_fixes() {
  local message=$1

  # Check if there are changes to commit
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "$message"
    git push origin $CURRENT_BRANCH
    echo "✓ Pushed fixes"
    return 0
  else
    echo "No code changes to commit (only comment replies)"
    return 1
  fi
}
```

### The Complete Loop

```bash
#!/bin/bash
# Phase 4: CI & Review Monitor Loop

MAX_ITERATIONS=10
INITIAL_WAIT=180  # 3 minutes - wait for auto-reviews (Gemini, CodeRabbit, etc.)
ITERATION_WAIT=30  # 30 seconds between iterations
iteration=0

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo ""
  echo "========================================"
  echo "CI & Review Monitor - Iteration $iteration"
  echo "========================================"

  # Step 1: Wait for CI
  if ! wait_for_ci; then
    echo "CI failed - launching ci-fixer agent..."
    # Use ci-fixer agent to fix CI failures
    # Then continue loop (push triggers new CI)
    continue
  fi

  # Step 1.5: On first iteration, wait for auto-reviews to arrive
  if [ $iteration -eq 1 ]; then
    echo ""
    echo "First iteration - waiting ${INITIAL_WAIT}s for auto-reviews to arrive..."
    echo "(Bots like Gemini Code Assist, CodeRabbit need time to analyze)"
    sleep $INITIAL_WAIT
  fi

  # Step 2: Check for unresolved feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')
  CHANGES_REQ=$(echo "$FEEDBACK" | jq -r '.changesRequested')

  if [ "$UNRESOLVED" -eq 0 ] && [ "$CHANGES_REQ" -eq 0 ]; then
    echo ""
    echo "╔══════════════════════════════════════╗"
    echo "║  ✓ ALL CHECKS PASSED                 ║"
    echo "║  ✓ ALL COMMENTS RESOLVED             ║"
    echo "║  ✓ NO CHANGES REQUESTED              ║"
    echo "║                                      ║"
    echo "║  Ready to merge!                     ║"
    echo "╚══════════════════════════════════════╝"
    break
  fi

  # Step 3: Address all feedback
  echo ""
  echo "Addressing $UNRESOLVED unresolved threads..."

  # Launch agent to address feedback
  # This agent will:
  # - Read each comment
  # - Fix code issues OR reply explaining why not applicable
  # - Resolve threads
  # - Request re-review if needed

  # Step 4: Commit and push (if code changes made)
  commit_and_push_fixes "fix: address review feedback (iteration $iteration)"

  # Step 5: Wait before next iteration
  echo ""
  echo "Waiting ${ITERATION_WAIT}s for CI to start and potential new feedback..."
  sleep $ITERATION_WAIT
done

if [ $iteration -ge $MAX_ITERATIONS ]; then
  echo ""
  echo "✗ Max iterations ($MAX_ITERATIONS) reached"
  echo "Manual intervention required"
  echo "PR: $PR_URL"
  exit 1
fi
```

### Summary Output

After each iteration:

```markdown
## Iteration ${iteration} Summary

**CI Status**: ✓ Passed
**Comments Addressed**: ${addressedCount}
  - Code fixes: ${codeFixCount}
  - Answered questions: ${questionCount}
  - Resolved as not applicable: ${notApplicableCount}
**Remaining Unresolved**: ${remainingCount}
**Changes Requested**: ${changesRequested ? 'Yes (re-review requested)' : 'No'}

${remainingCount > 0 ? 'Continuing to next iteration...' : 'Ready to proceed to merge!'}
```

## Phase 5: Review Loop (Subagent Quality Gates)

### Skip If Called From /next-task Workflow

```javascript
// Check if called from next-task workflow with completed review
if (workflowState) {
  const state = workflowState.readState();
  const reviewPhase = state?.phases?.history?.find(p => p.phase === 'review-loop');

  if (reviewPhase?.result?.approved) {
    console.log("## Review Loop: SKIPPED");
    console.log("Review already completed and approved by next-task workflow.");
    console.log(`- Review iterations: ${reviewPhase.result.iterations}`);
    console.log(`- Remaining issues: ${reviewPhase.result.remainingIssues?.medium || 0} medium, ${reviewPhase.result.remainingIssues?.low || 0} low`);

    // Skip to Phase 6: Merge
    SKIP_REVIEW = true;
  }
}
```

**When called standalone** (not from next-task), run the full review loop.
**When called from next-task** with `--state-file`, skip review (already done).

### Invoke Specialized Agents (If Not Skipped)

```markdown
Launching 3 review agents for PR #${PR_NUMBER}...
```

Use Task tool to launch agents in parallel:

#### 1. Code Reviewer Agent

```javascript
Task({
  subagent_type: "pr-review-toolkit:code-reviewer",
  prompt: `Review PR #${PR_NUMBER} for code quality, adherence to best practices, and potential bugs.

Focus on changed files only. Provide evidence-based findings with file:line references.

PR URL: ${PR_URL}
Branch: ${CURRENT_BRANCH}
Base: ${MAIN_BRANCH}`
})
```

#### 2. Silent Failure Hunter Agent

```javascript
Task({
  subagent_type: "pr-review-toolkit:silent-failure-hunter",
  prompt: `Review PR #${PR_NUMBER} for silent failures, inadequate error handling, and suppressed errors.

Check for:
- Empty catch blocks without logging
- Swallowed promises
- Missing error propagation
- Generic error messages

PR URL: ${PR_URL}`
})
```

#### 3. Test Analyzer Agent

```javascript
Task({
  subagent_type: "pr-review-toolkit:pr-test-analyzer",
  prompt: `Review PR #${PR_NUMBER} test coverage and quality.

Verify:
- New code has tests
- Edge cases covered
- Test quality (not just presence)
- Integration tests if needed

PR URL: ${PR_URL}`
})
```

### Aggregate Agent Feedback

After all agents complete:

```markdown
## Review Results

**Code Reviewer**: ${CODE_REVIEW_STATUS}
- Issues found: ${CODE_ISSUES_COUNT}
- Critical: ${CODE_CRITICAL_COUNT}

**Silent Failure Hunter**: ${SILENT_FAILURE_STATUS}
- Issues found: ${SILENT_FAILURE_COUNT}
- Potential failures: ${FAILURE_RISK_COUNT}

**Test Analyzer**: ${TEST_STATUS}
- Coverage: ${COVERAGE_PERCENT}%
- Critical gaps: ${TEST_GAPS_COUNT}
```

### Iteration Loop

If issues found:

```javascript
let iteration = 1;
const MAX_ITERATIONS = 3;

while (iteration <= MAX_ITERATIONS) {
  const issues = aggregateAgentFindings();

  if (issues.critical.length === 0 && issues.high.length === 0) {
    console.log("✓ All agents approved");
    break;
  }

  console.log(`\n## Review Iteration ${iteration}`);
  console.log(`Addressing ${issues.critical.length} critical and ${issues.high.length} high priority issues...`);

  // Fix issues
  for (const issue of [...issues.critical, ...issues.high]) {
    implementFix(issue);
  }

  // Commit fixes
  git add .
  git commit -m "fix: address review feedback (iteration ${iteration})"
  git push

  // Re-run agents on changed areas
  const reReviewResult = reRunAgents(changedFiles);

  iteration++;
}

if (issues.critical.length > 0 || issues.high.length > 0) {
  console.log("✗ Failed to address all critical/high issues after ${MAX_ITERATIONS} iterations");
  console.log("Manual intervention required");
  exit 1;
}
```

### Approval Gate

```markdown
## ✓ Quality Gate Passed

All review agents approved:
- Code quality: ✓
- Error handling: ✓
- Test coverage: ✓

Proceeding to merge...
```

## Phase 6: Merge PR

### Verify Merge Requirements

```bash
# Check PR is mergeable
MERGEABLE=$(gh pr view $PR_NUMBER --json mergeable --jq '.mergeable')

if [ "$MERGEABLE" != "MERGEABLE" ]; then
  echo "✗ PR is not mergeable (conflicts or requirements not met)"
  gh pr view $PR_NUMBER
  exit 1
fi
```

### Determine Merge Strategy

```bash
# Use provided strategy or default to squash
STRATEGY=${STRATEGY:-squash}

echo "Merging PR #$PR_NUMBER with strategy: $STRATEGY"
```

### Execute Merge

```bash
# Merge based on strategy
if [ "$STRATEGY" = "squash" ]; then
  gh pr merge $PR_NUMBER --squash --delete-branch
elif [ "$STRATEGY" = "merge" ]; then
  gh pr merge $PR_NUMBER --merge --delete-branch
elif [ "$STRATEGY" = "rebase" ]; then
  gh pr merge $PR_NUMBER --rebase --delete-branch
fi

if [ $? -eq 0 ]; then
  echo "✓ Merged PR #$PR_NUMBER"
else
  echo "✗ Merge failed"
  exit 1
fi
```

### Fetch Latest

```bash
# Switch to main and pull latest
git checkout $MAIN_BRANCH
git pull origin $MAIN_BRANCH

MERGE_SHA=$(git rev-parse HEAD)
echo "✓ Main branch at: $MERGE_SHA"
```

```javascript
// Update state with merge info
updatePhase('merge', {
  merged: true,
  mergeSha: MERGE_SHA,
  strategy: STRATEGY
});

if (workflowState) {
  workflowState.updateState({
    pr: { reviewState: 'merged' },
    git: { currentSha: MERGE_SHA }
  });
}
```

## Phase 7: Deploy to Development (Conditional)

**Skip if `WORKFLOW="single-branch"`**

### Wait for Deployment

Platform-specific deployment monitoring:

#### Railway

```bash
if [ "$DEPLOYMENT" = "railway" ]; then
  echo "Waiting for Railway development deployment..."

  # Get service name (assumes single service, adjust if multiple)
  SERVICE_NAME=$(railway service list --json | jq -r '.[0].name')

  # Monitor deployment
  DEPLOY_ID=$(railway deployment list --service $SERVICE_NAME --json | jq -r '.[0].id')

  while true; do
    STATUS=$(railway deployment get $DEPLOY_ID --json | jq -r '.status')

    if [ "$STATUS" = "SUCCESS" ]; then
      DEV_URL=$(railway domain list --service $SERVICE_NAME --json | jq -r '.[0].domain')
      echo "✓ Deployed to development: https://$DEV_URL"
      break
    elif [ "$STATUS" = "FAILED" ]; then
      echo "✗ Development deployment failed"
      railway logs --deployment $DEPLOY_ID
      exit 1
    fi

    sleep 10
  done
fi
```

#### Vercel

```bash
if [ "$DEPLOYMENT" = "vercel" ]; then
  echo "Waiting for Vercel development deployment..."

  # Get latest deployment
  DEPLOY_URL=$(vercel ls --json | jq -r '.[0].url')

  # Wait for ready status
  while true; do
    STATUS=$(vercel inspect $DEPLOY_URL --json | jq -r '.readyState')

    if [ "$STATUS" = "READY" ]; then
      echo "✓ Deployed to development: https://$DEPLOY_URL"
      DEV_URL="https://$DEPLOY_URL"
      break
    elif [ "$STATUS" = "ERROR" ]; then
      echo "✗ Development deployment failed"
      vercel logs $DEPLOY_URL
      exit 1
    fi

    sleep 10
  done
fi
```

#### Netlify

```bash
if [ "$DEPLOYMENT" = "netlify" ]; then
  echo "Waiting for Netlify development deployment..."

  # Get site ID
  SITE_ID=$(netlify status --json | jq -r '.site_id')

  # Get latest deploy
  DEPLOY_ID=$(netlify api listSiteDeploys --data "{ \"site_id\": \"$SITE_ID\" }" | jq -r '.[0].id')

  while true; do
    STATUS=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.state')

    if [ "$STATUS" = "ready" ]; then
      DEV_URL=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.deploy_ssl_url')
      echo "✓ Deployed to development: $DEV_URL"
      break
    elif [ "$STATUS" = "error" ]; then
      echo "✗ Development deployment failed"
      exit 1
    fi

    sleep 10
  done
fi
```

#### Generic / Unknown

```bash
if [ -z "$DEPLOYMENT" ] || [ "$DEPLOYMENT" = "null" ]; then
  echo "No deployment platform detected"
  echo "Assuming successful merge to $MAIN_BRANCH means deployment"
  DEV_URL="N/A"
fi
```

## Phase 8: Validate Development (Conditional)

**Skip if `WORKFLOW="single-branch"`**

### Smoke Tests

```bash
echo "Running smoke tests on development..."

# Wait for deployment to stabilize
sleep 30

# Basic health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $DEV_URL/health || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
  echo "✓ Health check passed: $HTTP_STATUS"
else
  echo "✗ Health check failed: $HTTP_STATUS"
  echo "Investigate deployment issues before proceeding to production"
  exit 1
fi

# Check for error logs (last 5 minutes)
echo "Checking logs for errors..."

if [ "$DEPLOYMENT" = "railway" ]; then
  ERROR_COUNT=$(railway logs --tail 100 | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "vercel" ]; then
  ERROR_COUNT=$(vercel logs $DEV_URL --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "netlify" ]; then
  ERROR_COUNT=$(netlify logs --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
else
  ERROR_COUNT=0
fi

if [ "$ERROR_COUNT" -gt 10 ]; then
  echo "✗ High error rate detected: $ERROR_COUNT errors in last 5 minutes"
  echo "Review logs before proceeding to production"
  exit 1
else
  echo "✓ Error rate acceptable: $ERROR_COUNT errors"
fi
```

### Critical Path Tests

If project has specific smoke test script:

```bash
# Check for smoke test script
if jq -e '.scripts["smoke-test"]' package.json > /dev/null 2>&1; then
  echo "Running project smoke tests..."

  # Set target URL
  export SMOKE_TEST_URL=$DEV_URL

  # Run smoke tests
  $PACKAGE_MGR run smoke-test

  if [ $? -eq 0 ]; then
    echo "✓ Smoke tests passed"
  else
    echo "✗ Smoke tests failed"
    exit 1
  fi
fi
```

### Validation Summary

```markdown
## Development Validation ✓

**URL**: ${DEV_URL}
**Health Check**: ✓ ${HTTP_STATUS}
**Error Rate**: ✓ ${ERROR_COUNT} errors
**Smoke Tests**: ✓ Passed

Development environment is healthy. Proceeding to production...
```

## Phase 9: Deploy to Production (Conditional)

**Skip if `WORKFLOW="single-branch"`**

### Merge to Production Branch

```bash
echo "Merging $MAIN_BRANCH → $PROD_BRANCH..."

# Checkout production branch
git checkout $PROD_BRANCH
git pull origin $PROD_BRANCH

# Merge main into production
git merge $MAIN_BRANCH --no-edit

if [ $? -ne 0 ]; then
  echo "✗ Merge to production failed (conflicts)"
  git merge --abort
  exit 1
fi

# Push to production
git push origin $PROD_BRANCH

if [ $? -eq 0 ]; then
  PROD_SHA=$(git rev-parse HEAD)
  echo "✓ Production branch at: $PROD_SHA"
else
  echo "✗ Push to production failed"
  exit 1
fi
```

### Wait for Production Deployment

Same platform-specific logic as Phase 7, but for production environment:

```bash
echo "Waiting for production deployment..."

# Platform-specific deployment monitoring
# (Similar to Phase 7 but targeting production)

if [ "$DEPLOYMENT" = "railway" ]; then
  # Monitor production service deployment
  # ...
elif [ "$DEPLOYMENT" = "vercel" ]; then
  # Monitor production deployment
  # ...
fi

echo "✓ Deployed to production: $PROD_URL"
```

## Phase 10: Validate Production (Conditional)

**Skip if `WORKFLOW="single-branch"`**

### Conservative Validation

```bash
echo "Validating production deployment..."

# Wait longer for production to stabilize
sleep 60

# Health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
  echo "✓ Production health check: $HTTP_STATUS"
else
  echo "✗ Production health check failed: $HTTP_STATUS"
  echo "INITIATING ROLLBACK"
  echo "WARNING: This will force push to $PROD_BRANCH to revert to previous version"

  # Rollback mechanism with --force-with-lease for safety
  git checkout $PROD_BRANCH
  git reset --hard HEAD~1

  # Use --force-with-lease to prevent overwriting unexpected remote changes
  if ! git push --force-with-lease origin $PROD_BRANCH; then
    echo "✗ Force push failed - remote may have unexpected changes"
    echo "Manual intervention required"
    exit 1
  fi

  echo "Rolled back production to previous version"
  exit 1
fi

# Monitor error logs
echo "Monitoring production logs..."

if [ "$DEPLOYMENT" = "railway" ]; then
  ERROR_COUNT=$(railway logs --tail 100 | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "vercel" ]; then
  ERROR_COUNT=$(vercel logs $PROD_URL --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
fi

if [ "$ERROR_COUNT" -gt 20 ]; then
  echo "✗ CRITICAL: High error rate in production: $ERROR_COUNT errors"
  echo "INITIATING ROLLBACK"
  echo "WARNING: This will force push to $PROD_BRANCH to revert to previous version"

  # Rollback with --force-with-lease for safety
  git checkout $PROD_BRANCH
  git reset --hard HEAD~1

  if ! git push --force-with-lease origin $PROD_BRANCH; then
    echo "✗ Force push failed - remote may have unexpected changes"
    echo "Manual intervention required"
    exit 1
  fi

  exit 1
else
  echo "✓ Production error rate acceptable: $ERROR_COUNT errors"
fi
```

### Production Smoke Tests

```bash
# If production smoke tests exist
if jq -e '.scripts["smoke-test:prod"]' package.json > /dev/null 2>&1; then
  echo "Running production smoke tests..."

  export SMOKE_TEST_URL=$PROD_URL
  $PACKAGE_MGR run smoke-test:prod

  if [ $? -ne 0 ]; then
    echo "✗ Production smoke tests failed"
    echo "INITIATING ROLLBACK"
    echo "WARNING: This will force push to $PROD_BRANCH to revert to previous version"

    git checkout $PROD_BRANCH
    git reset --hard HEAD~1

    if ! git push --force-with-lease origin $PROD_BRANCH; then
      echo "✗ Force push failed - remote may have unexpected changes"
      echo "Manual intervention required"
      exit 1
    fi

    exit 1
  fi
fi
```

### Rollback Mechanism

If any production validation fails:

```bash
rollback_production() {
  echo "========================================"
  echo "ROLLBACK INITIATED"
  echo "========================================"
  echo "WARNING: This will force push to $PROD_BRANCH to revert to previous version"

  # Revert production branch
  git checkout $PROD_BRANCH
  git reset --hard HEAD~1

  # Use --force-with-lease to prevent overwriting unexpected remote changes
  if ! git push --force-with-lease origin $PROD_BRANCH; then
    echo "✗ Force push failed - remote may have unexpected changes"
    echo "Manual intervention required"
    exit 1
  fi

  echo "✓ Rolled back production to previous deployment"
  echo "Previous version will redeploy automatically"

  # Wait for rollback deployment
  sleep 30

  # Verify rollback succeeded
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✓ Rollback successful, production is healthy"
  else
    echo "⚠ Rollback deployed but health check unclear"
    echo "Manual investigation required"
  fi

  exit 1
}
```

## Phase 11: Cleanup

### Worktree Cleanup

```bash
# Check for worktrees
WORKTREES=$(git worktree list --porcelain | grep -c "worktree")

if [ "$WORKTREES" -gt 1 ]; then
  echo "Cleaning up worktrees..."

  # Remove all worktrees except main
  git worktree list --porcelain | grep "worktree" | grep -v "$(git rev-parse --show-toplevel)" | while read -r wt; do
    WORKTREE_PATH=$(echo $wt | awk '{print $2}')
    git worktree remove $WORKTREE_PATH --force 2>/dev/null || true
  done

  echo "✓ Worktrees cleaned up"
fi
```

### Remove Task from Registry (Main Repo)

When cleanup completes, remove the task from the main repo's tasks.json registry:

```javascript
const fs = require('fs');

function removeTaskFromRegistry(taskId, mainRepoPath) {
  const registryPath = path.join(mainRepoPath, '.claude', 'tasks.json');

  if (!fs.existsSync(registryPath)) {
    console.log('No tasks.json registry found, skipping');
    return;
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const originalCount = registry.tasks.length;

  // Remove the completed task
  registry.tasks = registry.tasks.filter(t => t.id !== taskId);

  if (registry.tasks.length < originalCount) {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`✓ Removed task #${taskId} from tasks.json registry`);
  } else {
    console.log(`Task #${taskId} not found in registry (may have been cleaned already)`);
  }
}

// Get main repo path from workflow state
if (workflowState) {
  const state = workflowState.readState();
  const mainRepoPath = state?.git?.mainRepoPath || process.cwd();
  const taskId = state?.task?.id;

  if (taskId) {
    removeTaskFromRegistry(taskId, mainRepoPath);
  }
}
```

### Linear Integration (Optional)

```bash
# Check if Linear integration detected
LINEAR_DETECTED="false"
if gh pr view $PR_NUMBER --json body | jq -r '.body' | grep -q "linear.app"; then
  LINEAR_DETECTED="true"

  echo "Linear integration detected"

  # Extract Linear issue ID from PR body
  LINEAR_ID=$(gh pr view $PR_NUMBER --json body | jq -r '.body' | grep -oP 'linear.app/issue/\K[A-Z]+-\d+')

  if [ -n "$LINEAR_ID" ]; then
    echo "Associated Linear issue: $LINEAR_ID"
    echo "Update status manually in Linear: https://linear.app/issue/$LINEAR_ID"
  fi
fi
```

### PLAN.md Update (Optional)

```bash
# Check if PLAN.md exists
if [ -f "PLAN.md" ]; then
  echo "Updating PLAN.md..."

  # Mark related tasks as complete
  # This is project-specific, provide guidance:
  echo "Consider updating PLAN.md to mark completed tasks:"
  echo "- Search for references to PR #$PR_NUMBER"
  echo "- Mark related tasks as [x] complete"
  echo "- Update status sections"
fi
```

### Local Branch Cleanup

```bash
# Switch back to main
git checkout $MAIN_BRANCH

# Feature branch already deleted by gh pr merge --delete-branch
echo "✓ Feature branch deleted on remote"

# Delete local branch if exists
if git branch --list $CURRENT_BRANCH | grep -q $CURRENT_BRANCH; then
  git branch -D $CURRENT_BRANCH
  echo "✓ Deleted local branch: $CURRENT_BRANCH"
fi
```

## Phase 12: Completion Report

```markdown
# 🚀 Deployment Complete

## Pull Request
**Number**: #${PR_NUMBER}
**Title**: ${PR_TITLE}
**URL**: ${PR_URL}
**Status**: Merged to ${MAIN_BRANCH}

## Review Results
- **Code Quality**: ✓ Approved
- **Error Handling**: ✓ Approved
- **Test Coverage**: ✓ Approved
- **CI Status**: ✓ Passed

## Deployments

${WORKFLOW === 'dev-prod' ? `
### Development
**URL**: ${DEV_URL}
**Status**: ✓ Healthy
**Validation**: ✓ Passed

### Production
**URL**: ${PROD_URL}
**Status**: ✓ Healthy
**Validation**: ✓ Passed
` : `
### Production
**URL**: ${PROD_URL or "Deployed to " + MAIN_BRANCH}
**Status**: ✓ Deployed
`}

## Verification
- Health Checks: ✓ Passed
- Error Monitoring: ✓ Acceptable
- Smoke Tests: ✓ Passed

## Commits Shipped
${git log --oneline ${MAIN_BRANCH}~3..${MAIN_BRANCH}}

## Timeline
- PR Created: ${PR_CREATED_TIME}
- CI Completed: ${CI_COMPLETED_TIME}
- Merged: ${MERGE_TIME}
${WORKFLOW === 'dev-prod' ? `- Development Deploy: ${DEV_DEPLOY_TIME}\n- Production Deploy: ${PROD_DEPLOY_TIME}` : ''}
- Total Duration: ${TOTAL_DURATION}

---

✓ Successfully shipped to production!
```

```javascript
// Update state with completion
if (workflowState) {
  workflowState.completePhase({
    shipped: true,
    prNumber: PR_NUMBER,
    mergeSha: MERGE_SHA,
    devUrl: DEV_URL,
    prodUrl: PROD_URL,
    duration: TOTAL_DURATION
  });
}
```

## Error Handling

### GitHub CLI Not Available

```markdown
ERROR: GitHub CLI (gh) not found

Install: https://cli.github.com

Or use package manager:
  macOS: brew install gh
  Windows: winget install GitHub.cli
  Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

Then authenticate:
  gh auth login
```

### CI Failure

```markdown
✗ CI checks failed for PR #${PR_NUMBER}

View details:
  ${CI_URL}

Fix the failing tests/checks and push again.
The /ship command will resume from Phase 4 (CI monitoring).

To retry:
  git push
  /ship
```

### Merge Conflicts

```markdown
✗ Cannot merge PR #${PR_NUMBER}: conflicts with ${MAIN_BRANCH}

Resolve conflicts:
  git fetch origin
  git merge origin/${MAIN_BRANCH}
  # Resolve conflicts
  git add .
  git commit
  git push

Then retry:
  /ship
```

### Deployment Failure

```markdown
✗ Deployment failed

${WORKFLOW === 'dev-prod' ? 'Development' : 'Production'} deployment did not succeed.

Check deployment logs:
  ${DEPLOYMENT === 'railway' ? 'railway logs' : ''}
  ${DEPLOYMENT === 'vercel' ? 'vercel logs' : ''}
  ${DEPLOYMENT === 'netlify' ? 'netlify logs' : ''}

Once fixed, deployment will retry automatically.
```

### Production Validation Failure with Rollback

```markdown
✗ Production validation failed

ROLLBACK INITIATED

Production has been rolled back to previous version.
Previous deployment: ${PREVIOUS_SHA}

Issues detected:
  ${VALIDATION_ISSUES}

Fix the issues and try shipping again:
  /ship
```

## Important Notes

- Uses platform detection from `lib/platform/detect-platform.js`
- Uses tool verification from `lib/platform/verify-tools.js`
- Requires GitHub CLI (gh) for PR workflow
- Auto-adapts to single-branch or multi-branch workflow
- Platform-specific CI and deployment monitoring
- Automatic rollback on production failures
- Respects project conventions (commit style, PR format)
- Context-efficient (optimized git commands)

## Success Criteria

- ✅ All 12 phases implemented
- ✅ Conditional execution (single vs multi-branch)
- ✅ Subagent quality gates with iteration
- ✅ Platform-specific CI/CD monitoring (GitHub Actions, GitLab CI, CircleCI)
- ✅ Platform-specific deployment monitoring (Railway, Vercel, Netlify)
- ✅ Rollback mechanism on production failure
- ✅ Graceful degradation without CI/deployment
- ✅ Context-efficient commands

Begin Phase 1 now.
