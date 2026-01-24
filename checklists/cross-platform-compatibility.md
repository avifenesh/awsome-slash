# Cross-Platform Compatibility Checklist

Master reference for ensuring features work across Claude Code, OpenCode, and Codex CLI.

## Quick Reference

| Aspect | Claude Code | OpenCode | Codex CLI |
|--------|-------------|----------|-----------|
| **Config format** | JSON | JSON/JSONC | TOML |
| **Config location** | `~/.claude/settings.json` | `~/.config/opencode/opencode.json` | `~/.codex/config.toml` |
| **State directory** | `.claude/` | `.opencode/` | `.codex/` |
| **Commands location** | Plugin `commands/` | `~/.opencode/commands/` | N/A (use skills) |
| **Skills location** | `.claude/skills/` | `.opencode/skill/` | `~/.codex/skills/` |
| **Agents location** | Plugin `agents/` | `~/.opencode/agents/` | N/A (use MCP) |
| **Invocation prefix** | `/command` | `/command` | `$skill` |
| **Project instructions** | `CLAUDE.md` | `AGENTS.md` (reads CLAUDE.md) | `AGENTS.md` |
| **Env var for plugin root** | `CLAUDE_PLUGIN_ROOT` | `PLUGIN_ROOT` | `PLUGIN_ROOT` |
| **Env var for state dir** | N/A | `AI_STATE_DIR` | `AI_STATE_DIR` |
| **Label char limit** | No strict limit | **30 chars (enforced)** | No strict limit |

---

## Platform-Specific Transformations

### 1. Environment Variables

**In all command/agent files, transform:**
```
${CLAUDE_PLUGIN_ROOT} → ${PLUGIN_ROOT}
$CLAUDE_PLUGIN_ROOT   → $PLUGIN_ROOT
```

**Reason:** OpenCode and Codex use `PLUGIN_ROOT`, not `CLAUDE_PLUGIN_ROOT`.

### 2. State Directory

**Never hardcode `.claude/`**. Use platform-aware paths:

```javascript
// In JavaScript code
const stateDir = process.env.AI_STATE_DIR || '.claude';
const statePath = path.join(projectRoot, stateDir, 'tasks.json');
```

| Platform | AI_STATE_DIR Value |
|----------|-------------------|
| Claude Code | Not set (defaults to `.claude`) |
| OpenCode | `.opencode` |
| Codex CLI | `.codex` |

### 3. Command Frontmatter

**Claude Code format:**
```yaml
---
description: Task description
argument-hint: "[args]"
allowed-tools: Bash(git:*), Read, Write, Task
---
```

**OpenCode format:**
```yaml
---
description: Task description
agent: general
model: opencode/claude-opus-4-5  # Optional
subtask: true                     # Optional
---
```

**Transformation in installer:**
- Remove `allowed-tools` (permissions handled by agent definition)
- Add `agent: general`
- Optionally add `model` for complex commands

### 4. Agent Frontmatter

**Claude Code format:**
```yaml
---
name: my-agent
description: Agent description
tools: Bash(git:*), Read, Edit, Task
model: sonnet
---
```

**OpenCode format:**
```yaml
---
name: my-agent
description: Agent description
mode: subagent
model: anthropic/claude-sonnet-4
permission:
  read: allow
  edit: allow
  bash: ask
---
```

**Transformation rules:**

| Claude Code | OpenCode |
|-------------|----------|
| `tools: Bash(git:*)` | `permission: bash: allow` |
| `tools: Read` | `permission: read: allow` |
| `tools: Edit, Write` | `permission: edit: allow` |
| `tools: Task` | `permission: task: allow` |
| `model: sonnet` | `model: anthropic/claude-sonnet-4` |
| `model: opus` | `model: anthropic/claude-opus-4` |
| `model: haiku` | `model: anthropic/claude-haiku-3-5` |

### 5. Skill Format (Codex)

**Codex skills require SKILL.md with trigger-phrase descriptions:**

```yaml
---
name: skill-name
description: "Use when user asks to \"trigger phrase 1\", \"trigger phrase 2\". Description of what it does."
---
```

**Best practices:**
- Description MUST include trigger phrases
- Wrap description in quotes
- Escape internal quotes: `\"phrase\"`
- Keep SKILL.md under 500 lines
- Split large content into `references/` subdirectory

---

## UI/Question Constraints

### OpenCode 30-Character Label Limit

**CRITICAL:** OpenCode enforces a **30-character maximum** on option labels.

**Affected code:**
- `AskUserQuestion` tool calls
- Task selection labels
- Policy question labels
- Any user-facing options

**Pattern to use:**
```javascript
function truncateLabel(prefix, text, maxLen = 30) {
  const available = maxLen - prefix.length;
  return text.length > available
    ? prefix + text.substring(0, available - 1) + '…'
    : prefix + text;
}

// Example: "#123: " = 6 chars, leaving 24 for title
const label = truncateLabel(`#${issue.number}: `, issue.title);
```

**Template for task selection:**
```javascript
// CORRECT - All labels under 30 chars
AskUserQuestion({
  questions: [{
    header: "Select Task",  // max 30 chars
    question: "Which task to work on?",
    options: [
      { label: "#123: Fix login bug", description: "Full title here..." },
      { label: "#456: Add dark mode", description: "Full title here..." }
    ],
    multiSelect: false
  }]
});
```

**Files requiring label truncation:**
- `lib/sources/policy-questions.js` - Cached source labels
- `plugins/next-task/agents/task-discoverer.md` - Task selection
- `plugins/next-task/commands/next-task.md` - Existing task question

### Question Format Differences

| Aspect | Claude Code | OpenCode | Codex |
|--------|-------------|----------|-------|
| Multi-select | `multiSelect: true` | `multiple: true` | Not documented |
| Custom input | Always available | `custom: true` | "Other" option |
| Max questions | 4 | Unlimited | 5 |
| Header max | 12 chars | 30 chars | No limit |
| **Label max** | No limit | **30 chars** | No limit |

---

## MCP Configuration

### Claude Code
```json
{
  "mcpServers": {
    "awesome-slash": {
      "command": "node",
      "args": ["path/to/mcp-server/index.js"],
      "env": {
        "PLUGIN_ROOT": "path/to/plugin"
      }
    }
  }
}
```

### OpenCode
```json
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "path/to/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "path/to/plugin",
        "AI_STATE_DIR": ".opencode"
      },
      "enabled": true
    }
  }
}
```

### Codex CLI
```toml
[mcp_servers.awesome-slash]
command = "node"
args = ["path/to/mcp-server/index.js"]

[mcp_servers.awesome-slash.env]
PLUGIN_ROOT = "path/to/plugin"
AI_STATE_DIR = ".codex"
```

---

## Installation Locations

### Claude Code (via Marketplace)
```
~/.awesome-slash/           # Package copy
Plugin loaded via marketplace
```

### OpenCode
```
~/.awesome-slash/                      # Package copy
~/.opencode/commands/awesome-slash/    # Transformed commands
~/.opencode/agents/                    # Transformed agents (21 files)
~/.config/opencode/opencode.json       # MCP config added
```

### Codex CLI
```
~/.awesome-slash/           # Package copy
~/.codex/skills/            # Transformed skills (8 directories)
~/.codex/config.toml        # MCP config added
```

---

## Checklist: New Feature Release

### Before Starting

- [ ] Read this checklist completely
- [ ] Identify which platforms the feature affects
- [ ] Check if feature uses `AskUserQuestion` (label limits apply)

### Code Changes

- [ ] Use `${PLUGIN_ROOT}` not `${CLAUDE_PLUGIN_ROOT}` in new code
- [ ] Use `AI_STATE_DIR` env var for state directory paths
- [ ] All `AskUserQuestion` labels ≤30 chars
- [ ] No hardcoded `.claude/` paths

### Command Files

- [ ] Create command in `plugins/{plugin}/commands/`
- [ ] Add to `bin/cli.js` OpenCode `commandMappings` array
- [ ] Add to `bin/cli.js` Codex `skillMappings` array with trigger-phrase description

### Agent Files

- [ ] Create agent in `plugins/{plugin}/agents/`
- [ ] Agent will be auto-installed to OpenCode (installer handles transformation)
- [ ] Codex uses MCP tools instead of agents (no additional work)

### Installer Updates (`bin/cli.js`)

For new commands:
```javascript
// OpenCode command mappings (~line 218)
const commandMappings = [
  // [destFile, plugin, sourceFile]
  ['new-command.md', 'plugin-name', 'new-command.md'],
];
```

For new skills (Codex):
```javascript
// Codex skill mappings (~line 476)
const skillMappings = [
  // [skillName, plugin, sourceFile, triggerDescription]
  ['new-skill', 'plugin-name', 'new-command.md',
    'Use when user asks to "trigger1", "trigger2". Description of capability.'],
];
```

### Testing

- [ ] `npm test` passes (all 1307+ tests)
- [ ] Test on Claude Code: `/new-command`
- [ ] Test on OpenCode: `/new-command`
- [ ] Test on Codex CLI: `$new-skill`
- [ ] Verify state files created in correct directory

### Documentation

- [ ] Update `agent-docs/OPENCODE-REFERENCE.md` if OpenCode-specific
- [ ] Update `agent-docs/CODEX-REFERENCE.md` if Codex-specific
- [ ] Add to `CHANGELOG.md`

---

## Checklist: New Agent

### Code Changes

- [ ] Create in `plugins/{plugin}/agents/{agent-name}.md`
- [ ] Use `${PLUGIN_ROOT}` in all paths
- [ ] Keep description concise with clear purpose

### Installer Handles Automatically

The installer (`bin/cli.js`) automatically:
- Copies agent to `~/.opencode/agents/`
- Transforms frontmatter (tools → permissions, model names)
- No manual OpenCode agent creation needed

### Codex Compatibility

Codex doesn't have a native agent system. Our agents work via:
1. MCP tools that invoke agent logic
2. Skills that contain agent instructions inline

No additional Codex work needed for most agents.

---

## Checklist: Library Module Changes

- [ ] Update `lib/{module}/`
- [ ] Export from `lib/index.js`
- [ ] Run `./scripts/sync-lib.sh` to copy to all plugins
- [ ] Test on all platforms

---

## Common Pitfalls

### 1. Hardcoded State Directory
```javascript
// WRONG
const statePath = '.claude/tasks.json';

// CORRECT
const stateDir = process.env.AI_STATE_DIR || '.claude';
const statePath = `${stateDir}/tasks.json`;
```

### 2. Long Labels in Questions
```javascript
// WRONG - Will fail in OpenCode
{ label: "Resume and ship #220 (ProfileScreen component)", ... }

// CORRECT - Under 30 chars
{ label: "Resume task #220", description: "ProfileScreen component" }
```

### 3. Missing Trigger Phrases (Codex)
```yaml
# WRONG - Codex won't know when to trigger
description: Master workflow orchestrator

# CORRECT - Includes trigger phrases
description: "Use when user asks to \"find next task\", \"automate workflow\". Orchestrates task-to-production."
```

### 4. Wrong Environment Variable
```javascript
// WRONG - Only works in Claude Code
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

// CORRECT - Works everywhere
const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
```

### 5. Proactive Directory Creation
```javascript
// WRONG - Creates directory even if not needed
fs.mkdirSync('.opencode', { recursive: true });

// CORRECT - Only create when writing
function ensureStateDir() {
  const dir = process.env.AI_STATE_DIR || '.claude';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
```

---

## Reference Documents

| Document | Content |
|----------|---------|
| `agent-docs/OPENCODE-REFERENCE.md` | Complete OpenCode integration guide |
| `agent-docs/CODEX-REFERENCE.md` | Complete Codex CLI integration guide |
| `lib/cross-platform/RESEARCH.md` | Platform comparison research |
| `bin/cli.js` | Installer implementation (transformations) |

---

## File Size Recommendations

| File Type | Recommended Max | Notes |
|-----------|-----------------|-------|
| Command `.md` | 500 lines | Split into references/ if larger |
| Agent `.md` | 300 lines | Keep focused on single responsibility |
| Skill `SKILL.md` | 500 lines | Use progressive disclosure |

**Current violations to address:**
- `next-task.md`: 822 lines (split references needed)
- `enhance.md`: 941 lines (split references needed)
