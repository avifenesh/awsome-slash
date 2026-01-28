---
description: Validate task completion and approve for shipping. Can be used standalone or called by the workflow. Runs autonomous validation checks.
argument-hint: "[--task-id ID] [--verbose]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Grep, Glob
model: sonnet
---

# /delivery-approval - Delivery Validation

Validate that the current work is complete and ready to ship.
This command runs the same validation as the workflow's delivery-validator agent.

## Arguments

- `--task-id ID`: Specify task ID to validate against (default: from workflow state)
- `--verbose`: Show detailed output for each check

## Parse Arguments

```javascript
const args = $ARGUMENTS.split(' ').filter(Boolean);
const verbose = args.includes('--verbose');
const taskIdArg = args.find(a => a.startsWith('--task-id'));
const taskId = taskIdArg ? args[args.indexOf(taskIdArg) + 1] : null;
```

## Phase 1: Get Context

```javascript
const workflowState = require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/state/workflow-state.js');

let task;
let changedFiles;

// Try to get from workflow state first
const state = workflowState.readState();
if (state?.task) {
  task = state.task;
} else if (taskId) {
  // Fetch task from GitHub
  task = await fetchGitHubIssue(taskId);
} else {
  // Get from recent commit message
  task = await inferTaskFromCommits();
}

// Get changed files
changedFiles = (await exec('git diff --name-only origin/main..HEAD')).split('\n').filter(Boolean);
```

## Phase 2: Run Validation Checks

### Check 1: Git State

```bash
# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain)
if [ -n "$UNCOMMITTED" ]; then
  echo "UNCOMMITTED_CHANGES=true"
  echo "$UNCOMMITTED"
fi

# Check if ahead of remote
AHEAD=$(git rev-list --count origin/main..HEAD)
echo "COMMITS_AHEAD=$AHEAD"

# Check branch name
BRANCH=$(git branch --show-current)
echo "BRANCH=$BRANCH"
```

### Check 2: Tests Pass

```bash
# Detect and run tests
if [ -f "package.json" ]; then
  if grep -q '"test"' package.json; then
    echo "Running npm test..."
    npm test 2>&1
    TEST_RESULT=$?
    echo "TEST_RESULT=$TEST_RESULT"
  else
    echo "NO_TEST_SCRIPT=true"
  fi
elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
  echo "Running pytest..."
  pytest -v 2>&1
  TEST_RESULT=$?
  echo "TEST_RESULT=$TEST_RESULT"
elif [ -f "Cargo.toml" ]; then
  echo "Running cargo test..."
  cargo test 2>&1
  TEST_RESULT=$?
  echo "TEST_RESULT=$TEST_RESULT"
elif [ -f "go.mod" ]; then
  echo "Running go test..."
  go test ./... -v 2>&1
  TEST_RESULT=$?
  echo "TEST_RESULT=$TEST_RESULT"
fi
```

### Check 3: Build Passes

```bash
# Detect and run build
if [ -f "package.json" ] && grep -q '"build"' package.json; then
  echo "Running npm run build..."
  npm run build 2>&1
  BUILD_RESULT=$?
  echo "BUILD_RESULT=$BUILD_RESULT"
elif [ -f "Cargo.toml" ]; then
  echo "Running cargo build..."
  cargo build --release 2>&1
  BUILD_RESULT=$?
  echo "BUILD_RESULT=$BUILD_RESULT"
elif [ -f "go.mod" ]; then
  echo "Running go build..."
  go build ./... 2>&1
  BUILD_RESULT=$?
  echo "BUILD_RESULT=$BUILD_RESULT"
else
  echo "NO_BUILD_SCRIPT=true"
  BUILD_RESULT=0
fi
```

### Check 4: Lint Passes

```bash
# Run linter if available
if [ -f "package.json" ] && grep -q '"lint"' package.json; then
  echo "Running npm run lint..."
  npm run lint 2>&1
  LINT_RESULT=$?
  echo "LINT_RESULT=$LINT_RESULT"
elif [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
  echo "Running eslint..."
  npx eslint . 2>&1
  LINT_RESULT=$?
  echo "LINT_RESULT=$LINT_RESULT"
else
  echo "NO_LINTER=true"
  LINT_RESULT=0
fi
```

### Check 5: Type Check (TypeScript)

```bash
if [ -f "tsconfig.json" ]; then
  echo "Running tsc --noEmit..."
  npx tsc --noEmit 2>&1
  TYPE_RESULT=$?
  echo "TYPE_RESULT=$TYPE_RESULT"
else
  echo "NO_TYPESCRIPT=true"
  TYPE_RESULT=0
fi
```

## Phase 3: Check Task Requirements

```javascript
async function checkRequirements(task, changedFiles) {
  if (!task) {
    return { passed: true, reason: 'No task specified, skipping requirements check' };
  }

  const requirements = extractRequirements(task.description || task.body || '');

  if (requirements.length === 0) {
    return { passed: true, reason: 'No specific requirements found in task' };
  }

  // Analyze changed files for each requirement
  const results = [];
  for (const req of requirements) {
    const evidence = await findEvidence(req, changedFiles);
    results.push({
      requirement: req,
      implemented: evidence.found,
      evidence: evidence.details
    });
  }

  const allMet = results.every(r => r.implemented);
  return {
    passed: allMet,
    results,
    reason: allMet ? 'All requirements met' : 'Some requirements not implemented'
  };
}
```

## Phase 4: Aggregate Results

```javascript
const checks = {
  gitState: {
    passed: !UNCOMMITTED_CHANGES,
    uncommitted: UNCOMMITTED_CHANGES,
    commitsAhead: COMMITS_AHEAD,
    branch: BRANCH
  },
  tests: {
    passed: TEST_RESULT === 0,
    exitCode: TEST_RESULT
  },
  build: {
    passed: BUILD_RESULT === 0,
    exitCode: BUILD_RESULT
  },
  lint: {
    passed: LINT_RESULT === 0,
    exitCode: LINT_RESULT
  },
  typeCheck: {
    passed: TYPE_RESULT === 0,
    exitCode: TYPE_RESULT
  },
  requirements: await checkRequirements(task, changedFiles)
};

const allPassed = Object.values(checks).every(c => c.passed);
const failedChecks = Object.entries(checks)
  .filter(([_, v]) => !v.passed)
  .map(([k, _]) => k);
```

## Phase 5: Output Results

### Summary Report

```markdown
## Delivery Validation Report

**Task**: ${task?.title || 'N/A'}
**Branch**: ${BRANCH}
**Commits ahead of main**: ${COMMITS_AHEAD}

### Validation Results

| Check | Status | Details |
|-------|--------|---------|
| Git State | ${checks.gitState.passed ? '✓' : '✗'} | ${checks.gitState.uncommitted ? 'Uncommitted changes' : 'Clean'} |
| Tests | ${checks.tests.passed ? '✓' : '✗'} | Exit code: ${checks.tests.exitCode} |
| Build | ${checks.build.passed ? '✓' : '✗'} | Exit code: ${checks.build.exitCode} |
| Lint | ${checks.lint.passed ? '✓' : '✗'} | Exit code: ${checks.lint.exitCode} |
| Type Check | ${checks.typeCheck.passed ? '✓' : '✗'} | Exit code: ${checks.typeCheck.exitCode} |
| Requirements | ${checks.requirements.passed ? '✓' : '✗'} | ${checks.requirements.reason} |

### Overall Status

${allPassed ?
  '## ✓ APPROVED\nAll validation checks passed. Ready to ship!' :
  `## ✗ NOT APPROVED\nFailed checks: ${failedChecks.join(', ')}`}

${!allPassed ? `
### Fix Required

${failedChecks.map(check => {
  switch(check) {
    case 'gitState': return '- Commit or stash uncommitted changes';
    case 'tests': return '- Fix failing tests';
    case 'build': return '- Fix build errors';
    case 'lint': return '- Fix linting errors';
    case 'typeCheck': return '- Fix TypeScript errors';
    case 'requirements': return '- Implement missing requirements';
  }
}).join('\n')}
` : ''}
```

### JSON Output (for scripting)

```json
{
  "approved": ${allPassed},
  "task": {
    "id": "${task?.id || 'N/A'}",
    "title": "${task?.title || 'N/A'}"
  },
  "checks": {
    "gitState": ${JSON.stringify(checks.gitState)},
    "tests": ${JSON.stringify(checks.tests)},
    "build": ${JSON.stringify(checks.build)},
    "lint": ${JSON.stringify(checks.lint)},
    "typeCheck": ${JSON.stringify(checks.typeCheck)},
    "requirements": ${JSON.stringify(checks.requirements)}
  },
  "failedChecks": ${JSON.stringify(failedChecks)},
  "summary": "${allPassed ? 'All checks passed' : `Failed: ${failedChecks.join(', ')}`}"
}
```

## Examples

```bash
# Basic validation
/delivery-approval

# With verbose output
/delivery-approval --verbose

# For specific task
/delivery-approval --task-id 142

# Combined
/delivery-approval --task-id 142 --verbose
```

## Integration with Workflow

When called from the next-task workflow:
1. Task context is read from workflow state
2. Results are written back to workflow state
3. Workflow continues to ship phase if approved

When called standalone:
1. Attempts to infer task from commits
2. Runs all validation checks
3. Reports results but doesn't modify workflow state

## Success Criteria

- Runs all validation checks (tests, build, lint, types)
- Checks task requirements if available
- Provides clear pass/fail determination
- Shows actionable fixes for failures
- Works both standalone and in workflow context

