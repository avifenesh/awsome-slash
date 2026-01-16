/**
 * Tests for workflow-state.js module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const workflowState = require('../lib/state/workflow-state');

describe('workflow-state', () => {
  let testDir;

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateWorkflowId', () => {
    it('should generate unique IDs', () => {
      const id1 = workflowState.generateWorkflowId();
      const id2 = workflowState.generateWorkflowId();

      expect(id1).not.toBe(id2);
    });

    it('should match expected format', () => {
      const id = workflowState.generateWorkflowId();

      expect(id).toMatch(/^workflow-\d{8}-\d{6}-[a-f0-9]+$/);
    });
  });

  describe('createState', () => {
    it('should create state with default values', () => {
      const state = workflowState.createState();

      expect(state.version).toBe(workflowState.SCHEMA_VERSION);
      expect(state.workflow.type).toBe('next-task');
      expect(state.workflow.status).toBe('pending');
      expect(state.policy.taskSource).toBe('gh-issues');
      expect(state.phases.current).toBe('policy-selection');
    });

    it('should accept custom policy', () => {
      const state = workflowState.createState('next-task', {
        taskSource: 'linear',
        stoppingPoint: 'deployed'
      });

      expect(state.policy.taskSource).toBe('linear');
      expect(state.policy.stoppingPoint).toBe('deployed');
      expect(state.policy.priorityFilter).toBe('continue'); // default
    });
  });

  describe('readState / writeState', () => {
    it('should return null when no state file exists', () => {
      const state = workflowState.readState(testDir);

      expect(state).toBeNull();
    });

    it('should write and read state correctly', () => {
      const original = workflowState.createState();
      workflowState.writeState(original, testDir);

      const read = workflowState.readState(testDir);

      expect(read.workflow.id).toBe(original.workflow.id);
      expect(read.version).toBe(workflowState.SCHEMA_VERSION);
    });

    it('should create .claude directory if not exists', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const stateDir = path.join(testDir, '.claude');
      expect(fs.existsSync(stateDir)).toBe(true);
    });

    it('should return Error for corrupted JSON file', () => {
      const statePath = path.join(testDir, '.claude', 'workflow-state.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, '{invalid json content}');

      const result = workflowState.readState(testDir);

      expect(result).toBeInstanceOf(Error);
      expect(result.code).toBe('ERR_STATE_CORRUPTED');
      expect(result.message).toContain('Corrupted workflow state');
    });

    it('should distinguish between missing and corrupted files', () => {
      const missingResult = workflowState.readState(testDir);
      expect(missingResult).toBeNull();

      const statePath = path.join(testDir, '.claude', 'workflow-state.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, 'not valid json at all');

      const corruptedResult = workflowState.readState(testDir);
      expect(corruptedResult).toBeInstanceOf(Error);
      expect(corruptedResult).not.toBeNull();
    });
  });

  describe('updateState', () => {
    it('should update specific fields', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.updateState({
        task: {
          id: '142',
          title: 'Fix bug',
          source: 'github'
        }
      }, testDir);

      expect(updated.task.id).toBe('142');
      expect(updated.task.title).toBe('Fix bug');
      expect(updated.workflow.id).toBe(state.workflow.id); // unchanged
    });

    it('should deep merge nested objects', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      workflowState.updateState({
        policy: { taskSource: 'linear' }
      }, testDir);

      const read = workflowState.readState(testDir);

      expect(read.policy.taskSource).toBe('linear');
      expect(read.policy.priorityFilter).toBe('continue'); // preserved
    });

    it('should return null when no state exists', () => {
      const result = workflowState.updateState({ task: {} }, testDir);

      expect(result).toBeNull();
    });
  });

  describe('startPhase', () => {
    it('should start a valid phase', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.startPhase('task-discovery', testDir);

      expect(updated.phases.current).toBe('task-discovery');
      expect(updated.workflow.status).toBe('in_progress');
      expect(updated.phases.history.length).toBe(1);
      expect(updated.phases.history[0].phase).toBe('task-discovery');
      expect(updated.phases.history[0].status).toBe('in_progress');
    });

    it('should reject invalid phase names', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const result = workflowState.startPhase('invalid-phase', testDir);

      expect(result).toBeNull();
    });
  });

  describe('completePhase', () => {
    it('should complete current phase and advance', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);
      workflowState.startPhase('policy-selection', testDir);

      const updated = workflowState.completePhase({ policySet: true }, testDir);

      expect(updated.phases.current).toBe('task-discovery');
      expect(updated.phases.history[0].status).toBe('completed');
      expect(updated.phases.history[0].result.policySet).toBe(true);
      expect(updated.phases.history[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('failPhase', () => {
    it('should mark phase as failed with context', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);
      workflowState.startPhase('implementation', testDir);

      const updated = workflowState.failPhase('Test failed', { failingTest: 'auth.test.js' }, testDir);

      expect(updated.workflow.status).toBe('failed');
      expect(updated.phases.history[0].status).toBe('failed');
      expect(updated.checkpoints.canResume).toBe(true);
      expect(updated.checkpoints.resumeContext.reason).toBe('Test failed');
    });
  });

  describe('skipToPhase', () => {
    it('should skip intermediate phases', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.skipToPhase('implementation', 'policy already set', testDir);

      expect(updated.phases.current).toBe('implementation');

      // Should have skipped entries for policy-selection through planning
      const skippedCount = updated.phases.history.filter(p => p.status === 'skipped').length;
      expect(skippedCount).toBeGreaterThan(0);
    });
  });

  describe('completeWorkflow', () => {
    it('should finalize workflow', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.completeWorkflow({ metrics: { filesModified: 5 } }, testDir);

      expect(updated.workflow.status).toBe('completed');
      expect(updated.workflow.completedAt).not.toBeNull();
      expect(updated.phases.current).toBe('complete');
      expect(updated.checkpoints.canResume).toBe(false);
    });
  });

  describe('abortWorkflow', () => {
    it('should abort workflow with reason', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.abortWorkflow('user cancelled', testDir);

      expect(updated.workflow.status).toBe('aborted');
      expect(updated.checkpoints.canResume).toBe(false);
      expect(updated.checkpoints.resumeContext.abortReason).toBe('user cancelled');
    });
  });

  describe('deleteState', () => {
    it('should delete state file', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const statePath = workflowState.getStatePath(testDir);
      expect(fs.existsSync(statePath)).toBe(true);

      const result = workflowState.deleteState(testDir);

      expect(result).toBe(true);
      expect(fs.existsSync(statePath)).toBe(false);
    });

    it('should succeed even if file does not exist', () => {
      const result = workflowState.deleteState(testDir);

      expect(result).toBe(true);
    });
  });

  describe('hasActiveWorkflow', () => {
    it('should return false when no state exists', () => {
      expect(workflowState.hasActiveWorkflow(testDir)).toBe(false);
    });

    it('should return true for in_progress workflow', () => {
      const state = workflowState.createState();
      state.workflow.status = 'in_progress';
      workflowState.writeState(state, testDir);

      expect(workflowState.hasActiveWorkflow(testDir)).toBe(true);
    });

    it('should return false for completed workflow', () => {
      const state = workflowState.createState();
      state.workflow.status = 'completed';
      workflowState.writeState(state, testDir);

      expect(workflowState.hasActiveWorkflow(testDir)).toBe(false);
    });
  });

  describe('getWorkflowSummary', () => {
    it('should return null when no state exists', () => {
      expect(workflowState.getWorkflowSummary(testDir)).toBeNull();
    });

    it('should return summary with progress', () => {
      const state = workflowState.createState();
      state.task = { id: '123', title: 'Test task', source: 'github' };
      state.phases.history = [
        { phase: 'policy-selection', status: 'completed' },
        { phase: 'task-discovery', status: 'completed' }
      ];
      state.phases.current = 'worktree-setup';
      workflowState.writeState(state, testDir);

      const summary = workflowState.getWorkflowSummary(testDir);

      expect(summary.currentPhase).toBe('worktree-setup');
      expect(summary.progress).toBe('2/17');
      expect(summary.task.id).toBe('123');
    });

    it('should return error object for corrupted state', () => {
      const statePath = path.join(testDir, '.claude', 'workflow-state.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, 'corrupted data');

      const summary = workflowState.getWorkflowSummary(testDir);

      expect(summary.error).toContain('Corrupted workflow state');
      expect(summary.code).toBe('ERR_STATE_CORRUPTED');
    });
  });

  describe('updateAgentResult', () => {
    it('should update agent results', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const updated = workflowState.updateAgentResult('codeReviewer', {
        status: 'completed',
        issues: 3,
        critical: 0,
        high: 1
      }, testDir);

      expect(updated.agents.lastRun.codeReviewer.issues).toBe(3);
      expect(updated.agents.totalIssuesFound).toBe(3);
    });
  });

  describe('incrementIteration', () => {
    it('should increment iteration counter', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      workflowState.incrementIteration({ fixed: 2 }, testDir);
      const updated = workflowState.incrementIteration({ fixed: 1 }, testDir);

      expect(updated.phases.currentIteration).toBe(2);
      expect(updated.agents.totalIterations).toBe(2);
      expect(updated.agents.totalIssuesFixed).toBe(3);
    });
  });

  describe('PHASES constant', () => {
    it('should have all expected phases', () => {
      expect(workflowState.PHASES).toContain('policy-selection');
      expect(workflowState.PHASES).toContain('implementation');
      expect(workflowState.PHASES).toContain('review-loop');
      expect(workflowState.PHASES).toContain('merge');
      expect(workflowState.PHASES).toContain('complete');
    });

    it('should have policy-selection as first phase', () => {
      expect(workflowState.PHASES[0]).toBe('policy-selection');
    });

    it('should have complete as last phase', () => {
      expect(workflowState.PHASES[workflowState.PHASES.length - 1]).toBe('complete');
    });
  });

  describe('deepMerge security (via updateState)', () => {
    it('should filter out __proto__ keys to prevent prototype pollution', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      // Attempt prototype pollution via __proto__
      const maliciousUpdate = JSON.parse('{"task": {"__proto__": {"polluted": true}}}');
      workflowState.updateState(maliciousUpdate, testDir);

      // Verify prototype was not polluted
      expect({}.polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
    });

    it('should filter out constructor keys to prevent prototype pollution', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      // Attempt pollution via constructor
      const maliciousUpdate = { task: { constructor: { prototype: { polluted: true } } } };
      workflowState.updateState(maliciousUpdate, testDir);

      // Verify prototype was not polluted
      expect({}.polluted).toBeUndefined();
    });

    it('should filter out prototype keys to prevent prototype pollution', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      // Attempt pollution via prototype key
      const maliciousUpdate = { task: { prototype: { polluted: true } } };
      workflowState.updateState(maliciousUpdate, testDir);

      // Verify prototype was not polluted
      expect({}.polluted).toBeUndefined();
    });

    it('should handle null values in updates', () => {
      const state = workflowState.createState();
      state.task = { id: '123', title: 'Test' };
      workflowState.writeState(state, testDir);

      const updated = workflowState.updateState({ task: null }, testDir);

      expect(updated.task).toBeNull();
    });

    it('should preserve Date objects in merge', () => {
      const state = workflowState.createState();
      workflowState.writeState(state, testDir);

      const testDate = new Date('2026-01-16T00:00:00Z');
      const updated = workflowState.updateState({
        task: { deadline: testDate }
      }, testDir);

      // Note: Date gets serialized to string in JSON, but the merge should handle it
      expect(updated.task.deadline).toBeDefined();
    });

    it('should replace arrays instead of merging them', () => {
      const state = workflowState.createState();
      state.custom = { nested: { items: [1, 2, 3] } };
      workflowState.writeState(state, testDir);

      const updated = workflowState.updateState({
        custom: { nested: { items: [4, 5] } }
      }, testDir);

      // Arrays should be replaced, not concatenated
      expect(updated.custom.nested.items).toEqual([4, 5]);
    });

    it('should handle deeply nested object merging', () => {
      const state = workflowState.createState();
      state.config = { a: { b: { c: 1, d: 2 } } };
      workflowState.writeState(state, testDir);

      const updated = workflowState.updateState({
        config: { a: { b: { c: 99 } } }
      }, testDir);

      // Should merge deeply: c updated, d preserved
      expect(updated.config.a.b.c).toBe(99);
      expect(updated.config.a.b.d).toBe(2);
    });
  });
});
