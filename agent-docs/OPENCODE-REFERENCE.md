# OpenCode Integration Reference

> **SST OpenCode** (opencode.ai, github.com/sst/opencode) - 85k+ stars
> Not to be confused with the archived opencode-ai/opencode (now "Crush")

## Executive Summary

OpenCode has significant features Claude Code doesn't have:
- **Extended thinking** across 7+ providers (Anthropic, OpenAI, Google, Bedrock, etc.)
- **LSP integration** for code intelligence
- **Session compaction** with auto-summarization
- **12+ plugin hooks** for deep customization
- **Permission wildcards** with cascading approval
- **Event bus** for pub-sub across all operations

---

## Quick Facts

| Aspect | OpenCode | Claude Code |
|--------|----------|-------------|
| Config file | `opencode.jsonc` | `settings.json` |
| State directory | `.opencode/` | `.claude/` |
| Commands location | `~/.opencode/commands/` | Plugin commands |
| Skills location | `.opencode/skill/` | `.claude/skills/` |
| Agent definitions | `.opencode/agent/*.md` | Plugin agents |
| Model selection | Any provider (75+) | Anthropic only |
| User questions | Numbered list | Checkboxes |
| Project instructions | `AGENTS.md` (reads `CLAUDE.md` too) | `CLAUDE.md` |

---

## What Our Installer Does

When user runs `awesome-slash` and selects OpenCode:

```
~/.awesome-slash/           # Full package copy
~/.opencode/commands/awesome-slash/
├── deslop.md        # From plugins/deslop/commands/
├── enhance.md              # From plugins/enhance/commands/
├── next-task.md            # From plugins/next-task/commands/
├── delivery-approval.md
├── sync-docs.md
├── audit-project.md       # From plugins/audit-project/commands/
├── ship.md                 # From plugins/ship/commands/
└── drift-detect-scan.md   # From plugins/drift-detect/commands/scan.md

~/.config/opencode/opencode.json  # MCP config added
```

**MCP Configuration Added:**
```json
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "~/.awesome-slash/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "~/.awesome-slash",
        "AI_STATE_DIR": ".opencode"
      },
      "enabled": true
    }
  }
}
```

---

## Model Selection

### OpenCode Model Format

```
provider/model
```

**Examples:**
- `opencode/claude-opus-4-5` - Via OpenCode's proxy
- `anthropic/claude-opus-4-5` - Direct Anthropic
- `openai/gpt-4o` - OpenAI
- `groq/llama-3.3-70b` - Groq

### Specifying Model in Commands

OpenCode commands can specify model in frontmatter:

```yaml
---
description: Complex analysis task
agent: general
model: opencode/claude-opus-4-5
subtask: true
---
```

### Specifying Model in Agents

```yaml
# .opencode/agent/my-agent.md
---
description: Deep analysis agent
mode: subagent
model: opencode/claude-opus-4-5
temperature: 0.7
steps: 50
permission:
  edit: allow
  bash: ask
---

System prompt content here...
```

### Per-Agent Config in opencode.jsonc

```jsonc
{
  "agent": {
    "build": {
      "model": "opencode/claude-opus-4-5"
    },
    "triage": {
      "model": "opencode/claude-haiku-4-5"
    }
  }
}
```

---

## User Interaction Differences

### The Checkbox Problem

**Claude Code** - AskUserQuestion renders as interactive checkboxes:
```
☑ Option A (Recommended)
☐ Option B
☐ Option C
```

**OpenCode** - Questions render as numbered list:
```
1) Option A
2) Option B
3) Option C

Your selection: _
```

### OpenCode Question API

```typescript
// OpenCode's Question format
{
  question: "Which task source?",
  header: "Task Source",           // max 30 chars
  options: [
    { label: "GitHub Issues", description: "Fetch from gh issues" },
    { label: "Linear", description: "Fetch from Linear" }
  ],
  multiple: true,    // Allow multi-select (comma-separated numbers)
  custom: true       // Allow typing custom answer
}
```

### Implication for awesome-slash

Our agents use `AskUserQuestion` which works in both platforms, but:
- Claude Code: Beautiful checkbox UI
- OpenCode: Functional numbered list

**No code changes needed** - the functionality works, just different UI.

---

## Command Format Comparison

### Claude Code Format (Current)

```yaml
---
description: Task description
argument-hint: "[filter] [--status]"
allowed-tools: Bash(git:*), Read, Write, Task
---

# Command Title

Instructions...
```

### OpenCode Format

```yaml
---
description: Task description
agent: general              # Which agent handles this
model: opencode/claude-opus-4-5  # Optional model override
subtask: true               # Run as subtask (background)
---

Instructions with $1, $2, $ARGUMENTS placeholders...
```

### Key Differences

| Field | Claude Code | OpenCode |
|-------|-------------|----------|
| Tool restrictions | `allowed-tools` | `permission` block in agent |
| Arguments | `argument-hint` | `$1`, `$2`, `$ARGUMENTS` |
| Model | Inherited | `model` field |
| Agent selection | N/A | `agent` field |
| Background exec | N/A | `subtask: true` |

---

## Agent System

### Built-in OpenCode Agents

| Agent | Mode | Purpose |
|-------|------|---------|
| `build` | primary | Default, full tool access |
| `plan` | primary | Read-only, requires approval |
| `general` | subagent | Multi-step research |
| `explore` | subagent | Fast read-only exploration |

### Agent Modes

- **primary** - Can be default agent for sessions
- **subagent** - Called via Task tool from other agents
- **all** - Both primary and subagent

### Custom Agent Definition

```yaml
# .opencode/agent/opus-reviewer.md
---
description: Deep code review with Opus
mode: subagent
model: opencode/claude-opus-4-5
color: "#FF6B6B"
temperature: 0.3
steps: 100
permission:
  read: allow
  edit: ask
  bash: deny
---

You are a senior code reviewer. Analyze code thoroughly...
```

---

## MCP Integration

### Local Server (Our Setup)

```jsonc
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "/path/to/mcp-server/index.js"],
      "environment": { "PLUGIN_ROOT": "...", "AI_STATE_DIR": ".opencode" },
      "enabled": true,
      "timeout": 10000
    }
  }
}
```

### Remote Server (HTTP)

```jsonc
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### MCP Tools Available

All 8 tools work identically in OpenCode:
- `workflow_status` - Get current workflow state
- `workflow_start` - Start new workflow
- `workflow_resume` - Resume from checkpoint
- `workflow_abort` - Cancel and cleanup
- `task_discover` - Find tasks from sources
- `review_code` - Pattern-based code review
- `slop_detect` - 3-phase slop detection
- `enhance_analyze` - Quality analyzers

---

## Skill System

### Skill Location

OpenCode scans (in order):
1. `.opencode/skill/<name>/SKILL.md`
2. `.claude/skills/<name>/SKILL.md` (Claude Code compatibility)
3. `~/.config/opencode/skills/`

### Skill Format

```yaml
# .opencode/skill/my-skill/SKILL.md
---
name: my-skill
description: When to use this skill
---

Skill content and instructions...
```

### Compatibility

Our skills in `.claude/skills/` are automatically discovered by OpenCode.
No duplication needed.

---

## Configuration Hierarchy

**Merge order (lowest to highest priority):**
1. Remote org configs (`.well-known/opencode`)
2. Global: `~/.config/opencode/opencode.json`
3. Custom path: `OPENCODE_CONFIG` env var
4. Project: `opencode.jsonc` in project root
5. Inline: `OPENCODE_CONFIG_CONTENT` env var

### Variable Substitution

```jsonc
{
  "provider": {
    "anthropic": {
      "api_key": "{env:ANTHROPIC_API_KEY}"
    }
  }
}
```

---

## Permission System

### Permission Actions

- `allow` - Always allow
- `deny` - Always deny
- `ask` - Prompt user each time

### Pattern-Based Permissions

```jsonc
{
  "permission": {
    "edit": {
      "*.env": "ask",
      "*.env.example": "allow",
      "*": "allow"
    },
    "bash": "ask",
    "external_directory": "deny"
  }
}
```

### Per-Agent Permissions

```yaml
# In agent definition
permission:
  read: allow
  edit: ask
  bash: deny
  glob: allow
  grep: allow
```

---

## Project Instructions

### File Detection (auto-scanned)

OpenCode automatically reads:
1. `AGENTS.md` (preferred)
2. `CLAUDE.md` (fallback - compatibility)
3. `.github/copilot-instructions.md`
4. `.cursorrules`
5. `opencode.md`

### Generating AGENTS.md

```bash
# In OpenCode
/init
```

Creates `AGENTS.md` with project context.

---

## Known Limitations

### UI Differences (Not Fixable)

1. **Questions show as numbers, not checkboxes** - OpenCode limitation
2. **No rich markdown in responses** - Terminal rendering

### Functional Gaps

1. **No hook system** - OpenCode has plugins with hooks, but different from Claude Code hooks
2. **No marketplace** - Manual installation only
3. **Agent format differs** - Our agents work via Task tool, not native OpenCode agents

### Workarounds

| Issue | Workaround |
|-------|------------|
| No checkboxes | Works functionally, just different UI |
| Model selection | Users can set in `opencode.jsonc` |
| Agent definitions | MCP tools work; native agents need manual setup |

---

## Testing OpenCode Integration

### Verify MCP Connection

```bash
# In OpenCode session
# Use any MCP tool
workflow_status
```

### Verify Commands

```bash
# Should list awesome-slash commands
/next-task
/deslop
/ship
```

### Verify State Directory

```bash
# After running workflow
ls .opencode/
# Should see: tasks.json, flow.json (in worktree)
```

---

## Improvement Opportunities

### Short Term

1. Add `model:` hints to complex commands for better OpenCode experience
2. Document the numbered-list vs checkbox difference
3. Add OpenCode-specific examples to USAGE.md

### Medium Term

1. Create native OpenCode agent definitions (`.opencode/agent/`)
2. Add OpenCode plugin with hooks for workflow enforcement
3. Test with different model providers

### Long Term

1. OpenCode-native UI for task selection
2. Integrate with OpenCode's built-in agents
3. Cross-platform state sync

---

---

## Extended Thinking / Reasoning Configuration

OpenCode supports thinking/reasoning across **multiple providers** with different APIs.

### Provider-Specific Thinking Config

| Provider | Variants | Configuration |
|----------|----------|---------------|
| **Anthropic** | `high`, `max` | `thinking: { type: "enabled", budgetTokens: 16000 }` |
| **OpenAI/GPT-5** | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` | `reasoningEffort: "high"` |
| **Google Gemini** | `low`, `high`, `max` | `thinkingConfig: { includeThoughts: true, thinkingBudget: 16000 }` |
| **Amazon Bedrock** | `high`, `max` | `reasoningConfig: { type: "enabled", budgetTokens: 16000 }` |
| **Groq** | `none`, `low`, `medium`, `high` | `includeThoughts: true, thinkingLevel: "high"` |

### Configuring Extended Thinking

**Per-Agent (in opencode.jsonc):**
```jsonc
{
  "agent": {
    "build": {
      "model": "anthropic/claude-sonnet-4-20250929",
      "options": {
        "thinking": {
          "type": "enabled",
          "budgetTokens": 16000
        }
      }
    },
    "explore": {
      "model": "openai/gpt-5.1",
      "options": {
        "reasoningEffort": "high",
        "reasoningSummary": "auto"
      }
    }
  }
}
```

**Via Plugin Hook (runtime):**
```typescript
"chat.params": async (input, output) => {
  if (input.agent === "planning-agent") {
    output.options.thinking = { type: "enabled", budgetTokens: 16000 }
  }
}
```

**Cycle at Runtime:** Press `Ctrl+T` to cycle through available thinking variants.

---

## Question API Details

### Format Comparison

| Field | Claude Code | OpenCode |
|-------|-------------|----------|
| Multi-select | `multiSelect: true` | `multiple: true` |
| Custom input | Always available | `custom: true` (default) |
| Header max | 12 chars | 30 chars |
| **Label max** | No strict limit | **30 chars** (enforced) |
| Batch questions | 1-4 questions | Unlimited |

**CRITICAL: Label Length**
OpenCode enforces a **30-character limit** on option labels. Truncate task titles:
```javascript
function truncateLabel(num, title) {
  const prefix = `#${num}: `;
  const maxTitleLen = 30 - prefix.length;
  return title.length > maxTitleLen
    ? prefix + title.substring(0, maxTitleLen - 1) + '…'
    : prefix + title;
}
```

### OpenCode Question Schema

```typescript
{
  question: string,           // Full question text
  header: string,             // Label (max 30 chars)
  options: [
    { label: string, description: string }
  ],
  multiple?: boolean,         // Allow multi-select
  custom?: boolean            // Allow custom answer (default: true)
}
```

### Adapting Our AskUserQuestion Calls

Our agents use Claude's `AskUserQuestion` format. For OpenCode compatibility:

```typescript
// Claude Code format (current)
{
  questions: [{
    question: "Which task source?",
    header: "Source",        // max 12 chars
    multiSelect: false,
    options: [
      { label: "GitHub Issues", description: "..." }
    ]
  }]
}

// OpenCode equivalent
{
  questions: [{
    question: "Which task source?",
    header: "Task Source",   // max 30 chars - can be more descriptive
    multiple: false,
    custom: true,
    options: [
      { label: "GitHub Issues", description: "..." }
    ]
  }]
}
```

**Key Insight:** The formats are similar enough that Claude's `AskUserQuestion` tool works in OpenCode - it just renders as numbered list instead of checkboxes.

---

## Plugin Hooks (Deep Customization)

OpenCode has 12+ hooks for intercepting and modifying behavior.

### Hook Categories

**Chat Hooks:**
| Hook | Purpose |
|------|---------|
| `chat.message` | Intercept/modify user messages |
| `chat.params` | Modify temperature, reasoning effort, options |
| `chat.headers` | Add custom HTTP headers |

**Tool Hooks:**
| Hook | Purpose |
|------|---------|
| `tool.execute.before` | Modify tool arguments |
| `tool.execute.after` | Modify tool results |

**Permission Hook:**
| Hook | Purpose |
|------|---------|
| `permission.ask` | Override permission decisions (allow/deny/ask) |

**Experimental Hooks:**
| Hook | Purpose |
|------|---------|
| `experimental.chat.system.transform` | Modify system prompt |
| `experimental.session.compacting` | Customize session compaction |
| `experimental.chat.messages.transform` | Transform message history |

### Example: Workflow Enforcement via Hooks

```typescript
export const WorkflowPlugin: Plugin = async (ctx) => {
  return {
    "permission.ask": async (input, output) => {
      // Block git push during review phase
      if (input.permission === "bash" && input.metadata?.command?.includes("git push")) {
        const state = await getWorkflowState(ctx.directory)
        if (state?.phase === "review") {
          output.status = "deny"
        }
      }
    },

    "chat.params": async (input, output) => {
      // Use higher reasoning for complex agents
      if (["planning-agent", "implementation-agent"].includes(input.agent)) {
        output.options.thinking = { type: "enabled", budgetTokens: 16000 }
      }
    }
  }
}
```

---

## Session Compaction

OpenCode auto-compacts sessions when context overflows.

### How It Works

1. **Overflow Detection:** Monitors tokens vs model context limit
2. **Pruning:** Removes old tool outputs (keeps recent 40k tokens)
3. **Summarization:** Creates compacted summary message
4. **Continuation:** Auto-continues conversation

### Customizing Compaction

```typescript
"experimental.session.compacting": async (input, output) => {
  // Add workflow context to compaction
  const state = await getWorkflowState()
  output.context.push(`Current workflow phase: ${state?.phase}`)
  output.context.push(`Active task: ${state?.task?.title}`)

  // Custom compaction prompt
  output.prompt = "Summarize preserving: 1) workflow state 2) pending decisions 3) key findings"
}
```

---

## Permission System (Advanced)

### Wildcard Pattern Matching

```jsonc
{
  "permission": {
    "edit": {
      "*.env": "ask",
      "*.env.example": "allow",
      "src/**/*.ts": "allow",
      "*": "ask"
    },
    "bash": {
      "git *": "allow",
      "npm *": "allow",
      "rm -rf *": "deny",
      "*": "ask"
    }
  }
}
```

### Cascading Approval

When user selects "always" for a permission:
- All pending permissions matching same pattern are auto-approved
- Future requests matching pattern are auto-approved for session

### Permission Hook for Workflow

```typescript
"permission.ask": async (input, output) => {
  const workflowPatterns = {
    "git push": "deny",      // Block during review
    "gh pr create": "deny",  // Only /ship creates PRs
    "npm publish": "deny"    // Block publishing
  }

  for (const [pattern, action] of Object.entries(workflowPatterns)) {
    if (input.metadata?.command?.includes(pattern)) {
      output.status = action
      return
    }
  }
}
```

---

## LSP Integration

OpenCode has built-in Language Server Protocol support.

### Features

- **Symbol lookup:** Document and workspace symbols
- **Multiple servers:** pyright, TypeScript, custom
- **Dynamic spawning:** Per-file-type activation
- **Diagnostics:** Real-time error reporting

### Configuration

```jsonc
{
  "lsp": {
    "typescript": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx", ".js", ".jsx"]
    },
    "python": {
      "command": ["pyright-langserver", "--stdio"],
      "extensions": [".py"]
    },
    "custom": {
      "command": ["my-lsp", "--stdio"],
      "extensions": [".custom"],
      "disabled": false
    }
  }
}
```

---

## Event Bus

OpenCode has a pub-sub event system for all operations.

### Key Events

| Event | Description |
|-------|-------------|
| `session.created` | New session started |
| `session.compacted` | Session compressed |
| `message.updated` | Message content changed |
| `tool.execute.before/after` | Tool lifecycle |
| `file.edited` | File modified |
| `permission.updated` | Permission changed |

### Subscribing to Events

```typescript
"event": async ({ event }) => {
  switch (event.type) {
    case "tool.execute.after":
      // Update workflow state after tool completion
      await updateWorkflowState(event.properties)
      break
    case "session.compacted":
      // Preserve workflow context
      await preserveWorkflowContext(event.properties.sessionID)
      break
  }
}
```

---

## Native Plugin vs MCP

### Comparison

| Aspect | Native Plugin | MCP Server |
|--------|---------------|------------|
| Setup | `.opencode/plugins/` | MCP config + server process |
| Performance | Faster (in-process) | Slower (IPC) |
| Hooks | Full access (12+) | Tools only |
| Auth | Built-in OAuth/API | Manual |
| Events | Full subscription | None |

### Recommendation

**Use MCP** when:
- Cross-platform compatibility needed (Claude + OpenCode + Codex)
- Simple tool exposure

**Use Native Plugin** when:
- OpenCode-only features needed (hooks, events, compaction)
- Maximum performance required
- Deep workflow integration

---

## Implementation Opportunities

### Short Term (adapt existing)

1. **Question format:** Our `AskUserQuestion` works but could use longer headers (30 vs 12 chars)
2. **Model hints:** Add `model:` to agent frontmatter for OpenCode users
3. **Permission patterns:** Document recommended permission config for workflows

### Medium Term (new features)

1. **Native plugin:** Create OpenCode plugin alongside MCP server
2. **Reasoning config:** Add thinking budget config to our agents
3. **Compaction hook:** Preserve workflow state during session compaction
4. **Event integration:** Use event bus for workflow state management

### Long Term (unique value)

1. **LSP integration:** Leverage code intelligence for better reviews
2. **Permission enforcement:** Use hooks to enforce workflow gates
3. **Auto-model selection:** Choose reasoning level based on task complexity

---

## Global Thinking Model Configuration

### Proposal for awesome-slash

Add to user's `opencode.jsonc`:

```jsonc
{
  "agent": {
    // Simple agents - no extended thinking
    "worktree-manager": {
      "model": "anthropic/claude-haiku-4-5"
    },
    "simple-fixer": {
      "model": "anthropic/claude-haiku-4-5"
    },

    // Medium agents - standard thinking
    "task-discoverer": {
      "model": "anthropic/claude-sonnet-4",
      "options": { "thinking": { "type": "enabled", "budgetTokens": 8000 } }
    },

    // Complex agents - extended thinking
    "planning-agent": {
      "model": "anthropic/claude-sonnet-4",
      "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
    },
    "delivery-validator": {
      "model": "anthropic/claude-sonnet-4",
      "options": { "thinking": { "type": "enabled", "budgetTokens": 16000 } }
    }
  }
}
```

### Model Selection Strategy

| Agent Category | Model | Thinking Budget |
|----------------|-------|-----------------|
| **Execution** (worktree, simple-fixer) | Haiku | None |
| **Discovery** (task-discoverer, ci-monitor) | Sonnet | 8k |
| **Analysis** (exploration, deslop-work) | Sonnet | 12k |
| **Reasoning** (planning, review, delivery) | Sonnet | 16k |
| **Synthesis** (plan-synthesizer, enhancement-orchestrator) | Opus | 16k+ |

---

## Resources

- **Docs**: https://opencode.ai/docs
- **GitHub**: https://github.com/sst/opencode
- **Config Schema**: https://opencode.ai/config.json
- **SDK**: `npm install @opencode-ai/sdk`
- **Plugin SDK**: `npm install @opencode-ai/plugin`
