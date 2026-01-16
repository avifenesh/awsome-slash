#!/usr/bin/env node
/**
 * MCP Server for awesome-slash-commands
 *
 * Exposes workflow tools to any MCP-compatible AI coding assistant:
 * - Claude Code (native)
 * - OpenCode
 * - Codex CLI
 *
 * Run: node mcp-server/index.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const path = require('path');
const workflowState = require('../lib/state/workflow-state.js');

// Plugin root for relative paths
const PLUGIN_ROOT = process.env.PLUGIN_ROOT || path.join(__dirname, '..');

// Define available tools
const TOOLS = [
  {
    name: 'workflow_status',
    description: 'Get the current workflow state, including active task, phase, and resume capability',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'workflow_start',
    description: 'Start a new workflow with specified policy settings',
    inputSchema: {
      type: 'object',
      properties: {
        taskSource: {
          type: 'string',
          enum: ['gh-issues', 'linear', 'tasks-md', 'custom'],
          description: 'Where to look for tasks'
        },
        priorityFilter: {
          type: 'string',
          enum: ['continue', 'bugs', 'security', 'features', 'all'],
          description: 'What type of tasks to prioritize'
        },
        stoppingPoint: {
          type: 'string',
          enum: ['implemented', 'pr-created', 'all-green', 'merged', 'deployed', 'production'],
          description: 'How far to take the task'
        }
      },
      required: []
    }
  },
  {
    name: 'workflow_resume',
    description: 'Resume an interrupted workflow from its last checkpoint',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'workflow_abort',
    description: 'Abort the current workflow and cleanup resources (worktree, branches)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'task_discover',
    description: 'Discover and prioritize available tasks from configured sources',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['gh-issues', 'linear', 'tasks-md'],
          description: 'Task source to search'
        },
        filter: {
          type: 'string',
          description: 'Filter tasks by type (bug, feature, security, etc.)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return'
        }
      },
      required: []
    }
  },
  {
    name: 'review_code',
    description: 'Run multi-agent code review on changed files',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to review (defaults to git diff)'
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum review iterations (default: 3)'
        }
      },
      required: []
    }
  }
];

// Tool handlers
const toolHandlers = {
  async workflow_status() {
    const state = workflowState.readState();

    if (state instanceof Error) {
      return {
        content: [{ type: 'text', text: `Error: ${state.message}` }],
        isError: true
      };
    }
    if (!state) {
      return { content: [{ type: 'text', text: 'No active workflow.' }] };
    }

    const summary = workflowState.getWorkflowSummary();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(summary, null, 2)
      }]
    };
  },

  async workflow_start({ taskSource, priorityFilter, stoppingPoint }) {
    // Check for existing workflow
    if (workflowState.hasActiveWorkflow()) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Active workflow exists. Use workflow_abort to cancel or workflow_resume to continue.'
        }],
        isError: true
      };
    }

    const policy = {
      ...workflowState.DEFAULT_POLICY,
      taskSource: taskSource || 'gh-issues',
      priorityFilter: priorityFilter || 'continue',
      stoppingPoint: stoppingPoint || 'merged'
    };

    const state = workflowState.createState('next-task', policy);
    workflowState.writeState(state);

    return {
      content: [{
        type: 'text',
        text: `Workflow started: ${state.workflow.id}\nPolicy: ${JSON.stringify(policy, null, 2)}`
      }]
    };
  },

  async workflow_resume() {
    const state = workflowState.readState();

    if (state instanceof Error) {
      return {
        content: [{ type: 'text', text: `Error: ${state.message}` }],
        isError: true
      };
    }
    if (!state) {
      return {
        content: [{ type: 'text', text: 'No workflow to resume.' }],
        isError: true
      };
    }

    if (!state.checkpoints?.canResume) {
      return {
        content: [{ type: 'text', text: 'Workflow cannot be resumed from current state.' }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Resuming workflow ${state.workflow.id} from phase: ${state.checkpoints.resumeFrom}`
      }]
    };
  },

  async workflow_abort() {
    const state = workflowState.readState();

    if (state instanceof Error) {
      return {
        content: [{ type: 'text', text: `Error: ${state.message}` }],
        isError: true
      };
    }
    if (!state) {
      return {
        content: [{ type: 'text', text: 'No workflow to abort.' }]
      };
    }

    workflowState.abortWorkflow('User requested abort');

    return {
      content: [{
        type: 'text',
        text: `Workflow ${state.workflow.id} aborted. Cleanup: worktree and branches should be removed manually.`
      }]
    };
  },

  async task_discover({ source, filter, limit }) {
    // This would integrate with gh/linear/etc
    // For now, return placeholder
    return {
      content: [{
        type: 'text',
        text: `Task discovery would search ${source || 'gh-issues'} with filter "${filter || 'all'}" (limit: ${limit || 10})`
      }]
    };
  },

  async review_code({ files, maxIterations }) {
    return {
      content: [{
        type: 'text',
        text: `Code review would analyze ${files?.length || 'changed'} files with max ${maxIterations || 3} iterations.`
      }]
    };
  }
};

// Create and run server
async function main() {
  const server = new Server(
    {
      name: 'awesome-slash',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true
      };
    }

    try {
      return await handler(args || {});
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('awesome-slash MCP server running');
}

main().catch(console.error);
