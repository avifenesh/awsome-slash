# Data Contracts Reference

> Defines the data structures returned by collectors.js and how the agent should interpret them.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    /drift-detect command                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     collectors.js                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ GitHub State │  │   Docs       │  │   Code       │          │
│  │ (gh CLI)     │  │ (fs.read)    │  │ (fs.scan)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ JSON data
┌─────────────────────────────────────────────────────────────────┐
│                  plan-synthesizer agent                         │
│              (loads drift-analysis skill)                       │
│                                                                  │
│  1. Cross-reference docs ↔ code                                 │
│  2. Identify drift patterns                                     │
│  3. Calculate priorities                                        │
│  4. Generate actionable report                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Reality Check Report                          │
└─────────────────────────────────────────────────────────────────┘
```

## 1. GitHub State (`collectedData.github`)

```typescript
interface GitHubState {
  available: boolean;          // gh CLI authenticated?
  error?: string;              // Error message if not available
  
  summary: {
    issueCount: number;
    prCount: number;
    milestoneCount: number;
  };
  
  issues: Array<{
    number: number;
    title: string;
    labels: string[];
    milestone: string | null;
    createdAt: string;
    updatedAt: string;
    snippet: string;           // First 200 chars of body
  }>;
  
  prs: Array<{
    number: number;
    title: string;
    labels: string[];
    isDraft: boolean;
    createdAt: string;
    updatedAt: string;
    files: string[];           // Changed file paths
    snippet: string;
  }>;
  
  milestones: Array<{
    title: string;
    state: 'open' | 'closed';
    due_on: string | null;
    open_issues: number;
    closed_issues: number;
  }>;
  
  categorized: {
    bugs: Array<{number, title, priority?}>;
    features: Array<{number, title, priority?}>;
    security: Array<{number, title, priority?}>;
    enhancements: Array<{number, title, priority?}>;
    other: Array<{number, title, priority?}>;
  };
  
  stale: Array<{
    number: number;
    title: string;
    lastUpdated: string;
    daysStale: number;
  }>;
  
  themes: Array<{
    word: string;
    count: number;
  }>;
  
  overdueMilestones: Array<{title, due_on}>;
}
```

### Agent Actions for GitHub Data

| Data Point | Agent Should |
|------------|--------------|
| `issues` with no labels | Flag as "needs triage" |
| `categorized.security` | Prioritize in report, check for workarounds |
| `stale` items | Recommend closing or updating |
| `overdueMilestones` | Flag as release blockers |
| `themes` | Identify focus areas, compare to code activity |
| `priority` (opt-in) | Use `bucket` for time-boxing recommendations |

---

## 2. Documentation Analysis (`collectedData.docs`)

```typescript
interface DocsAnalysis {
  summary: {
    fileCount: number;
    totalWords: number;
  };
  
  files: {
    [path: string]: {
      path: string;
      sectionCount: number;
      sections: string[];        // H2 headers (max 10)
      hasInstallation: boolean;
      hasUsage: boolean;
      hasApi: boolean;
      hasTesting: boolean;
      codeBlocks: number;
      wordCount: number;
    };
  };
  
  features: string[];            // Extracted feature names (max 20)
  plans: string[];               // TODO/FIXME/roadmap items (max 15)
  
  checkboxes: {
    checked: number;
    unchecked: number;
    total: number;
    items: Array<{
      checked: boolean;
      text: string;              // The checkbox text (max 150 chars)
    }>;
  };
  
  gaps: Array<{
    type: 'missing' | 'missing-section';
    file: string;
    section?: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}
```

### Agent Actions for Docs Data

| Data Point | Agent Should |
|------------|--------------|
| `features` | Cross-reference with `code.symbols` |
| `checkboxes.items` | Validate each against code existence |
| `checkboxes` with checked=true but no code | Flag as "marked done but not implemented" |
| `checkboxes` with checked=false but code exists | Flag as "implemented but not marked done" |
| `gaps` | Include in report recommendations |
| Files with `hasApi: false` | Check if API exists in code but not documented |

---

## 3. Codebase Analysis (`collectedData.code`)

```typescript
interface CodeAnalysis {
  summary: {
    totalDirs: number;
    totalFiles: number;
  };
  
  projectType: {
    primary: 'rust' | 'go' | 'node' | 'java' | 'python' | 'unknown';
    all: string[];              // All detected languages
    isMultiLang: boolean;
  };
  
  topLevelDirs: string[];       // Feature-level directories
  
  frameworks: string[];         // Detected frameworks
  testFramework: string | null;
  hasTypeScript: boolean;
  
  implementedFeatures: string[]; // Detected from directory patterns
  
  symbols: {
    [filePath: string]: {
      functions: string[];
      classes: string[];
      exports: string[];
    };
  };
  
  health: {
    hasTests: boolean;
    hasLinting: boolean;
    hasCi: boolean;
    hasReadme: boolean;
  };
  
  fileStats: {
    [extension: string]: number; // File count by extension
  };
}
```

### Agent Actions for Code Data

| Data Point | Agent Should |
|------------|--------------|
| `projectType.isMultiLang` | Note complexity, check each language has tests |
| `frameworks` | Compare to documented tech stack |
| `symbols` | Use for feature-to-code matching |
| `health.hasTests: false` | Flag as critical gap |
| `health.hasCi: false` | Flag as medium gap |
| `topLevelDirs` | Map to documented features |
| `implementedFeatures` | Compare to docs.features |

---

## Cross-Reference Algorithm

The agent should perform this mental model:

### Step 1: Build Feature Lists

```
Documented Features:
- docs.features (from README lists)
- docs.checkboxes.items (from PLAN.md)
- github.issues (intended work)

Implemented Features:
- code.topLevelDirs (directory-based)
- code.symbols (function/class names)
- code.implementedFeatures (pattern-detected)
```

### Step 2: Match Each Documented Feature

For each documented feature:
1. Normalize the name (lowercase, remove separators)
2. Search in `code.topLevelDirs` for directory match
3. Search in `code.symbols` for function/class match
4. Categorize as:
   - **Implemented**: Found in code
   - **Partially Implemented**: Some evidence but incomplete
   - **Not Implemented**: No code evidence

### Step 3: Find Orphaned Code

For each `code.topLevelDirs` entry:
1. Check if mentioned in docs
2. If not → "Implemented but not documented"

### Step 4: Validate Checkboxes

For each `docs.checkboxes.items`:
1. If `checked: true` but no code → **DRIFT: Marked done but not implemented**
2. If `checked: false` but code exists → **UPDATE NEEDED: Implemented but not checked**

---

## Priority Calculation (Opt-in)

When `options.calculatePriority: true`, issues include:

```typescript
interface Priority {
  score: number;        // 2-30 range
  severity: 'critical' | 'high' | 'medium' | 'low';
  bucket: 'immediate' | 'short-term' | 'medium-term' | 'backlog';
}
```

### Bucket Meanings

| Bucket | Score | Recommendation |
|--------|-------|----------------|
| immediate | >= 15 | Address this week |
| short-term | 10-14 | Address this month |
| medium-term | 5-9 | Plan for next quarter |
| backlog | < 5 | When bandwidth allows |

---

## Example Agent Reasoning

```
Given:
- docs.checkboxes.items = [{checked: true, text: "Add user authentication"}]
- code.topLevelDirs = ["src", "tests", "docs"]
- code.symbols = {"src/index.js": {functions: ["main", "setup"]}}

Agent reasoning:
1. "Add user authentication" is marked complete
2. Search for "auth" in topLevelDirs → NOT FOUND
3. Search for "auth", "login", "session" in symbols → NOT FOUND
4. CONCLUSION: DRIFT DETECTED
   - Checkbox marked done but no auth code exists
   - Recommendation: Either implement auth or uncheck the item
```
