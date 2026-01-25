# awesome-slash for Codex CLI

Professional-grade slash commands adapted for OpenAI's Codex CLI.

## Quick Install

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./adapters/codex/install.sh
```

## Prerequisites

- **Codex CLI** - Install from [developers.openai.com/codex/cli](https://developers.openai.com/codex/cli)
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org)
- **Git** - Download from [git-scm.com](https://git-scm.com)
- **GitHub CLI (`gh`)** - For PR commands (install: `brew install gh` or see [cli.github.com](https://cli.github.com))

## Available Commands

### 🧹 `/deslop` - AI Slop Cleanup

Remove debugging code, old TODOs, and other AI slop.

```bash
codex
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
codex
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
codex
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
codex
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

## Installation Details

The installer:
1. Creates `~/.codex/prompts/awesome-slash/`
2. Copies command files with path adjustments
3. Installs shared libraries (platform detection, patterns)
4. Creates environment setup scripts

### File Structure

```
~/.codex/prompts/awesome-slash/
├── commands/
│   ├── deslop.md
│   ├── next-task.md
│   ├── audit-project.md
│   └── ship.md
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

### Clean up debugging code
```bash
codex
> /deslop apply

# Changeset 1/5: Remove console.log statements
# - src/app.js: Removed 3 console.log calls
# ✓ Tests passed
#
# Summary: 5 files changed, 23 lines deleted
```

### Get next priority task
```bash
codex
> /next-task

# Top 5 Priority Tasks:
#
# 1. [High Impact] Fix login timeout on mobile
#    Score: 9.2/10 (Impact: 10, Urgency: 9, Effort: 3)
#    Status: not-started (no code found)
```

### Ship a feature
```bash
# Make your changes
git add .

codex
> /ship

# ✓ Commits with AI message
# ✓ Creates PR with context
# ✓ Waits for CI
# ✓ Reviews code
# ✓ Merges to main
# ✓ Deploys and validates
```

---

## Codex-Specific Notes

### Custom Prompt Integration

These commands integrate with Codex's custom prompt system. You can also create shortcuts by adding to your Codex config.

### Multi-Agent Differences

Codex CLI may handle multi-agent workflows differently than Claude Code. Commands will adapt to available capabilities.

### Built-in Commands

Use alongside Codex's built-in commands:
- `/diff` - View Git diff
- `/review` - Codex's native review
- `/compact` - Summarize conversation
- `/model` - Switch models

awesome-slash commands complement these.

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
./adapters/codex/install.sh
```

---

## Troubleshooting

### Commands not showing up
1. Restart Codex CLI
2. Check installation: `ls ~/.codex/prompts/awesome-slash/commands/`
3. Re-run installer

### Path errors
Re-run installer to fix path substitutions:
```bash
./adapters/codex/install.sh
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

## Support

- **Repository**: https://github.com/avifenesh/awesome-slash
- **Issues**: https://github.com/avifenesh/awesome-slash/issues
- **Codex CLI Docs**: https://developers.openai.com/codex/cli

---

## Resources

- [Codex CLI Slash Commands](https://developers.openai.com/codex/cli/slash-commands/)
- [Custom Prompts](https://developers.openai.com/codex/custom-prompts/)
- [awesome-slash Main README](../../README.md)
- [Multi-Tool Adapters](../README.md)

---

Made with ❤️ for the Codex CLI community
