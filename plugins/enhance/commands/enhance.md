---
description: Analyze plugin structures, MCP tools, and security patterns
argument-hint: "[plugin-name] [--fix] [--verbose]"
---

# /enhance:plugin - Plugin Structure Analyzer

Analyze plugin structures, MCP tool definitions, and security patterns against best practices.

## Arguments

Parse from $ARGUMENTS:
- **plugin**: Specific plugin to analyze (default: all)
- **--fix**: Apply auto-fixes for HIGH certainty issues
- **--verbose**: Show all issues including LOW certainty

## Workflow

1. **Discover plugins** - Find all plugins in `plugins/` directory
2. **Load patterns** - Import from `${CLAUDE_PLUGIN_ROOT}/lib/enhance/`
3. **Analyze each plugin**:
   - Validate plugin.json structure
   - Check MCP tool definitions
   - Scan for security patterns
4. **Generate report** - Markdown table grouped by certainty
5. **Apply fixes** - If --fix flag, apply HIGH certainty auto-fixes

## Detection Categories

### HIGH Certainty

| Pattern | Description | Auto-Fix |
|---------|-------------|----------|
| Missing additionalProperties | Schema allows extra fields | Add `"additionalProperties": false` |
| Missing required fields | Parameters not marked required | Add to `required` array |
| Version mismatch | plugin.json vs package.json | Sync versions |
| Missing tool description | Tool has no description | Manual fix required |

### MEDIUM Certainty (verify context)

| Pattern | Description |
|---------|-------------|
| Broad permissions | Agent has `Bash` without restrictions |
| Deep nesting | Parameter schema >2 levels deep |
| Long description | Tool description >500 chars |
| Missing param descriptions | Parameters lack descriptions |

### LOW Certainty (advisory)

| Pattern | Description |
|---------|-------------|
| Tool over-exposure | Many tools in single plugin |
| Optimization hints | Suggested simplifications |

## Output Format

```markdown
## Plugin Analysis: {plugin-name}

### Tool Definitions ({n} issues)
| Tool | Issue | Fix | Certainty |
|------|-------|-----|-----------|
| workflow_start | Missing additionalProperties | Add to schema | HIGH |

### Structure ({n} issues)
- Version mismatch: plugin.json (2.6.1) vs package.json (2.7.0)

### Security ({n} issues)
- `ci-fixer` agent has unrestricted Bash access
```

## Implementation

```javascript
const { pluginAnalyzer } = require('${CLAUDE_PLUGIN_ROOT}/lib/enhance');

// Parse arguments
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const pluginName = args.find(a => !a.startsWith('--'));
const applyFixes = args.includes('--fix');
const verbose = args.includes('--verbose');

// Run analysis
const results = await pluginAnalyzer.analyze({
  plugin: pluginName,
  verbose
});

// Generate report
const report = pluginAnalyzer.generateReport(results);
console.log(report);

// Apply fixes if requested
if (applyFixes) {
  const fixed = await pluginAnalyzer.applyFixes(results);
  console.log(`Applied ${fixed.applied.length} fixes`);
}
```

## Success Criteria

- All plugin.json files validated
- MCP tool definitions checked against best practices
- Security patterns scanned
- Clear report with actionable items
- Auto-fix available for HIGH certainty issues
