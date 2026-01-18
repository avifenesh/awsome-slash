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
const fs = require('fs').promises;
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);
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
    const taskSource = source || 'gh-issues';
    const maxTasks = limit || 10;

    try {
      let tasks = [];

      if (taskSource === 'gh-issues') {
        try {
          await execAsync('gh --version');
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: 'Error: GitHub CLI (gh) is not installed or not configured. Please install gh and authenticate.'
            }],
            isError: true
          };
        }

        const { stdout } = await execAsync(
          `gh issue list --state open --json number,title,labels,createdAt --limit ${maxTasks}`
        );

        const issues = JSON.parse(stdout || '[]');

        let filtered = issues;
        if (filter && filter !== 'all') {
          filtered = issues.filter(issue => {
            const labelNames = issue.labels.map(l => l.name.toLowerCase());
            const filterLower = filter.toLowerCase();

            return labelNames.some(label =>
              label.includes(filterLower) ||
              filterLower.includes(label)
            );
          });
        }

        tasks = filtered.map(issue => ({
          id: `#${issue.number}`,
          title: issue.title,
          type: issue.labels.find(l => ['bug', 'feature', 'security'].includes(l.name.toLowerCase()))?.name || 'task',
          labels: issue.labels.map(l => l.name),
          createdAt: issue.createdAt,
          source: 'github'
        }));

      } else if (taskSource === 'tasks-md') {
        const possibleFiles = ['TASKS.md', 'PLAN.md', 'TODO.md'];
        let content = null;
        let foundFile = null;

        for (const file of possibleFiles) {
          try {
            content = await fs.readFile(file, 'utf-8');
            foundFile = file;
            break;
          } catch (e) {
          }
        }

        if (content) {
          const lines = content.split('\n');
          const taskLines = lines.filter(line => /^[-*]\s+\[\s*\]\s+/.test(line));

          tasks = taskLines.slice(0, maxTasks).map((line, index) => {
            const text = line.replace(/^[-*]\s+\[\s*\]\s+/, '').trim();
            const isBug = /\b(bug|fix|error|issue)\b/i.test(text);
            const isFeature = /\b(feature|add|implement|create)\b/i.test(text);

            return {
              id: `task-${index + 1}`,
              title: text,
              type: isBug ? 'bug' : isFeature ? 'feature' : 'task',
              labels: [],
              source: foundFile
            };
          });

          if (filter && filter !== 'all') {
            tasks = tasks.filter(task => task.type === filter.toLowerCase());
          }
        } else {
          return {
            content: [{
              type: 'text',
              text: 'No task files found (looked for TASKS.md, PLAN.md, TODO.md)'
            }]
          };
        }
      } else {
        return {
          content: [{
            type: 'text',
            text: `Task source "${taskSource}" not yet implemented`
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            source: taskSource,
            filter: filter || 'all',
            count: tasks.length,
            tasks: tasks
          }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error discovering tasks: ${error.message}`
        }],
        isError: true
      };
    }
  },

  async review_code({ files, maxIterations }) {
    try {
      let filesToReview = files || [];

      if (!filesToReview.length) {
        try {
          const { stdout } = await execAsync('git diff --name-only HEAD');
          filesToReview = stdout.trim().split('\n').filter(f => f);

          if (!filesToReview.length) {
            const { stdout: stagedOut } = await execAsync('git diff --cached --name-only');
            filesToReview = stagedOut.trim().split('\n').filter(f => f);
          }

          if (!filesToReview.length) {
            const { stdout: lastCommit } = await execAsync('git diff --name-only HEAD~1');
            filesToReview = lastCommit.trim().split('\n').filter(f => f);
          }

        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error getting changed files: ${error.message}. Please specify files explicitly.`
            }],
            isError: true
          };
        }
      }

      if (!filesToReview.length) {
        return {
          content: [{
            type: 'text',
            text: 'No files to review. No changes detected in working directory or last commit.'
          }]
        };
      }

      const findings = [];
      const patterns = {
        console_log: {
          pattern: /console\.(log|debug|info|warn|error)\(/g,
          severity: 'warning',
          message: 'Debug console statement found'
        },
        todo_fixme: {
          pattern: /\/\/\s*(TODO|FIXME|HACK|XXX|NOTE):/gi,
          severity: 'info',
          message: 'Comment marker found'
        },
        commented_code: {
          pattern: /^\s*\/\/.*[{};].*$/gm,
          severity: 'info',
          message: 'Possible commented-out code'
        },
        debugger: {
          pattern: /\bdebugger\b/g,
          severity: 'error',
          message: 'Debugger statement found'
        },
        empty_catch: {
          pattern: /catch\s*\([^)]*\)\s*{\s*}/g,
          severity: 'warning',
          message: 'Empty catch block - silent error swallowing'
        },
        any_type: {
          pattern: /:\s*any\b/g,
          severity: 'warning',
          message: 'TypeScript "any" type used'
        },
        hardcoded_secret: {
          pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']+["']/gi,
          severity: 'error',
          message: 'Possible hardcoded secret'
        }
      };

      for (const file of filesToReview) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          const fileFindings = [];

          for (const [name, check] of Object.entries(patterns)) {
            const matches = [...content.matchAll(check.pattern)];

            for (const match of matches) {
              const position = match.index;
              let lineNum = 1;
              let charCount = 0;

              for (let i = 0; i < lines.length; i++) {
                charCount += lines[i].length + 1; // +1 for newline
                if (charCount > position) {
                  lineNum = i + 1;
                  break;
                }
              }

              fileFindings.push({
                type: name,
                line: lineNum,
                column: match.index - content.lastIndexOf('\n', match.index),
                severity: check.severity,
                message: check.message,
                match: match[0].substring(0, 100) // Truncate long matches
              });
            }
          }

          if (fileFindings.length > 0) {
            findings.push({
              file: file,
              issues: fileFindings
            });
          }

        } catch (error) {
          findings.push({
            file: file,
            error: `Could not read file: ${error.message}`
          });
        }
      }

      const totalIssues = findings.reduce((sum, f) => sum + (f.issues?.length || 0), 0);
      const bySeverity = {
        error: findings.flatMap(f => f.issues || []).filter(i => i.severity === 'error').length,
        warning: findings.flatMap(f => f.issues || []).filter(i => i.severity === 'warning').length,
        info: findings.flatMap(f => f.issues || []).filter(i => i.severity === 'info').length
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            filesReviewed: filesToReview.length,
            totalIssues: totalIssues,
            bySeverity: bySeverity,
            findings: findings
          }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error during code review: ${error.message}`
        }],
        isError: true
      };
    }
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
