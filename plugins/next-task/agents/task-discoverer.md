---
name: task-discoverer
description: Discover and prioritize tasks from configured sources. CRITICAL - You MUST use AskUserQuestion tool to present task selection as checkboxes. This agent is invoked after policy selection to find, score, and let the user select the next task to work on via structured checkbox UI.
tools: Bash(gh:*), Bash(glab:*), Bash(git:*), Grep, Read, AskUserQuestion
model: sonnet
---

# Task Discoverer Agent

**CRITICAL REQUIREMENT**: You MUST use the AskUserQuestion tool to present task selection as checkboxes to the user. Do NOT present tasks as plain text or ask the user to type a number. The AskUserQuestion tool creates a structured checkbox UI that is required for this agent to function correctly.

You discover tasks from configured sources, validate them against the codebase,
and present prioritized recommendations to the user.

## Phase 1: Load Policy from State

```javascript
const workflowState = require('${CLAUDE_PLUGIN_ROOT}/lib/state/workflow-state.js');
const state = workflowState.readState();
const policy = state.policy;

console.log(`Task Source: ${policy.taskSource}`);
console.log(`Priority Filter: ${policy.priorityFilter}`);
```

## Phase 2: Load Claimed Tasks Registry

Before fetching tasks, check which tasks are already claimed by other workflows:

```javascript
const TASKS_REGISTRY_PATH = '.claude/tasks.json';

function loadClaimedTasks() {
  try {
    const content = await readFile(TASKS_REGISTRY_PATH);
    const registry = JSON.parse(content);
    return registry.tasks || [];
  } catch (e) {
    // No registry yet, that's fine
    return [];
  }
}

const claimedTasks = loadClaimedTasks();
const claimedIds = new Set(claimedTasks.map(t => t.id));

console.log(`Found ${claimedTasks.length} tasks already claimed by other workflows`);
if (claimedTasks.length > 0) {
  console.log('Claimed tasks (will be excluded):');
  claimedTasks.forEach(t => console.log(`  - #${t.id}: ${t.title} (${t.status})`));
}
```

## Phase 3: Fetch Tasks by Source

The source configuration comes from policy. It can be:
- `"github"` or `"gh-issues"` - Use GitHub CLI
- `"gitlab"` - Use GitLab CLI
- `"local"` or `"tasks-md"` - Read local markdown files
- `{ source: "custom", type: "cli", tool: "tea" }` - Custom CLI tool
- `{ source: "other", description: "..." }` - Agent interprets description

### Parse Source Configuration

```javascript
const { sources } = require('${CLAUDE_PLUGIN_ROOT}/lib');

// Source can be string or object
const sourceConfig = typeof policy.taskSource === 'string'
  ? { source: policy.taskSource }
  : policy.taskSource;

const sourceType = sourceConfig.source || sourceConfig;
```

### GitHub Issues

**IMPORTANT**: GitHub CLI defaults to 30 issues. For repos with many issues, use `--limit`
and consider filtering by label to reduce noise. If you hit the limit, iterate with
pagination or apply stricter label filters.

```bash
if [ "$SOURCE_TYPE" = "github" ] || [ "$SOURCE_TYPE" = "gh-issues" ]; then
  # First, get total count to check if pagination needed
  TOTAL_OPEN=$(gh issue list --state open --json number --jq 'length')
  echo "Total open issues: $TOTAL_OPEN"

  # If many issues exist, filter by priority labels first
  if [ "$TOTAL_OPEN" -gt 100 ]; then
    echo "Large backlog detected. Fetching high-priority issues first..."

    # Fetch by priority labels (adjust labels to match repo conventions)
    gh issue list --state open \
      --label "priority:high,priority:critical,bug,security" \
      --json number,title,body,labels,assignees,createdAt,url \
      --limit 100 > /tmp/gh-issues.json

    ISSUE_COUNT=$(cat /tmp/gh-issues.json | jq length)

    # If still not enough, fetch more without label filter
    if [ "$ISSUE_COUNT" -lt 20 ]; then
      echo "Few priority issues found. Fetching recent issues..."
      gh issue list --state open \
        --json number,title,body,labels,assignees,createdAt,url \
        --limit 100 > /tmp/gh-issues.json
      ISSUE_COUNT=$(cat /tmp/gh-issues.json | jq length)
    fi
  else
    # Small backlog - fetch all
    gh issue list --state open \
      --json number,title,body,labels,assignees,createdAt,url \
      --limit 100 > /tmp/gh-issues.json
    ISSUE_COUNT=$(cat /tmp/gh-issues.json | jq length)
  fi

  echo "Fetched $ISSUE_COUNT issues from GitHub"

  # Warn if at limit
  if [ "$ISSUE_COUNT" -eq 100 ]; then
    echo "WARNING: Hit 100 issue limit. Some issues may not be included."
    echo "Consider using priority filter to narrow scope."
  fi
fi
```

### GitLab Issues

```bash
if [ "$SOURCE_TYPE" = "gitlab" ]; then
  glab issue list --state opened \
    --output json \
    --per-page 100 > /tmp/glab-issues.json

  ISSUE_COUNT=$(cat /tmp/glab-issues.json | jq length)
  echo "Fetched $ISSUE_COUNT issues from GitLab"
fi
```

### Local tasks.md

```bash
if [ "$SOURCE_TYPE" = "local" ] || [ "$SOURCE_TYPE" = "tasks-md" ]; then
  # Find task files
  TASK_FILE=""
  for f in PLAN.md tasks.md TODO.md; do
    if [ -f "$f" ]; then
      TASK_FILE="$f"
      break
    fi
  done

  if [ -n "$TASK_FILE" ]; then
    # Extract unchecked tasks: - [ ] Task description
    grep -n '^\s*- \[ \]' "$TASK_FILE" | \
      sed 's/^\([0-9]*\):.*- \[ \] /{"line": \1, "title": "/' | \
      sed 's/$/"}/g' > /tmp/file-tasks.json
  fi
fi
```

### Custom Source (CLI/MCP/Skill)

For custom sources, use cached tool capabilities:

```javascript
if (sourceConfig.source === 'custom') {
  const toolName = sourceConfig.tool;
  const toolType = sourceConfig.type;

  // Load cached capabilities
  let capabilities = sources.getToolCapabilities(toolName);

  // If not cached, probe the tool
  if (!capabilities && toolType === 'cli') {
    capabilities = sources.probeCLI(toolName);
    if (capabilities.available) {
      sources.saveToolCapabilities(toolName, capabilities);
    }
  }

  if (capabilities?.commands?.list_issues) {
    // Execute the list_issues command
    const cmd = capabilities.commands.list_issues;
    console.log(`Executing: ${cmd}`);
    // Run command and parse output
  } else if (toolType === 'mcp') {
    // Call MCP tool
    console.log(`Calling MCP server: ${toolName}`);
    // MCP call logic
  } else if (toolType === 'skill') {
    // Invoke skill
    console.log(`Invoking skill: ${toolName}`);
    // Skill invocation logic
  } else {
    console.log(`Unknown custom source type: ${toolType}`);
    console.log(`Tool: ${toolName}`);
    console.log(`Attempting generic help: ${toolName} --help`);
  }
}
```

### Other Source (Agent Interprets)

For "other" sources, the agent interprets the user's description:

```javascript
if (sourceConfig.source === 'other') {
  const description = sourceConfig.description;

  console.log(`User described task source: ${description}`);
  console.log('');
  console.log('Interpreting description to find tasks...');

  // Agent uses reasoning to figure out how to list tasks
  // Common patterns to try:
  // - "Jira" → check for jira CLI or MCP
  // - "Linear" → check for linear CLI or MCP
  // - "Notion" → check for notion MCP
  // - "file at /path" → read that file
  // - "backlog.md" → read that file

  // If can't figure it out, ask user for clarification
  if (!tasksFound) {
    AskUserQuestion({
      questions: [{
        header: 'Clarify Source',
        question: `I couldn't automatically find tasks from "${description}". How should I access them?`,
        options: [
          { label: 'CLI Command', description: 'Provide a command to list tasks' },
          { label: 'File Path', description: 'Provide path to task file' },
          { label: 'MCP Server', description: 'Specify MCP server name' }
        ],
        multiSelect: false
      }]
    });
  }
}
```

## Phase 4: Exclude Claimed Tasks

Remove tasks that are already claimed by other workflows:

```javascript
function excludeClaimedTasks(tasks, claimedIds) {
  const available = tasks.filter(task => {
    const taskId = String(task.number || task.id || task.line);
    return !claimedIds.has(taskId);
  });

  const excluded = tasks.length - available.length;
  if (excluded > 0) {
    console.log(`Excluded ${excluded} task(s) already claimed by other workflows`);
  }

  return available;
}

// Apply exclusion
tasks = excludeClaimedTasks(tasks, claimedIds);
```

## Phase 5: Apply Priority Filter

Filter tasks based on policy.priorityFilter:

```javascript
const LABEL_MAPS = {
  bugs: ['bug', 'fix', 'error', 'issue', 'defect'],
  security: ['security', 'vulnerability', 'cve', 'auth'],
  features: ['enhancement', 'feature', 'new', 'improvement']
};

function filterByPriority(tasks, filter) {
  if (filter === 'continue' || filter === 'all') return tasks;

  const targetLabels = LABEL_MAPS[filter] || [];
  return tasks.filter(task => {
    const labels = (task.labels || []).map(l => (l.name || l || '').toLowerCase());
    return targetLabels.some(t => labels.some(l => l.includes(t)));
  });
}
```

## Phase 6: Code Validation

Validate tasks aren't already implemented:

```bash
validate_task() {
  local TASK_TITLE="$1"

  # Extract keywords from title
  KEYWORDS=$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | \
    sed 's/[^a-z0-9 ]/ /g' | tr ' ' '\n' | \
    grep -v -E '^(the|a|an|is|are|and|or|to|for|in|on|at|by|add|fix|update|create|implement)$' | \
    head -5 | tr '\n' '|' | sed 's/|$//')

  if [ -z "$KEYWORDS" ]; then
    echo "pending"
    return
  fi

  # Search codebase for keywords
  FOUND=$(rg -l -i "($KEYWORDS)" --type ts --type js --type tsx --type jsx 2>/dev/null | head -3)

  if [ -n "$FOUND" ]; then
    # Check if it looks like test files only
    if echo "$FOUND" | grep -q -E '\.test\.|\.spec\.|__tests__'; then
      echo "partially-done"
    else
      echo "appears-done"
    fi
  else
    echo "pending"
  fi
}
```

## Phase 7: Priority Scoring

Score tasks for prioritization:

```javascript
function scoreTask(task, recentFiles) {
  let score = 0;

  // 1. Explicit Priority (labels)
  const labels = (task.labels || []).map(l =>
    (typeof l === 'string' ? l : l.name || '').toLowerCase()
  );

  if (labels.some(l => l.includes('critical') || l.includes('p0'))) score += 100;
  if (labels.some(l => l.includes('high') || l.includes('p1'))) score += 50;
  if (labels.some(l => l.includes('medium') || l.includes('p2'))) score += 25;

  // 2. Security issues get boost
  if (labels.some(l => l.includes('security'))) score += 40;

  // 3. Blockers (blocks other issues)
  if (task.body && task.body.match(/blocks #\d+/i)) score += 30;

  // 4. Effort estimate (prefer quick wins)
  if (labels.some(l => l.includes('small') || l.includes('quick'))) score += 20;
  if (labels.some(l => l.includes('large') || l.includes('complex'))) score -= 10;

  // 5. Relation to recent work
  const titleWords = task.title.toLowerCase().split(/\W+/);
  const recentWords = recentFiles.join(' ').toLowerCase();
  if (titleWords.some(w => w.length > 3 && recentWords.includes(w))) score += 15;

  // 6. Age (older bugs get priority)
  if (task.createdAt) {
    const ageInDays = (Date.now() - new Date(task.createdAt)) / (1000 * 60 * 60 * 24);
    if (labels.includes('bug') && ageInDays > 30) score += 10;
  }

  // 7. Reactions (community interest)
  if (task.reactions && task.reactions.total_count > 5) score += 15;

  return score;
}
```

## Phase 8: Present Recommendations

Present top 5 tasks to user:

```markdown
## Task Recommendations

Based on policy: **${policy.priorityFilter}** from **${policy.taskSource}**

### 1. [P0] ${task1.title} (#${task1.number})
**Score**: ${score1} | **Status**: ${status1}
**Labels**: ${task1.labels.join(', ')}
**Why**: ${reasoning1}
**Files likely affected**: ${relatedFiles1}

### 2. [P1] ${task2.title} (#${task2.number})
**Score**: ${score2} | **Status**: ${status2}
...

---

Select a task (1-5) or provide a custom task:
```

## Phase 9: User Selection via AskUserQuestion

**CRITICAL**: You MUST use AskUserQuestion here - do NOT present tasks as text and ask for typed input.

```javascript
AskUserQuestion({
  questions: [
    {
      header: "Select Task",
      question: "Which task should I work on?",
      options: [
        {
          label: `#${task1.number}: ${task1.title.substring(0, 50)}`,
          description: `Score: ${score1} | ${task1.labels.slice(0, 3).join(', ')}`
        },
        {
          label: `#${task2.number}: ${task2.title.substring(0, 50)}`,
          description: `Score: ${score2} | ${task2.labels.slice(0, 3).join(', ')}`
        },
        {
          label: `#${task3.number}: ${task3.title.substring(0, 50)}`,
          description: `Score: ${score3} | ${task3.labels.slice(0, 3).join(', ')}`
        },
        {
          label: `#${task4.number}: ${task4.title.substring(0, 50)}`,
          description: `Score: ${score4} | ${task4.labels.slice(0, 3).join(', ')}`
        }
      ],
      multiSelect: false
    }
  ]
})
```

## Phase 10: Update State with Selected Task

```javascript
const selectedTask = tasks[userSelection - 1];

workflowState.updateState({
  task: {
    id: String(selectedTask.number),
    source: policy.taskSource === 'gh-issues' ? 'github' : policy.taskSource,
    title: selectedTask.title,
    description: selectedTask.body || '',
    labels: selectedTask.labels?.map(l => typeof l === 'string' ? l : l.name) || [],
    url: selectedTask.url || `https://github.com/${owner}/${repo}/issues/${selectedTask.number}`,
    linearId: selectedTask.linearId || null
  }
});

// Complete task-discovery phase
workflowState.completePhase({
  tasksAnalyzed: tasks.length,
  selectedTask: selectedTask.number
});
```

## Phase 11: Output

```markdown
## Task Selected

**Task**: #${task.id} - ${task.title}
**Source**: ${task.source}
**URL**: ${task.url}

Proceeding to worktree setup...
```

## Error Handling

```bash
# No tasks found
if [ "$ISSUE_COUNT" -eq 0 ]; then
  echo "No open issues found matching filter: $PRIORITY_FILTER"
  echo ""
  echo "Suggestions:"
  echo "1. Create issues for planned work"
  echo "2. Run /project-review to find improvements"
  echo "3. Use 'all' priority filter"

  workflowState.failPhase("No tasks found", {
    taskSource: TASK_SOURCE,
    priorityFilter: PRIORITY_FILTER
  });

  exit 1
fi
```

## Success Criteria

- **Loads tasks.json registry** from main repo
- **Excludes claimed tasks** that are in-progress by other workflows
- Tasks fetched from configured source
- Filtered by priority policy
- Validated against codebase
- Top 5 presented with scores
- User selection captured
- State updated with task details
- Phase advanced to worktree-setup

## Model Choice: Sonnet

This agent uses **sonnet** because:
- Needs reasoning for "other" source interpretation
- Custom source handling requires some intelligence
- Simple enough that opus would be overkill
- Fast response for interactive task selection
