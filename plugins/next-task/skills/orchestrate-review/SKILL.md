---
name: orchestrate-review
description: "Use when user asks to \"deep review the code\", \"thorough code review\", \"multi-pass review\", or when orchestrating Phase 9 review loop. Provides review pass definitions (code quality, security, performance, test coverage, specialists), signal detection patterns, and iteration algorithms."
user-invocable: false
metadata:
  short-description: "Multi-pass code review orchestration"
---

# Orchestrate Review

Multi-pass code review with parallel Task agents, finding aggregation, and iteration until clean.

## Scope-Based Specialist Selection

Select conditional specialists based on the review scope:
- **User request**: Detect signals from content user refers to (files, directory, module)
- **Workflow (Phase 9)**: Detect signals from changed files only
- **Project audit**: Detect signals from project structure as a whole

## Review Passes

Spawn parallel `general-purpose` Task agents (model: `sonnet`), one per pass:

### Core (Always)
```javascript
const corePasses = [
  { id: 'code-quality', role: 'code quality reviewer',
    focus: ['Style and consistency', 'Best practices', 'Bugs and logic errors', 'Error handling', 'Maintainability', 'Duplication'] },
  { id: 'security', role: 'security reviewer',
    focus: ['Auth/authz flaws', 'Input validation', 'Injection risks', 'Secrets exposure', 'Insecure defaults'] },
  { id: 'performance', role: 'performance reviewer',
    focus: ['N+1 queries', 'Blocking operations', 'Hot path inefficiencies', 'Memory leaks'] },
  { id: 'test-coverage', role: 'test coverage reviewer',
    focus: ['Missing tests', 'Edge case coverage', 'Test quality', 'Integration needs', 'Mock appropriateness'] }
];
```

### Conditional (Signal-Based)
```javascript
if (signals.hasDb) passes.push({ id: 'database', role: 'database specialist',
  focus: ['Query performance', 'Indexes/transactions', 'Migration safety', 'Data integrity'] });
if (signals.needsArchitecture) passes.push({ id: 'architecture', role: 'architecture reviewer',
  focus: ['Module boundaries', 'Dependency direction', 'Cross-layer coupling', 'Pattern consistency'] });
if (signals.hasApi) passes.push({ id: 'api', role: 'api designer',
  focus: ['REST conventions', 'Error/status consistency', 'Pagination/filters', 'Versioning'] });
if (signals.hasFrontend) passes.push({ id: 'frontend', role: 'frontend specialist',
  focus: ['Component boundaries', 'State management', 'Accessibility', 'Render performance'] });
if (signals.hasBackend) passes.push({ id: 'backend', role: 'backend specialist',
  focus: ['Service boundaries', 'Domain logic', 'Concurrency/idempotency', 'Background job safety'] });
if (signals.hasDevops) passes.push({ id: 'devops', role: 'devops reviewer',
  focus: ['CI/CD safety', 'Secrets handling', 'Build/test pipelines', 'Deploy config'] });
```

## Signal Detection

```javascript
const signals = {
  hasDb: files.some(f => /(db|migrations?|schema|prisma|typeorm|sql)/i.test(f)),
  hasApi: files.some(f => /(api|routes?|controllers?|handlers?)/i.test(f)),
  hasFrontend: files.some(f => /\.(tsx|jsx|vue|svelte)$/.test(f)),
  hasBackend: files.some(f => /(server|backend|services?|domain)/i.test(f)),
  hasDevops: files.some(f => /(\.github\/workflows|Dockerfile|k8s|terraform)/i.test(f)),
  needsArchitecture: files.length > 20
};
```

## Task Prompt Template

```
You are a ${pass.role}. Review these changed files:
${files.join('\n')}

Focus: ${pass.focus.map(f => `- ${f}`).join('\n')}

Return JSON:
{
  "pass": "${pass.id}",
  "findings": [{
    "file": "path.ts",
    "line": 42,
    "severity": "critical|high|medium|low",
    "description": "Issue",
    "suggestion": "Fix",
    "confidence": "high|medium|low",
    "falsePositive": false
  }]
}

Example finding:
{
  "file": "src/auth/login.ts",
  "line": 89,
  "severity": "high",
  "description": "Password comparison uses timing-vulnerable string equality",
  "suggestion": "Use crypto.timingSafeEqual() instead of === for password comparison",
  "confidence": "high",
  "falsePositive": false
}

Report every issue found. Empty findings array if code is clean.
```

## Aggregation

```javascript
function aggregateFindings(results) {
  const items = [];
  for (const {pass, findings = []} of results) {
    for (const f of findings) {
      items.push({
        id: `${pass}:${f.file}:${f.line}:${f.description}`,
        pass, ...f,
        status: f.falsePositive ? 'false-positive' : 'open'
      });
    }
  }

  // Deduplicate by id
  const deduped = [...new Map(items.map(i => [i.id, i])).values()];

  // Group by severity
  const bySeverity = {critical: [], high: [], medium: [], low: []};
  deduped.forEach(i => !i.falsePositive && bySeverity[i.severity || 'low'].push(i));

  const totals = Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length]));

  return {
    items: deduped,
    bySeverity,
    totals,
    openCount: Object.values(totals).reduce((a, b) => a + b, 0)
  };
}
```

## Iteration Loop

```javascript
const MAX_ITERATIONS = 5, MAX_STALLS = 2;
let iteration = 1, stallCount = 0, lastHash = null;

while (iteration <= MAX_ITERATIONS) {
  // 1. Spawn parallel Task agents
  const results = await Promise.all(passes.map(pass => Task({
    subagent_type: 'general-purpose',
    model: 'sonnet',
    prompt: /* see template above */
  })));

  // 2. Aggregate findings
  const findings = aggregateFindings(results);

  // 3. Check if done
  if (findings.openCount === 0) {
    workflowState.updateFlow({ reviewResult: { approved: true, iterations: iteration } });
    break;
  }

  // 4. Fix issues (severity order: critical → high → medium → low)
  for (const issue of [...findings.bySeverity.critical, ...findings.bySeverity.high,
                          ...findings.bySeverity.medium, ...findings.bySeverity.low]) {
    if (!issue.falsePositive) {
      // Apply fix using Edit tool based on issue.suggestion
    }
  }

  // 5. Commit
  exec(`git add . && git commit -m "fix: review feedback (iteration ${iteration})"`);

  // 6. Post-iteration deslop
  Task({ subagent_type: 'next-task:deslop-work', model: 'sonnet' });

  // 7. Stall detection
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(findings.items.filter(i => !i.falsePositive)))
    .digest('hex');
  stallCount = hash === lastHash ? stallCount + 1 : 0;
  lastHash = hash;

  // 8. Check limits
  if (stallCount >= MAX_STALLS || iteration >= MAX_ITERATIONS) {
    workflowState.updateFlow({
      reviewResult: { approved: false, blocked: true,
                     reason: stallCount >= MAX_STALLS ? 'stall-detected' : 'iteration-limit',
                     remaining: findings.totals }
    });
    break;
  }

  iteration++;
}
```

## Review Queue

Store state at `{stateDir}/review-queue-{timestamp}.json`:
```javascript
{
  status: 'open|resolved|blocked',
  scope: { type: 'diff', files: [...] },
  passes: ['code-quality', 'security', ...],
  items: [/* findings */],
  iteration: N,
  stallCount: N
}
```

Delete when approved. Keep when blocked for orchestrator inspection.
