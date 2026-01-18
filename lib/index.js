/**
 * Awesome-Slash Core Library
 *
 * Unified entry point for all core library modules.
 * Provides platform detection, pattern matching, workflow state management,
 * configuration management, and context optimization utilities.
 *
 * @module awesome-slash/lib
 * @author Avi Fenesh
 * @license MIT
 */

const detectPlatform = require('./platform/detect-platform');
const verifyTools = require('./platform/verify-tools');
const reviewPatterns = require('./patterns/review-patterns');
const slopPatterns = require('./patterns/slop-patterns');
const workflowState = require('./state/workflow-state');
const contextOptimizer = require('./utils/context-optimizer');
const shellEscape = require('./utils/shell-escape');
const config = require('./config');

/**
 * Platform detection and verification utilities
 */
const platform = {
  /**
   * Detect project platform configuration
   * @see module:platform/detect-platform
   */
  detect: detectPlatform.detect,
  detectAsync: detectPlatform.detectAsync,
  detectCI: detectPlatform.detectCI,
  detectDeployment: detectPlatform.detectDeployment,
  detectProjectType: detectPlatform.detectProjectType,
  detectPackageManager: detectPlatform.detectPackageManager,
  detectBranchStrategy: detectPlatform.detectBranchStrategy,
  detectMainBranch: detectPlatform.detectMainBranch,
  invalidateCache: detectPlatform.invalidateCache,

  /**
   * Verify tool availability
   * @see module:platform/verify-tools
   */
  verifyTools: verifyTools.verify,
  verifyToolsAsync: verifyTools.verifyAsync,
  checkTool: verifyTools.checkTool,
  checkToolAsync: verifyTools.checkToolAsync,
  TOOL_DEFINITIONS: verifyTools.TOOL_DEFINITIONS
};

/**
 * Code pattern matching utilities
 */
const patterns = {
  /**
   * Review patterns for code quality analysis
   * @see module:patterns/review-patterns
   */
  review: reviewPatterns,

  /**
   * Slop patterns for AI-generated code detection
   * @see module:patterns/slop-patterns
   */
  slop: slopPatterns
};

/**
 * Workflow state management
 * @see module:state/workflow-state
 */
const state = {
  // Constants
  SCHEMA_VERSION: workflowState.SCHEMA_VERSION,
  PHASES: workflowState.PHASES,
  DEFAULT_POLICY: workflowState.DEFAULT_POLICY,

  // Core functions
  generateWorkflowId: workflowState.generateWorkflowId,
  getStatePath: workflowState.getStatePath,
  ensureStateDir: workflowState.ensureStateDir,
  validateStateSchema: workflowState.validateStateSchema,

  // CRUD operations
  createState: workflowState.createState,
  readState: workflowState.readState,
  writeState: workflowState.writeState,
  updateState: workflowState.updateState,
  deleteState: workflowState.deleteState,

  // Phase management
  startPhase: workflowState.startPhase,
  completePhase: workflowState.completePhase,
  failPhase: workflowState.failPhase,
  skipToPhase: workflowState.skipToPhase,

  // Workflow lifecycle
  completeWorkflow: workflowState.completeWorkflow,
  abortWorkflow: workflowState.abortWorkflow,
  hasActiveWorkflow: workflowState.hasActiveWorkflow,
  getWorkflowSummary: workflowState.getWorkflowSummary,

  // Agent management
  updateAgentResult: workflowState.updateAgentResult,
  incrementIteration: workflowState.incrementIteration
};

/**
 * Git command optimization and string escaping utilities
 * @see module:utils/context-optimizer
 * @see module:utils/shell-escape
 */
const utils = {
  contextOptimizer,
  shellEscape
};

// Main exports
module.exports = {
  platform,
  patterns,
  state,
  utils,
  config,

  // Direct module access for backward compatibility
  detectPlatform,
  verifyTools,
  reviewPatterns,
  slopPatterns,
  workflowState,
  contextOptimizer,
  shellEscape
};
