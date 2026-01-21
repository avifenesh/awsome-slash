# AI Slop: Comprehensive Research Document

> **Research Date**: January 2026
> **Context**: awesome-slash plugin development
> **Researcher**: Claude (Opus 4.5)

---

## Table of Contents

1. [Research Motivation](#research-motivation)
2. [Methodology](#methodology)
3. [Definition of AI Slop](#definition-of-ai-slop)
4. [Detailed Pattern Categories](#detailed-pattern-categories)
5. [Professional Tools & Approaches](#professional-tools--approaches)
6. [Gap Analysis: Current vs Needed](#gap-analysis-current-vs-needed)
7. [Recommendations](#recommendations)
8. [Sources](#sources)

---

## Research Motivation

### The Problem

The `/deslop-around` command in awesome-slash was designed as a "slop cleanup" tool, but after running it on modified files, it only detected basic patterns:

| What We Check | Result |
|---------------|--------|
| `console.log/debug/error` | None found |
| `TODO/FIXME/HACK` comments | None found |
| Placeholder text (lorem ipsum) | None found |
| Disabled linters (eslint-disable) | None found |
| Empty catch blocks | 8 found (intentional) |
| Debug imports (pdb, ipdb) | None found |
| Commented-out code blocks | None found |

**The user's feedback was clear**: *"what we do is simple sanitizer, i need much more than that. Bring me all what professionals means when they says slop"*

This prompted deep research into what "AI slop" actually means in professional software engineering contexts, beyond simple code hygiene patterns.

### The Question

What do professionals, experienced developers, and the software engineering community *actually* mean when they refer to "AI slop" in code? How does this differ from traditional code quality concerns?

---

## Methodology

### Sources Consulted

1. **GitHub Issues** - Real-world discussions about AI slop in codebases
2. **GitHub Repositories** - Tools specifically built to detect AI slop
3. **Technical Documentation** - README files from slop detection tools
4. **Community Discussions** - Developer feedback and experiences
5. **Wikipedia** - Attempted (blocked by 403)
6. **Tech Journalism** - Attempted (Wired, The Atlantic, Verge - blocked)

### Key Discoveries

The most valuable source was a GitHub issue from the FortCov project (#1288) titled "META: Address AI slop throughout codebase" which provided a comprehensive, evidence-based definition with concrete metrics.

Additionally, several purpose-built tools were discovered:
- `sloppylint` - Python AI slop detector
- `AI-SLOP-Detector` - Multi-pattern analyzer
- `vibe-check-mcp` - Vibe coding safety net
- `anti-slop-library` - Design pattern detection

---

## Definition of AI Slop

### Wikipedia Definition (Referenced)

> "AI slop is low-quality AI-generated content characterized by solving problems that do not exist, over-engineering simple solutions, verbose documentation with buzzwords, defensive coding for impossible scenarios, and creating technical debt faster than solving it."

### Working Definition

**AI slop** refers to code, documentation, or design artifacts produced by AI systems that exhibit characteristic patterns of:

1. **Substance without value** - Code that exists but serves no purpose
2. **Complexity without necessity** - Over-engineered solutions to simple problems
3. **Claims without evidence** - Documentation that doesn't match reality
4. **Structure without function** - Frameworks and patterns used incorrectly

The key insight is that AI slop is **not** about syntax errors, type mismatches, or style violations (which eslint/tsc/clippy already catch). It's about **semantic problems** - code that compiles and passes linters but is fundamentally misguided, wasteful, or misleading.

---

## Detailed Pattern Categories

### Category 1: Over-Engineering

**The #1 indicator of AI slop according to professional sources.**

#### Manifestations

| Pattern | Example | Why It's Slop |
|---------|---------|---------------|
| File proliferation | 141 files for a text parser | Simple task, complex solution |
| Line inflation | 24,126 lines for 10 CLI flags | 2,400 lines per flag is absurd |
| Directory explosion | 37 directories in src/ | Unnecessary organization overhead |
| Abstraction layers | Factory → Builder → Strategy for one class | Patterns without purpose |

#### Real-World Example (FortCov)

```
Before (AI-generated):
- 141 source files
- 24,126 lines of code
- 37 directories
- 16 security-related files

After (human cleanup target):
- ~10 source files
- ~2000 lines of code
- Clear documentation
- No security theater
```

#### Detection Signals

- Lines of code / number of features ratio > 500:1
- Number of files > 10x the number of distinct features
- Abstract classes with single implementations
- Interfaces implemented by one class
- Configuration systems for < 5 settings

---

### Category 2: Phantom References

**Comments and docs referencing things that don't exist.**

> **Note**: Hallucinated imports and fake API calls are caught by TypeScript/rustc/eslint/clippy. This category focuses on what linters miss.

#### What Linters Miss

```javascript
// Comments referencing non-existent issues:
// Fixed in #395 (issue doesn't exist)
// See PR #667 for context (PR doesn't exist)
// As discussed in ARCHITECTURE.md (file doesn't exist)
// Per the design doc in docs/auth-flow.md (file doesn't exist)
```

#### Detection Approach

- Validate issue/PR numbers against GitHub API
- Check file path references in comments actually exist

---

### Category 3: Placeholder Code

**Code that exists structurally but lacks implementation.**

#### Common Patterns

```typescript
// Pattern 1: Empty function body
function importantFunction(): void {
  // TODO
}

// Pattern 2: Throw that will never be implemented
function criticalFeature(): Result {
  throw new Error('TODO: implement this');
}

// Pattern 3: Stub returns
function calculateTotal(items: Item[]): number {
  return 0; // Always returns 0
}

// Pattern 4: Placeholder logic
function validateInput(data: unknown): boolean {
  return true; // Always returns true
}

// Pattern 5: Comment-only functions
function processData(data: UserData): ProcessedData {
  // This function processes the data
  // It handles all edge cases
  // And returns the processed result
  return data as ProcessedData;
}
```

```rust
// Rust equivalents:
fn important_function() {
    todo!() // or unimplemented!()
}

fn calculate_total(_items: &[Item]) -> u32 {
    0 // Always returns 0
}

fn validate_input(_data: &str) -> bool {
    true // Always returns true
}
```

#### Why This Is Worse Than Missing Code

- **False confidence**: Tests might pass because stubs return "safe" values
- **Hidden bugs**: Code appears complete but isn't
- **Maintenance burden**: Future developers assume it works
- **Documentation lies**: Docstrings describe non-existent behavior

---

### Category 4: Buzzword Inflation

**Claims in documentation that aren't supported by the code.**

#### The Buzzword-Evidence Matrix

| Buzzword | Required Evidence | Common AI Failure |
|----------|-------------------|-------------------|
| "Production-ready" | Tests, error handling, logging | No tests exist |
| "Enterprise-grade" | Auth, audit logs, scalability | Single-user only |
| "Secure" | Input validation, encryption, auth | No security code |
| "Scalable" | Async, caching, load handling | Synchronous, no caching |
| "Battle-tested" | Usage metrics, issue history | Brand new code |
| "Comprehensive" | Edge case handling | Happy path only |

#### Detection Approach (from AI-SLOP-Detector)

The tool uses a "Trust, but Verify" approach:
1. Scan documentation for quality claims
2. Search codebase for evidence
3. Flag claims without supporting code

```
Claim: "Production-ready authentication system"
Evidence search:
  ✗ No test files matching *auth*.test.*
  ✗ No error handling in auth modules
  ✗ No logging statements
  ✗ No rate limiting
Result: BUZZWORD INFLATION DETECTED
```

---

### Category 5: Documentation Bloat

**Documentation that obscures rather than clarifies.**

#### Patterns

1. **Disproportionate Documentation**
   ```typescript
   /**
    * Add two numbers together.
    *
    * This function takes two numeric arguments and returns their sum.
    * It uses the built-in addition operator to perform the calculation.
    * The function supports both integers and floating-point numbers.
    *
    * @param a - The first number to add. Can be integer or float.
    * @param b - The second number to add. Can be integer or float.
    * @returns The sum of a and b. Type matches input types.
    * @throws {TypeError} If inputs are not numeric.
    * @example
    * ```ts
    * add(2, 3) // => 5
    * add(1.5, 2.5) // => 4.0
    * ```
    */
   function add(a: number, b: number): number {
     return a + b;
   }
   ```

   **19 lines of JSDoc for 1 line of code.**

2. **Security Theater Documentation**
   - 195-line SECURITY_TESTS_README for a coverage tool
   - "Penetration testing guide" for a file parser
   - "Responsible disclosure policy" for a CLI utility

3. **Meaningless Changelogs**
   ```markdown
   ## v2.1.0
   - Epic 2 architectural discipline enforcement
   - Quantum-ready infrastructure improvements
   - Enhanced synergy between modules
   ```

#### LDR (Logic Density Ratio)

From AI-SLOP-Detector:
```
LDR = (Lines of Logic) / (Lines of Documentation + Comments)

LDR < 0.3 = Documentation bloat detected
LDR > 3.0 = Under-documented (separate concern)
```

---

### Category 6: Infrastructure Without Implementation

**Setting up systems that are never used.**

#### Examples

```typescript
// Database configured but never queried
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// ... no actual database operations anywhere

// Logger configured but never used
import pino from 'pino';
const logger = pino({ level: 'debug' });
// ... logger.info() never called

// Auth middleware installed but bypassed
app.use(async (req, res, next) => {
  // TODO: implement authentication
  next();
});
```

```rust
// Rust equivalent:
use sqlx::PgPool;

async fn setup() -> PgPool {
    PgPool::connect("postgres://...").await.unwrap()
}
// ... pool never used for queries

// Tracing configured but never used
use tracing_subscriber;
tracing_subscriber::init();
// ... tracing::info!() never called
```

#### The "Neo4j Pattern" (from vibe-check-mcp)

> "Neo4j setup without core functionality execution" - systems configured, dependencies installed, configuration files created, but the actual *use* of the system never implemented.

---

### Category 7: Defensive Coding for Impossible Scenarios

**Handling errors that cannot occur.**

#### Examples from FortCov

| "Security" Feature | Context | Reality |
|-------------------|---------|---------|
| Fork bomb prevention | Coverage tool | Cannot fork bomb |
| Memory leak detector | Never called | Unused code |
| Unicode attack prevention | Parsing .gcov | ASCII-only format |
| Disk space suggestions | Error message: "rm -f /tmp/*" | Dangerous, unnecessary |

#### The Pattern

```typescript
function readConfigFile(path: string): Config {
  // Unnecessary: path already validated 3 levels up
  if (!path) {
    throw new Error('Path cannot be null');
  }

  // Unnecessary: fs.existsSync already called by caller
  if (!fs.existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  // Unnecessary: this is a config reader, not a web server
  if (path.includes('..')) {
    throw new Error('Path traversal detected!');
  }

  // Unnecessary: we control the input
  if (path.length > 10000) {
    throw new Error('Path too long - possible attack');
  }

  // Finally, the actual logic (1 line)
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}
```

```rust
// Rust equivalent:
fn read_config_file(path: &Path) -> Result<Config, Error> {
    // Unnecessary: path already validated by caller
    if path.as_os_str().is_empty() {
        return Err(Error::new("Path cannot be empty"));
    }

    // Unnecessary: already checked
    if !path.exists() {
        return Err(Error::new("File not found"));
    }

    // Unnecessary: this is internal tooling
    if path.to_string_lossy().contains("..") {
        return Err(Error::new("Path traversal detected!"));
    }

    // Finally, the actual logic
    let content = std::fs::read_to_string(path)?;
    serde_json::from_str(&content).map_err(Into::into)
}
```

---

### Category 8: Unnecessary Abstraction

**Design patterns used without purpose.**

#### Anti-Patterns

1. **Single-Implementation Interface**
   ```typescript
   interface DataProcessor {
     process(data: Data): void;
   }
   class DataProcessorImpl implements DataProcessor { ... }
   // Only one implementation exists or will ever exist
   ```

2. **Factory for One Product**
   ```typescript
   class ConnectionFactory {
     createConnection(): DatabaseConnection {
       return new DatabaseConnection();
     }
   }
   // Only creates one type, no configuration, no variation
   ```

3. **Strategy Pattern with One Strategy**
   ```typescript
   interface SortStrategy<T> {
     sort(items: T[]): T[];
   }

   class QuickSortStrategy<T> implements SortStrategy<T> {
     sort(items: T[]): T[] {
       return [...items].sort();
     }
   }
   // Only one strategy, never extended, just call .sort()
   ```

4. **Builder for Simple Objects**
   ```typescript
   const user = new UserBuilder()
     .setName('John')
     .setEmail('john@example.com')
     .build();

   // vs simply:
   const user: User = { name: 'John', email: 'john@example.com' };
   ```

```rust
// Rust equivalents:

// Trait with single implementation
trait DataProcessor {
    fn process(&self, data: &Data);
}
struct DataProcessorImpl;
impl DataProcessor for DataProcessorImpl { ... }
// Only one impl exists

// Builder for simple struct
let user = UserBuilder::new()
    .name("John")
    .email("john@example.com")
    .build();

// vs simply:
let user = User { name: "John".into(), email: "john@example.com".into() };
```

---

### Category 9: Text Slop in Comments and Documentation

**Bombastic, over-verbose language that inflates simple concepts.**

The core issue is not about using simple vs complex language - developers use technical terminology appropriately. The problem is AI's tendency toward **bombastic** phrasing and **over-verbose** explanations that add length without substance.

#### Key Patterns

| Category | Examples | Why It's Slop |
|----------|----------|---------------|
| **Preambles** | "Certainly!", "I'd be happy to help!", "Great question!" | Adds nothing, filler before actual content |
| **Bombastic verbs** | "leverage", "utilize", "facilitate", "orchestrate" | Inflated alternatives to "use", "run", "help" |
| **Hedging filler** | "It's worth noting that", "Generally speaking" | Verbose throat-clearing |
| **Empty transitions** | "Now, let's move on to", "With that said" | Unnecessary padding between points |
| **Buzzword phrases** | "delve into", "deep dive", "paradigm shift", "synergy" | Sounds impressive, means little |
| **Over-explanation** | Explaining obvious code in 5 sentences | Treats reader as incapable |

#### The Real Problem: Verbosity Ratio

AI slop isn't about vocabulary choices alone. It's about **saying more than necessary**:

```typescript
// AI slop (bombastic, over-verbose):
// This function is designed to facilitate the processing of user data
// by leveraging advanced algorithms to ensure optimal performance.
// It's worth noting that this implementation follows best practices
// and has been carefully crafted to handle edge cases gracefully.
function processUserData(data: UserData): ProcessedData { ... }

// Direct (not slop):
// Process user data. Returns cleaned object.
function processUserData(data: UserData): ProcessedData { ... }
```

```rust
/// AI slop (bombastic, over-verbose):
/// This function is designed to facilitate the processing of user data
/// by leveraging advanced algorithms to ensure optimal performance.
/// It's worth noting that this implementation follows best practices.
pub fn process_user_data(data: &UserData) -> ProcessedData { ... }

/// Direct (not slop):
/// Process user data. Returns cleaned struct.
pub fn process_user_data(data: &UserData) -> ProcessedData { ... }
```

The difference: 4 lines of puffery vs 1 line of information. Both could use technical terms, but one inflates while the other communicates.

#### What Is NOT Slop

- Using technical terminology ("implements", "orchestrates" when accurate)
- Detailed explanations where complexity warrants it
- Specific, substantive comments that add context

The test: **Does removing this text lose information?** If no, it's slop.

---

### Category 10: Code Style Tells

**Patterns that reveal AI generation.**

#### Naming Patterns

```typescript
// Generic AI names (bad):
const data = getData();
const result = process(data);
const item = fetchItem();
const temp = calculateTemp();
const value = getValue();
const output = generateOutput();

// Specific human names (good):
const userProfile = fetchUserProfile(userId);
const monthlyRevenue = calculateRevenue(transactions);
const validatedEmail = normalizeEmail(rawInput);
```

```rust
// Rust equivalent:
// Generic AI names (bad):
let data = get_data();
let result = process(&data);
let item = fetch_item();

// Specific human names (good):
let user_profile = fetch_user_profile(user_id);
let monthly_revenue = calculate_revenue(&transactions);
let validated_email = normalize_email(&raw_input);
```

#### Structural Tells

1. **Inconsistent paradigms**: Mixing OOP and functional randomly
2. **Over-consistent formatting**: Perfectly uniform where humans vary
3. **Verbose method names**: `getUserDataFromDatabaseById` vs `getUser`
4. **Unnecessary type annotations on obvious types**:
   ```typescript
   function add(a: number, b: number): number {
     const result: number = a + b;
     return result;
   }
   ```
   ```rust
   fn add(a: i32, b: i32) -> i32 {
       let result: i32 = a + b;
       result
   }
   // Type inference handles this: let result = a + b;
   ```

---

## Professional Tools & Approaches

### Tool 1: sloppylint

**Purpose**: Detect AI-generated code anti-patterns (Python-focused, concepts transferable)

**Key Detection Areas**:
1. **Noise** - Debug artifacts, redundant comments
2. **Lies** - Hallucinations, placeholder functions
3. **Soul** - Over-engineering, poor structure
4. **Structure** - Language anti-patterns

**Transferable Concepts for TS/Rust** (beyond what linters catch):
- Placeholder functions that compile but do nothing useful
- Over-engineering detection
- Comment/doc quality analysis

### Tool 2: AI-SLOP-Detector

**Purpose**: Production-grade static analyzer for 6 categories

**Detection Categories**:
1. Placeholder code (14 patterns)
2. Buzzword inflation (quality claims vs evidence)
3. Documentation inflation (doc/code ratio)
4. Hallucinated dependencies (unused imports by category)
5. Context-based jargon (15+ evidence types)
6. CI/CD integration (enforcement modes)

**Metrics**:
- LDR (Logic Density Ratio) - 40% weight
- Inflation Detection - 35% weight
- Dependency Checks - 25% weight

### Tool 3: vibe-check-mcp

**Purpose**: Safety net for "vibe coding" sessions

**Key Patterns**:
- Integration over-engineering
- Infrastructure without implementation
- Overconfident inaccuracy
- Understanding erosion

**Intervention Points**:
- Pre-implementation checks
- Mid-development monitoring
- Pre-commit validation
- Post-session education

### Tool 4: anti-slop (Design)

**Purpose**: Detect generic AI-generated design patterns

**Detects 20+ patterns including**:
- Purple/indigo gradient overuse
- Default fonts (Inter, Space Grotesk)
- Decorative 3D elements
- Glassmorphism with excessive blur
- Generic hero layouts
- Clichéd marketing copy

**Scoring**: A-F grades based on pattern density

---

## Gap Analysis: Current vs Needed

### Current /deslop-around Detection

| Pattern | Status | Impact |
|---------|--------|--------|
| console.log/debug | ✅ Detected | Low |
| TODO/FIXME | ✅ Detected | Low |
| Empty catch blocks | ✅ Detected | Low |
| Commented code | ✅ Detected | Low |
| Disabled linters | ✅ Detected | Low |
| Placeholder text | ✅ Detected | Low |

### High-Impact Detection Status (What Linters Miss)

| Pattern | Status | Impact | Difficulty | Notes |
|---------|--------|--------|------------|-------|
| Placeholder functions (compilable stubs) | ✅ **Implemented** | **High** | Easy | v2.6.1 - Comprehensive for TS/JS/Rust/Python/Go/Java |
| Doc/code ratio | ✅ **Committed** | **Medium** | Easy | main branch - `doc_code_ratio_js` pattern with multi-pass analysis |
| Phantom references in comments | ✅ **Committed** | **Medium** | Easy | main branch - `issue_pr_references`, `file_path_references` patterns |
| Over-engineering metrics | ✅ **Committed** | **Critical** | Medium | main branch - `over_engineering_metrics` pattern |
| Generic naming | ✅ **Merged** | **Medium** | Medium | main branch - 4 patterns for JS/TS/Python/Rust/Go |
| Verbosity detection | ✅ **Committed** | **Medium** | Medium | main branch - 4 patterns (preambles, buzzwords, hedging, ratio) |
| Buzzword inflation | ⏳ **TODO** | **High** | Hard | Priority 3 - Claim extraction vs evidence search |
| Unnecessary abstraction | ⏳ **Future** | **Medium** | Hard | Post-release consideration |

> **Note**: Hallucinated imports, fake API calls, type errors are already caught by eslint/tsc/clippy.
>
> **Release Target**: Complete all ⏳ TODO items before v2.7.0 release.

---

## Implementation Status

**Current Version**: 2.6.1 (npm)
**Development**: main branch (not released)
**Target Release**: v2.7.0 (after completing all priorities below)

| Priority | Tasks | Status | Release |
|----------|-------|--------|---------|
| Priority 1 (Quick Wins) | 3 tasks | ✅ 100% Complete | Pending |
| Priority 2 (Medium Effort) | 2 tasks | ✅ 100% Complete | Pending |
| Priority 3 (Advanced) | 2 tasks | ⏳ 50% Complete | Pending |
| **Total** | **7 tasks** | **6/7 (86%)** | **After 100%** |

**Commits on main (not released):**
- `5950ccb` - feat(deslop): add generic naming detection for JS/TS, Python, Rust, Go (#110)
- `0e68b21` - feat(deslop): add doc/code ratio and phantom reference detection
- `50ce0d2` - docs: update /deslop-around pattern documentation

---

## Recommendations

> **Release Strategy**: Complete all priority tasks below + major cleaning work before releasing v2.7.0. Target is to ship a comprehensive deslop enhancement as a complete feature set, not piecemeal releases.

### Priority 1: Quick Wins (Easy, High Impact) - ✅ COMPLETED

~~1. **Placeholder Function Detection**~~ ✅ **DONE** (Already implemented in v2.6.1)
   - Empty function bodies or `// TODO` only
   - `throw new Error('not implemented')` / `todo!()` / `unimplemented!()`
   - Functions returning hardcoded values (0, true, null, [])
   - **Status**: Comprehensive detection for TS/JS/Rust/Python/Go/Java with 838+ tests

~~2. **Doc/Code Ratio**~~ ✅ **DONE** (Committed, not released)
   - Flag JSDoc/doc comments > function length (3x threshold)
   - Multi-pass analysis with brace matching
   - **Pattern**: `doc_code_ratio_js` in `lib/patterns/slop-patterns.js`
   - **Analyzer**: `analyzeDocCodeRatio()` in `lib/patterns/slop-analyzers.js`
   - **Status**: 35+ tests, A+ coverage

~~3. **Phantom Reference Validation**~~ ✅ **DONE** (Committed, not released)
   - Simplified: ANY issue/PR/iteration mention is flagged as slop
   - File path references in comments flagged as potentially outdated
   - **Patterns**: `issue_pr_references` (autoFix: remove), `file_path_references` (autoFix: flag)
   - **Status**: Comprehensive regex tests with ReDoS protection

### Priority 2: Medium Effort (Medium, High Impact) - ✅ COMPLETE

~~4. **Generic Naming Detection**~~ ✅ **DONE** (Merged to main, v2.7.0)
   - Patterns: `generic_naming_js`, `generic_naming_py`, `generic_naming_rust`, `generic_naming_go`
   - Flags: data, result, item, temp, value, output, response, obj, ret, res, val, arr, str, num, buf, ctx, cfg, opts, args, params
   - Python pattern excludes for-in loop variables to reduce false positives
   - Go pattern fixed to remove invalid `var` with `:=` syntax
   - **Status**: 38 tests, 95%+ coverage, ReDoS protection, PR #110 merged

~~5. **Verbosity Detection**~~ ✅ **DONE** (Committed, not released)
   - `verbosity_preambles` - AI preamble phrases in comments (Certainly!, I'd be happy to help!)
   - `verbosity_buzzwords` - Marketing buzzwords (synergize, paradigm shift, game-changing)
   - `verbosity_hedging` - Hedging language (perhaps, might be, should work)
   - `verbosity_ratio` - Inline comment-to-code ratio (multi-pass analyzer, >2:1 threshold)
   - **Patterns**: 4 new patterns in `lib/patterns/slop-patterns.js`
   - **Analyzer**: `analyzeVerbosityRatio()` in `lib/patterns/slop-analyzers.js`
   - **Status**: 70+ tests, comprehensive coverage

### Priority 3: Advanced (Hard, Critical Impact) - ⏳ 50% COMPLETE

~~6. **Over-Engineering Metrics**~~ ✅ **DONE** (Committed, not released)
   - Export-based detection: files-per-export (>20x), lines-per-export (>500:1), directory depth (>4 levels)
   - Multi-language: JavaScript/TypeScript, Rust, Go, Python
   - Entry point scanning: index.js, lib.rs, __init__.py, main.go
   - **Pattern**: `over_engineering_metrics` in `lib/patterns/slop-patterns.js`
   - **Analyzer**: `analyzeOverEngineering()` in `lib/patterns/slop-analyzers.js`
   - **Status**: 40+ tests, comprehensive coverage

7. **Buzzword Inflation** ⏳ TODO
   - Claim extraction from docs
   - Evidence search in code
   - Gap reporting
   - **Difficulty**: Hard (semantic analysis, evidence gathering)
   - **Impact**: Critical (validates documentation claims)

---

## Detection Pipeline Architecture

### Flow Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    SLOP DETECTION PIPELINE                       │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 1: Built-in Detection (zero-dep, pure JS)                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐     │
│  │ Metrics    │ │ Patterns   │ │ Text Slop  │ │ Structure  │     │
│  │ (LDR, LOC) │ │ (46 rules) │ │ (phrases)  │ │ (imports)  │     │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘     │
│        └──────────────┴──────────────┴──────────────┘            │
│                              ▼                                    │
│                 ┌─────────────────────────┐                       │
│                 │  Certainty-Tagged Report │                      │
│                 │  • HIGH: definite issues │                      │
│                 │  • MEDIUM: likely issues │                      │
│                 │  • LOW: hot areas/hints  │                      │
│                 └───────────┬─────────────┘                       │
├─────────────────────────────┼────────────────────────────────────┤
│  PHASE 2: Optional CLI Enhancement                               │
│                             ▼                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                    │
│  │ jscpd      │ │ madge      │ │ escomplex  │  ← If installed    │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘                    │
│        └──────────────┴──────────────┘                           │
│                       ▼                                           │
│         ┌─────────────────────────┐                               │
│         │  Enhanced Metrics       │                               │
│         │  (complexity, deps)     │                               │
│         └───────────┬─────────────┘                               │
├─────────────────────┼────────────────────────────────────────────┤
│  PHASE 3: LLM Analysis (Required)                                │
│                     ▼                                             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Agent receives:                                          │    │
│  │  • Certainty-tagged findings                              │    │
│  │  • Hot areas without certainty                            │    │
│  │  • Thoroughness level (quick/normal/deep)                 │    │
│  │                                                           │    │
│  │  Agent completes:                                         │    │
│  │  • Validates uncertain findings                           │    │
│  │  • Semantic analysis (buzzword claims vs evidence)        │    │
│  │  • Context-aware judgment (is this REALLY slop?)          │    │
│  │  • Scopes to what automated tools can't catch             │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Thoroughness Levels

| Level | Built-in | CLI Tools | LLM Scope |
|-------|----------|-----------|-----------|
| **quick** | All patterns | Skip | HIGH certainty only |
| **normal** | All patterns | If available | HIGH + MEDIUM + sample LOW |
| **deep** | All patterns | If available | All findings + full semantic analysis |

---

## Extracted Detection Patterns (From Research)

### Sloppylint: 46 Patterns Across 4 Axes

**Axis 1: Noise (10 patterns)**
```typescript
const NOISE_PATTERNS = {
  redundantComments: /\/\/\s*(increment|decrement|set|get|return)\s+(the\s+)?\w+/i,
  emptyDocstrings: /\/\*\*\s*\*\//,
  genericDescriptions: /\/\/\s*(this|the)\s+(function|method|class)\s+(does|is|handles)/i,
  debugStatements: /console\.(log|debug|info|warn|trace)\s*\(/,
  breakpoints: /debugger\s*;/,
  commentedCodeBlocks: /\/\/\s*(const|let|var|function|if|for|while|return)\s+/,
  excessiveLogging: null, // Requires counting - flag if >5 log statements per function
  unnecessaryPass: /\{\s*\}/, // Empty blocks
  obviousTypeAnnotations: /:\s*(string|number|boolean)\s*=\s*(['"`]|[0-9]|true|false)/,
  changelogInSource: /\*\s*(v?\d+\.\d+|changelog|version\s+history)/i,
};
```

**Axis 2: Quality/Hallucinations (14 patterns)**
```typescript
const QUALITY_PATTERNS = {
  // Placeholder patterns
  todoFixme: /\/\/\s*(TODO|FIXME|HACK|XXX|BUG):/i,
  notImplemented: /throw\s+new\s+Error\s*\(\s*['"`].*not\s+impl/i,
  ellipsisPlaceholder: /\.\.\./,  // In function bodies
  returnNonePlaceholder: /return\s+(null|undefined|None)\s*;?\s*\/\//, // with comment

  // Stub returns (HIGH certainty)
  stubReturns: /return\s+(0|true|false|\[\]|\{\}|''|"")\s*;?\s*$/,

  // Magic values
  magicNumbers: /[^a-zA-Z_]([2-9]\d{2,}|[1-9]\d{3,})[^a-zA-Z_0-9]/, // Numbers > 100
  magicStrings: /['"`][a-zA-Z0-9_\-]{20,}['"`]/, // Long unexplained strings

  // Assumption comments
  assumptionComments: /\/\/\s*(assuming|assume|should\s+be|probably|i\s+think)/i,

  // Mutable defaults (JS)
  mutableDefaults: /=\s*\[\]|\{\}\s*\)/, // Default params with [] or {}

  // Impossible conditions
  impossibleConditions: /if\s*\(\s*(true|false|1|0)\s*\)/,
};
```

**Axis 3: Style (10 patterns)**
```typescript
const STYLE_PATTERNS = {
  // Overconfident language
  overconfident: /\/\/\s*(obviously|clearly|simply|trivially|of\s+course)/i,

  // Hedging phrases
  hedging: /\/\/\s*(might|maybe|perhaps|possibly|could\s+be|should\s+work)/i,

  // Apologetic tone
  apologetic: /\/\/\s*(sorry|apolog|unfortunately|i\s+tried)/i,

  // Bombastic verbs
  bombastic: /\b(leverage|utilize|facilitate|orchestrate|synergize|streamline)\b/i,

  // AI preambles (in comments)
  aiPreambles: /\/\/\s*(certainly|i'd\s+be\s+happy|great\s+question|absolutely)/i,

  // Function size (requires AST or line counting)
  oversizedFunction: null, // Flag if >50 lines

  // Excessive nesting
  excessiveNesting: /^\s{16,}/, // >4 levels of indentation

  // Nested ternary
  nestedTernary: /\?[^:]+\?/,

  // Single letter variables (not i,j,k,x,y,z)
  singleLetterVars: /\b(const|let|var)\s+([a-hln-wA-HLN-W])\s*=/,
};
```

**Axis 4: Structural (12 patterns)**
```typescript
const STRUCTURAL_PATTERNS = {
  // Empty exception blocks
  emptyExcept: /catch\s*\([^)]*\)\s*\{\s*\}/,

  // Bare exception (catches everything)
  bareExcept: /catch\s*\(\s*(e|err|error|ex)?\s*\)\s*\{/,

  // Wildcard imports
  wildcardImports: /import\s+\*\s+from/,

  // Unused imports (requires tracking)
  unusedImports: null, // Track imports vs usage

  // Single-method classes
  singleMethodClass: null, // Requires AST

  // Unreachable code
  unreachableCode: /return\s+[^;]+;\s*\n\s*[^}\s]/,

  // Duplicate code blocks
  duplicateCode: null, // Use hash-based detection
};
```

### AI-SLOP-Detector: 6 Detection Mechanisms

**1. Logic Density Ratio (LDR)**
```typescript
function calculateLDR(codeLines: number, docLines: number): LDRResult {
  const ratio = docLines > 0 ? codeLines / docLines : Infinity;
  return {
    ratio,
    severity: ratio < 0.3 ? 'critical' : ratio < 0.5 ? 'warning' : 'ok',
    message: ratio < 0.3 ? 'Documentation bloat: more docs than code' : null,
  };
}
```

**2. Maintainability Index (from escomplex)**
```typescript
// MI = 171 - (3.42 × ln(effort)) - (0.23 × ln(cyclomatic)) - (16.2 × ln(loc))
function calculateMaintainabilityIndex(
  halsteadEffort: number,
  cyclomaticComplexity: number,
  logicalLoc: number
): number {
  let mi = 171
    - (3.42 * Math.log(halsteadEffort))
    - (0.23 * Math.log(cyclomaticComplexity))
    - (16.2 * Math.log(logicalLoc));

  // Clamp to 0-100 scale
  mi = Math.max(0, Math.min(171, mi));
  return (mi * 100) / 171;
}
```

**3. Cyclomatic Complexity (increment count for each)**
```typescript
const COMPLEXITY_INCREMENTORS = {
  ts: [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /\?\s*[^:]+\s*:/g,  // Ternary
    /&&/g,
    /\|\|/g,
    /\?\?/g,  // Nullish coalescing
  ],
  rust: [
    /\bif\s+/g,
    /\belse\s+if\s+/g,
    /\bfor\s+/g,
    /\bwhile\s+/g,
    /\bmatch\s+/g,
    /=>\s*\{/g,  // Match arms
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
  ],
};

function countCyclomaticComplexity(content: string, lang: 'ts' | 'rust'): number {
  let complexity = 1; // Base complexity
  for (const pattern of COMPLEXITY_INCREMENTORS[lang]) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}
```

**4. Buzzword Inflation Detection**
```typescript
const BUZZWORDS = [
  'production-ready', 'enterprise-grade', 'battle-tested',
  'scalable', 'robust', 'comprehensive', 'secure',
  'high-performance', 'best-in-class', 'industry-standard',
];

const EVIDENCE_CHECKS = {
  'production-ready': [/\.test\.|\.spec\.|__tests__/, /try\s*\{/, /logger\./],
  'secure': [/validate|sanitize|escape/, /auth|permission/, /encrypt|hash/],
  'scalable': [/async|await|Promise/, /cache|redis|memcache/, /queue|worker/],
  'comprehensive': [/edge\s*case|boundary|error\s*handling/],
};

function detectBuzzwordInflation(docs: string, code: string): BuzzwordFinding[] {
  const findings: BuzzwordFinding[] = [];

  for (const word of BUZZWORDS) {
    if (docs.toLowerCase().includes(word)) {
      const checks = EVIDENCE_CHECKS[word] || [];
      const evidenceFound = checks.some(pattern => pattern.test(code));

      if (!evidenceFound) {
        findings.push({
          buzzword: word,
          certainty: 'MEDIUM', // Agent should verify
          message: `Claim "${word}" without supporting evidence`,
        });
      }
    }
  }
  return findings;
}
```

### Vibe-Check: Over-Engineering Detection

**Infrastructure-Without-Implementation**
```typescript
const INFRASTRUCTURE_PATTERNS = [
  // Database setup without queries
  { setup: /new\s+(PrismaClient|Pool|Connection)/, usage: /\.(query|find|create|update)/ },
  // Logger setup without usage
  { setup: /(pino|winston|bunyan)\s*\(/, usage: /\.(info|warn|error|debug)\s*\(/ },
  // Auth setup without protection
  { setup: /passport\.|auth0|jwt\.sign/, usage: /isAuthenticated|requireAuth|protect/ },
];

function detectInfraWithoutImpl(content: string): InfraFinding[] {
  const findings: InfraFinding[] = [];

  for (const pattern of INFRASTRUCTURE_PATTERNS) {
    if (pattern.setup.test(content) && !pattern.usage.test(content)) {
      findings.push({
        type: 'infrastructure-without-implementation',
        certainty: 'LOW', // Agent should investigate
        message: 'Infrastructure configured but appears unused',
      });
    }
  }
  return findings;
}
```

---

## Language Support Matrix

Primary support (lean toward): **TypeScript** and **Rust**
Secondary support: JavaScript, Python, Go, Java

| Detection | TS/JS | Rust | Python | Go |
|-----------|-------|------|--------|-----|
| Line counting | ✅ | ✅ | ✅ | ✅ |
| Comment patterns | ✅ | ✅ | ✅ | ✅ |
| Placeholder detection | ✅ | ✅ | ✅ | ✅ |
| Import analysis | ✅ | ✅ | ✅ | ✅ |
| Cyclomatic complexity | ✅ | ✅ | ⚠️ | ⚠️ |
| Buzzword inflation | ✅ | ✅ | ✅ | ✅ |

---

## Multi-Language Pattern Definitions

### Comment Syntax by Language

```typescript
const COMMENT_SYNTAX = {
  ts: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  js: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
  rust: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '///' },
  python: { line: '#', blockStart: '"""', blockEnd: '"""', docStart: '"""' },
  go: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '//' },
  java: { line: '//', blockStart: '/*', blockEnd: '*/', docStart: '/**' },
};
```

### Placeholder Patterns by Language

```typescript
const PLACEHOLDER_PATTERNS = {
  ts: [
    /throw\s+new\s+Error\s*\(\s*['"`].*(?:TODO|implement|not\s+impl)/i,
    /(?:function\s+\w+|=>\s*)\s*\{\s*\}/,
    /return\s+(?:0|true|false|null|undefined|\[\]|\{\})\s*;?\s*$/m,
    /\{\s*\/\/\s*TODO[^}]*\}/i,
  ],
  rust: [
    /\btodo!\s*\(/,
    /\bunimplemented!\s*\(/,
    /\bpanic!\s*\(\s*["'].*(?:TODO|implement)/i,
    /fn\s+\w+[^{]*\{\s*\}/,  // Empty fn body
    /=>\s*\{\s*\}/,          // Empty match arm
  ],
  python: [
    /raise\s+NotImplementedError/,
    /pass\s*$/,
    /\.\.\.\s*$/,  // Ellipsis
    /return\s+None\s*$/,
    /#\s*TODO/i,
  ],
  go: [
    /panic\s*\(\s*["'].*(?:TODO|implement)/i,
    /return\s+nil\s*$/,
    /\/\/\s*TODO/i,
    /func\s+\w+[^{]*\{\s*\}/,  // Empty func
  ],
};
```

### Debug Statement Patterns

```typescript
const DEBUG_PATTERNS = {
  ts: [/console\.(log|debug|info|warn|trace)\s*\(/, /debugger\s*;/],
  rust: [/dbg!\s*\(/, /println!\s*\(\s*["']debug/i, /#\[cfg\(debug_assertions\)\]/],
  python: [/print\s*\(/, /pdb\.set_trace\(\)/, /breakpoint\(\)/],
  go: [/fmt\.Print/, /log\.Print/, /debug\./],
};
```

---

## Core Detection Functions (Zero-Dep)

### Approach 3: Simple Duplicate Detection (Zero-Dep)

Simplified Rabin-Karp - hash normalized line sequences:

```typescript
// Zero dependencies - simple duplicate detection
function normalizeCode(line: string): string {
  return line
    .replace(/['"`][^'"`]*['"`]/g, 'STR')  // Normalize strings
    .replace(/\b\d+\b/g, 'NUM')             // Normalize numbers
    .replace(/\s+/g, ' ')                   // Normalize whitespace
    .trim();
}

function findDuplicates(files: Map<string, string>, minLines = 5): Duplicate[] {
  const hashMap = new Map<string, { file: string; start: number }[]>();
  const duplicates: Duplicate[] = [];

  for (const [filePath, content] of files) {
    const lines = content.split('\n').map(normalizeCode);

    // Create sliding window hashes
    for (let i = 0; i <= lines.length - minLines; i++) {
      const block = lines.slice(i, i + minLines).join('\n');
      const hash = simpleHash(block);

      if (!hashMap.has(hash)) {
        hashMap.set(hash, []);
      }
      hashMap.get(hash)!.push({ file: filePath, start: i + 1 });
    }
  }

  // Find duplicates (same hash, different locations)
  for (const [hash, locations] of hashMap) {
    if (locations.length > 1) {
      duplicates.push({ hash, locations });
    }
  }
  return duplicates;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}
```

**For heavy-duty duplicate detection**: Shell out to `jscpd` (user installs separately).

### Approach 4: Simple Import Analysis (Zero-Dep)

Extract imports with regex, build basic dependency map:

```typescript
// Zero dependencies - import extraction
const IMPORT_PATTERNS = {
  ts: /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
  rust: /use\s+((?:crate|super|self)?(?:::\w+)+)/g,
};

function extractImports(content: string, lang: 'ts' | 'rust'): string[] {
  const imports: string[] = [];
  const pattern = IMPORT_PATTERNS[lang];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function analyzeImportDepth(files: Map<string, string[]>): DepthAnalysis {
  // Count how deep import chains go
  const depths = new Map<string, number>();

  for (const [file, imports] of files) {
    const localImports = imports.filter(i => i.startsWith('.') || i.startsWith('@/'));
    depths.set(file, localImports.length);
  }

  const avgDepth = [...depths.values()].reduce((a, b) => a + b, 0) / depths.size;
  const maxDepth = Math.max(...depths.values());

  return { avgDepth, maxDepth, fileCount: files.size };
}
```

| Metric | Threshold | Indicates |
|--------|-----------|-----------|
| Avg imports/file | > 15 | High coupling |
| Max imports in single file | > 30 | God module |
| Files with 0 importers | Many | Orphaned code |

**For full dependency graphs**: Shell out to `madge` (user installs separately).

### Generic Naming Detection (Regex-based)

```typescript
const GENERIC_NAMES = /\b(const|let|var)\s+(data|result|item|temp|value|output|response|obj|ret|res)\s*[=:]/gi;

function detectGenericNames(content: string, filePath: string): GenericNameWarning[] {
  const warnings: GenericNameWarning[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].matchAll(GENERIC_NAMES);
    for (const match of matches) {
      warnings.push({
        file: filePath,
        line: i + 1,
        name: match[2],
        certainty: 'LOW', // Agent should check context
      });
    }
  }
  return warnings;
}
```

---

## Sources

### Primary Sources

1. **GitHub Issue: FortCov #1288**
   - "META: Address AI slop throughout codebase"
   - URL: https://github.com/lazy-fortran/fortcov/issues/1288
   - Key contribution: Concrete metrics and real-world examples

2. **sloppylint**
   - "AI Slop Detector" (Python-focused, concepts apply to any language)
   - URL: https://github.com/rsionnach/sloppylint
   - Key contribution: 4-category detection framework (Noise, Lies, Soul, Structure)

3. **AI-SLOP-Detector**
   - "Stop shipping AI slop"
   - URL: https://github.com/flamehaven01/AI-SLOP-Detector
   - Key contribution: 6-category detection framework, LDR metric

4. **vibe-check-mcp**
   - "Vibe Coding Safety Net"
   - URL: https://github.com/kesslerio/vibe-check-mcp
   - Key contribution: Over-engineering detection patterns

5. **anti-slop-library**
   - "AI Design Pattern Detection"
   - URL: https://github.com/rohunvora/anti-slop-library
   - Key contribution: Design slop patterns (transferable concepts)

6. **cc-polymath anti-slop skill**
   - URL: https://github.com/rand/cc-polymath
   - Key contribution: Text slop phrase list

7. **ai-eng-system clean command**
   - URL: https://github.com/v1truv1us/ai-eng-system
   - Key contribution: Preamble/hedging language patterns

### Automation Tools (Static Analysis)

8. **escomplex**
   - URL: https://github.com/jared-stilwell/escomplex
   - Key contribution: Cyclomatic complexity, Halstead metrics, maintainability index for JS/TS

9. **jscpd**
   - URL: https://github.com/kucherenko/jscpd
   - Key contribution: Rabin-Karp algorithm for duplicate/copy-paste detection (150+ languages)

10. **madge**
    - URL: https://github.com/pahen/madge
    - Key contribution: Dependency graph analysis, circular dependency detection

11. **dependency-cruiser**
    - URL: https://github.com/sverweij/dependency-cruiser
    - Key contribution: Rule-based dependency validation, architectural enforcement

12. **ts-morph**
    - URL: https://github.com/dsherret/ts-morph
    - Key contribution: TypeScript AST manipulation for pattern detection

13. **tree-sitter**
    - URL: https://github.com/tree-sitter/tree-sitter
    - Key contribution: Fast incremental parsing, multi-language AST

14. **cloc / tokei**
    - URLs: https://github.com/AlDanial/cloc, https://github.com/XAMPPRocky/tokei
    - Key contribution: Fast line counting (code vs comments vs blanks)

### Secondary Sources (Blocked/Unavailable)

- Wikipedia: "Slop (artificial intelligence)" - 403 error
- Wired, The Atlantic, The Verge, Ars Technica - blocked
- Reddit discussions - blocked

### Community Evidence

Multiple GitHub issues across repositories using "AI slop" as a recognized term for low-quality AI-generated code, confirming this is established terminology in the developer community.

---

## Conclusion

The term "AI slop" in professional software engineering contexts refers to a much broader set of problems than simple code hygiene issues like debug statements or TODO comments. It encompasses:

1. **Structural problems**: Over-engineering, unnecessary abstraction
2. **Semantic problems**: Hallucinations, placeholder code
3. **Trust problems**: Buzzword inflation, phantom references
4. **Maintenance problems**: Documentation bloat, generic naming

The key insight is that **AI slop creates technical debt faster than it solves problems**. A comprehensive slop detector must move beyond syntax-level checks to identify code that is technically valid but fundamentally lacks substance or purpose.

---

*Document generated as part of awesome-slash plugin research. See `/deslop-around` command for implementation.*
