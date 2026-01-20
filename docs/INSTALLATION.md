# Installation Guide

Complete installation instructions for awesome-slash across all supported platforms.

---

## Claude Code (Recommended)

Add the marketplace and install plugins directly in Claude Code:

```bash
/plugin marketplace add avifenesh/awesome-slash
/plugin install next-task@awesome-slash
/plugin install ship@awesome-slash
/plugin install deslop-around@awesome-slash
/plugin install project-review@awesome-slash
/plugin install reality-check@awesome-slash
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

## Manual Installation

### Claude Code

### Option 1: Marketplace (Recommended)

Add the marketplace and install plugins:

```bash
# Add the marketplace
/plugin marketplace add avifenesh/awesome-slash

# Install all plugins
/plugin install next-task@awesome-slash
/plugin install ship@awesome-slash
/plugin install deslop-around@awesome-slash
/plugin install project-review@awesome-slash
/plugin install reality-check@awesome-slash
```

**Scopes** (optional):
```bash
# User scope (default) - available in all projects
/plugin install next-task@awesome-slash

# Project scope - shared with team (in .claude/settings.json)
/plugin install next-task@awesome-slash --scope project

# Local scope - just for you in this project (gitignored)
/plugin install next-task@awesome-slash --scope local
```

### Option 2: Local Clone

Clone the repository and run the install script:

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./scripts/install/claude.sh
```

### Option 3: Plugin Directory Flag

For development or testing:

```bash
git clone https://github.com/avifenesh/awesome-slash.git
claude --plugin-dir ./awesome-slash/plugins/next-task
```

---

## OpenCode

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./scripts/install/opencode.sh
```

This configures:
- MCP server in `~/.config/opencode/opencode.json`
- Slash commands in `~/.config/opencode/commands/`

---

## Codex CLI

> **Note:** Codex uses `$` prefix for skills (e.g., `$next-task` instead of `/next-task`).

```bash
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash
./scripts/install/codex.sh
```

This configures:
- MCP server in `~/.codex/config.toml`
- Skills in `~/.codex/skills/`

---

## Verify Installation

### Claude Code

```bash
/help
```

You should see commands:
- `/next-task` - Master workflow orchestrator
- `/ship` - Complete PR workflow
- `/deslop-around` - AI slop cleanup
- `/project-review` - Multi-agent code review
- `/reality-check:scan` - Plan drift detection

### OpenCode / Codex

Type the command name and it should be recognized:
- `/next-task` (OpenCode) or `$next-task` (Codex)

---

## Prerequisites

### Required

- **Git** - Version control
  ```bash
  git --version
  ```

- **Node.js 18+** - For library functions
  ```bash
  node --version
  ```

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
