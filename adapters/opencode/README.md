# awesome-slash for OpenCode

Professional-grade slash commands adapted for OpenCode.

## Quick Install

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./adapters/opencode/install.sh
```

## Prerequisites

- **OpenCode** - Install from [opencode.ai](https://opencode.ai)
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org)
- **Git** - Download from [git-scm.com](https://git-scm.com)
- **GitHub CLI (`gh`)** - For PR commands (install: `brew install gh` or see [cli.github.com](https://cli.github.com))

## Available Commands

### 🧹 `/deslop` - AI Slop Cleanup

Remove debugging code, old TODOs, and other AI slop.

```bash
opencode
> /deslop
> /deslop apply
> /deslop apply src/ 10
```

**What it does:**
- Scans for console.logs, print statements, old TODOs
- Generates report or auto-applies fixes
- Runs verification tests
- Preserves functionality with minimal diffs

---

### 📋 `/next-task` - Intelligent Task Prioritization

Discover what to work on next with AI analysis.

```bash
opencode
> /next-task
> /next-task bug
> /next-task --include-blocked
```

**What it does:**
- Analyzes GitHub Issues (required)
- Validates tasks aren't already implemented
- Scores by impact, urgency, effort
- Provides top 5 recommendations with evidence

**Requires:** GitHub CLI (`gh`)

---

### 🔍 `/audit-project` - Multi-Agent Code Review

Comprehensive review with specialized AI agents.

```bash
opencode
> /audit-project
> /audit-project --recent
> /audit-project --domain security
> /audit-project --resume
```

**What it does:**
- Deploys 10 specialized agents
- Adapts to your tech stack
- Finds bugs, security issues, performance problems
- Iterates until no open issues remain

---

### 🚀 `/ship` - Complete PR Workflow

Ship from commit to production with validation.

```bash
opencode
> /ship
> /ship --strategy rebase
```

**What it does:**
1. Commits changes with AI message
2. Creates PR with description
3. Waits for CI to pass
4. Runs quality reviews
5. Merges to main
6. Deploys to dev/prod
7. Validates deployments
8. Auto-rollback on failure

**Requires:** Git, GitHub CLI (`gh`)

---


## OpenCode-Specific Features

OpenCode provides additional features you can combine with awesome-slash commands:

### File Includes with `@`

Include file contents in your prompt:

```bash
opencode
> /audit-project @src/main.py @tests/test_main.py
```

This adds the file contents to the context before running the review.

### Bash Output with `!`

Include bash command output:

```bash
opencode
> /deslop apply !git diff --name-only
```

This runs `git diff --name-only` and includes the output in the prompt.

### Combined Usage

```bash
opencode
> /next-task @PLAN.md !gh issue list
```

Analyzes tasks with PLAN.md content and current GitHub issues.

---

## Installation Details

The installer:
1. Creates `~/.opencode/commands/awesome-slash/`
2. Copies command files with path adjustments
3. Installs shared libraries (platform detection, patterns)
4. Creates environment setup scripts

### File Structure

```
~/.opencode/commands/awesome-slash/
├── deslop.md
├── next-task.md
├── audit-project.md
├── ship.md
├── lib/
│   ├── platform/
│   │   ├── detect-platform.js
│   │   └── verify-tools.js
│   ├── patterns/
│   │   ├── review-patterns.js
│   │   └── slop-patterns.js
│   └── utils/
│       └── context-optimizer.js
├── env.sh
└── README.md
```

---

## Usage Examples

### Clean up with file filter
```bash
opencode
> /deslop apply @src/app.js

# Changeset 1/3: Remove console.log statements
# - src/app.js: Removed 3 console.log calls
# ✓ Tests passed
```

### Review specific files
```bash
opencode
> /audit-project @src/auth.py @src/api.py

# Iteration 1: Found 4 issues (2 critical, 2 high)
# ✓ Fixed SQL injection in auth.py:45
# ✓ Fixed race condition in api.py:123
```

### Next task with context
```bash
opencode
> /next-task @PLAN.md !gh issue list

# Top 5 Priority Tasks:
# (includes analysis from PLAN.md and GitHub issues)
```

### Ship with diff review
```bash
opencode
> !git diff
> /ship --strategy rebase

# (reviews the diff you just displayed, then ships)
```

---

## Platform Support

### Auto-Detected CI Platforms
GitHub Actions · GitLab CI · CircleCI · Jenkins · Travis CI

### Auto-Detected Deployment Platforms
Railway · Vercel · Netlify · Fly.io · Platform.sh · Render

### Auto-Detected Project Types
Node.js · Python · Rust · Go · Java

---

## Updating

To update commands:

```bash
cd /path/to/awesome-slash
git pull origin main
./adapters/opencode/install.sh
```

---

## Troubleshooting

### Commands not showing up
1. Restart OpenCode TUI
2. Check installation: `ls ~/.opencode/commands/awesome-slash/`
3. Re-run installer

### Commands only work in TUI

Currently, OpenCode slash commands are only available in the TUI (Terminal User Interface), not from the CLI directly. Feature request exists to add CLI support.

### Path errors
Re-run installer to fix path substitutions:
```bash
./adapters/opencode/install.sh
```

### Node.js not found
Ensure Node.js 18+ is installed:
```bash
node --version  # Should be v18.0.0 or higher
```

### GitHub CLI authentication
```bash
gh auth login
gh auth status
```

---

## Differences from Claude Code

| Feature | Claude Code | OpenCode |
|---------|-------------|----------|
| Installation | Marketplace | Manual script |
| Updates | Automatic | Re-run installer |
| File Includes | Built-in | `@filename` syntax |
| Bash Output | Built-in | `!command` syntax |
| Multi-agent | Full support | May vary |

---

## Support

- **Repository**: https://github.com/avifenesh/awesome-slash
- **Issues**: https://github.com/avifenesh/awesome-slash/issues
- **OpenCode Docs**: https://opencode.ai/docs

---

## Resources

- [OpenCode Commands](https://opencode.ai/docs/commands/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [awesome-slash Main README](../../README.md)
- [Multi-Tool Adapters](../README.md)

---

Made with ❤️ for the OpenCode community
