# Installation Guide

One codebase works across three platforms—Claude Code, OpenCode, and Codex CLI. Install once, get the same workflows everywhere. State files adapt automatically to each platform's conventions.

---

## Quick Navigation

| Section | Jump to |
|---------|---------|
| [Claude Code](#claude-code-recommended) | Marketplace install (easiest) |
| [npm Install](#all-platforms-npm-global-install) | Works for all platforms |
| [Alternative Methods](#alternative-installation-methods) | Local dev, manual |
| [Verify Installation](#verify-installation) | Check it worked |
| [Prerequisites](#prerequisites) | What you need first |
| [Troubleshooting](#troubleshooting) | Common issues |

---

## Claude Code (Recommended)

Add the marketplace and install plugins directly in Claude Code:

```bash
/plugin marketplace add avifenesh/awesome-slash
/plugin install next-task@awesome-slash
/plugin install ship@awesome-slash
/plugin install deslop@awesome-slash
/plugin install audit-project@awesome-slash
/plugin install drift-detect@awesome-slash
/plugin install repo-map@awesome-slash
/plugin install enhance@awesome-slash
/plugin install sync-docs@awesome-slash
```

**Scopes** (optional):
```bash
# User scope (default) - available in all projects
/plugin install next-task@awesome-slash

# Project scope - shared with team
/plugin install next-task@awesome-slash --scope project
```

---

## All Platforms (npm Global Install)

Interactive installer for Claude Code, OpenCode, and Codex CLI:

```bash
npm install -g awesome-slash@latest
awesome-slash
```

Select one or more platforms when prompted:
```
Which platforms do you want to install for?

  1) Claude Code
  2) OpenCode
  3) Codex CLI

Your selection: 1 2
```

**Commands:**
```bash
npm update -g awesome-slash       # Update
npm uninstall -g awesome-slash    # Remove npm package
awesome-slash --remove            # Clean up configs
```

---

## Alternative Installation Methods

### Local Development (Plugin Directory)

For testing or development, load plugins directly:

```bash
git clone https://github.com/avifenesh/awesome-slash.git
claude --plugin-dir ./awesome-slash/plugins/next-task
```

### OpenCode / Codex CLI

Use the npm installer (recommended):

```bash
npm install -g awesome-slash@latest
awesome-slash
```

Select your platform when prompted. The installer configures:

| Platform | Config Location | State Directory |
|----------|-----------------|-----------------|
| Claude Code | Marketplace | `.claude/` |
| OpenCode | `~/.config/opencode/` | `.opencode/` |
| Codex CLI | `~/.codex/` | `.codex/` |

> **Note:** Codex uses `$` prefix for skills (e.g., `$next-task` instead of `/next-task`).

---

## Verify Installation

### Claude Code

```bash
/help
```

You should see commands:
- `/next-task` - Master workflow orchestrator
- `/ship` - Complete PR workflow
- `/deslop` - AI slop cleanup
- `/audit-project` - Multi-agent code review
- `/drift-detect` - Plan drift detection
- `/repo-map` - AST repo map generation
- `/enhance` - Enhancement analyzer suite
- `/sync-docs` - Documentation sync

### OpenCode / Codex

Type the command name and it should be recognized:
- `/next-task` (OpenCode) or `$next-task` (Codex)

### Local Repo Diagnostics (optional)

If you're running from the repo, you can verify platform detection and tool availability:

```bash
npm run detect   # Platform detection (CI, deploy, project type)
npm run verify   # Tool availability + versions
```

---

## Prerequisites

### Required

- **Git** - Version control
  ```bash
  git --version
  ```

- **Node.js 18+** - For library functions

### Recommended (Repo Map)

- **ast-grep (`sg`)** - Required for `/repo-map` generation. Install upfront for the best experience.

### Required for GitHub Workflows

- **GitHub CLI (`gh`)** - For PR operations and issue discovery
  ```bash
  # Install
  brew install gh        # macOS
  winget install GitHub.cli  # Windows

  # Authenticate
  gh auth login

  # Verify
  gh auth status
  ```

### Optional (Auto-Detected)

These tools are detected automatically if present:
- Railway CLI, Vercel CLI, Netlify CLI (for deployments)
- GitLab CLI (`glab`) for GitLab workflows

---

## Managing Plugins

### Update Marketplace

```bash
/plugin marketplace update awesome-slash
```

### Update Plugins

```bash
/plugin update next-task@awesome-slash
```

### Disable/Enable

```bash
/plugin disable next-task@awesome-slash
/plugin enable next-task@awesome-slash
```

### Uninstall

```bash
/plugin uninstall next-task@awesome-slash

# Or remove marketplace entirely
/plugin marketplace remove awesome-slash
```

### Local Installation Update

```bash
cd path/to/awesome-slash
git pull origin main
```

---

## Troubleshooting

### Commands Don't Appear

1. **Check marketplace is added:**
   ```bash
   /plugin marketplace list
   ```

2. **Check plugin is installed:**
   ```bash
   /plugin list
   ```

3. **Restart Claude Code** after installation

### "Marketplace not found"

The repository must be public or you need authentication:

```bash
# For private repos, ensure gh is authenticated
gh auth status
```

### Plugin Install Fails

Try adding the full GitHub URL:
```bash
/plugin marketplace add https://github.com/avifenesh/awesome-slash.git
```

### "GitHub CLI not found"

Required for `/ship` and GitHub-based workflows:
```bash
brew install gh  # macOS
winget install GitHub.cli  # Windows

gh auth login
```

---

## Platform-Specific Notes

### Claude Code
- Plugins installed via marketplace are cached locally
- Use `--scope project` to share plugins with your team
- State stored in `.claude/`

### OpenCode
- MCP server provides workflow tools
- Slash commands defined in `~/.config/opencode/commands/`
- State stored in `.opencode/`

### Codex CLI
- Uses `$` prefix instead of `/` for commands
- Skills defined in `~/.codex/skills/`
- State stored in `.codex/`

---

## Getting Help

- **Issues:** https://github.com/avifenesh/awesome-slash/issues
- **Discussions:** https://github.com/avifenesh/awesome-slash/discussions

```bash
gh issue create --repo avifenesh/awesome-slash \
  --title "Installation: [description]" \
  --body "Environment: [Claude Code/OpenCode/Codex], OS: [...]"
```
