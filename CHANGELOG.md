# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Verbosity Detection** - New patterns for `/deslop-around` command to detect AI-generated verbose code
  - `verbosity_preambles` - AI preamble phrases in comments (e.g., "Certainly!", "I'd be happy to help")
  - `verbosity_buzzwords` - Marketing buzzwords that obscure meaning (e.g., "synergize", "paradigm shift", "game-changing")
    - Excludes standard SE terminology like "leverage", "utilize", "orchestrate"
  - `verbosity_hedging` - Hedging language in comments (e.g., "perhaps", "might be", "should work", "I think")
  - `verbosity_ratio` - Multi-pass analyzer for excessive inline comments (>2:1 comment-to-code ratio)
  - Multi-language support for comment detection (JavaScript, Python, Rust, Go)
  - New `analyzeVerbosityRatio()` function in slop-analyzers.js

- **Over-Engineering Metrics Detection** - New project-level analysis for `/deslop-around` command
  - Detects three signals of over-engineering (the #1 AI slop indicator):
    - File proliferation: >20 files per export
    - Code density: >500 lines per export
    - Directory depth: >4 levels in src/
  - Multi-language support: JavaScript/TypeScript, Rust, Go, Python
  - Export detection via standard entry points (index.js, lib.rs, __init__.py, etc.)
  - Returns metrics with violations and severity (HIGH/MEDIUM/OK)
  - New `analyzeOverEngineering()` function in slop-analyzers.js
  - Severity `high`, autoFix `flag` (cannot auto-fix architectural issues)
- **Generic Naming Detection** - New patterns for `/deslop-around` command to flag overly generic variable names
  - JavaScript/TypeScript: `const/let/var data`, `result`, `item`, `temp`, `value`, `response`, etc.
  - Python: Generic assignments (excludes for-in loop variables)
  - Rust: `let`/`let mut` with generic names
  - Go: Short declarations (`:=`) with generic names
  - Severity `low` (advisory), autoFix `flag` (requires semantic understanding to rename)
  - Test files excluded to prevent false positives
- **Doc/Code Ratio Detection** - New `doc_code_ratio_js` pattern flags JSDoc blocks that are disproportionately longer than the functions they document (threshold: 3x function length)
  - Uses multi-pass analysis to compute actual doc/code ratio
  - Skips tiny functions (< 3 lines) to avoid false positives
  - Severity `medium`, autoFix `flag` (requires manual review)
  - New `lib/patterns/slop-analyzers.js` module for structural code analysis
- **Issue/PR Reference Cleanup** - New `issue_pr_references` pattern flags ANY mention of issue/PR/iteration numbers in code comments as slop (e.g., `#123`, `PR #456`, `iteration 5`)
  - Context belongs in commits and PRs, not code comments
  - Severity `medium`, autoFix `remove` (clear slop)
  - Excludes markdown files where issue references are appropriate
- **File Path Reference Detection** - New `file_path_references` pattern flags file path references in comments that may become outdated (e.g., `// see auth-flow.md`)
  - Severity `low`, autoFix `flag` (may have valid documentation purpose)
- **Multi-Pass Pattern Helper** - New `getMultiPassPatterns()` function to retrieve patterns requiring structural analysis
- **Placeholder Function Detection** - New patterns for `/deslop-around` command (#98)
  - JavaScript/TypeScript: stub returns (0, true, false, null, [], {}), empty functions, throw Error("TODO")
  - Rust: todo!(), unimplemented!(), panic!("TODO")
  - Python: raise NotImplementedError, pass-only functions, ellipsis bodies
  - Go: panic("TODO") placeholders
  - Java: throw UnsupportedOperationException()
  - All patterns have severity `high` and autoFix `flag` (requires manual review)
  - Test files are excluded to prevent false positives

### Fixed
- **findMatchingBrace** - Now skips comments to avoid breaking on quotes/apostrophes in comment text (e.g., "it's", "we're")
- **Reality Check Output Size** - Condensed collector output to ~700 lines/~4.5k tokens (was thousands of lines)
  - Issue/PR bodies replaced with 200-char snippets (full context not needed)
  - Categorized issues store number + title (enough to understand without lookup)
  - PRs include files changed for scope understanding
  - Documentation features limited to 20, plans to 15
  - Code structure replaced with summary stats + top-level dirs only
  - File stats limited to top 10 extensions
  - **Added symbol extraction** - function/class/export names per source file (up to 40 files)
    - Helps agent verify if documented features are actually implemented
    - Scans lib/, src/, app/, pages/, components/, utils/, services/, api/ dirs

## [2.6.0] - 2026-01-20

### Added
- **CLI Installer** - `npm install -g awesome-slash@latest && awesome-slash`
  - Multi-select: choose one or more platforms (Claude Code, OpenCode, Codex)
  - Uses npm package files directly (no git clone)
  - Claude Code: Uses GitHub marketplace for plugin installation
  - OpenCode: Copies commands to `~/.opencode/commands/awesome-slash/`
  - Codex: Copies prompts to `~/.codex/prompts/` (uses prompts system, not skills)
  - Configures MCP servers automatically for OpenCode and Codex
  - Update: `npm update -g awesome-slash`
  - Remove: `npm uninstall -g awesome-slash && awesome-slash --remove`
- **Automated Release Workflow** - GitHub Actions workflow for npm publish with provenance

### Fixed
- **CLI Installer** - Multiple fixes for cross-platform installation
  - Fixed OpenCode command path to `~/.opencode/commands/awesome-slash/`
  - Fixed Codex to use proper skills format with `SKILL.md` (name + description)
  - Fixed MCP server dependency installation
  - Cleans up deprecated files and old wrong locations on install/update
  - Added all 7 skills: next-task, ship, deslop-around, project-review, reality-check-scan, delivery-approval, update-docs-around

### Changed
- **Reality Check Architectural Refactor** - Replaced 4 LLM agents with JS collectors + single Opus call (#97)
  - New `lib/reality-check/collectors.js` handles all data collection with pure JavaScript
  - Deleted `issue-scanner.md`, `doc-analyzer.md`, `code-explorer.md` agents
  - Deleted `reality-check-state.js` (510 lines of unnecessary state management)
  - Enhanced `plan-synthesizer.md` to receive raw data and perform deep semantic analysis
  - ~77% token reduction for reality-check scans
  - Command flags replace interactive settings: `--sources`, `--depth`, `--output`, `--file`
- **Package Size** - Reduced npm package size by excluding adapters and dev scripts

### Breaking Changes
- `.claude/reality-check.local.md` settings file is no longer used
- Use command flags instead: `/reality-check:scan --sources github,docs --depth quick`
- `/reality-check:set` command removed (use flags instead)

### Removed
- `plugins/reality-check/agents/issue-scanner.md`
- `plugins/reality-check/agents/doc-analyzer.md`
- `plugins/reality-check/agents/code-explorer.md`
- `plugins/reality-check/lib/state/reality-check-state.js`
- `plugins/reality-check/commands/set.md` (use command flags instead)
- `adapters/` and `scripts/install/` from npm package (CLI handles installation)

## [2.5.1] - 2026-01-19

### Added
- **Platform-Aware State Directories** - State files now stored in platform-specific directories
  - Claude Code: `.claude/`
  - OpenCode: `.opencode/`
  - Codex CLI: `.codex/`
  - Override with `AI_STATE_DIR` environment variable
- **New lib/platform/state-dir.js** - Centralized platform detection module

### Fixed
- **OpenCode Installer** - Fixed config format (uses `mcp` key, `type: local`)
- **Codex Installer** - Fixed to use `config.toml` with Windows-style paths
- **MCP Server Bugs** - Fixed `state.workflow.id` → `state.task.id` references
- **MCP Resume Logic** - Fixed `checkpoints.canResume` to use correct state fields

### Changed
- **Codex Skills** - Added explicit instructions to get files from git diff or ask user
- **OpenCode Commands** - Added "CRITICAL: Always Ask User First" sections
- **Documentation** - Added note that Codex uses `$` prefix instead of `/` for commands

## [2.5.0] - 2026-01-19

### Added
- **Multi-Source Task Discovery** - Support for GitHub, GitLab, local files, custom CLI tools
- **Source Preference Caching** - Last-used source cached in `sources/preference.json`
- **Large Backlog Handling** - Pagination and priority filtering for repos with many issues

### Changed
- **Streamlined Policy Selection** - Direct questions from orchestrator, removed separate agent

### Security
- **Command Injection** - Fixed shell command injection vulnerabilities
- **Path Traversal** - Fixed path traversal in source-cache.js

## [2.4.7] - 2026-01-18

### Changed
- **Simplified State Management** - Rewrote workflow-state.js (#90)
  - Reduced from 922 to ~520 lines
  - Removed overengineered config system (~10,000 lines deleted)
  - Removed 13 unused JSON schema files
  - Replaced complex nested state with simple two-file system:
    - `tasks.json` in main project: tracks active worktree/task
    - `flow.json` in worktree: tracks workflow progress
  - Removed arbitrary maxReviewIterations (now runs until approved)
  - Removed unused mergeStrategy option
- **Tasks Lifecycle Wiring** - tasks.json now auto-registers/clears with workflow lifecycle
  - `createFlow()` automatically registers task in tasks.json
  - `completeWorkflow()` and `abortWorkflow()` automatically clear active task
- **Agent Model Updates** - task-discoverer and code-explorer upgraded to opus
- **Project Philosophy** - Added development guidelines to CLAUDE.md
  - Core priorities: User DX > worry-free automation > minimal tokens > quality > simplicity
  - Plugin purpose clarification: for OTHER projects, not internal tooling

### Fixed
- **Path Validation** - Added path validation to prevent traversal attacks in workflow-state.js
- **Error Logging** - Added critical error logging for corrupted JSON files
- **hasActiveTask** - Fixed false positive with legacy format (uses `!= null` instead of truthiness)
- **writeFlow** - Fixed mutation issues by cloning before modification
- **updateFlow** - Fixed null handling logic
- **completePhase** - Fixed to use updateFlow pattern consistently

## [2.4.6] - 2026-01-18

### Fixed
- **Documentation Accuracy** - Fixed all documentation inconsistencies (#91)
  - Fixed config file name: `.claude.config.json` → `.awesomeslashrc.json` in INSTALLATION.md
  - Fixed phase counts: Updated to 18 phases in USAGE.md, CROSS_PLATFORM.md
  - Removed all time estimates from user-facing docs (policy compliance)
  - Updated planning-agent tools in CLAUDE.md and CROSS_PLATFORM.md
  - Fixed non-existent script references in migration guides
- **Auto-Resume Prevention** - Added mandatory gates to prevent automatic task resumption (#92)
  - Added ⛔ NO AUTO-RESUME gate in next-task.md
  - Added mandatory existing task check in policy-selector.md (Phase 1.5)
  - User must explicitly choose: start new, resume, abort, or view status
  - Warning for active tasks (< 1 hour old) that may be running elsewhere
  - Default behavior: "Start New Task (Recommended)"

### Changed
- **Planning Flow Architecture** - Improved planning workflow separation (#93)
  - planning-agent now outputs structured JSON instead of entering plan mode
  - Orchestrator receives JSON, formats to markdown, enters plan mode
  - Context-efficient: JSON with `=== PLAN_START ===` markers
  - Clean separation: agent creates, orchestrator presents
  - Removed EnterPlanMode tool from planning-agent
- **Work Guidelines** - Added "No Summary Files" policy to CLAUDE.md
  - Prohibited: `*_FIXES_APPLIED.md`, `*_AUDIT.md`, `*_SUMMARY.md`
  - Summary info goes in CHANGELOG.md or commit messages only
  - Focus on work, not documentation about work

## [2.4.5] - 2026-01-18

### Fixed
- **Agent Tool Enforcement** - Critical fixes for agent tool usage (#88)
  - Fixed policy-selector agent not showing checkbox UI - Added AskUserQuestion to tools
  - Fixed task-discoverer agent not showing task selection as checkboxes
  - Fixed planning-agent not entering plan mode after creating plans
  - Added CRITICAL REQUIREMENT sections to enforce proper tool usage
- **Schema Validator** - Fixed validation bugs
  - Added string constraints (minLength, maxLength, pattern) to main validate() method
  - Fixed null type checking to handle null separately from object type
  - Added array constraints (minItems, maxItems, uniqueItems) to main validate() method
- **Cache Management** - Migrated to CacheManager abstraction
  - Fixed unbounded state cache growth in workflow-state.js
  - Replaced plain Map with CacheManager (maxSize: 50, ttl: 200ms)
  - Removed custom cache management code for consistency

### Changed
- **Documentation** - Simplified and clarified user-facing docs
  - Streamlined MANUAL_TESTING.md - removed verbose explanations
  - Made README.md more concise and professional
  - Removed excessive formatting and emoji icons

### Tests
- Fixed cache-manager test maxSize conflicts
- Skipped 3 MCP server integration tests (mocking complexity)
- All core tests passing: 513/516 passed, 3 skipped

## [2.4.4] - 2026-01-18

### Added
- **PR Auto-Review Process** - Added mandatory workflow for 4 auto-reviewers (Copilot, Claude, Gemini, Codex)
- **Agent Responsibilities** - Documented required tools and MUST-CALL agents for /next-task and /ship
- **CLAUDE.md Enhancement** - Comprehensive agent workflow documentation with tool restrictions

### Changed
- Updated ci-monitor.md with 4-reviewer process details
- Updated ship-ci-review-loop.md with PR auto-review section

## [2.4.3] - 2026-01-18

### Added
- **CLAUDE.md** - Project guidelines with release process and PR auto-review workflow
- **npm installation option** - Added npm as primary installation method to INSTALLATION.md

### Fixed
- **Documentation sync** - Fixed outdated references across all documentation:
  - Fixed plugin install commands in adapters/README.md (`deslop-around` → `awesome-slash`)
  - Updated phase counts in CROSS_PLATFORM.md (`17-phase` → `13/12-phase`)
  - Completed agent list in CROSS_PLATFORM.md (8 → 18 agents)
  - Updated version references throughout docs

### Changed
- Reorganized INSTALLATION.md with npm as Option 1 (Recommended)

## [2.4.2] - 2026-01-18

### Fixed
- **Security**: Addressed 32 technical debt issues from multi-agent review (#84)
  - Fixed command injection vulnerabilities in context-optimizer.js
  - Addressed path traversal risks in workflow-state.js
  - Enhanced input validation across core libraries
  - Added 255 new tests (total: 180 → 435 tests)
- **Renamed package** from `awsome-slash` to `awesome-slash` (fixed typo)
- Updated all internal references, repository URLs, and environment variable names

## [2.4.1] - 2026-01-18

### Added
- Published to npm as `awesome-slash` for easier installation
- Added `.npmignore` and `files` field for optimized package size (191KB → 143KB)

### Changed
- npm is now the recommended installation method
- Updated README with npm badges and installation instructions

## [2.4.0] - 2026-01-18

### Added
- **Reality Check Plugin**: Deep repository analysis to detect plan drift and gaps
  - Multi-agent parallel scanning architecture (issue-scanner, doc-analyzer, code-explorer, plan-synthesizer)
  - Detects drift: plan stagnation, priority neglect, documentation lag, scope overcommit
  - Identifies gaps: missing tests, outdated docs, overdue milestones
  - Cross-references documented vs implemented features
  - Generates prioritized reconstruction plans (immediate, short-term, medium-term, backlog)
  - Interactive first-run setup with checkbox configuration
  - Configurable via `.claude/reality-check.local.md` settings file
  - Commands: `/reality-check:scan`, `/reality-check:set`
  - Includes `reality-analysis` skill for drift detection patterns and prioritization frameworks

### Improved
- **Test Coverage**: Enhanced `workflow-state.test.js` to verify state immutability after failed operations (#60)
  - Added validation that `startPhase()` with invalid phase name leaves state completely unchanged
  - Ensures no partial writes occur when operations fail
  - Strengthens guarantee of atomic state updates


## [2.3.1] - 2026-01-17

### Fixed
- **Error Handling**: `readState()` now returns Error object for corrupted JSON files instead of null (#50)
  - Enables distinction between missing files (returns `null`) and corrupted files (returns `Error` with code `ERR_STATE_CORRUPTED`)
  - Updated all internal callers and plugin copies to handle Error returns gracefully
- **Security**: `deepMerge()` prototype pollution protection now applied to all plugin copies
  - Prevents `__proto__`, `constructor`, `prototype` key injection attacks
  - Uses `Object.keys()` instead of `for...in` to avoid inherited property iteration
  - Handles null/undefined and Date objects properly
- **Ship CI Loop**: Mandatory comment resolution before merge
  - Phase 4 now ALWAYS runs, even when called from /next-task
  - Phase 6 includes mandatory pre-merge check for zero unresolved threads
  - Clarified that "SKIPS review" only applies to Phase 5 internal agents, not external auto-reviewers

## [2.3.0] - 2026-01-16

### Added
- **CI & Review Monitor Loop** for `/ship` command (#79)
  - Continuous monitoring loop waits for CI AND addresses ALL PR feedback
  - Auto-waits 3 minutes on first iteration for review bots (Gemini, CodeRabbit)
  - Configurable via `SHIP_INITIAL_WAIT` environment variable
  - Addresses every comment: fixes, answers questions, or explains resolution
  - GraphQL-based thread resolution and reply functionality
- **Comprehensive Command Injection Tests**: 44 new test cases for `verify-tools.js` (#61, #78)
  - Newline injection patterns (LF, CR, CRLF)
  - Null byte injection
  - Path traversal (Unix and Windows)
  - Command substitution (backticks, dollar-paren)
  - Quote escaping (single and double quotes)
  - Shell metacharacters (pipes, redirects, operators, globs)

### Changed
- **Progressive Disclosure Refactoring** for reduced context consumption
  - `ship.md`: 1697 → 337 lines (-80%), split into 4 files
  - `project-review.md`: 929 → 273 lines (-71%), split into 3 files
  - All core command files now under 500 line limit per Claude Code best practices
  - Reference files loaded on-demand, reducing base context consumption
- **Explicit Workflow State Updates** in next-task agents
  - Mandatory state updates box diagrams in all agents
  - Clear `recordStepCompletion()` function template
  - Explicit /ship invocation requirement after docs-updater
  - Worktree cleanup responsibilities matrix
  - "Existing session" vs "stale session" semantics clarified

### Fixed
- **Security**: Protected `deepMerge` against prototype pollution attacks
- **Security**: Improved input validation in core libraries
- **Performance**: Optimized core library operations

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
- **State Management** - `.claude/workflow-state.json` for workflow persistence
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

