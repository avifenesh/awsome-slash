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

### Missing High-Impact Detection (What Linters Miss)

| Pattern | Status | Impact | Difficulty |
|---------|--------|--------|------------|
| Over-engineering metrics | ❌ Missing | **Critical** | Medium |
| Placeholder functions (compilable stubs) | ❌ Missing | **High** | Easy |
| Buzzword inflation | ❌ Missing | **High** | Hard |
| Doc/code ratio | ❌ Missing | **Medium** | Easy |
| Unnecessary abstraction | ❌ Missing | **Medium** | Hard |
| Generic naming | ❌ Missing | **Medium** | Medium |
| Phantom references in comments | ❌ Missing | **Medium** | Easy |
| Verbosity detection | ❌ Missing | **Medium** | Medium |

> **Note**: Hallucinated imports, fake API calls, type errors are already caught by eslint/tsc/clippy.

---

## Recommendations

### Priority 1: Quick Wins (Easy, High Impact)

1. **Placeholder Function Detection**
   - Empty function bodies or `// TODO` only
   - `throw new Error('not implemented')` / `todo!()` / `unimplemented!()`
   - Functions returning hardcoded values (0, true, null, [])

2. **Doc/Code Ratio**
   - Flag JSDoc/doc comments > function length
   - Detect boilerplate doc patterns

3. **Phantom Reference Validation**
   - Verify issue/PR numbers exist
   - Check file path references

### Priority 2: Medium Effort (Medium, High Impact)

4. **Generic Naming Detection**
   - Flag excessive use of: data, result, item, temp, value, output
   - Suggest more specific names

5. **Verbosity Detection**
   - Comment-to-code ratio per function
   - Flag comments that restate obvious code
   - Detect bombastic phrasing patterns

### Priority 3: Advanced (Hard, Critical Impact)

6. **Over-Engineering Metrics**
   - Lines per feature ratio
   - File count analysis
   - Abstraction depth measurement

7. **Buzzword Inflation**
   - Claim extraction from docs
   - Evidence search in code
   - Gap reporting

---

## Automation Approaches (No Line-by-Line Agent Review)

The goal is **fast, automated detection** without expensive LLM calls or heavy dependencies.

### Dependency Considerations

Most static analysis tools (escomplex, jscpd, madge) are MIT-licensed but pull heavy dependency trees (AST parsers, lodash, etc.). For a lightweight plugin:

| Approach | Recommendation |
|----------|----------------|
| **Zero-dep implementations** | Regex-based line counting, pattern matching |
| **Shell out to CLI** | User installs tools separately (optional) |
| **TypeScript compiler API** | Already available in TS projects |

**Avoid**: cloc (GPL v2 license), heavy AST libraries as direct deps.

### Approach 1: Zero-Dep Line Counting & Ratios

```typescript
// Zero dependencies - pure regex
function countLines(content: string, lang: 'ts' | 'js' | 'rust'): LineStats {
  const lines = content.split('\n');

  let code = 0, comments = 0, blank = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) { blank++; continue; }

    // Block comments
    if (lang === 'rust') {
      if (trimmed.startsWith('/*')) inBlockComment = true;
      if (inBlockComment) { comments++; if (trimmed.endsWith('*/')) inBlockComment = false; continue; }
      if (trimmed.startsWith('//')) { comments++; continue; }
    } else {
      if (trimmed.startsWith('/*')) inBlockComment = true;
      if (inBlockComment) { comments++; if (trimmed.includes('*/')) inBlockComment = false; continue; }
      if (trimmed.startsWith('//')) { comments++; continue; }
    }

    code++;
  }

  return { code, comments, blank, total: lines.length };
}

// Logic Density Ratio
function calculateLDR(stats: LineStats): number {
  return stats.comments > 0 ? stats.code / stats.comments : Infinity;
}
```

| Metric | Threshold | Detects |
|--------|-----------|---------|
| **LDR** | < 0.3 = bloat, > 10 = under-documented | Documentation inflation |
| **Comment %** | > 50% suspicious | Over-documentation |
| **File count / features** | > 10:1 | Over-engineering |

### Approach 2: Regex-Based Placeholder Detection (Zero-Dep)

Skip full AST parsing - regex catches most placeholder patterns:

```typescript
// Zero dependencies - pattern matching
const PLACEHOLDER_PATTERNS = [
  // Throw not implemented
  /throw\s+new\s+Error\s*\(\s*['"`].*(?:TODO|implement|not\s+impl)/i,
  // todo!/unimplemented! in Rust
  /\btodo!\s*\(|unimplemented!\s*\(/,
  // Empty function bodies (JS/TS)
  /(?:function\s+\w+|=>\s*)\s*\{\s*\}/,
  // Stub returns
  /return\s+(?:0|true|false|null|undefined|\[\]|\{\})\s*;?\s*$/m,
  // Single-line TODO functions
  /\{\s*\/\/\s*TODO[^}]*\}/i,
];

function detectPlaceholders(content: string, filePath: string): PlaceholderMatch[] {
  const matches: PlaceholderMatch[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(lines[i])) {
        matches.push({ file: filePath, line: i + 1, pattern: pattern.source });
      }
    }
  }
  return matches;
}
```

**For complex AST analysis** (optional, user-installed):
- Shell out to `tsc --diagnostics` for TypeScript projects
- Use TypeScript compiler API directly (no extra dep in TS projects)

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

### Approach 5: Regex Pattern Matching (Text Slop)

Fast regex scan for bombastic phrases in comments.

```typescript
const SLOP_PATTERNS = [
  /\bcertainly\b/i,
  /\bI'd be happy to\b/i,
  /\bgreat question\b/i,
  /\bit's worth noting\b/i,
  /\bgenerally speaking\b/i,
  /\bleverage\b/i,
  /\bfacilitate\b/i,
  /\bdelve\b/i,
  /\bparadigm\b/i,
  /\bsynergy\b/i,
];

function scanComments(content: string): SlopMatch[] {
  const commentPattern = /\/\/.*$|\/\*[\s\S]*?\*\//gm;
  const matches: SlopMatch[] = [];

  for (const comment of content.matchAll(commentPattern)) {
    for (const pattern of SLOP_PATTERNS) {
      if (pattern.test(comment[0])) {
        matches.push({ line: getLineNumber(content, comment.index), pattern });
      }
    }
  }
  return matches;
}
```

### Approach 6: Cross-Reference Validation

Validate references in comments against actual data.

```typescript
// Extract issue/PR references from comments
const refPattern = /#(\d+)/g;

// Validate against GitHub API (batch request)
async function validateRefs(refs: number[], repo: string): Promise<InvalidRef[]> {
  const { data: issues } = await octokit.issues.listForRepo({ owner, repo, state: 'all' });
  const validIds = new Set(issues.map(i => i.number));
  return refs.filter(r => !validIds.has(r)).map(r => ({ ref: r, exists: false }));
}
```

### Approach 7: Generic Naming Detection

AST + word frequency analysis.

```typescript
const GENERIC_NAMES = new Set(['data', 'result', 'item', 'temp', 'value', 'output', 'response', 'obj']);

function detectGenericNames(file: SourceFile): GenericNameWarning[] {
  const warnings: GenericNameWarning[] = [];

  for (const decl of file.getVariableDeclarations()) {
    const name = decl.getName();
    if (GENERIC_NAMES.has(name.toLowerCase())) {
      warnings.push({ name, line: decl.getStartLineNumber() });
    }
  }
  return warnings;
}
```

### Recommended Architecture (Zero-Dep Core)

```
┌─────────────────────────────────────────────────────────────┐
│              SLOP DETECTION PIPELINE (Zero-Dep)             │
├─────────────────────────────────────────────────────────────┤
│  BUILT-IN (zero dependencies, pure JS/TS)                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Line Count  │ │ Placeholder │ │ Text Slop   │            │
│  │ (regex)     │ │ Detection   │ │ Patterns    │            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│         │               │               │                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Import      │ │ Duplicate   │ │ Generic     │            │
│  │ Analysis    │ │ Detection   │ │ Naming      │            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│         │               │               │                    │
│         └───────────────┼───────────────┘                    │
│                         ▼                                    │
│              ┌─────────────────────┐                         │
│              │   Slop Report       │                         │
│              │   (file:line:issue) │                         │
│              └──────────┬──────────┘                         │
├─────────────────────────┼───────────────────────────────────┤
│  OPTIONAL: CLI TOOLS (user installs separately)             │
│                         ▼                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ jscpd       │ │ madge       │ │ escomplex   │            │
│  │ (duplicates)│ │ (deps)      │ │ (complexity)│            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│  Shell out if available, skip gracefully if not             │
├─────────────────────────────────────────────────────────────┤
│  OPTIONAL: LLM (only when needed)                           │
│              ┌─────────────────────┐                         │
│              │   Semantic Analysis │   ← Buzzword validation │
│              │   (expensive)       │     Claim vs evidence   │
│              └─────────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Zero-dep core**: Built-in detection runs with no npm dependencies
2. **Optional enhancement**: Shell out to CLI tools if user has them installed
3. **Graceful degradation**: Missing tools = skip that check, don't fail
4. **LLM-last**: Only use tokens for semantic analysis that regex can't handle

**Dependency cost**: Zero required. Optional tools = user's choice.

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
