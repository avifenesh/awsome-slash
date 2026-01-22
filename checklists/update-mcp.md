# MCP Server Update Checklist

Adding or updating MCP server tools.

## Best Practices Reference

- **MCP Patterns**: `agent-docs/FUNCTION-CALLING-TOOL-USE-REFERENCE.md`
- **Tool Schema**: `lib/cross-platform/RESEARCH.md` (Section 2)
- **Cross-Platform**: `lib/cross-platform/index.js`

## 1. Update Tool Definition

File: `mcp-server/index.js`

Add to `TOOLS` array (~line 30):
```javascript
{
  name: 'tool_name',
  description: 'Concise description (<100 chars)',
  inputSchema: {
    type: 'object',
    properties: {
      param: {
        type: 'string',
        description: 'Param description',
        enum: ['option1', 'option2']  // Use enums when possible
      }
    },
    required: []  // List required params
  }
}
```

**Guidelines:**
- Keep descriptions under 100 chars (token efficiency)
- Use flat parameter structures (avoid nesting)
- Include enums for constrained values
- Document defaults in description

## 2. Add Tool Handler

File: `mcp-server/index.js`

Add handler in the `handleToolCall` function:
```javascript
case 'tool_name': {
  const { param } = args;

  // Implementation
  const result = doSomething(param);

  // Use cross-platform response helpers
  return crossPlatform.successResponse(result);

  // Or for errors:
  // return crossPlatform.errorResponse('Error message', { details });
}
```

**Error Handling:**
- Use `crossPlatform.errorResponse()` for application errors
- Include actionable error messages
- Never throw - return `isError: true` response

## 3. Update Marketplace

File: `.claude-plugin/marketplace.json`

Add tool to mcpServer.tools array:
```json
"mcpServer": {
  "tools": ["existing_tool", "new_tool"]
}
```

## 4. Update CLI Installer

File: `bin/cli.js`

Update MCP tools list in both OpenCode and Codex sections:

```javascript
// OpenCode (~line 239)
console.log('   MCP tools: ..., new_tool\n');

// Codex (~line 371)
console.log('   MCP tools: ..., new_tool\n');
```

## 5. Update Documentation

File: `docs/ARCHITECTURE.md`

Add to MCP Server Tools table:
```markdown
| `new_tool` | Description of what it does |
```

## 6. Write Tests

File: `__tests__/mcp-server.test.js`

```javascript
describe('MCP Server - new_tool', () => {
  it('should handle valid input', async () => {
    // Test implementation
  });

  it('should handle errors gracefully', async () => {
    // Test error case
  });
});
```

## 7. Test Cross-Platform

```bash
# Rebuild and install
npm pack
npm install -g ./awesome-slash-*.tgz
awesome-slash  # Reinstall for all platforms

# Test MCP server loads
node -e "require('./mcp-server/index.js')"
```

## Tool Response Format

Always use these helpers from `lib/cross-platform`:

```javascript
const crossPlatform = require('../lib/cross-platform/index.js');

// Success
return crossPlatform.successResponse({ data: result });

// Error
return crossPlatform.errorResponse('What went wrong', { hint: 'How to fix' });

// Unknown tool
return crossPlatform.unknownToolResponse(toolName, availableTools);
```

## Common Pitfalls

- **Don't throw errors** - Use `isError: true` response
- **Don't use verbose descriptions** - Keep under 100 chars
- **Don't nest parameters** - Keep schema flat
- **Don't forget to update CLI** - Tools list shown to users
