/**
 * Workflow State Management
 *
 * Persistent state management for next-task workflow orchestration.
 * Enables resume capability, multi-agent coordination, and progress tracking.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '2.0.0';
const STATE_DIR = '.claude';
const STATE_FILE = 'workflow-state.json';

const PHASES = [
  'policy-selection',
  'task-discovery',
  'worktree-setup',
  'exploration',
  'planning',
  'user-approval',
  'implementation',
  'review-loop',
  'delivery-approval',
  'ship-prep',
  'create-pr',
  'ci-wait',
  'comment-fix',
  'merge',
  'production-ci',
  'deploy',
  'production-release',
  'complete'
];

const DEFAULT_POLICY = {
  taskSource: 'gh-issues',
  priorityFilter: 'continue',
  platform: 'detected',
  stoppingPoint: 'merged',
  mergeStrategy: 'squash',
  autoFix: true,
  maxReviewIterations: 3
};

/**
 * Generate a unique workflow ID
 * @returns {string} Workflow ID in format: workflow-YYYYMMDD-HHMMSS-random
 */
function generateWorkflowId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = crypto.randomBytes(4).toString('hex');
  return `workflow-${date}-${time}-${random}`;
}

/**
 * Get the state file path
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Full path to state file
 */
function getStatePath(baseDir = process.cwd()) {
  return path.join(baseDir, STATE_DIR, STATE_FILE);
}

/**
 * Ensure state directory exists
 * @param {string} [baseDir=process.cwd()] - Base directory
 */
function ensureStateDir(baseDir = process.cwd()) {
  const stateDir = path.join(baseDir, STATE_DIR);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

/**
 * Create a new workflow state
 * @param {string} [type='next-task'] - Workflow type
 * @param {Object} [policy={}] - Policy overrides
 * @returns {Object} New workflow state
 */
function createState(type = 'next-task', policy = {}) {
  const now = new Date().toISOString();

  return {
    version: SCHEMA_VERSION,
    workflow: {
      id: generateWorkflowId(),
      type,
      status: 'pending',
      startedAt: now,
      lastUpdatedAt: now,
      completedAt: null
    },
    policy: { ...DEFAULT_POLICY, ...policy },
    task: null,
    git: null,
    pr: null,
    phases: {
      current: 'policy-selection',
      currentIteration: 0,
      history: []
    },
    agents: null,
    checkpoints: {
      canResume: true,
      resumeFrom: null,
      resumeContext: null
    },
    metrics: {
      totalDuration: 0,
      tokensUsed: 0,
      toolCalls: 0,
      filesModified: 0,
      linesAdded: 0,
      linesRemoved: 0
    }
  };
}

/**
 * Read workflow state from file
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|Error|null} Workflow state, Error if corrupted, or null if not found
 */
function readState(baseDir = process.cwd()) {
  const statePath = getStatePath(baseDir);

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(content);

    // Version check
    if (state.version !== SCHEMA_VERSION) {
      console.warn(`State version mismatch: ${state.version} vs ${SCHEMA_VERSION}`);
      // Future: Add migration logic here
    }

    return state;
  } catch (error) {
    // Return Error object to distinguish corrupted file from missing file
    const corrupted = new Error(`Corrupted workflow state: ${error.message}`);
    corrupted.code = 'ERR_STATE_CORRUPTED';
    corrupted.cause = error;
    console.error(corrupted.message);
    return corrupted;
  }
}

/**
 * Write workflow state to file
 * @param {Object} state - Workflow state
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {boolean} Success status
 */
function writeState(state, baseDir = process.cwd()) {
  ensureStateDir(baseDir);
  const statePath = getStatePath(baseDir);

  try {
    // Update timestamp
    state.workflow.lastUpdatedAt = new Date().toISOString();

    const content = JSON.stringify(state, null, 2);
    fs.writeFileSync(statePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing state: ${error.message}`);
    return false;
  }
}

/**
 * Update specific fields in workflow state
 * @param {Object} updates - Fields to update (deep merge)
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function updateState(updates, baseDir = process.cwd()) {
  let state = readState(baseDir);

  if (state instanceof Error) {
    console.error(`Cannot update state: ${state.message}`);
    return null;
  }
  if (!state) {
    console.error('No existing state to update');
    return null;
  }

  // Deep merge updates
  state = deepMerge(state, updates);

  if (writeState(state, baseDir)) {
    return state;
  }

  return null;
}

/**
 * Deep merge two objects (with prototype pollution protection)
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  // Handle null/undefined cases
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return source;

  const result = { ...target };

  for (const key of Object.keys(source)) {
    // Protect against prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const sourceVal = source[key];
    const targetVal = result[key];

    // Handle Date objects - preserve as-is
    if (sourceVal instanceof Date) {
      result[key] = new Date(sourceVal.getTime());
    }
    // Handle null explicitly - allow overwriting with null
    else if (sourceVal === null) {
      result[key] = null;
    }
    // Recursively merge plain objects
    else if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(targetVal || {}, sourceVal);
    }
    // Replace arrays and primitives
    else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Start a new phase
 * @param {string} phaseName - Phase name
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function startPhase(phaseName, baseDir = process.cwd()) {
  if (!PHASES.includes(phaseName)) {
    console.error(`Invalid phase: ${phaseName}`);
    return null;
  }

  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot start phase: ${state.message}`);
    return null;
  }
  if (!state) {
    console.error('No workflow state exists. Create a workflow first.');
    return null;
  }

  const history = state.phases?.history || [];

  history.push({
    phase: phaseName,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    completedAt: null,
    duration: null,
    result: null
  });

  return updateState({
    workflow: { status: 'in_progress' },
    phases: { current: phaseName, history },
    checkpoints: { canResume: true, resumeFrom: phaseName, resumeContext: null }
  }, baseDir);
}

/**
 * Update the current phase entry with completion data
 * @param {Object} state - Current state
 * @param {string} status - New status (completed/failed)
 * @param {Object} result - Result data
 * @returns {Object} Updated history
 */
function finalizePhaseEntry(state, status, result) {
  const history = state.phases.history || [];
  const entry = history[history.length - 1];

  if (entry) {
    const now = new Date().toISOString();
    entry.status = status;
    entry.completedAt = now;
    entry.duration = new Date(now).getTime() - new Date(entry.startedAt).getTime();
    entry.result = result;
  }

  return history;
}

/**
 * Complete the current phase
 * @param {Object} [result={}] - Phase result data
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function completePhase(result = {}, baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot complete phase: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const history = finalizePhaseEntry(state, 'completed', result);
  const currentIndex = PHASES.indexOf(state.phases.current);
  const nextPhase = currentIndex < PHASES.length - 1 ? PHASES[currentIndex + 1] : 'complete';

  return updateState({
    phases: { current: nextPhase, history },
    checkpoints: { resumeFrom: nextPhase, resumeContext: null }
  }, baseDir);
}

/**
 * Fail the current phase
 * @param {string} reason - Failure reason
 * @param {Object} [context={}] - Context for resume
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function failPhase(reason, context = {}, baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot fail phase: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const history = finalizePhaseEntry(state, 'failed', { error: reason });

  return updateState({
    workflow: { status: 'failed' },
    phases: { history },
    checkpoints: {
      canResume: true,
      resumeFrom: state.phases.current,
      resumeContext: { reason, ...context }
    }
  }, baseDir);
}

/**
 * Skip to a specific phase
 * @param {string} phaseName - Phase to skip to
 * @param {string} [reason='manual skip'] - Skip reason
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function skipToPhase(phaseName, reason = 'manual skip', baseDir = process.cwd()) {
  if (!PHASES.includes(phaseName)) {
    console.error(`Invalid phase: ${phaseName}`);
    return null;
  }

  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot skip to phase: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const currentIndex = PHASES.indexOf(state.phases.current);
  const targetIndex = PHASES.indexOf(phaseName);

  // Add skipped entries for phases we're jumping over
  const history = [...(state.phases.history || [])];
  const now = new Date().toISOString();

  for (let i = currentIndex; i < targetIndex; i++) {
    history.push({
      phase: PHASES[i],
      status: 'skipped',
      startedAt: now,
      completedAt: now,
      duration: 0,
      result: { skippedReason: reason }
    });
  }

  return updateState({
    phases: {
      current: phaseName,
      history
    },
    checkpoints: {
      resumeFrom: phaseName
    }
  }, baseDir);
}

/**
 * Complete the entire workflow
 * @param {Object} [result={}] - Final result data
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function completeWorkflow(result = {}, baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot complete workflow: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const now = new Date().toISOString();
  const startTime = new Date(state.workflow.startedAt).getTime();
  const endTime = new Date(now).getTime();

  return updateState({
    workflow: {
      status: 'completed',
      completedAt: now
    },
    phases: {
      current: 'complete'
    },
    checkpoints: {
      canResume: false,
      resumeFrom: null
    },
    metrics: {
      totalDuration: endTime - startTime,
      ...result.metrics
    }
  }, baseDir);
}

/**
 * Abort the workflow
 * @param {string} [reason='user aborted'] - Abort reason
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function abortWorkflow(reason = 'user aborted', baseDir = process.cwd()) {
  return updateState({
    workflow: {
      status: 'aborted',
      completedAt: new Date().toISOString()
    },
    checkpoints: {
      canResume: false,
      resumeFrom: null,
      resumeContext: { abortReason: reason }
    }
  }, baseDir);
}

/**
 * Delete workflow state (cleanup)
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {boolean} Success status
 */
function deleteState(baseDir = process.cwd()) {
  const statePath = getStatePath(baseDir);

  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    return true;
  } catch (error) {
    console.error(`Error deleting state: ${error.message}`);
    return false;
  }
}

/**
 * Check if a workflow is in progress
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {boolean} True if workflow is active
 */
function hasActiveWorkflow(baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) return false;
  if (!state) return false;

  return ['pending', 'in_progress', 'paused'].includes(state.workflow.status);
}

/**
 * Get workflow summary for display
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Summary object or null
 */
function getWorkflowSummary(baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    return { error: state.message, code: state.code };
  }
  if (!state) return null;

  const completedPhases = state.phases.history?.filter(p => p.status === 'completed').length || 0;
  const totalPhases = PHASES.length - 1; // Exclude 'complete'

  return {
    id: state.workflow.id,
    type: state.workflow.type,
    status: state.workflow.status,
    currentPhase: state.phases.current,
    progress: `${completedPhases}/${totalPhases}`,
    progressPercent: Math.round((completedPhases / totalPhases) * 100),
    task: state.task ? {
      id: state.task.id,
      title: state.task.title,
      source: state.task.source
    } : null,
    pr: state.pr ? {
      number: state.pr.number,
      url: state.pr.url,
      ciStatus: state.pr.ciStatus
    } : null,
    canResume: state.checkpoints.canResume,
    resumeFrom: state.checkpoints.resumeFrom,
    startedAt: state.workflow.startedAt,
    duration: state.metrics?.totalDuration || 0
  };
}

/**
 * Update agent results
 * @param {string} agentName - Agent identifier
 * @param {Object} result - Agent result
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function updateAgentResult(agentName, result, baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot update agent result: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const agents = state.agents || {
    lastRun: {},
    totalIterations: 0,
    totalIssuesFound: 0,
    totalIssuesFixed: 0
  };

  agents.lastRun[agentName] = result;
  agents.totalIssuesFound += result.issues || 0;

  return updateState({ agents }, baseDir);
}

/**
 * Increment review iteration
 * @param {Object} [result={}] - Iteration result
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {Object|null} Updated state or null on error
 */
function incrementIteration(result = {}, baseDir = process.cwd()) {
  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot increment iteration: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const agents = state.agents || {
    lastRun: {},
    totalIterations: 0,
    totalIssuesFound: 0,
    totalIssuesFixed: 0
  };

  agents.totalIterations += 1;
  agents.totalIssuesFixed += result.fixed || 0;

  return updateState({
    phases: {
      currentIteration: state.phases.currentIteration + 1
    },
    agents
  }, baseDir);
}

// Export all functions
module.exports = {
  // Constants
  SCHEMA_VERSION,
  PHASES,
  DEFAULT_POLICY,

  // Core functions
  generateWorkflowId,
  getStatePath,
  ensureStateDir,

  // CRUD operations
  createState,
  readState,
  writeState,
  updateState,
  deleteState,

  // Phase management
  startPhase,
  completePhase,
  failPhase,
  skipToPhase,

  // Workflow lifecycle
  completeWorkflow,
  abortWorkflow,
  hasActiveWorkflow,
  getWorkflowSummary,

  // Agent management
  updateAgentResult,
  incrementIteration
};
