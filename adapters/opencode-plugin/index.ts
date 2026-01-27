/**
 * awesome-slash Native OpenCode Plugin
 *
 * Provides deep integration with OpenCode features:
 * - Auto-thinking selection based on agent complexity
 * - Workflow enforcement via permission hooks
 * - Session compaction with workflow state preservation
 *
 * Install: Automatically installed by `awesome-slash` CLI when selecting OpenCode
 * Location: ~/.opencode/plugins/awesome-slash/
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

// Agent complexity tiers for thinking budget selection
const AGENT_THINKING_CONFIG: Record<string, { budget: number; description: string }> = {
  // Execution tier - no thinking needed (haiku-level tasks)
  "worktree-manager": { budget: 0, description: "Simple git operations" },
  "simple-fixer": { budget: 0, description: "Mechanical code fixes" },
  "ci-monitor": { budget: 0, description: "Status checking" },

  // Discovery tier - light thinking (8k)
  "task-discoverer": { budget: 8000, description: "Task analysis" },
  "docs-updater": { budget: 8000, description: "Documentation sync" },

  // Analysis tier - moderate thinking (12k)
  "exploration-agent": { budget: 12000, description: "Codebase exploration" },
  "deslop-work": { budget: 12000, description: "Slop detection" },
  "test-coverage-checker": { budget: 12000, description: "Coverage analysis" },
  "ci-fixer": { budget: 12000, description: "CI problem solving" },

  // Reasoning tier - extended thinking (16k)
  "planning-agent": { budget: 16000, description: "Implementation planning" },
  "delivery-validator": { budget: 16000, description: "Delivery validation" },
  "implementation-agent": { budget: 16000, description: "Code implementation" },

  // Synthesis tier - maximum thinking (20k+)
  "plan-synthesizer": { budget: 20000, description: "Deep semantic analysis" },
  "enhancement-orchestrator": { budget: 20000, description: "Enhancement coordination" },
  "plugin-enhancer": { budget: 16000, description: "Plugin analysis" },
  "agent-enhancer": { budget: 16000, description: "Agent optimization" },
  "docs-enhancer": { budget: 16000, description: "Docs improvement" },
  "claudemd-enhancer": { budget: 16000, description: "Project memory optimization" },
  "prompt-enhancer": { budget: 16000, description: "Prompt quality analysis" },
}

// Workflow phases where certain actions are blocked
const WORKFLOW_BLOCKED_ACTIONS: Record<string, string[]> = {
  "exploration": [],
  "planning": [],
  "implementation": ["git push", "gh pr create"],
  "review": ["git push", "gh pr create", "gh pr merge"],
  "delivery-validation": ["git push", "gh pr create", "gh pr merge"],
  "shipping": [], // /ship handles these
}

// Get state directory based on platform
function getStateDir(directory: string): string {
  // Check for AI_STATE_DIR env var first
  if (process.env.AI_STATE_DIR) {
    return join(directory, process.env.AI_STATE_DIR)
  }
  // Default to .opencode for OpenCode
  return join(directory, ".opencode")
}

// Read workflow state from flow.json
async function getWorkflowState(directory: string): Promise<{
  phase?: string
  task?: { id: string; title: string }
  worktree?: string
} | null> {
  const stateDir = getStateDir(directory)
  const flowPath = join(stateDir, "flow.json")

  try {
    if (!existsSync(flowPath)) return null
    const content = await readFile(flowPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

// Save workflow context for compaction
async function saveCompactionContext(directory: string, context: string[]): Promise<void> {
  const stateDir = getStateDir(directory)
  const contextPath = join(stateDir, "compaction-context.json")

  try {
    await mkdir(stateDir, { recursive: true })
    await writeFile(contextPath, JSON.stringify({
      context,
      timestamp: Date.now()
    }, null, 2))
  } catch {
    // Ignore write errors
  }
}

export const AwesomeSlashPlugin: Plugin = async (ctx) => {
  const { directory } = ctx

  return {
    /**
     * Auto-select thinking budget based on agent complexity
     *
     * This hook fires before each LLM call and can modify:
     * - temperature
     * - topP, topK
     * - options (provider-specific, including thinking config)
     */
    "chat.params": async (input, output) => {
      const agentName = input.agent?.toLowerCase() || ""

      // Check if this is one of our agents
      const config = AGENT_THINKING_CONFIG[agentName]

      if (config && config.budget > 0) {
        // Detect provider and apply appropriate thinking config
        const providerID = input.model?.providerID || ""

        if (providerID.includes("anthropic") || providerID.includes("bedrock")) {
          // Anthropic-style thinking
          output.options = output.options || {}
          output.options.thinking = {
            type: "enabled",
            budgetTokens: config.budget
          }
        } else if (providerID.includes("openai") || providerID.includes("azure")) {
          // OpenAI-style reasoning
          output.options = output.options || {}
          const effort = config.budget >= 16000 ? "high" :
                        config.budget >= 12000 ? "medium" : "low"
          output.options.reasoningEffort = effort
          output.options.reasoningSummary = "auto"
        } else if (providerID.includes("google")) {
          // Google Gemini thinking
          output.options = output.options || {}
          output.options.thinkingConfig = {
            includeThoughts: true,
            thinkingBudget: config.budget
          }
        }
        // Other providers: let them use defaults
      }

      // Adjust temperature based on agent type
      if (agentName.includes("review") || agentName.includes("validator")) {
        // Lower temperature for review/validation tasks (more deterministic)
        output.temperature = Math.min(output.temperature || 0.7, 0.3)
      } else if (agentName.includes("planning") || agentName.includes("exploration")) {
        // Moderate temperature for exploration (some creativity)
        output.temperature = output.temperature || 0.5
      }
    },

    /**
     * Workflow enforcement via permission hooks
     *
     * Blocks certain actions during workflow phases to enforce:
     * - No git push until /ship
     * - No PR creation until /ship
     * - No merging until validation complete
     */
    "permission.ask": async (input, output) => {
      // Only intercept bash permissions
      if (input.type !== "bash") return

      const command = input.metadata?.command as string || ""
      const state = await getWorkflowState(directory)

      if (!state?.phase) return // No active workflow

      const blockedActions = WORKFLOW_BLOCKED_ACTIONS[state.phase] || []

      for (const blocked of blockedActions) {
        if (command.includes(blocked)) {
          output.status = "deny"

          // Log why it was blocked (for debugging)
          console.error(`[awesome-slash] Blocked "${blocked}" during ${state.phase} phase`)
          console.error(`[awesome-slash] Use /ship to properly push and create PR`)
          return
        }
      }
    },

    /**
     * Session compaction hook
     *
     * Preserves workflow state when OpenCode compacts the session.
     * This ensures long-running workflows don't lose context.
     */
    "experimental.session.compacting": async (input, output) => {
      const state = await getWorkflowState(directory)

      if (state) {
        // Add workflow context to compaction
        output.context = output.context || []

        if (state.phase) {
          output.context.push(`WORKFLOW STATE: Currently in "${state.phase}" phase`)
        }

        if (state.task) {
          output.context.push(`ACTIVE TASK: ${state.task.title} (${state.task.id})`)
        }

        if (state.worktree) {
          output.context.push(`WORKTREE: Working in ${state.worktree}`)
        }

        // Custom compaction prompt to preserve important info
        output.prompt = `Summarize this conversation while preserving:
1. Current workflow phase and state
2. Task being worked on and progress
3. Key decisions made and their rationale
4. Pending actions and blockers
5. File paths and code changes discussed

Keep technical details accurate. The user will continue this workflow after compaction.`

        // Save context for potential recovery
        await saveCompactionContext(directory, output.context)
      }
    },

    /**
     * Tool execution tracking
     *
     * Updates workflow state after tool executions for better tracking.
     */
    "tool.execute.after": async (input, output) => {
      // Track significant tool completions
      const significantTools = ["Write", "Edit", "Bash"]

      if (significantTools.includes(input.tool)) {
        const state = await getWorkflowState(directory)
        if (state) {
          // Update last activity timestamp in flow.json
          const stateDir = getStateDir(directory)
          const flowPath = join(stateDir, "flow.json")

          try {
            const updatedState = {
              ...state,
              lastActivityAt: Date.now(),
              lastTool: input.tool
            }
            await writeFile(flowPath, JSON.stringify(updatedState, null, 2))
          } catch {
            // Ignore write errors
          }
        }
      }
    },

    /**
     * Event subscription for workflow monitoring
     */
    event: async ({ event }) => {
      // Monitor for session errors during workflow
      if (event.type === "session.error") {
        const state = await getWorkflowState(directory)
        if (state?.phase) {
          console.error(`[awesome-slash] Error during ${state.phase} phase:`, event.properties)
        }
      }
    }
  }
}

// Default export for OpenCode plugin loader
export default AwesomeSlashPlugin
