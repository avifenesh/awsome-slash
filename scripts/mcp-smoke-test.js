#!/usr/bin/env node
/**
 * MCP Server Smoke Test
 * Verifies the MCP server tools are properly exported and callable
 */

const path = require('path');

console.log('MCP Smoke Test\n');

// Test 1: Server module loads
console.log('1. Loading MCP server module...');
let toolHandlers;
try {
  const mcpServer = require(path.join(__dirname, '..', 'mcp-server', 'index.js'));
  toolHandlers = mcpServer.toolHandlers;
  console.log('   ✓ Module loaded');
} catch (e) {
  console.error(`   ✗ Failed to load: ${e.message}`);
  process.exit(1);
}

// Test 2: Tool handlers exist
console.log('2. Checking tool handlers...');
const expectedTools = [
  'workflow_status',
  'workflow_start',
  'workflow_resume',
  'workflow_abort',
  'task_discover',
  'review_code'
];

let missing = [];
for (const tool of expectedTools) {
  if (typeof toolHandlers[tool] !== 'function') {
    missing.push(tool);
  }
}

if (missing.length > 0) {
  console.error(`   ✗ Missing handlers: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`   ✓ All ${expectedTools.length} handlers present`);

// Test 3: workflow_status returns without error
console.log('3. Calling workflow_status...');
(async () => {
  try {
    const result = await toolHandlers.workflow_status({});
    if (!result || !result.content) {
      throw new Error('Invalid response structure');
    }
    console.log('   ✓ Returns valid response');
  } catch (e) {
    console.error(`   ✗ Failed: ${e.message}`);
    process.exit(1);
  }

  // Test 4: task_discover handles missing gh gracefully
  console.log('4. Calling task_discover (tasks-md source)...');
  try {
    const result = await toolHandlers.task_discover({ source: 'tasks-md' });
    if (!result || !result.content) {
      throw new Error('Invalid response structure');
    }
    console.log('   ✓ Returns valid response');
  } catch (e) {
    console.error(`   ✗ Failed: ${e.message}`);
    process.exit(1);
  }

  console.log('\n✓ All smoke tests passed');
})();
