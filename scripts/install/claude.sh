#!/bin/bash
# Install awesome-slash plugins for Claude Code
# Usage: ./scripts/install/claude.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Installing awesome-slash for Claude Code..."
echo "Plugin root: $PLUGIN_ROOT"

# Check if Claude Code is available
if ! command -v claude &> /dev/null; then
  echo "Error: Claude Code CLI not found"
  echo "Install from: https://claude.ai/code"
  exit 1
fi

# Install dependencies first
echo ""
echo "Installing dependencies..."
cd "$PLUGIN_ROOT"
npm install --production

# Add as local marketplace
echo ""
echo "Adding local marketplace..."
claude plugin marketplace add "$PLUGIN_ROOT" 2>/dev/null || true

# Install each plugin
echo ""
echo "Installing plugins..."

for plugin in next-task ship deslop-around project-review reality-check; do
  echo "  Installing $plugin..."
  claude plugin install "$plugin@awesome-slash" 2>/dev/null || echo "    (already installed or use /plugin install)"
done

echo ""
echo "✓ Installation complete!"
echo ""
echo "Available commands:"
echo "  /next-task            - Master workflow orchestrator"
echo "  /ship                 - Complete PR workflow"
echo "  /deslop-around        - AI slop cleanup"
echo "  /project-review       - Multi-agent code review"
echo "  /reality-check:scan   - Plan drift detection"
echo ""
echo "To verify: /plugin list"
echo ""
echo "Alternative: Start Claude with plugin directory:"
echo "  claude --plugin-dir $PLUGIN_ROOT/plugins/next-task"
