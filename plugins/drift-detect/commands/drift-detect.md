---
description: Deep repository analysis to realign project plans with actual code reality
argument-hint: "[--sources github,gitlab,local,custom,docs,code] [--depth quick|thorough] [--output file|display|both] [--file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Read, Glob, Grep, Task, Write, AskUserQuestion
---

# /drift-detect - Reality Check Scanner

Perform deep repository analysis to identify drift between documented plans and actual implementation.

## Architecture

```
drift-detect.md -> collectors.js (pure JS) -> plan-synthesizer (Opus) -> report
```

Data collection is pure JavaScript. Only semantic analysis uses Opus (agent loads drift-analysis skill).

## Arguments

Parse from $ARGUMENTS:
- `--sources`: Sources to scan (default: github,docs,code; supports gitlab/local/custom)
- `--depth`: quick or thorough (default: thorough)
- `--output`: file, display, or both (default: both)
- `--file`: Output path (default: drift-detect-report.md)

## Phase 1: Parse Arguments and Collect Data

```javascript
const pluginPath = '${PLUGIN_ROOT}'.replace(/\\/g, '/');
const collectors = require(`${pluginPath}/lib/drift-detect/collectors.js`);
const repoMap = require(`${pluginPath}/lib/repo-map`);
const { sources } = require(`${pluginPath}/lib`);

// Repo map is optional. If ast-grep exists, build the map. If not, ask whether to install.
const repoRoot = process.cwd();
const mapStatus = repoMap.status(repoRoot);
const astGrep = await repoMap.checkAstGrepInstalled();

if (!mapStatus.exists) {
  if (astGrep.found) {
    console.log('Repo map not found. Building it now for faster, more accurate drift detection...');
    const initResult = await repoMap.init(repoRoot, { includeDocs: false });
    if (initResult.success) {
      console.log(`Repo map created (${initResult.summary.files} files, ${initResult.summary.symbols} symbols).`);
    } else {
      console.log(`Repo map init failed (${initResult.error}). Continuing without repo map.`);
    }
  } else {
    const response = await AskUserQuestion({
      questions: [{
        header: 'Repo map setup',
        question: 'ast-grep is not installed. What would you like to do?',
        options: [
          { label: 'Install + init now', description: 'Agent installs ast-grep and builds repo map' },
          { label: "I'll install + init", description: 'You will install ast-grep and run /repo-map init' },
          { label: 'Continue without map', description: 'Skip repo map for this run' }
        ],
        multiple: false
      }]
    });

    const choice = response?.[0]?.[0];
    if (choice === 'Install + init now') {
      try {
        await Bash({
          command: 'npm install -g @ast-grep/cli',
          description: 'Installs ast-grep CLI globally'
        });
        const initResult = await repoMap.init(repoRoot, { includeDocs: false });
        if (initResult.success) {
          console.log(`Repo map created (${initResult.summary.files} files, ${initResult.summary.symbols} symbols).`);
        } else {
          console.log(`Repo map init failed (${initResult.error}). Continuing without repo map.`);
        }
      } catch {
        console.log('Failed to install ast-grep. Continuing without repo map.');
      }
    } else if (choice === "I'll install + init") {
      console.log(repoMap.getInstallInstructions());
      console.log('Install ast-grep, then run /repo-map init and re-run /drift-detect.');
      return;
    }
  }
} else if (mapStatus.status?.staleness?.isStale) {
  if (astGrep.found) {
    console.log(`Repo map is stale (${mapStatus.status.staleness.reason}). Updating now...`);
    const updateResult = await repoMap.update(repoRoot);
    if (!updateResult.success) {
      console.log(`Repo map update failed (${updateResult.error}). Continuing with stale map.`);
    }
  } else {
    console.log(`Repo map is stale (${mapStatus.status.staleness.reason}). Continuing without updating (ast-grep not installed).`);
  }
}

const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const options = {
  sources: ['github', 'docs', 'code'],
  depth: 'thorough',
  output: 'both',
  file: 'drift-detect-report.md',
  cwd: process.cwd()
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sources' && args[i+1]) options.sources = args[++i].split(',').map(s => s.trim());
  else if (args[i] === '--depth' && args[i+1]) options.depth = args[++i];
  else if (args[i] === '--output' && args[i+1]) options.output = args[++i];
  else if (args[i] === '--file' && args[i+1]) options.file = args[++i];
}

// Select issue tracker source (GitHub/GitLab/Local/Custom)
if (options.sources.includes('github') || options.sources.includes('gitlab')) {
  const { questions } = sources.getPolicyQuestions();
  const sourceQuestion = [questions[0]];
  const sourceResponse = await AskUserQuestion({ questions: sourceQuestion });
  const sourceAnswer = sourceResponse?.[0]?.[0];

  let custom = {};
  if (sources.needsCustomFollowUp(sourceAnswer)) {
    const typeResponse = await AskUserQuestion(sources.getCustomTypeQuestions());
    const typeAnswer = typeResponse?.[0]?.[0];
    const typeMap = {
      'CLI Tool': 'cli',
      'MCP Server': 'mcp',
      'Skill/Plugin': 'skill',
      'File Path': 'file'
    };
    const typeInternal = typeMap[typeAnswer] || 'cli';
    const nameResponse = await AskUserQuestion(sources.getCustomNameQuestion(typeInternal));
    const nameAnswer = nameResponse?.[0]?.[0];
    custom = { type: typeAnswer, name: nameAnswer };
  }

  if (sources.needsOtherDescription(sourceAnswer)) {
    const otherResponse = await AskUserQuestion({
      questions: [{
        header: 'Other',
        question: 'Describe the source you want me to use.',
        options: [],
        multiSelect: false
      }]
    });
    custom = { ...custom, description: otherResponse?.[0]?.[0] };
  }

  const policy = sources.parseAndCachePolicy({
    source: sourceAnswer,
    priority: 'All',
    stopPoint: 'Merged',
    custom
  });
  options.issueSource = policy.taskSource;

  if (options.issueSource?.source && options.issueSource.source !== 'github') {
    options.sources = options.sources.filter(src => src !== 'github');
    if (!options.sources.includes(options.issueSource.source)) {
      options.sources.push(options.issueSource.source);
    }
  }
}

console.log(`## Starting Reality Check Scan\n\n**Sources**: ${options.sources.join(', ')}\n**Depth**: ${options.depth}\n`);

const collectedData = await collectors.collectAllData(options);

if (collectedData.github && !collectedData.github.available) {
  if (collectedData.github.source === 'gitlab') {
    console.log(`Note: GitLab CLI not available. Run \`glab auth login\` to enable.`);
  } else if (collectedData.github.source === 'github') {
    console.log(`Note: GitHub CLI not available. Run \`gh auth login\` to enable.`);
  } else if (collectedData.github.source === 'custom') {
    console.log(`Note: Custom source unavailable. Verify your configuration or tool.`);
  }
}

console.log(`### Data Collection Complete\n`);
```

## Phase 2: Semantic Analysis

Agent loads drift-analysis skill automatically via frontmatter. Pass data, let agent/skill handle analysis instructions.

```javascript
await Task({
  subagent_type: "drift-detect:plan-synthesizer",
  prompt: `Analyze this project for drift between plans and implementation.

## Collected Data

### Issue Tracker State
\`\`\`json
${JSON.stringify(collectedData.github, null, 2)}
\`\`\`

### Documentation Analysis
\`\`\`json
${JSON.stringify(collectedData.docs, null, 2)}
\`\`\`

### Codebase Analysis
\`\`\`json
${JSON.stringify(collectedData.code, null, 2)}
\`\`\`

### Drift Summary
\`\`\`json
${JSON.stringify(collectedData.drift, null, 2)}
\`\`\`

Generate a Reality Check Report. Be brutally specific with issue numbers, file paths, and actionable recommendations.

Evidence requirement: for every drift claim include:
- Docs evidence (file + line from drift.featureEvidence.items[].doc or drift.planEvidence.items[].doc or docs.featureDetails)
- Code evidence (file + line/symbol from drift.featureEvidence.items[].code or drift.planEvidence.items[].code or code.repoMap.featureEvidence)
If evidence is missing, state it explicitly.`,
  description: "Analyze project reality"
});
```

## Phase 3: Output Report

```javascript
if (options.output === 'file' || options.output === 'both') {
  console.log(`\n---\nReport saved to: ${options.file}`);
}

console.log(`\n## Reality Check Complete\n\nRun \`/drift-detect --depth quick\` for faster subsequent scans.`);
```

## Quick Reference

| Flag | Values | Default |
|------|--------|---------|
| --sources | github,gitlab,local,custom,docs,code | all |
| --depth | quick, thorough | thorough |
| --output | file, display, both | both |
| --file | path | drift-detect-report.md |

Begin scan now.

