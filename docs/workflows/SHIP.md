# /ship Workflow

Complete technical reference for the `/ship` workflow.

**TL;DR:** Takes current branch to merged PR. Auto-detects CI/deploy platforms. Waits for reviewers, addresses every comment. Rollback on production failure.

---

## Quick Navigation

| Section | Jump to |
|---------|---------|
| [Workflow Phases](#workflow-phases) | All phases from commit to merge |
| [Review Comment Handling](#review-comment-handling) | How every comment gets addressed |
| [Error Handling](#error-handling) | Exit codes and recovery |
| [Integration with /next-task](#integration-with-next-task) | What changes when called from workflow |
| [Platform Detection Details](#platform-detection-details) | CI and deploy detection |
| [Example Flow](#example-flow) | Full walkthrough |

**Related docs:**
- [/next-task Workflow](./NEXT-TASK.md) - The full workflow that calls /ship
- [Agent Reference](../reference/AGENTS.md) - ci-monitor, ci-fixer details
- [MCP Tools](../reference/MCP-TOOLS.md) - workflow_status, workflow_abort

---

## Overview

`/ship` takes your current branch from uncommitted changes (or already committed) to a merged PR with all CI checks passing and all review comments addressed.

**Why this design:** Shipping isn't just "create PR." It's monitoring CI, waiting for reviewers, reading comments, deciding how to respond, pushing fixes, waiting again. This workflow handles all of that. Every comment from every reviewer gets addressed—either fixed, explained, or marked as out of scope with a reason. You start `/ship` and check back when it's merged.

---

## Workflow Phases

### Phase 1: Pre-flight Checks

**Platform Detection:**

The workflow detects your project setup:

| Detection | How |
|-----------|-----|
| CI Platform | Checks for `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/config.yml`, `Jenkinsfile`, `.travis.yml` |
| Deploy Platform | Checks for `railway.json`, `vercel.json`, `netlify.toml`, `fly.toml`, `render.yaml` |
| Project Type | Checks for `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml` |
| Branch Strategy | Single-branch (main only) or multi-branch (dev + prod) |
| Main Branch | `main` or `master` |

**Tool Verification:**

Checks 25+ tools in parallel:
- Required: `git`, `gh` (GitHub CLI)
- Optional: `node`, `npm`, `docker`, `railway`, `vercel`, etc.

Fails if `gh` is not available (required for PR workflow).

**Git Status:**
- Must be on a feature branch (not main/master)
- Checks for uncommitted changes

---

### Phase 2: Commit

Only runs if there are uncommitted changes.

```bash
# Stage files (excluding .env and other secrets)
git add [files...]

# Create semantic commit message
git commit -m "type(scope): subject"
```

Commit message is generated based on changes:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for restructuring
- `test:` for test changes

---

### Phase 3: Push & Create PR

```bash
git push -u origin $BRANCH_NAME

gh pr create --base main --title "..." --body "..."
```

PR body includes:
- Summary of changes
- Files modified
- Test coverage status
- Link to related issue (if from `/next-task`)

---

### Phase 4: CI Monitor Loop

Polls CI status every 15 seconds:

```bash
gh pr checks $PR_NUMBER --json name,state,conclusion
```

**States handled:**
- `pending`, `queued`, `in_progress` - Keep waiting
- `success` - Continue to next phase
- `failure` - Invoke ci-fixer agent to diagnose and fix

**Timeout:** 30 minutes max wait

---

### Phase 5: Review Wait

Waits 3 minutes (configurable via `SHIP_INITIAL_WAIT` env var) for auto-reviewers to post comments.

**Expected reviewers:**
- GitHub Copilot
- Claude (Anthropic)
- Gemini (Google)
- Codex (OpenAI)

---

### Phase 6: Address Review Comments

**Query unresolved threads:**

```graphql
query {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          path
          line
          diffHunk
          comments { body }
        }
      }
    }
  }
}
```

**For each unresolved thread:**

1. Classify the comment:
   - `code_fix_required` - Needs code change
   - `style_suggestion` - Style/formatting issue
   - `question` - Needs explanation
   - `false_positive` - Incorrect finding
   - `not_relevant` - Out of scope

2. Handle based on classification:
   - Code fixes: Use ci-fixer agent to implement
   - Style fixes: Apply and commit
   - Questions: Reply with explanation
   - False positives: Reply explaining why, then resolve
   - Not relevant: Reply explaining scope, then resolve

3. Resolve thread via GraphQL mutation:

```graphql
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}
```

4. If changes were made: push and wait for CI again

**Loop continues** until all threads resolved (max 10 iterations).

---

### Phase 7: Internal Review (Standalone Only)

**Skipped when called from `/next-task`** (review already completed by Phase 9 review loop).

When standalone, launches core review passes in parallel:
- Code quality (includes error handling)
- Security
- Performance
- Test coverage

Iterates until no non-false-positive issues remain (max 3 iterations).

---

### Phase 8: Merge

**Pre-merge verification:**

1. Check `MERGEABLE` status via `gh pr view`
2. Count unresolved threads (must be 0)
3. Verify CI passing

**Merge execution:**

```bash
gh pr merge $PR_NUMBER --squash --delete-branch
git checkout main
git pull origin main
```

Merge strategy options:
- `squash` (default) - Combines all commits
- `merge` - Creates merge commit
- `rebase` - Rebases onto main

---

### Phase 9-10: Deploy & Validate (Multi-branch Only)

Only runs if project uses multi-branch workflow (dev + prod branches).

**Development Deploy:**
1. Merge main to dev branch
2. Wait for deployment
3. Health check: `curl $DEV_URL/health`
4. Error monitoring: Check for new errors in logs

**Production Deploy:**
1. Merge main to prod branch
2. Wait for deployment
3. Health check: `curl $PROD_URL/health`
4. Error monitoring: Check error rate

**Rollback on failure:**

```bash
git checkout prod
git reset --hard HEAD~1
git push --force-with-lease origin prod
```

Uses `--force-with-lease` for safety (prevents overwriting unexpected changes).

---

### Phase 11: Cleanup

- Removes worktree directory (if from `/next-task`)
- Closes GitHub issue with completion comment
- Removes task from `tasks.json`
- Deletes local feature branch

---

### Phase 12: Completion Report

Outputs summary:
- PR number and URL
- Review results
- CI status
- Deployment URLs (if applicable)

---

## Review Comment Handling

Every comment from every reviewer gets addressed. No exceptions.

**Categorization logic:**

| Category | When | Action |
|----------|------|--------|
| `code_fix_required` | Comment suggests code change | Implement fix |
| `style_suggestion` | Formatting, naming, conventions | Apply fix |
| `question` | Asks about approach or design | Reply with explanation |
| `false_positive` | Incorrect finding | Explain why, resolve |
| `not_relevant` | Out of scope for this PR | Explain scope, resolve |

**Example handling:**

```
Comment: "This function could use destructuring"
Category: style_suggestion
Action: Apply destructuring, commit, push

Comment: "Why did you use a Map here instead of an object?"
Category: question
Action: Reply explaining Map benefits for this case, resolve

Comment: "Potential SQL injection"
Category: code_fix_required (but actually false positive)
Action: Reply explaining parameterized query is used, resolve
```

---

## Error Handling

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Success - PR merged |
| 1 | General failure |
| 2 | CI failure (retryable) |
| 3 | Review timeout |
| 4 | Deployment failure |
| 5 | Rollback triggered |

**Recovery procedures:**

| Error | Recovery |
|-------|----------|
| CI failure | Fix issue, commit, push, run `/ship` again |
| Merge conflict | Resolve conflict, commit, push, run `/ship` |
| Max iterations | Manually address remaining comments, run `/ship` |
| Deployment failure | Rollback happens automatically, investigate logs |

**Debug mode:**

```bash
SHIP_DEBUG=1 /ship
```

Outputs detailed logging for each phase.

---

## Integration with /next-task

When called from `/next-task` (via `--state-file` argument):

**Skipped phases:**
- Phase 7 (internal review) - Already done by Phase 9 review loop
- Deslop cleanup - Already done by deslop-work

**Still runs:**
- Phase 6 (address comments) - External reviewers comment AFTER PR creation

This ensures quality gates are trusted but post-PR feedback is still handled.

---

## Platform Detection Details

**CI Platforms:**

| Platform | Detected By | Capabilities |
|----------|-------------|--------------|
| GitHub Actions | `.github/workflows/` | Full support |
| GitLab CI | `.gitlab-ci.yml` | Full support |
| CircleCI | `.circleci/config.yml` | Full support |
| Jenkins | `Jenkinsfile` | Full support |
| Travis CI | `.travis.yml` | Basic support |

**Deploy Platforms:**

| Platform | Detected By | Capabilities |
|----------|-------------|--------------|
| Railway | `railway.json` | Auto-deploy, health checks |
| Vercel | `vercel.json` | Auto-deploy, preview URLs |
| Netlify | `netlify.toml` | Auto-deploy, preview URLs |
| Fly.io | `fly.toml` | Auto-deploy, health checks |
| Render | `render.yaml` | Auto-deploy, health checks |

---

## Usage Examples

**Basic usage:**

```bash
/ship
```

**Preview without executing:**

```bash
/ship --dry-run
```

**Use rebase instead of squash:**

```bash
/ship --strategy rebase
```

**Integration with next-task:**

```bash
# Called automatically by docs-updater agent
/ship --state-file .claude/flow.json
```

---

## Example Flow

```
User: /ship

[Pre-flight]
→ CI: GitHub Actions ✓
→ Deploy: Railway ✓
→ Branch: feature/add-dark-mode ✓

[Commit]
→ Staged 3 files
→ Committed: "feat(ui): add dark mode toggle"

[Push & PR]
→ Pushed to origin/feature/add-dark-mode
→ Created PR #156

[CI Monitor]
→ Waiting for checks...
→ lint: passed
→ test: passed
→ build: passed

[Review Wait]
→ Waiting 3 minutes for reviewers...

[Address Comments]
→ Found 4 comments from 3 reviewers
→ Comment 1: Applied style fix
→ Comment 2: Answered question
→ Comment 3: Applied code fix
→ Comment 4: Explained false positive
→ All threads resolved ✓

[Merge]
→ Verified MERGEABLE status
→ Merged PR #156 to main

[Cleanup]
→ Deleted feature branch
→ Closed issue #89

Done! PR #156 merged.
```

---

## Navigation

[← Back to Documentation Index](../README.md) | [Main README](../../README.md)

**Related:**
- [/next-task Workflow](./NEXT-TASK.md) - The full workflow that calls /ship
- [Agent Reference](../reference/AGENTS.md) - ci-monitor, ci-fixer details
- [MCP Tools](../reference/MCP-TOOLS.md) - Programmatic access
