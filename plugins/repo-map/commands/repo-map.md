---
description: Generate and maintain a cached AST repo map (symbols, imports, exports) using ast-grep for accurate drift detection and analysis
argument-hint: "init|update|status|rebuild [--force] [--full] [--no-docs] [--docs-depth quick|thorough]"
allowed-tools: Bash(git:*), Bash(npm:*), Read, Task, Write, AskUserQuestion
---

# /repo-map - AST Repo Map

Generate a cached repository map of symbols and imports using ast-grep. This enables faster drift detection and more accurate doc↔code matching.

## Arguments

Parse from `$ARGUMENTS`:

- **Action**: `init` | `update` | `status` | `rebuild` (default: `status`)
- `--force`: Force rebuild (for `init`)
- `--full`: Force full rebuild (for `update`)
- `--no-docs`: Skip documentation analysis
- `--docs-depth`: `quick` or `thorough` (default: `thorough`)

Examples:

- `/repo-map init`
- `/repo-map update --full`
- `/repo-map status`

## Execution

### 1) Load Repo Map Module

```javascript
const pluginPath = '${PLUGIN_ROOT}'.replace(/\\/g, '/');
const repoMap = require(`${pluginPath}/lib/repo-map`);
```

### 2) Parse Arguments

```javascript
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const action = (args[0] || 'status').toLowerCase();

const options = {
  force: args.includes('--force'),
  full: args.includes('--full'),
  includeDocs: !args.includes('--no-docs'),
  docsDepth: (args.includes('--docs-depth') && args[args.indexOf('--docs-depth') + 1]) || 'thorough'
};
```

### 3) Ensure ast-grep is Available

```javascript
const installed = await repoMap.checkAstGrepInstalled();
if (!installed.found || !repoMap.installer.meetsMinimumVersion(installed.version)) {
  const suggestion = repoMap.getInstallInstructions();
  const choice = await AskUserQuestion({
    questions: [{
      header: 'Install ast-grep?',
      question: 'ast-grep is required for repo-map. Install now?',
      options: [
        { label: 'Install via npm', description: 'Runs: npm install -g @ast-grep/cli' },
        { label: 'Skip for now', description: 'Show install instructions and exit' }
      ]
    }]
  });

  if (choice?.[0] === 'Install via npm') {
    await Bash('npm install -g @ast-grep/cli');
  } else {
    console.log(suggestion);
    return;
  }
}
```

### 4) Run Action

```javascript
let result;

if (action === 'init' || action === 'rebuild') {
  result = await repoMap.init(process.cwd(), {
    force: action === 'rebuild' || options.force,
    includeDocs: options.includeDocs,
    docsDepth: options.docsDepth
  });
} else if (action === 'update') {
  result = await repoMap.update(process.cwd(), { full: options.full });
} else if (action === 'status') {
  result = repoMap.status(process.cwd());
} else {
  console.log('Unknown action. Use: init | update | status | rebuild');
  return;
}

if (result?.success === false) {
  console.log(result.error || 'Repo-map failed');
  if (result.installSuggestion) console.log(result.installSuggestion);
  return;
}

if (action === 'status' && !result.exists) {
  console.log('No repo-map found. Run /repo-map init to generate one.');
  return;
}
```

### 5) Validate Results (init/update only)

After `init` or `update`, run validation using the lightweight agent:

```javascript
if (action === 'init' || action === 'rebuild' || action === 'update') {
  const summary = result?.map?.stats || result?.summary || result?.changes || {};
  const validation = await Task({
    subagent_type: 'repo-map:map-validator',
    prompt: `Validate repo-map results. Summary: ${JSON.stringify(summary)}`
  });
  console.log(validation);
}
```

## Output Format

```markdown
## Repo Map Result

**Action**: init|update|status
**Files**: <count>
**Symbols**: <count>
**Languages**: <list>
**Commit**: <hash>

### Notes
- <warnings or validation results>
```

