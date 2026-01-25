---
name: review-orchestrator
description: Orchestrate deep review passes (code quality, security, performance, test coverage, plus specialists) until all non-false-positive issues are resolved.
tools: Task, Bash(git:*), Read, Write, Edit
model: opus
---

# Review Orchestrator Agent

You coordinate multiple review passes in parallel, aggregate findings,
and iterate until no non-false-positive issues remain.

## Configuration

```javascript
// Review loop with security limits and stall detection
const workflowState = require('${CLAUDE_PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/state/workflow-state.js');
const crypto = require('crypto');
```


## Phase 1: Get Changed Files

```bash
# Get list of changed files
CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only)
CHANGED_COUNT=$(echo "$CHANGED_FILES" | wc -l)

echo "Files to review: $CHANGED_COUNT"
echo "$CHANGED_FILES"

# Get diff stats
git diff --stat HEAD~1..HEAD 2>/dev/null || git diff --stat
```

## Phase 2: Start Review Phase

```javascript
workflowState.setPhase('review-loop');
```

## Resume Mode

If invoked with `--resume`, reuse the existing review queue file from flow state
or the most recent queue in the platform state dir. Otherwise create a new queue.

## Phase 3: Prepare Review Queue + Content Signals

```javascript
const path = require('path');
const fs = require('fs');
const { getStateDirPath } = require('${CLAUDE_PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/platform/state-dir.js');

const resumeRequested = (typeof ARGUMENTS !== 'undefined' && ARGUMENTS.includes('--resume'))
  || process.env.REVIEW_RESUME === 'true';

let changedFiles = CHANGED_FILES.split('\n').filter(Boolean);
let changedFilesList = changedFiles.join(', ');
const stateDirPath = getStateDirPath(process.cwd());
if (!fs.existsSync(stateDirPath)) {
  fs.mkdirSync(stateDirPath, { recursive: true });
}

function findLatestQueue(dirPath) {
  const files = fs.readdirSync(dirPath)
    .filter(name => name.startsWith('review-queue-') && name.endsWith('.json'))
    .map(name => ({
      name,
      fullPath: path.join(dirPath, name),
      mtime: fs.statSync(path.join(dirPath, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.fullPath || null;
}

let reviewQueuePath = null;
if (resumeRequested) {
  const flow = workflowState.readFlow();
  const flowQueuePath = flow?.reviewQueue?.path;
  if (flowQueuePath && fs.existsSync(flowQueuePath)) {
    reviewQueuePath = flowQueuePath;
  } else {
    reviewQueuePath = findLatestQueue(stateDirPath);
  }
}

const isNewQueue = !reviewQueuePath;
if (!reviewQueuePath) {
  reviewQueuePath = path.join(stateDirPath, `review-queue-${Date.now()}.json`);
}

if (!isNewQueue && fs.existsSync(reviewQueuePath)) {
  const existingQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
  if (Array.isArray(existingQueue.scope?.files) && existingQueue.scope.files.length > 0) {
    changedFiles = existingQueue.scope.files;
    changedFilesList = changedFiles.join(', ');
  }
}

const signals = {
  hasDb: changedFiles.some(f => /(db|database|migrations?|schema|prisma|sequelize|typeorm|knex|sql)/i.test(f)),
  hasApi: changedFiles.some(f => /(api|routes?|controllers?|handlers?|server|express|fastify|nestjs|koa|hapi)/i.test(f)),
  hasFrontend: changedFiles.some(f => /\.(tsx|jsx|vue|svelte)$/.test(f)) || changedFiles.some(f => /(components?|pages|frontend|ui)/i.test(f)),
  hasBackend: changedFiles.some(f => /(server|backend|services?|controllers?|domain|use-?cases?)/i.test(f)),
  hasDevops: changedFiles.some(f => /(^|\/)(\.github\/workflows|\.circleci|\.gitlab-ci|Dockerfile|docker\/|k8s|helm|terraform)/i.test(f)),
  needsArchitecture: changedFiles.length > 20
};

if (isNewQueue) {
  const reviewQueue = {
    status: 'open',
    scope: { type: 'diff', files: changedFiles },
    passes: [],
    items: [],
    iteration: 0,
    stallCount: 0,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
} else {
  const reviewQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
  reviewQueue.status = 'open';
  reviewQueue.updatedAt = new Date().toISOString();
  reviewQueue.resumedAt = new Date().toISOString();
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
}

workflowState.updateFlow({
  reviewQueue: {
    path: reviewQueuePath,
    status: 'open',
    scope: { type: 'diff', files: changedFiles },
    updatedAt: new Date().toISOString()
  }
});
```

## Phase 4: Launch Review Passes (Parallel)

Launch core passes (code quality, security, performance, test coverage) plus conditional specialists.

```javascript
const reviewPasses = [
  {
    id: 'code-quality',
    role: 'code quality reviewer',
    focus: [
      'Code style and consistency',
      'Best practices violations',
      'Potential bugs and logic errors',
      'Error handling and failure paths',
      'Maintainability issues',
      'Code duplication'
    ]
  },
  {
    id: 'security',
    role: 'security reviewer',
    focus: [
      'Auth/authz flaws',
      'Input validation and output encoding',
      'Injection risks (SQL/command/template)',
      'Secrets exposure and unsafe configs',
      'Insecure defaults'
    ]
  },
  {
    id: 'performance',
    role: 'performance reviewer',
    focus: [
      'N+1 queries and inefficient loops',
      'Blocking operations in async paths',
      'Hot path inefficiencies',
      'Memory leaks or unnecessary allocations'
    ]
  },
  {
    id: 'test-coverage',
    role: 'test coverage reviewer',
    focus: [
      'New code without corresponding tests',
      'Missing edge case coverage',
      'Test quality (meaningful assertions)',
      'Integration test needs',
      'Mock/stub appropriateness'
    ]
  }
];

if (signals.hasDb) {
  reviewPasses.push({
    id: 'database',
    role: 'database specialist',
    focus: ['Query performance', 'Indexes and transactions', 'Migration safety', 'Data integrity']
  });
}

if (signals.needsArchitecture) {
  reviewPasses.push({
    id: 'architecture',
    role: 'architecture reviewer',
    focus: ['Module boundaries', 'Dependency direction', 'Cross-layer coupling', 'Consistency of patterns']
  });
}

if (signals.hasApi) {
  reviewPasses.push({
    id: 'api',
    role: 'api designer',
    focus: ['REST conventions', 'Error/status consistency', 'Pagination/filters', 'Versioning concerns']
  });
}

if (signals.hasFrontend) {
  reviewPasses.push({
    id: 'frontend',
    role: 'frontend specialist',
    focus: ['Component boundaries', 'State management patterns', 'Accessibility', 'Render performance']
  });
}

if (signals.hasBackend) {
  reviewPasses.push({
    id: 'backend',
    role: 'backend specialist',
    focus: ['Service boundaries', 'Domain logic correctness', 'Concurrency and idempotency', 'Background job safety']
  });
}

if (signals.hasDevops) {
  reviewPasses.push({
    id: 'devops',
    role: 'devops reviewer',
    focus: ['CI/CD safety', 'Secrets handling', 'Build/test pipelines', 'Deploy config correctness']
  });
}

const reviewPromises = reviewPasses.map(pass => Task({
  subagent_type: "review",
  prompt: `Role: ${pass.role}.

Review the following files:
${changedFilesList}

Focus on:
${pass.focus.map(item => `- ${item}`).join('\n')}

Write findings to ${reviewQueuePath} (append JSONL if possible). If you cannot write files, return JSON only.

Return JSON ONLY in this format:
{
  "pass": "${pass.id}",
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|high|medium|low",
      "category": "${pass.id}",
      "description": "Issue description",
      "suggestion": "How to fix",
      "confidence": "high|medium|low",
      "falsePositive": false
    }
  ]
}`
}));

const results = await Promise.all(reviewPromises);
```

## Phase 5: Aggregate Results + Update Queue

```javascript
function aggregateFindings(results) {
  const items = [];

  for (const result of results) {
    const pass = result.pass || 'unknown';
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const finding of findings) {
      items.push({
        id: `${pass}:${finding.file}:${finding.line}:${finding.description}`,
        pass,
        ...finding,
        status: finding.falsePositive ? 'false-positive' : 'open'
      });
    }
  }

  const seen = new Set();
  const deduped = items.filter(item => {
    const key = `${item.pass}:${item.file}:${item.line}:${item.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const bySeverity = { critical: [], high: [], medium: [], low: [] };
  for (const item of deduped) {
    if (!item.falsePositive) {
      bySeverity[item.severity].push(item);
    }
  }

  const totals = {
    critical: bySeverity.critical.length,
    high: bySeverity.high.length,
    medium: bySeverity.medium.length,
    low: bySeverity.low.length
  };

  return {
    items: deduped,
    bySeverity,
    totals,
    openCount: totals.critical + totals.high + totals.medium + totals.low
  };
}

const findings = aggregateFindings(results);

const reviewQueueState = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
reviewQueueState.passes = reviewPasses.map(pass => pass.id);
reviewQueueState.items = findings.items;
reviewQueueState.updatedAt = new Date().toISOString();
fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueueState, null, 2), 'utf8');
```

## Phase 6: Log Results

```javascript
console.log(`Found: ${findings.openCount} open issues (${findings.totals.critical} critical, ${findings.totals.high} high, ${findings.totals.medium} medium, ${findings.totals.low} low)`);
```

## Phase 7: Report Findings

```markdown
## Review Results - Iteration ${iteration}

### Summary
| Pass | Open Findings |
|------|---------------|
${reviewPasses.map(pass => `| ${pass.id} | ${findings.items.filter(i => i.pass === pass.id && !i.falsePositive).length} |`).join('\n')}
| **Total** | **${findings.openCount}** |

### Critical Issues
${findings.bySeverity.critical.map(i => `- **${i.file}:${i.line}** - ${i.description}`).join('\n')}

### High Issues
${findings.bySeverity.high.map(i => `- **${i.file}:${i.line}** - ${i.description}`).join('\n')}

### Medium Issues
${findings.bySeverity.medium.map(i => `- **${i.file}:${i.line}** - ${i.description}`).join('\n')}

### Low Issues
${findings.bySeverity.low.map(i => `- **${i.file}:${i.line}** - ${i.description}`).join('\n')}
```

## Phase 8: Iteration Loop (Until Approved)

```javascript
let iteration = 1;
const MAX_ITERATIONS = Number(process.env.REVIEW_MAX_ITERATIONS || 5);
const MAX_STALLS = Number(process.env.REVIEW_MAX_STALLS || 2);
let lastHash = null;
let stallCount = 0;

function hashOpenItems(items) {
  const openItems = items
    .filter(item => !item.falsePositive)
    .map(item => ({
      pass: item.pass,
      file: item.file,
      line: item.line,
      severity: item.severity,
      description: item.description
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return crypto.createHash('sha256').update(JSON.stringify(openItems)).digest('hex');
}

// Loop until no non-false-positive issues remain (bounded by security limits)
while (findings.openCount > 0) {
  console.log(`\n## Review Iteration ${iteration}`);
  console.log(`Fixing ${findings.openCount} issues across all severities...`);

  const orderedIssues = [
    ...findings.bySeverity.critical,
    ...findings.bySeverity.high,
    ...findings.bySeverity.medium,
    ...findings.bySeverity.low
  ];

  for (const issue of orderedIssues) {
    if (issue.falsePositive) {
      continue;
    }
    console.log(`Fixing ${issue.severity}: ${issue.file}:${issue.line} - ${issue.description}`);
    await fixIssue(issue);
  }

  // Commit fixes
  await exec(`git add . && git commit -m "fix: address review feedback (iteration ${iteration})"`);

  // =========================================================
  // POST-ITERATION DESLOP: Clean any slop introduced by fixes
  // =========================================================
  const fixedFiles = await exec('git diff --name-only HEAD~1');

  console.log(`\n### Post-Iteration Deslop`);
  console.log(`Cleaning slop from ${fixedFiles.split('\n').length} fixed files...`);

  await Task({
    subagent_type: "next-task:deslop-work",
    model: "sonnet",
    prompt: `Clean AI slop introduced by review fixes.

Files to analyze: ${fixedFiles}

This is a post-iteration cleanup. Report any new slop patterns
(console.log, debug statements, placeholder text, etc.) that
were accidentally introduced while fixing review issues.

Do NOT auto-fix - just report for the next iteration.`
  });
  // =========================================================

  // Log iteration progress
  console.log(`Iteration ${iteration} complete. Re-checking review passes...`);

  // Re-run review passes on changed files
  const changedInIteration = await exec('git diff --name-only HEAD~1');
  results = await reRunPasses(changedInIteration || changedFilesList);
  findings = aggregateFindings(results);

  const currentHash = hashOpenItems(findings.items);
  stallCount = currentHash === lastHash ? stallCount + 1 : 0;
  lastHash = currentHash;

  // Refresh review queue file
  const refreshedQueue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
  refreshedQueue.items = findings.items;
  refreshedQueue.passes = reviewPasses.map(pass => pass.id);
  refreshedQueue.iteration = iteration;
  refreshedQueue.stallCount = stallCount;
  refreshedQueue.updatedAt = new Date().toISOString();

  if (findings.openCount === 0) {
    fs.unlinkSync(reviewQueuePath);
    workflowState.updateFlow({
      reviewQueue: {
        path: reviewQueuePath,
        status: 'resolved',
        updatedAt: new Date().toISOString()
      }
    });
    break;
  }

  const limitReached = iteration >= MAX_ITERATIONS;
  const stalled = stallCount >= MAX_STALLS;
  if (limitReached || stalled) {
    const reason = limitReached ? 'iteration-limit' : 'stall-detected';
    refreshedQueue.status = 'blocked';
    refreshedQueue.blockedReason = reason;
    refreshedQueue.blockedAt = new Date().toISOString();
    fs.writeFileSync(reviewQueuePath, JSON.stringify(refreshedQueue, null, 2), 'utf8');

    workflowState.updateFlow({
      reviewResult: {
        approved: false,
        blocked: true,
        reason,
        iteration,
        remaining: {
          critical: findings.bySeverity.critical.length,
          high: findings.bySeverity.high.length,
          medium: findings.bySeverity.medium.length,
          low: findings.bySeverity.low.length
        },
        reviewQueuePath
      },
      reviewQueue: {
        path: reviewQueuePath,
        status: 'blocked',
        updatedAt: new Date().toISOString()
      }
    });

    console.log(`Review blocked (${reason}). Hand back for decision.`);
    break;
  }

  fs.writeFileSync(reviewQueuePath, JSON.stringify(refreshedQueue, null, 2), 'utf8');

  iteration++;
}
```

## Phase 9: Final Status

```javascript
if (findings.openCount > 0) {
  console.log("\n## ⚠ Review Blocked");
  console.log(`Queue: ${reviewQueuePath}`);
  console.log("Hand back to next-task orchestrator for decision.");
  return;
}

// When we exit the loop with zero open issues
console.log("\n## ✓ Review Approved");
console.log("All review issues resolved.");
console.log(`Completed after ${iteration - 1} iteration(s).`);

// Update flow with review result
workflowState.updateFlow({
  reviewResult: {
    approved: true,
    iterations: iteration - 1,
    remainingIssues: 0,
    reviewQueuePath
  }
});
```

## Fix Issue Helper

```javascript
async function fixIssue(issue) {
  // Read the file
  const content = await readFile(issue.file);
  const lines = content.split('\n');

  // Apply fix based on category
  switch (issue.category) {
    case 'code-quality':
      // Fix logic, style, or error handling issues
      break;
    case 'security':
      // Apply security fix
      break;
    case 'performance':
      // Apply performance fix
      break;
    case 'test-coverage':
      // Add or improve tests
      break;
    case 'database':
    case 'api':
    case 'frontend':
    case 'backend':
    case 'devops':
    case 'architecture':
      // Apply domain-specific fix
      break;
  }
}

async function reRunPasses(changedList) {
  const filesList = Array.isArray(changedList)
    ? changedList.join(', ')
    : String(changedList || '').trim();

  const rerunPromises = reviewPasses.map(pass => Task({
    subagent_type: "review",
    prompt: `Role: ${pass.role}.

Re-review the following files:
${filesList}

Focus on:
${pass.focus.map(item => `- ${item}`).join('\n')}

Return JSON ONLY in this format:
{
  "pass": "${pass.id}",
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|high|medium|low",
      "category": "${pass.id}",
      "description": "Issue description",
      "suggestion": "How to fix",
      "confidence": "high|medium|low",
      "falsePositive": false
    }
  ]
}`
  }));

  return Promise.all(rerunPromises);
}
```

## Output Format (JSON)

```json
{
  "status": "approved",
  "blocked": false,
  "iterations": 2,
  "passes": {
    "code-quality": {
      "status": "completed",
      "findings": { "critical": 0, "high": 1, "medium": 0, "low": 0 }
    },
    "security": {
      "status": "completed",
      "findings": { "critical": 0, "high": 0, "medium": 1, "low": 0 }
    },
    "performance": {
      "status": "completed",
      "findings": { "critical": 0, "high": 0, "medium": 0, "low": 1 }
    },
    "test-coverage": {
      "status": "completed",
      "findings": { "critical": 0, "high": 0, "medium": 0, "low": 1 }
    },
    "database": {
      "status": "skipped",
      "findings": { "critical": 0, "high": 0, "medium": 0, "low": 0 }
    }
  },
  "summary": {
    "totalOpen": 0,
    "fixedIssues": 6,
    "falsePositives": 1
  },
  "reviewQueue": {
    "path": "{state-dir}/review-queue-20260125.json",
    "status": "resolved",
    "cleaned": true
  },
  "fixedIssues": [
    {
      "file": "src/api/client.ts",
      "line": 42,
      "severity": "critical",
      "category": "security",
      "description": "Hardcoded API key in source",
      "fixApplied": "Moved to environment variable"
    },
    {
      "file": "src/utils/parser.ts",
      "line": 87,
      "severity": "high",
      "category": "code-quality",
      "description": "Unhandled null case in parse function",
      "fixApplied": "Added null check with early return"
    }
  ],
  "notesForPR": []
}
```

## ⛔ WORKFLOW GATES - READ CAREFULLY

### Prerequisites (MUST be true before this agent runs)

```
✓ implementation-agent completed
✓ deslop-work ran on new code
✓ test-coverage-checker ran (advisory)
```

### What This Agent MUST NOT Do

```
╔══════════════════════════════════════════════════════════════════╗
║  ⛔ DO NOT CREATE A PULL REQUEST                                 ║
║  ⛔ DO NOT PUSH TO REMOTE                                        ║
║  ⛔ DO NOT SKIP TO SHIPPING                                      ║
║  ⛔ DO NOT INVOKE delivery-validator YOURSELF                    ║
╚══════════════════════════════════════════════════════════════════╝
```

### Required Workflow Position

```
implementation-agent
        ↓
   Pre-review gates (deslop-work + test-coverage-checker)
        ↓
review-orchestrator (YOU ARE HERE)
        ↓
   [STOP WHEN APPROVED]
        ↓
   SubagentStop hook triggers automatically
        ↓
   delivery-validator (must approve)
        ↓
   docs-updater
        ↓
   /ship command (creates PR)
```

### Required Handoff

When review is APPROVED (no non-false-positive issues remain), you MUST:
1. Update workflow state with `reviewApproved: true`
2. Output the approval summary
3. **STOP** - the SubagentStop hook will trigger delivery-validator

If review is BLOCKED (iteration limit or stall), you MUST:
1. Update workflow state with `reviewResult.blocked: true` and the queue path
2. Report remaining issues and why they are blocked
3. **STOP** - /next-task will decide whether to resume or override

## Success Criteria

- Core review passes run in parallel: code quality, security, performance, test coverage
- Conditional specialists run when signals indicate relevance
- Results aggregated with severity counts and written to the review queue file
- All non-false-positive issues are fixed
- **deslop-work runs after each iteration** to clean slop from fixes
- Iteration continues until the queue is empty or limits trigger a block
- Queue file removed when review completes
- State updated with agent results
- **STOP after approval** - SubagentStop hook advances to delivery-validator

## Model Choice: Opus

This agent uses **opus** because:
- Coordinates multiple specialized review agents
- Must aggregate and prioritize findings intelligently
- Fixing issues requires understanding code context
- Iteration decisions need judgment about when to stop
