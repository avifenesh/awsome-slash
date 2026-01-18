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

/**
 * State cache configuration
 */
const STATE_CACHE_TTL_MS = 200; // Cache TTL for rapid successive reads
const _stateCache = new Map(); // Cache keyed by resolved base directory

/**
 * Get cached state if valid
 * @param {string} cacheKey - Cache key (resolved base path)
 * @returns {Object|null} Cached state or null if expired/missing
 */
function getCachedState(cacheKey) {
  const cached = _stateCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.state;
  }
  return null;
}

/**
 * Set state cache
 * @param {string} cacheKey - Cache key (resolved base path)
 * @param {Object} state - State to cache
 */
function setCachedState(cacheKey, state) {
  _stateCache.set(cacheKey, {
    state,
    expiry: Date.now() + STATE_CACHE_TTL_MS
  });
}

/**
 * Invalidate state cache for a directory
 * @param {string} cacheKey - Cache key (resolved base path)
 */
function invalidateStateCache(cacheKey) {
  _stateCache.delete(cacheKey);
}

/**
 * Clear all state caches (useful for testing)
 */
function clearAllStateCaches() {
  _stateCache.clear();
}

/**
 * Validate and normalize base directory path to prevent path traversal
 * @param {string} baseDir - Base directory path
 * @returns {string} Validated absolute path
 * @throws {Error} If path is invalid or potentially dangerous
 */
function validateBasePath(baseDir) {
  if (typeof baseDir !== 'string' || baseDir.length === 0) {
    throw new Error('Base directory must be a non-empty string');
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(baseDir);

  // Check for null bytes (path traversal via null byte injection)
  if (resolvedPath.includes('\0')) {
    throw new Error('Path contains invalid null byte');
  }

  // Ensure the path exists and is a directory
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist yet - that's OK, it will be created
      // But the parent must exist and be a directory
      const parentDir = path.dirname(resolvedPath);
      try {
        const parentStats = fs.statSync(parentDir);
        if (!parentStats.isDirectory()) {
          throw new Error('Parent path is not a directory');
        }
      } catch (parentError) {
        if (parentError.code === 'ENOENT') {
          throw new Error('Parent directory does not exist');
        }
        throw parentError;
      }
    } else if (error.message) {
      throw error;
    }
  }

  return resolvedPath;
}

/**
 * Validate that the final state path is within the base directory
 * @param {string} statePath - The full state file path
 * @param {string} baseDir - The validated base directory
 * @throws {Error} If path traversal is detected
 */
function validateStatePathWithinBase(statePath, baseDir) {
  const resolvedStatePath = path.resolve(statePath);
  const resolvedBaseDir = path.resolve(baseDir);

  // Ensure state path is within base directory
  if (!resolvedStatePath.startsWith(resolvedBaseDir + path.sep) &&
      resolvedStatePath !== resolvedBaseDir) {
    throw new Error('Path traversal detected: state path is outside base directory');
  }
}

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

// Pre-computed phase index map for O(1) lookup (vs O(n) array indexOf)
const PHASE_INDEX = new Map(PHASES.map((phase, index) => [phase, index]));

/**
 * Check if a phase name is valid (O(1) lookup)
 * @param {string} phaseName - Phase to check
 * @returns {boolean} True if valid phase
 */
function isValidPhase(phaseName) {
  return PHASE_INDEX.has(phaseName);
}

/**
 * Get the index of a phase (O(1) lookup)
 * @param {string} phaseName - Phase name
 * @returns {number} Phase index or -1 if invalid
 */
function getPhaseIndex(phaseName) {
  return PHASE_INDEX.has(phaseName) ? PHASE_INDEX.get(phaseName) : -1;
}

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
 * Get the state file path with validation
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {string} Full path to state file
 * @throws {Error} If path validation fails
 */
function getStatePath(baseDir = process.cwd()) {
  const validatedBase = validateBasePath(baseDir);
  const statePath = path.join(validatedBase, STATE_DIR, STATE_FILE);

  // Verify the state path is still within the base directory
  validateStatePathWithinBase(statePath, validatedBase);

  return statePath;
}

/**
 * Ensure state directory exists with validation
 * Optimized: eliminates TOCTOU race by using mkdirSync with recursive option directly
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @throws {Error} If path validation fails
 */
function ensureStateDir(baseDir = process.cwd()) {
  const validatedBase = validateBasePath(baseDir);
  const stateDir = path.join(validatedBase, STATE_DIR);

  // Verify the state dir path is still within the base directory
  validateStatePathWithinBase(stateDir, validatedBase);

  // mkdirSync with recursive:true is idempotent - no need to check existence first
  // This eliminates TOCTOU race condition where directory could be created between check and mkdir
  fs.mkdirSync(stateDir, { recursive: true });
}

/**
 * Validate workflow state against schema
 * Ensures state object has required fields and valid structure
 * @param {Object} state - State object to validate
 * @returns {{valid: boolean, errors: Array<string>}} Validation result
 */
function validateStateSchema(state) {
  const errors = [];

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['State must be an object'] };
  }

  // Check version
  if (!state.version || typeof state.version !== 'string') {
    errors.push('Missing or invalid version field');
  }

  // Check workflow object
  if (!state.workflow || typeof state.workflow !== 'object') {
    errors.push('Missing or invalid workflow object');
  } else {
    if (!state.workflow.id) errors.push('Missing workflow.id');
    if (!state.workflow.type) errors.push('Missing workflow.type');
    if (!state.workflow.status) errors.push('Missing workflow.status');
    if (!state.workflow.startedAt) errors.push('Missing workflow.startedAt');
  }

  // Check policy object
  if (!state.policy || typeof state.policy !== 'object') {
    errors.push('Missing or invalid policy object');
  }

  // Check phases object
  if (!state.phases || typeof state.phases !== 'object') {
    errors.push('Missing or invalid phases object');
  } else {
    if (!state.phases.current) errors.push('Missing phases.current');
    if (!Array.isArray(state.phases.history)) errors.push('phases.history must be an array');
  }

  // Check checkpoints object
  if (!state.checkpoints || typeof state.checkpoints !== 'object') {
    errors.push('Missing or invalid checkpoints object');
  }

  // Check metrics object
  if (!state.metrics || typeof state.metrics !== 'object') {
    errors.push('Missing or invalid metrics object');
  }

  return {
    valid: errors.length === 0,
    errors
  };
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
 * Read workflow state from file (with caching for rapid successive reads)
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.skipCache=false] - Skip cache and read from file
 * @returns {Object|Error|null} Workflow state, Error if corrupted, or null if not found
 */
function readState(baseDir = process.cwd(), options = {}) {
  const statePath = getStatePath(baseDir);
  const cacheKey = path.resolve(baseDir);

  // Check cache first (unless skipCache is true)
  if (!options.skipCache) {
    const cached = getCachedState(cacheKey);
    if (cached !== null) {
      // Return a deep copy to prevent mutations affecting cache
      return JSON.parse(JSON.stringify(cached));
    }
  }

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

    // Cache the state
    setCachedState(cacheKey, state);

    return state;
  } catch (error) {
    const corrupted = new Error(`Corrupted workflow state: ${error.message}`);
    corrupted.code = 'ERR_STATE_CORRUPTED';
    corrupted.cause = error;
    console.error(corrupted.message);
    return corrupted;
  }
}

/**
 * Write workflow state to file (invalidates cache)
 * @param {Object} state - Workflow state
 * @param {string} [baseDir=process.cwd()] - Base directory
 * @returns {boolean} Success status
 */
function writeState(state, baseDir = process.cwd()) {
  ensureStateDir(baseDir);
  const statePath = getStatePath(baseDir);
  const cacheKey = path.resolve(baseDir);

  try {
    // Update timestamp
    state.workflow.lastUpdatedAt = new Date().toISOString();

    const content = JSON.stringify(state, null, 2);
    fs.writeFileSync(statePath, content, 'utf8');

    // Update cache with new state
    setCachedState(cacheKey, state);

    return true;
  } catch (error) {
    // Invalidate cache on write error
    invalidateStateCache(cacheKey);
    console.error(`Error writing state: ${error.message}`);
    return false;
  }
}

/**
 * Check if updates object contains only simple (non-nested) values
 * Optimization: avoid deep merge overhead for simple top-level updates
 * @param {Object} updates - Updates to check
 * @returns {boolean} True if all values are primitives or arrays
 */
function isSimpleUpdate(updates) {
  if (!updates || typeof updates !== 'object') return true;

  for (const value of Object.values(updates)) {
    // Nested plain objects require deep merge
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      return false;
    }
  }
  return true;
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

  // Optimize: use shallow merge for simple updates (no nested objects)
  // This avoids the overhead of deep cloning when only top-level fields change
  if (isSimpleUpdate(updates)) {
    state = { ...state, ...updates };
  } else {
    // Deep merge for complex nested updates
    state = deepMerge(state, updates);
  }

  if (writeState(state, baseDir)) {
    return state;
  }

  return null;
}

/**
 * Maximum recursion depth for deepMerge to prevent stack overflow attacks
 */
const MAX_MERGE_DEPTH = 50;

/**
 * Deep merge two objects (with prototype pollution and stack overflow protection)
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @param {number} [depth=0] - Current recursion depth (internal)
 * @returns {Object} Merged object
 * @throws {Error} If recursion depth exceeds MAX_MERGE_DEPTH
 */
function deepMerge(target, source, depth = 0) {
  // Protect against stack overflow from deeply nested objects
  if (depth > MAX_MERGE_DEPTH) {
    throw new Error(`Maximum merge depth (${MAX_MERGE_DEPTH}) exceeded - possible circular reference or attack`);
  }

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
    // Recursively merge plain objects (with depth tracking)
    else if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(targetVal || {}, sourceVal, depth + 1);
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
  if (!isValidPhase(phaseName)) {
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
  const currentIndex = getPhaseIndex(state.phases.current);
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
  if (!isValidPhase(phaseName)) {
    console.error(`Invalid phase: ${phaseName}`);
    return null;
  }

  const state = readState(baseDir);
  if (state instanceof Error) {
    console.error(`Cannot skip to phase: ${state.message}`);
    return null;
  }
  if (!state) return null;

  const currentIndex = getPhaseIndex(state.phases.current);
  const targetIndex = getPhaseIndex(phaseName);

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
  PHASE_INDEX,
  DEFAULT_POLICY,
  MAX_MERGE_DEPTH,

  // Phase helpers (O(1) lookup)
  isValidPhase,
  getPhaseIndex,

  // Core functions
  generateWorkflowId,
  getStatePath,
  ensureStateDir,
  validateStateSchema,

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
  incrementIteration,

  // Cache management
  clearAllStateCaches,

  // Internal functions for testing
  _internal: {
    validateBasePath,
    validateStatePathWithinBase,
    deepMerge,
    isSimpleUpdate,
    getCachedState,
    setCachedState,
    invalidateStateCache,
    STATE_CACHE_TTL_MS
  }
};
