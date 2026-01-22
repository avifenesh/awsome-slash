# New Agent Checklist

Adding a new specialist agent to the workflow.

## Best Practices Reference

- **Agent Design**: `agent-docs/AI-AGENT-ARCHITECTURE-RESEARCH.md`
- **Multi-Agent Systems**: `agent-docs/MULTI-AGENT-SYSTEMS-REFERENCE.md`
- **Instruction Following**: `agent-docs/LLM-INSTRUCTION-FOLLOWING-RELIABILITY.md`
- **Prompt Template**: `lib/cross-platform/RESEARCH.md` (Section 6)

## 1. Create Agent File

Location: `plugins/next-task/agents/{agent-name}.md`

Use this template structure:

```markdown
# Agent: {name}

## Role

{one-sentence description}

## Instructions

1. ALWAYS {critical constraint}
2. NEVER {prohibited action}
3. {specific step}

## Tools Available

- tool_1: description
- tool_2: description

If tool not listed, respond: "Tool not available"

## Output Format

<output>
{exact structure expected}
</output>

## Critical Constraints

{repeat most important constraints - addresses "Lost in Middle" problem}
```

**Guidelines:**
- Put critical info at START and END (Lost in Middle mitigation)
- Use explicit tool allowlisting
- Include 2-3 examples for complex tasks
- Keep descriptions concise (<100 chars per tool)
- Use imperative language

## 2. Choose Model Tier

| Complexity | Model | Use For |
|------------|-------|---------|
| Complex reasoning | `opus` | exploration, planning, implementation, review |
| Standard tasks | `sonnet` | validation, cleanup, monitoring |
| Simple operations | `haiku` | worktree setup, simple fixes |

## 3. Update Workflow Documentation

File: `agent-docs/workflow.md`

Add to the agent table:
```markdown
| Phase | Agent | Model | Required Tools | Purpose |
| X | `new-agent` | sonnet | Tool1, Tool2 | Brief purpose |
```

## 4. Update Orchestrator

File: `plugins/next-task/commands/next-task.md`

Add agent invocation at appropriate phase:
```javascript
await Task({
  subagent_type: "next-task:new-agent",
  model: "sonnet",  // or opus/haiku
  prompt: `Task description for agent`
});
```

## 5. Update Hooks (if needed)

File: `plugins/next-task/hooks/hooks.json`

If agent should trigger automatically after another agent:
```json
{
  "SubagentStop": {
    "triggers": {
      "previous-agent": "next-task:new-agent"
    }
  }
}
```

## 6. Define Tool Restrictions

In workflow.md, add to Agent Tool Restrictions table:
```markdown
| new-agent | Allowed: X, Y | Disallowed: Z |
```

## 7. Test Agent

```bash
# Run workflow and verify agent is called
/next-task

# Or test agent directly
Task({ subagent_type: "next-task:new-agent", prompt: "Test" })
```

## 8. Update Agent Count

File: `README.md`

Update "Specialist Agents (N Total)" section.

File: `docs/ARCHITECTURE.md`

Add to appropriate agent category table.
