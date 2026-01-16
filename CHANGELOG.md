# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Comprehensive Command Injection Tests**: 44 new test cases for `verify-tools.js` security validation (#61)
  - Newline injection patterns (LF, CR, CRLF)
  - Null byte injection
  - Path traversal (Unix and Windows)
  - Command substitution (backticks, dollar-paren)
  - Quote escaping (single and double quotes)
  - Shell metacharacters (pipes, redirects, operators, globs)
  - Tests validate both command name and version flag parameters


## [2.2.1] - 2026-01-16

### Fixed
- **Version Sync** - All package manifests now correctly report version 2.2.1
  - `plugin.json` was stuck at 2.1.2
  - `package-lock.json` was stuck at 1.2.0

## [2.2.0] - 2026-01-16

### Added
- **Two-File State Management** to prevent workflow collisions
  - `tasks.json` in main repo: Shared registry of claimed tasks
  - `workflow-status.json` in worktree: Local step tracking with timestamps
  - Resume by task ID, branch name, or worktree path
- **New Agents**
  - `ci-fixer.md` (sonnet): Fix CI failures and PR comments, called by ci-monitor
  - `simple-fixer.md` (haiku): Execute pre-defined code fixes mechanically
- **Workflow Enforcement Gates** - Explicit STOP gates in all agents
  - Agents cannot skip review-orchestrator, delivery-validator, docs-updater
  - Agents cannot create PRs - only /ship creates PRs
  - SubagentStop hooks enforce mandatory workflow sequence
- **State Schema Files**
  - `tasks-registry.schema.json`: Schema for main repo task registry
  - `worktree-status.schema.json`: Schema for worktree step tracking

### Changed
- **Model Optimization** for cost efficiency
  - `policy-selector`: sonnet → haiku (simple checkbox UI)
  - `worktree-manager`: sonnet → haiku (scripted git commands)
  - `task-discoverer`: sonnet → inherit (varies by context)
  - `ci-monitor`: sonnet → haiku (watching) + sonnet subagent (fixing)
  - `deslop-work`: Now delegates fixes to simple-fixer (haiku)
  - `docs-updater`: Now delegates fixes to simple-fixer (haiku)
- **test-coverage-checker** enhanced with quality validation
  - Validates tests actually exercise new code (not just path matching)
  - Detects trivial assertions (e.g., `expect(true).toBe(true)`)
  - Checks for edge case coverage
  - Verifies tests import the source file they claim to test
- **next-task.md** refactored from 761 to ~350 lines
  - Progressive disclosure - orchestrates agents, doesn't duplicate knowledge
  - Ends at delivery validation, hands off to /ship
  - Added State Management Architecture section
- **ship.md** integration with next-task
  - Skips review loop when called from next-task (already done)
  - Removes task from registry on cleanup

### Fixed
- Workflow enforcement: Agents can no longer skip mandatory gates
- State collisions: Parallel workflows no longer write to same file
- Trigger language standardized: "Use this agent [when/after] X to Y"
- Removed "CRITICAL" language from worktree-manager (per best practices)
- Added model choice rationale documentation to all agents

## [2.1.2] - 2026-01-16

### Fixed
- **Codex CLI Install Script**: Now uses `codex mcp add` command for proper MCP server registration
- **Codex Skills**: Creates skills in proper `<skill-name>/SKILL.md` folder structure per Codex docs
- **OpenCode Install Script**: Uses `opencode.json` config with proper `mcp` object format
- **OpenCode Agents**: Creates agents with proper markdown frontmatter (description, mode, tools)

## [2.1.1] - 2026-01-16

### Fixed
- Removed invalid `sharedLib` and `requires` keys from all plugin.json files
- Moved SubagentStop hooks to proper `hooks/hooks.json` file location
- Fixed marketplace schema validation errors

## [2.1.0] - 2026-01-16

### Added
- **Quality Gate Agents** for fully autonomous workflow after plan approval
  - `deslop-work.md` - Clean AI slop from committed but unpushed changes
  - `test-coverage-checker.md` - Validate new work has test coverage
  - `delivery-validator.md` - Autonomous delivery validation (NOT manual approval)
  - `docs-updater.md` - Update docs related to changes after delivery validation
- **New Commands**
  - `/update-docs-around` - Standalone docs sync command for entire repo
  - `/delivery-approval` - Standalone delivery validation command
- **SubagentStop Hooks** in plugin.json for automatic workflow phase transitions
- **Workflow Automation** - No human intervention from plan approval until policy stop point

### Changed
- Updated workflow to 13 phases (was 17) with new quality gate phases
- Pre-review gates now run before first review (deslop-work + test-coverage-checker)
- Post-iteration deslop runs after each review iteration to clean fixes
- Delivery validation is now autonomous (not manual approval)
- Documentation auto-updates after delivery validation
- Total agents increased from 8 to 12 specialist agents

### Improved
- Review-orchestrator.md now calls deslop-work after each iteration
- Next-task.md updated with new phases (7.5, 9, 9.5) for autonomous flow
- Full autonomous flow after plan approval - only 3 human touchpoints total

## [2.0.0] - 2026-01-15

### Added
- **Master Workflow Orchestrator** - Complete task-to-production automation
- **State Management** - `.claude/.workflow-state.json` for workflow persistence
- **8 Specialist Agents** - Opus for complex tasks, Sonnet for operations
- **Cross-Platform MCP Server** - Integration with OpenCode and Codex CLI
- **Resume Capability** - `--status`, `--resume`, `--abort` flags

### Changed
- Removed `pr-merge` plugin - functionality absorbed into `next-task` and `ship`
- Updated marketplace.json to v2.0.0

## [1.1.0] - 2026-01-15

### Added
- **Test Infrastructure**: Jest test suite with 103 unit tests covering all core modules
  - `detect-platform.test.js` - Platform detection tests
  - `verify-tools.test.js` - Tool verification tests
  - `slop-patterns.test.js` - Pattern matching and secret detection tests
  - `review-patterns.test.js` - Framework pattern tests
- **Expanded Secret Detection**: 14 new patterns for comprehensive credential detection
  - JWT tokens, OpenAI API keys, GitHub tokens (PAT, fine-grained, OAuth)
  - AWS credentials, Google/Firebase API keys, Stripe API keys
  - Slack tokens/webhooks, Discord tokens/webhooks, SendGrid API keys
  - Twilio credentials, NPM tokens, Private keys, High-entropy strings
- **Plugin Dependencies**: Added `sharedLib` and `requires` fields to all plugin manifests
- **Pre-indexed Pattern Lookups**: O(1) lookup performance for patterns by language, severity, category
  - `getPatternsByCategory()`, `getPatternsForFrameworkCategory()`
  - `searchPatterns()` for full-text search across all patterns
  - `getPatternCount()`, `getTotalPatternCount()` for statistics

### Changed
- **Async Platform Detection**: Converted to async operations with `Promise.all` for parallel execution
  - `detectAsync()` runs all detections in parallel
  - Added async versions of all detection functions
- **Async Tool Verification**: Parallel tool checking reduces verification time from ~2s to ~200ms
  - `verifyToolsAsync()` checks all 26 tools in parallel
  - `checkToolAsync()` for individual async tool checks
- **File Caching**: Added `existsCached()` and `readFileCached()` to avoid redundant file reads

### Fixed
- Windows spawn deprecation warning by using `cmd.exe` directly instead of shell option
- Token exposure in `pr-merge.md` and `ship.md` - now uses `-K` config file approach
- Force push safety in `ship.md` - replaced `--force` with `--force-with-lease`
- JSON structure validation before accessing `config.environments` in platform detection
- Glob expansion issue in install scripts - now uses explicit for-loop iteration
- Numeric validation for PR number input in `/pr-merge`

### Security
- Added `deepFreeze()` to pattern objects for V8 optimization and immutability
- Input validation for tool commands and version flags (alphanumeric only)

## [1.0.0] - 2026-01-15

Initial release with full feature set.

### Added
- `/ship` command for complete PR workflow with deployment
- `/next-task` command for intelligent task prioritization
- `/deslop-around` command for AI slop cleanup
- `/project-review` command for multi-agent code review (with Phase 8 GitHub issue creation)
- `/pr-merge` command for intelligent PR merge procedure
- Platform detection scripts with caching
- Tool verification system
- Context optimization utilities
- Adapters for Codex CLI and OpenCode
- MIT License
- Security policy
- Contributing guidelines
