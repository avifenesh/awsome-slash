#!/bin/bash
# Install awesome-slash for Codex CLI
# Usage: ./scripts/install/codex.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Installing awesome-slash for Codex CLI..."
echo "Plugin root: $PLUGIN_ROOT"

# Check if codex is installed
if ! command -v codex &> /dev/null; then
  echo "Error: Codex CLI not found. Please install it first."
  echo "See: https://developers.openai.com/codex/quickstart/"
  exit 1
fi

# Install MCP server dependencies
echo "Installing MCP server dependencies..."
cd "$PLUGIN_ROOT/mcp-server"
npm install --production

# Add MCP server using codex mcp add command
echo "Configuring MCP server..."

# Remove existing awesome-slash MCP server if present
codex mcp remove awesome-slash 2>/dev/null || true

# Add the MCP server with environment variable
codex mcp add awesome-slash \
  --env "PLUGIN_ROOT=$PLUGIN_ROOT" \
  -- node "$PLUGIN_ROOT/mcp-server/index.js"

echo "MCP server configured."

# Create skills directory
CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex}"
SKILLS_DIR="$CODEX_CONFIG/skills"

echo "Installing Codex skills..."

# Create next-task skill
mkdir -p "$SKILLS_DIR/next-task"
cat > "$SKILLS_DIR/next-task/SKILL.md" << 'EOF'
---
name: next-task
description: Master workflow orchestrator for task-to-production automation. Use when users want to find their next task, prioritize work, start a new workflow, or ask "what should I work on". Integrates with GitHub Issues, Linear, and PLAN.md for task discovery.
---

# Next Task Workflow

Find and implement the next priority task with full workflow automation.

## Capabilities

Use the awesome-slash MCP tools:
- `workflow_status` - Check current workflow state
- `workflow_start` - Start a new workflow
- `workflow_resume` - Resume from checkpoint
- `workflow_abort` - Cancel and cleanup
- `task_discover` - Find and prioritize tasks

## Workflow

1. Check `workflow_status` for existing workflow
2. If none exists, use `workflow_start` to begin
3. Use `task_discover` to find priority tasks from configured source
4. Guide through task selection and implementation
5. Use `workflow_resume` if interrupted

## Task Sources

- GitHub Issues (default)
- Linear issues
- PLAN.md file
EOF

# Create ship skill
mkdir -p "$SKILLS_DIR/ship"
cat > "$SKILLS_DIR/ship/SKILL.md" << 'EOF'
---
name: ship
description: Complete PR workflow from commit to production with validation. Use when users want to ship code, create a PR, merge changes, or deploy. Handles commit, PR creation, CI monitoring, review, merge, and deployment.
---

# Ship Workflow

Complete PR workflow from commit to production.

## Capabilities

Use the awesome-slash MCP tools:
- `workflow_status` - Check current state
- `review_code` - Run multi-agent review

## Workflow

1. Stage and commit changes with AI-generated message
2. Create PR with context
3. Run `review_code` for multi-agent review
4. Monitor CI status
5. Merge when approved
6. Deploy if configured

## Platforms

Supports: GitHub Actions, GitLab CI, CircleCI, Railway, Vercel, Netlify, Fly.io
EOF

# Create review skill
mkdir -p "$SKILLS_DIR/review"
cat > "$SKILLS_DIR/review/SKILL.md" << 'EOF'
---
name: review
description: Run multi-agent code review on changes. Use when users want to review code, check code quality, or run code analysis before committing or creating a PR.
---

# Code Review

Run multi-agent code review on changes.

## Capabilities

Use the awesome-slash MCP tools:
- `review_code` - Run multi-agent review

## Review Agents

- Code quality analysis
- Silent failure detection
- Test coverage analysis
- Security review

## Usage

Run `review_code` tool with the files to review.
Auto-fixes critical and high severity issues.
Reports medium and low severity for manual review.
EOF

# Create deslop skill
mkdir -p "$SKILLS_DIR/deslop"
cat > "$SKILLS_DIR/deslop/SKILL.md" << 'EOF'
---
name: deslop
description: Clean AI slop from codebase - console.log statements, TODO comments, placeholder text, empty catch blocks, and other debugging artifacts. Use when users want to clean up code, remove debugging statements, or prepare code for production.
---

# Deslop - AI Slop Cleanup

Remove debugging code, old TODOs, and AI-generated slop from codebase.

## Detection Patterns

- Console debugging (console.log, print, dbg!)
- Placeholder text (TODO, FIXME, lorem ipsum)
- Empty catch blocks
- Commented-out code
- Magic numbers
- Disabled linters

## Usage

1. Analyze codebase or specific files
2. Report issues found with severity
3. Apply fixes with verification when requested
EOF

echo ""
echo "✓ Installation complete!"
echo ""
echo "Usage:"
echo "  1. Start Codex: codex --enable skills"
echo "  2. Skills available: \$next-task, \$ship, \$review, \$deslop"
echo "  3. MCP tools: workflow_status, workflow_start, task_discover, review_code"
echo ""
echo "To verify installation:"
echo "  codex mcp list"
echo "  ls ~/.codex/skills/"
