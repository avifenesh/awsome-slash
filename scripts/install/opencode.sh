#!/bin/bash
# Install awesome-slash for OpenCode
# Usage: ./scripts/install/opencode.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Installing awesome-slash for OpenCode..."
echo "Plugin root: $PLUGIN_ROOT"

# Check if OpenCode is installed
if ! command -v opencode &> /dev/null; then
  echo "Error: OpenCode not found. Please install it first."
  echo "See: https://opencode.ai/docs/cli/"
  exit 1
fi

# Check if OpenCode config directory exists
OPENCODE_CONFIG="${OPENCODE_CONFIG:-$HOME/.config/opencode}"
if [ ! -d "$OPENCODE_CONFIG" ]; then
  echo "Creating OpenCode config directory..."
  mkdir -p "$OPENCODE_CONFIG"
fi

# Install MCP server dependencies
echo "Installing MCP server dependencies..."
cd "$PLUGIN_ROOT/mcp-server"
npm install --production

# Create/update OpenCode config with MCP server
CONFIG_FILE="$OPENCODE_CONFIG/opencode.json"
echo "Configuring MCP server in $CONFIG_FILE..."

if [ -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
  echo "Backed up existing config to $CONFIG_FILE.backup"
fi

# Check if jq is available for JSON manipulation
if command -v jq &> /dev/null; then
  if [ -f "$CONFIG_FILE.backup" ]; then
    # Merge with existing config
    jq --arg root "$PLUGIN_ROOT" '.mcp["awesome-slash"] = {
      "type": "local",
      "command": ["node", ($root + "/mcp-server/index.js")],
      "environment": {"PLUGIN_ROOT": $root},
      "enabled": true
    }' "$CONFIG_FILE.backup" > "$CONFIG_FILE"
  else
    # Create new config
    jq -n --arg root "$PLUGIN_ROOT" '{
      "mcp": {
        "awesome-slash": {
          "type": "local",
          "command": ["node", ($root + "/mcp-server/index.js")],
          "environment": {"PLUGIN_ROOT": $root},
          "enabled": true
        }
      }
    }' > "$CONFIG_FILE"
  fi
else
  # Create config without jq
  cat > "$CONFIG_FILE" << EOF
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "$PLUGIN_ROOT/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "$PLUGIN_ROOT"
      },
      "enabled": true
    }
  }
}
EOF
fi

# Create agent definitions
AGENT_DIR="$OPENCODE_CONFIG/agent"
mkdir -p "$AGENT_DIR"

echo "Installing agent configurations..."

# Workflow orchestrator agent (primary)
cat > "$AGENT_DIR/workflow.md" << 'EOF'
---
description: Master workflow orchestrator for task-to-production automation with MCP tools
mode: primary
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
---

# Workflow Orchestrator

You are a workflow orchestrator that manages development tasks from discovery to production.

## MCP Tools Available

Use the awesome-slash MCP tools:
- `workflow_status` - Check current workflow state
- `workflow_start` - Start a new workflow
- `workflow_resume` - Resume from checkpoint
- `workflow_abort` - Cancel and cleanup
- `task_discover` - Find and prioritize tasks
- `review_code` - Run multi-agent review

## Workflow Phases

1. Policy Selection - Configure task source, priority, stopping point
2. Task Discovery - Find and prioritize tasks
3. Worktree Setup - Create isolated environment
4. Exploration - Deep codebase analysis
5. Planning - Design implementation plan
6. User Approval - Get plan approval
7. Implementation - Execute the plan
8. Review Loop - Multi-agent review until approved
9. Ship - PR creation, CI monitoring, merge
10. Cleanup - Remove worktree, update state

When starting, check for existing workflow with `workflow_status` first.
EOF

# Review agent (subagent)
cat > "$AGENT_DIR/review.md" << 'EOF'
---
description: Multi-agent code reviewer for quality analysis
mode: subagent
tools:
  read: true
  write: false
  edit: false
  bash: false
  glob: true
  grep: true
---

# Code Review Agent

Run comprehensive code review using the awesome-slash `review_code` MCP tool.

## Review Domains

- Code quality analysis
- Silent failure detection
- Test coverage analysis
- Security review

## Process

1. Call `review_code` with files to review
2. Report issues by severity (critical, high, medium, low)
3. Auto-fix critical and high severity issues
4. Report medium and low for manual review
EOF

# Ship agent (subagent)
cat > "$AGENT_DIR/ship.md" << 'EOF'
---
description: Complete PR workflow from commit to production
mode: subagent
tools:
  read: true
  write: true
  bash: true
  glob: true
  grep: true
permission:
  bash:
    "git *": allow
    "gh *": allow
    "*": ask
---

# Ship Agent

Complete PR workflow from commit to production.

## Workflow

1. Stage and commit changes with AI-generated message
2. Create PR with context
3. Run `review_code` MCP tool for multi-agent review
4. Monitor CI status
5. Merge when approved
6. Deploy if configured

## Platform Support

- CI: GitHub Actions, GitLab CI, CircleCI
- Deploy: Railway, Vercel, Netlify, Fly.io
EOF

echo ""
echo "✓ Installation complete!"
echo ""
echo "Usage:"
echo "  1. Start OpenCode: opencode"
echo "  2. Switch agents with Tab: workflow, review, ship"
echo "  3. MCP tools: workflow_status, workflow_start, task_discover, etc."
echo ""
echo "To verify installation:"
echo "  opencode mcp list"
echo "  ls ~/.config/opencode/agent/"
