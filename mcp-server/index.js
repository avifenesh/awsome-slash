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
const fsSync = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const { Worker } = require('worker_threads');
const execAsync = promisify(exec);
const workflowState = require('../lib/state/workflow-state.js');
const { runPipeline, formatHandoffPrompt, CERTAINTY, THOROUGHNESS } = require('../lib/patterns/pipeline.js');
const crossPlatform = require('../lib/cross-platform/index.js');
const enhance = require('../lib/enhance/index.js');
const repoMap = require('../lib/repo-map');

// Plugin root for relative paths
const PLUGIN_ROOT = process.env.PLUGIN_ROOT || path.join(__dirname, '..');
const REPO_ROOT = process.cwd();

function resolveRepoPath(inputPath) {
  if (!inputPath) return null;
  const resolved = path.resolve(REPO_ROOT, inputPath);
  const withinRepo = resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep);
  return withinRepo ? resolved : null;
}

function toRepoRelative(resolvedPath) {
  const relative = path.relative(REPO_ROOT, resolvedPath);
  if (!relative) return '.';
  return relative.split(path.sep).join('/');
}

function filterRepoFiles(files) {
  const allowed = [];
  const rejected = [];

  for (const file of files) {
    if (!file) continue;
    const resolved = resolveRepoPath(file);
    if (!resolved) {
      rejected.push(file);
      continue;
    }
    allowed.push(toRepoRelative(resolved));
  }

  return { allowed, rejected };
}

function runPipelineAsync(repoPath, options) {
  const pipelinePath = path.join(PLUGIN_ROOT, 'lib', 'patterns', 'pipeline.js');
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require('worker_threads');
       try {
         const { runPipeline } = require(workerData.pipelinePath);
         const result = runPipeline(workerData.repoPath, workerData.options);
         parentPort.postMessage({ ok: true, result });
       } catch (error) {
         parentPort.postMessage({ ok: false, error: { message: error.message, stack: error.stack } });
       }`,
      {
        eval: true,
        workerData: {
          repoPath,
          options,
          pipelinePath
        }
      }
    );

    worker.once('message', (message) => {
      worker.terminate();
      if (message.ok) {
        resolve(message.result);
      } else {
        const err = new Error(message.error?.message || 'Pipeline worker failed');
        err.stack = message.error?.stack;
        reject(err);
      }
    });

    worker.once('error', (error) => {
      worker.terminate();
      reject(error);
    });
  });
}

// MCP_TOOLS_ARRAY - Define available tools
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
          enum: ['gh-issues', 'linear', 'tasks-md', 'custom'],
          description: 'Task source to search'
        },
        filter: {
          type: 'string',
          description: 'Filter tasks by type (bug, feature, security, etc.)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return'
        },
        customFile: {
          type: 'string',
          description: 'Repo-relative path to custom task file (required when source is "custom"). Parses markdown checkboxes.'
        }
      },
      required: []
    }
  },
  {
    name: 'review_code',
    description: 'Run pattern-based code review on changed files',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative files to review (defaults to git diff)'
        },
        thoroughness: {
          type: 'string',
          enum: ['quick', 'normal', 'deep'],
          description: 'Analysis depth (default: normal)'
        },
        compact: {
          type: 'boolean',
          description: 'Use compact output format (default: true)'
        }
      },
      required: []
    }
  },
  {
    name: 'slop_detect',
    description: 'Detect AI slop patterns with certainty-based findings',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repo-relative directory or file to scan (default: repo root)'
        },
        mode: {
          type: 'string',
          enum: ['report', 'apply'],
          description: 'Report only or apply fixes (default: report)'
        },
        thoroughness: {
          type: 'string',
          enum: ['quick', 'normal', 'deep'],
          description: 'quick=regex only, normal=+analyzers, deep=+CLI tools'
        },
        compact: {
          type: 'boolean',
          description: 'Use compact table format (60% fewer tokens)'
        }
      },
      required: []
    }
  },
  {
    name: 'enhance_analyze',
    description: 'Analyze plugins, agents, docs, or prompts for enhancement opportunities',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to analyze (default: current directory)'
        },
        focus: {
          type: 'string',
          enum: ['all', 'plugin', 'agent', 'docs', 'claudemd', 'prompt'],
          description: 'Which analyzer to run (default: all)'
        },
        mode: {
          type: 'string',
          enum: ['report', 'apply'],
          description: 'Report only or apply HIGH certainty fixes (default: report)'
        },
        compact: {
          type: 'boolean',
          description: 'Use compact output format (default: true)'
        }
      },
      required: []
    }
  },
  {
    name: 'repo_map',
    description: 'Generate or update cached AST repo map',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['init', 'update', 'status', 'rebuild'],
          description: 'Action to perform (default: status)'
        },
        includeDocs: {
          type: 'boolean',
          description: 'Include documentation analysis (default: true)'
        },
        docsDepth: {
          type: 'string',
          enum: ['quick', 'thorough'],
          description: 'Docs analysis depth (default: thorough)'
        },
        full: {
          type: 'boolean',
          description: 'Force full rebuild on update'
        },
        force: {
          type: 'boolean',
          description: 'Force rebuild on init'
        },
        cwd: {
          type: 'string',
          description: 'Repo-relative root (default: repo root)'
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
        text: `Workflow started: ${state.task.id}\nPolicy: ${JSON.stringify(policy, null, 2)}`
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

    if (state.status !== 'in_progress' || state.phase === 'complete') {
      return {
        content: [{ type: 'text', text: 'Workflow cannot be resumed from current state.' }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: `Resuming workflow ${state.task.id} from phase: ${state.phase}`
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
        text: `Workflow ${state.task.id} aborted. Cleanup: worktree and branches should be removed manually.`
      }]
    };
  },

  async task_discover({ source, filter, limit, customFile }) {
    const taskSource = source || 'gh-issues';
    // Validate and sanitize limit to prevent command injection
    let maxTasks = 10;
    if (limit !== undefined) {
      const parsed = parseInt(limit, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        maxTasks = parsed;
      }
    }

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

        // Use array form to prevent command injection
        const ghArgs = [
          'issue', 'list',
          '--state', 'open',
          '--json', 'number,title,labels,createdAt',
          '--limit', String(maxTasks)
        ];
        const { stdout } = await execAsync(`gh ${ghArgs.join(' ')}`);

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

      } else if (taskSource === 'linear') {
        // Linear integration via GitHub issues containing Linear URLs
        try {
          await execAsync('gh --version');
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: 'Error: GitHub CLI (gh) is not installed or not configured. Linear integration requires gh to access GitHub issues with Linear links.'
            }],
            isError: true
          };
        }

        const ghArgs = [
          'issue', 'list',
          '--state', 'open',
          '--json', 'number,title,body,labels,createdAt',
          '--limit', String(Math.min(maxTasks * 2, 100)) // Fetch more since we'll filter for Linear links
        ];
        const { stdout } = await execAsync(`gh ${ghArgs.join(' ')}`);
        const issues = JSON.parse(stdout || '[]');

        // Extract Linear URLs from issue bodies (length-limited to prevent ReDoS)
        const linearUrlPattern = /https:\/\/linear\.app\/[^\s)]{1,200}/g;
        const linearIssues = issues
          .map(issue => {
            const linearMatches = issue.body ? issue.body.match(linearUrlPattern) : null;
            if (!linearMatches || linearMatches.length === 0) return null;

            // Extract Linear ID from URL (e.g., ENG-123 from https://linear.app/company/issue/ENG-123/...)
            const linearUrl = linearMatches[0];
            // Match /issue/ID pattern specifically to avoid false matches
            const linearIdMatch = linearUrl.match(/\/issue\/([A-Z]+-\d+)/);
            const linearId = linearIdMatch ? linearIdMatch[1] : null;

            return {
              number: issue.number,
              title: issue.title,
              body: issue.body,
              labels: issue.labels,
              createdAt: issue.createdAt,
              linearUrl: linearUrl,
              linearId: linearId
            };
          })
          .filter(issue => issue !== null)
          .slice(0, maxTasks);

        let filtered = linearIssues;
        if (filter && filter !== 'all') {
          filtered = linearIssues.filter(issue => {
            const labelNames = issue.labels.map(l => l.name.toLowerCase());
            const filterLower = filter.toLowerCase();

            return labelNames.some(label =>
              label.includes(filterLower) ||
              filterLower.includes(label)
            );
          });
        }

        tasks = filtered.map(issue => ({
          id: issue.linearId || `#${issue.number}`,
          title: issue.title,
          type: issue.labels.find(l => ['bug', 'feature', 'security'].includes(l.name.toLowerCase()))?.name || 'task',
          labels: issue.labels.map(l => l.name),
          createdAt: issue.createdAt,
          source: 'linear',
          linearUrl: issue.linearUrl,
          githubNumber: issue.number
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
            // File doesn't exist, try next one
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
      } else if (taskSource === 'custom') {
        if (!customFile) {
          return {
            content: [{
              type: 'text',
              text: 'Error: customFile parameter is required when source is "custom"'
            }],
            isError: true
          };
        }

        const resolvedCustomFile = resolveRepoPath(customFile);
        if (!resolvedCustomFile) {
          return {
            content: [{
              type: 'text',
              text: `Error: customFile must be within the repository. Received "${customFile}".`
            }],
            isError: true
          };
        }

        try {
          const content = await fs.readFile(resolvedCustomFile, 'utf-8');
          const lines = content.split('\n');
          const taskLines = lines.filter(line => /^[-*]\s+\[\s*\]\s+/.test(line));

          tasks = taskLines.slice(0, maxTasks).map((line, index) => {
            const text = line.replace(/^[-*]\s+\[\s*\]\s+/, '').trim();
            const isBug = /\b(bug|fix|error|issue)\b/i.test(text);
            const isFeature = /\b(feature|add|implement|create)\b/i.test(text);
            const isSecurity = /\b(security|vulnerability|cve|auth)\b/i.test(text);

            return {
              id: `custom-${index + 1}`,
              title: text,
              type: isSecurity ? 'security' : isBug ? 'bug' : isFeature ? 'feature' : 'task',
              labels: [],
              source: toRepoRelative(resolvedCustomFile)
            };
          });

          if (filter && filter !== 'all') {
            tasks = tasks.filter(task => task.type === filter.toLowerCase());
          }

        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error reading custom file "${customFile}": ${error.message}`
            }],
            isError: true
          };
        }
      } else {
        return {
          content: [{
            type: 'text',
            text: `Unknown task source: "${taskSource}"`
          }],
          isError: true
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
      console.error('Error discovering tasks:', error);
      return {
        content: [{
          type: 'text',
          text: `Error discovering tasks: An internal error occurred. Please check server logs for details.`
        }],
        isError: true
      };
    }
  },

  async review_code({ files, thoroughness, compact }) {
    try {
      let filesToReview = files || [];

      // Auto-detect files from git if not provided
      if (!filesToReview.length) {
        try {
          const { stdout } = await execAsync('git diff --name-only HEAD');
          filesToReview = stdout.trim().split('\n').filter(f => f);

          if (!filesToReview.length) {
            const { stdout: stagedOut } = await execAsync('git diff --cached --name-only');
            filesToReview = stagedOut.trim().split('\n').filter(f => f);
          }

          if (!filesToReview.length) {
            try {
              const { stdout: lastCommit } = await execAsync('git diff --name-only HEAD~1');
              filesToReview = lastCommit.trim().split('\n').filter(f => f);
            } catch (e) {
              // HEAD~1 doesn't exist (single-commit repo)
            }
          }
        } catch (error) {
          return crossPlatform.errorResponse(
            `Cannot get changed files: ${error.message}. Specify files explicitly.`
          );
        }
      }

      if (!filesToReview.length) {
        return crossPlatform.successResponse('No files to review. No changes detected.');
      }

      const { allowed, rejected } = filterRepoFiles(filesToReview);
      if (rejected.length > 0) {
        return crossPlatform.errorResponse(
          `Invalid file path(s) outside the repository: ${rejected.join(', ')}`
        );
      }
      filesToReview = allowed;

      if (!filesToReview.length) {
        return crossPlatform.errorResponse('No valid files to review after path validation.');
      }

      // Use the full pipeline for detection
      let result;
      try {
        result = await runPipelineAsync(process.cwd(), {
          thoroughness: thoroughness || THOROUGHNESS.NORMAL,
          targetFiles: filesToReview,
          mode: 'report'
        });
      } catch (error) {
        console.warn(`Pipeline worker failed, falling back to sync run: ${error.message}`);
        result = runPipeline(process.cwd(), {
          thoroughness: thoroughness || THOROUGHNESS.NORMAL,
          targetFiles: filesToReview,
          mode: 'report'
        });
      }

      // Use compact format by default for MCP (token efficiency)
      const useCompact = compact !== false;
      const prompt = formatHandoffPrompt(result.findings, 'report', {
        compact: useCompact,
        maxFindings: 50
      });

      return crossPlatform.successResponse({
        filesReviewed: filesToReview.length,
        totalIssues: result.findings.length,
        summary: result.summary,
        prompt: prompt
      });

    } catch (error) {
      console.error('Error during code review:', error);
      return crossPlatform.errorResponse('Code review failed. Check server logs.');
    }
  },

  async slop_detect({ path: scanPath, mode, thoroughness, compact }) {
    try {
      const resolvedTargetPath = resolveRepoPath(scanPath || REPO_ROOT);
      if (!resolvedTargetPath) {
        return crossPlatform.errorResponse(
          `Invalid path outside repository: ${scanPath}`
        );
      }

      // Validate path exists
      try {
        await fs.access(resolvedTargetPath);
      } catch (e) {
        return crossPlatform.errorResponse(`Path not found: ${resolvedTargetPath}`);
      }

      // Run the 3-phase pipeline
      let result;
      try {
        result = await runPipelineAsync(resolvedTargetPath, {
          thoroughness: thoroughness || THOROUGHNESS.NORMAL,
          mode: mode || 'report'
        });
      } catch (error) {
        console.warn(`Pipeline worker failed, falling back to sync run: ${error.message}`);
        result = runPipeline(resolvedTargetPath, {
          thoroughness: thoroughness || THOROUGHNESS.NORMAL,
          mode: mode || 'report'
        });
      }

      // Use compact format by default for MCP (60% fewer tokens)
      const useCompact = compact !== false;
      const prompt = formatHandoffPrompt(result.findings, mode || 'report', {
        compact: useCompact,
        maxFindings: 50
      });

      // Return structured result
      return crossPlatform.successResponse({
        path: toRepoRelative(resolvedTargetPath),
        mode: mode || 'report',
        thoroughness: thoroughness || 'normal',
        filesAnalyzed: result.metadata.filesAnalyzed,
        findings: {
          total: result.findings.length,
          byCertainty: result.summary.byCertainty,
          bySeverity: result.summary.bySeverity,
          autoFixable: result.summary.byAutoFix.remove || 0
        },
        missingTools: result.missingTools,
        prompt: prompt
      });

    } catch (error) {
      console.error('Error during slop detection:', error);
      return crossPlatform.errorResponse('Slop detection failed. Check server logs.');
    }
  },

  async enhance_analyze({ path: scanPath, focus, mode, compact }) {
    try {
      const targetPath = scanPath || process.cwd();
      const analyzerFocus = focus || 'all';
      const analyzeMode = mode || 'report';

      // Validate path exists
      try {
        await fs.access(targetPath);
      } catch (e) {
        return crossPlatform.errorResponse(`Path not found: ${targetPath}`);
      }

      const allFindings = [];
      const summary = { plugin: 0, agent: 0, docs: 0, claudemd: 0, prompt: 0 };

      // Run analyzers based on focus
      if (analyzerFocus === 'all' || analyzerFocus === 'plugin') {
        try {
          const result = enhance.analyzeAllPlugins(targetPath);
          if (result && result.findings) {
            allFindings.push(...result.findings.map(f => ({ ...f, analyzer: 'plugin' })));
            summary.plugin = result.findings.length;
          }
        } catch (e) {
          console.error('Plugin analyzer error:', e.message);
        }
      }

      if (analyzerFocus === 'all' || analyzerFocus === 'agent') {
        try {
          const result = enhance.analyzeAllAgents(targetPath);
          if (result && result.findings) {
            allFindings.push(...result.findings.map(f => ({ ...f, analyzer: 'agent' })));
            summary.agent = result.findings.length;
          }
        } catch (e) {
          console.error('Agent analyzer error:', e.message);
        }
      }

      if (analyzerFocus === 'all' || analyzerFocus === 'docs') {
        try {
          const result = enhance.analyzeAllDocs(targetPath);
          if (result && result.findings) {
            allFindings.push(...result.findings.map(f => ({ ...f, analyzer: 'docs' })));
            summary.docs = result.findings.length;
          }
        } catch (e) {
          console.error('Docs analyzer error:', e.message);
        }
      }

      if (analyzerFocus === 'all' || analyzerFocus === 'claudemd') {
        try {
          const result = enhance.analyzeProjectMemory(targetPath);
          if (result && result.findings) {
            allFindings.push(...result.findings.map(f => ({ ...f, analyzer: 'claudemd' })));
            summary.claudemd = result.findings.length;
          }
        } catch (e) {
          console.error('Project memory analyzer error:', e.message);
        }
      }

      if (analyzerFocus === 'all' || analyzerFocus === 'prompt') {
        try {
          const result = enhance.analyzeAllPrompts(targetPath);
          if (result && result.findings) {
            allFindings.push(...result.findings.map(f => ({ ...f, analyzer: 'prompt' })));
            summary.prompt = result.findings.length;
          }
        } catch (e) {
          console.error('Prompt analyzer error:', e.message);
        }
      }

      // Deduplicate if running all analyzers
      let findings = allFindings;
      if (analyzerFocus === 'all' && enhance.deduplicateOrchestratorFindings) {
        findings = enhance.deduplicateOrchestratorFindings(allFindings);
      }

      // Sort by certainty
      const certaintyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      findings.sort((a, b) => (certaintyOrder[a.certainty] || 2) - (certaintyOrder[b.certainty] || 2));

      // Apply fixes if requested
      let fixResults = null;
      if (analyzeMode === 'apply') {
        const highCertaintyFixes = findings.filter(f => f.certainty === 'HIGH' && f.autoFix);
        if (highCertaintyFixes.length > 0) {
          fixResults = { attempted: highCertaintyFixes.length, applied: 0 };
          for (const fix of highCertaintyFixes) {
            try {
              if (fix.analyzer === 'plugin') enhance.applyFixes([fix]);
              else if (fix.analyzer === 'agent') enhance.agentApplyFixes([fix]);
              else if (fix.analyzer === 'docs') enhance.docsApplyFixes([fix]);
              else if (fix.analyzer === 'claudemd') enhance.projectMemoryApplyFixes([fix]);
              else if (fix.analyzer === 'prompt') enhance.promptApplyFixes([fix]);
              fixResults.applied++;
            } catch (e) {
              console.error(`Fix failed for ${fix.file}:`, e.message);
            }
          }
        }
      }

      // Format output
      const useCompact = compact !== false;
      const byCertainty = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      findings.forEach(f => { byCertainty[f.certainty] = (byCertainty[f.certainty] || 0) + 1; });

      return crossPlatform.successResponse({
        path: targetPath,
        focus: analyzerFocus,
        mode: analyzeMode,
        total: findings.length,
        byCertainty,
        byAnalyzer: summary,
        autoFixable: findings.filter(f => f.autoFix).length,
        fixResults,
        findings: useCompact
          ? findings.slice(0, 30).map(f => ({
              file: f.file,
              line: f.line,
              certainty: f.certainty,
              issue: f.issue,
              analyzer: f.analyzer
            }))
          : findings.slice(0, 50)
      });

    } catch (error) {
      console.error('Error during enhance analysis:', error);
      return crossPlatform.errorResponse('Enhance analysis failed. Check server logs.');
    }
  },

  async repo_map({ action, includeDocs, docsDepth, full, force, cwd }) {
    try {
      const requestedPath = cwd || REPO_ROOT;
      const resolvedBasePath = resolveRepoPath(requestedPath);
      if (!resolvedBasePath) {
        return crossPlatform.errorResponse(
          `Invalid path outside repository: ${cwd}`
        );
      }
      const basePath = resolvedBasePath;
      const act = (action || 'status').toLowerCase();

      let result;
      if (act === 'init' || act === 'rebuild') {
        result = await repoMap.init(basePath, {
          force: act === 'rebuild' || force === true,
          includeDocs: includeDocs !== false,
          docsDepth: docsDepth || 'thorough'
        });
      } else if (act === 'update') {
        result = await repoMap.update(basePath, { full: full === true });
      } else if (act === 'status') {
        result = repoMap.status(basePath);
      } else {
        return crossPlatform.errorResponse('Invalid action. Use init, update, status, or rebuild.');
      }

      if (result?.success === false) {
        return crossPlatform.errorResponse(result.error || 'repo-map failed', {
          hint: result.installSuggestion
        });
      }

      if (act === 'status' && result.exists === false) {
        return crossPlatform.successResponse({
          exists: false,
          message: 'No repo-map found. Run repo_map action=init to generate one.'
        });
      }

      return crossPlatform.successResponse({
        action: act,
        result
      });
    } catch (error) {
      console.error('Error during repo-map:', error);
      return crossPlatform.errorResponse('Repo-map failed. Check server logs.');
    }
  }
};

// Create and run server
async function main() {
  // MCP_SERVER_VERSION - Update on release
const server = new Server(
    {
      name: 'awesome-slash',
      version: '3.2.0-rc.1',
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

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toolHandlers };
}

/**
 * Error boundary for uncaught errors
 * Prevents server crashes and provides meaningful error messages
 */
function setupErrorBoundary() {
  let errorCount = 0;
  const MAX_ERRORS = 10;
  const ERROR_WINDOW = 60000; // 1 minute
  let firstErrorTime = null;

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack:', error.stack);

    // Track error rate for graceful shutdown decision
    const now = Date.now();
    if (!firstErrorTime || (now - firstErrorTime) > ERROR_WINDOW) {
      errorCount = 1;
      firstErrorTime = now;
    } else {
      errorCount++;
    }

    // If too many errors in short time, exit gracefully
    if (errorCount >= MAX_ERRORS) {
      console.error(`${MAX_ERRORS} uncaught exceptions in ${ERROR_WINDOW}ms - exiting to prevent corrupted state`);
      process.exit(1);
    }

    console.error(`Error count: ${errorCount}/${MAX_ERRORS} in current window`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);

    // Track error rate
    const now = Date.now();
    if (!firstErrorTime || (now - firstErrorTime) > ERROR_WINDOW) {
      errorCount = 1;
      firstErrorTime = now;
    } else {
      errorCount++;
    }

    // If too many errors in short time, exit gracefully
    if (errorCount >= MAX_ERRORS) {
      console.error(`${MAX_ERRORS} unhandled rejections in ${ERROR_WINDOW}ms - exiting to prevent corrupted state`);
      process.exit(1);
    }

    console.error(`Error count: ${errorCount}/${MAX_ERRORS} in current window`);
  });

  // Handle SIGINT gracefully
  process.on('SIGINT', () => {
    console.error('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  // Handle SIGTERM gracefully
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });
}

// Only run main if this is the main module
if (require.main === module) {
  setupErrorBoundary();

  main().catch((error) => {
    console.error('Fatal error in main():', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
}
