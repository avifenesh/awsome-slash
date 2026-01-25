---
description: Deep repository analysis to realign project plans with actual code reality
argument-hint: "[--sources github,docs,code] [--depth quick|thorough] [--output file|display|both] [--file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Glob, Grep, Task, Write
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
- `--sources`: Sources to scan (default: github,docs,code)
- `--depth`: quick or thorough (default: thorough)
- `--output`: file, display, or both (default: both)
- `--file`: Output path (default: drift-detect-report.md)

## Phase 1: Parse Arguments and Collect Data

```javascript
const pluginPath = '${CLAUDE_PLUGIN_ROOT}'.replace(/\\/g, '/');
const collectors = require(`${pluginPath}/lib/drift-detect/collectors.js`);

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

console.log(`## Starting Reality Check Scan\n\n**Sources**: ${options.sources.join(', ')}\n**Depth**: ${options.depth}\n`);

const collectedData = await collectors.collectAllData(options);

if (options.sources.includes('github') && collectedData.github && !collectedData.github.available) {
  console.log(`Note: GitHub CLI not available. Run \`gh auth login\` to enable.`);
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

### GitHub State
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

Generate a Reality Check Report. Be brutally specific with issue numbers, file paths, and actionable recommendations.`,
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
| --sources | github,docs,code | all |
| --depth | quick, thorough | thorough |
| --output | file, display, both | both |
| --file | path | drift-detect-report.md |

Begin scan now.
