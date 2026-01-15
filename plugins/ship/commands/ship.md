---
description: Complete PR workflow from commit to production with validation
argument-hint: "[--strategy STRATEGY] [--skip-tests] [--dry-run] [--state-file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task
---

# /ship - Complete PR Workflow

End-to-end workflow: commit → PR → CI → review → merge → deploy → validate → production.

Auto-adapts to your project's CI platform, deployment platform, and branch strategy.

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
const stateFileIdx = args.indexOf('--state-file');
const stateFilePath = stateFileIdx >= 0 ? args[stateFileIdx + 1] : null;

let workflowState = null;
if (stateFilePath) {
  workflowState = require('${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js');
  const state = workflowState.readState();

  if (state) {
    console.log(`Workflow: ${state.workflow.id}`);
    console.log(`Task: #${state.task?.id} - ${state.task?.title}`);
    console.log(`Current phase: ${state.phases?.current}`);

    // Skip phases already completed
    const completedPhases = state.phases?.history?.map(h => h.phase) || [];
    console.log(`Completed phases: ${completedPhases.join(', ')}`);
  }
}

// Helper to update state at each phase
function updatePhase(phase, result) {
  if (workflowState) {
    workflowState.startPhase(phase);
    if (result) {
      workflowState.completePhase(result);
    }
  }
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

## Phase 4: Wait for CI

Platform-adaptive CI monitoring:

### GitHub Actions

```bash
if [ "$CI_PLATFORM" = "github-actions" ]; then
  echo "Waiting for GitHub Actions CI..."

  # Get latest run
  RUN_ID=$(gh run list --branch $CURRENT_BRANCH --limit 1 --json databaseId --jq '.[0].databaseId')

  # Watch run
  gh run watch $RUN_ID --exit-status
  CI_STATUS=$?

  if [ $CI_STATUS -eq 0 ]; then
    echo "✓ CI passed"
  else
    echo "✗ CI failed"
    echo "View logs: $(gh run view $RUN_ID --web)"
    exit 1
  fi
fi
```

```javascript
// Update state with CI status
updatePhase('ci-wait', {
  ciPlatform: CI_PLATFORM,
  passed: CI_STATUS === 0
});

if (workflowState) {
  workflowState.updateState({
    pr: { ciStatus: CI_STATUS === 0 ? 'passed' : 'failed' }
  });
}
```

### GitLab CI

```bash
if [ "$CI_PLATFORM" = "gitlab-ci" ]; then
  echo "Waiting for GitLab CI..."

  # Create secure curl config to avoid token exposure in process list
  CURL_CONFIG=$(mktemp)
  chmod 600 "$CURL_CONFIG"
  echo "header = \"PRIVATE-TOKEN: $GITLAB_TOKEN\"" > "$CURL_CONFIG"
  trap "rm -f \"$CURL_CONFIG\"" EXIT

  # Poll pipeline status
  while true; do
    STATUS=$(curl -s -K "$CURL_CONFIG" \
      "https://gitlab.com/api/v4/projects/$PROJECT_ID/pipelines?ref=$CURRENT_BRANCH&per_page=1" \
      | jq -r '.[0].status')

    if [ "$STATUS" = "success" ]; then
      echo "✓ CI passed"
      break
    elif [ "$STATUS" = "failed" ]; then
      echo "✗ CI failed"
      rm -f "$CURL_CONFIG"
      exit 1
    fi

    sleep 10
  done
  rm -f "$CURL_CONFIG"
fi
```

### CircleCI / Other

```bash
if [ "$CI_PLATFORM" = "circleci" ] || [ "$CI_PLATFORM" = "jenkins" ] || [ "$CI_PLATFORM" = "travis" ]; then
  echo "Monitoring $CI_PLATFORM CI..."

  # Use gh pr checks for generic monitoring
  while true; do
    CHECKS=$(gh pr checks $PR_NUMBER --json state,conclusion)

    PENDING=$(echo $CHECKS | jq '[.[] | select(.state=="PENDING")] | length')
    FAILED=$(echo $CHECKS | jq '[.[] | select(.conclusion=="FAILURE")] | length')

    if [ "$FAILED" -gt 0 ]; then
      echo "✗ CI checks failed"
      gh pr checks $PR_NUMBER
      exit 1
    elif [ "$PENDING" -eq 0 ]; then
      echo "✓ All CI checks passed"
      break
    fi

    echo "Waiting for CI... ($PENDING pending)"
    sleep 15
  done
fi
```

### No CI Platform

```bash
if [ "$CI_PLATFORM" = "null" ] || [ -z "$CI_PLATFORM" ]; then
  echo "No CI platform detected"

  if [ "$SKIP_TESTS" != "true" ]; then
    echo "Running tests locally..."

    if [ "$PROJECT_TYPE" = "nodejs" ]; then
      $PACKAGE_MGR test
    elif [ "$PROJECT_TYPE" = "python" ]; then
      pytest
    elif [ "$PROJECT_TYPE" = "rust" ]; then
      cargo test
    elif [ "$PROJECT_TYPE" = "go" ]; then
      go test ./...
    fi

    if [ $? -eq 0 ]; then
      echo "✓ Tests passed locally"
    else
      echo "✗ Tests failed"
      exit 1
    fi
  else
    echo "⚠ Skipping tests (--skip-tests provided)"
  fi
fi
```

## Phase 5: Review Loop (Subagent Quality Gates)

Multi-agent code review with approval gates:

### Invoke Specialized Agents

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
