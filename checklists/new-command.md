# New Slash Command Checklist

Adding a new slash command (e.g., `/my-command`).

## Best Practices Reference

- **Prompt Design**: `agent-docs/PROMPT-ENGINEERING-REFERENCE.md`
- **Cross-Model Compatibility**: `lib/cross-platform/RESEARCH.md`

## 1. Create Command File

Location: `plugins/{plugin-name}/commands/{command-name}.md`

```markdown
---
description: Short description for implicit invocation (max 500 chars)
---

# /command-name - Title

Brief description of what the command does.

## Arguments

- `--flag`: Description
- `[optional]`: Description

## Workflow

1. Step one
2. Step two

## Output Format

Describe expected output.
```

**Guidelines:**
- Keep description under 500 chars (token efficiency)
- Use imperative instructions ("Do X", not "You should do X")
- Include examples for complex operations
- Reference lib modules: `${CLAUDE_PLUGIN_ROOT}/lib/...`

## 2. Update Plugin Manifest

File: `plugins/{plugin-name}/.claude-plugin/plugin.json`

Add command to the plugin's command list if needed.

## 3. Update Marketplace

File: `.claude-plugin/marketplace.json`

If it's a new plugin or major command:
```json
{
  "name": "plugin-name",
  "description": "Updated description mentioning new command"
}
```

## 4. Update CLI Installer

File: `bin/cli.js`

Add command mappings for OpenCode and Codex:

```javascript
// OpenCode mappings (~line 218)
const commandMappings = [
  // ... existing
  ['new-command.md', 'plugin-name', 'new-command.md'],
];

// Codex skill mappings (~line 328)
const skillMappings = [
  // ... existing
  ['new-command', 'plugin-name', 'new-command.md', 'Description for skill'],
];
```

## 5. Update Documentation

- [ ] `docs/ARCHITECTURE.md` → Add to commands list if significant
- [ ] `README.md` → Add to Available Commands section
- [ ] `CHANGELOG.md` → Note the addition

## 6. Test Cross-Platform

```bash
# Rebuild package
npm pack

# Test installation
npm install -g ./awesome-slash-*.tgz
awesome-slash  # Select all platforms

# Verify command exists
# Claude Code: /new-command
# OpenCode: /new-command
# Codex CLI: $new-command
```

## 7. Sync Library (if command uses lib/)

```bash
./scripts/sync-lib.sh
```
