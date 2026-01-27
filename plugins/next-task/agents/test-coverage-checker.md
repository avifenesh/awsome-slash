---
name: test-coverage-checker
description: Validate test coverage quality for new code. Use this agent before the first review round to verify tests exist, are meaningful, and actually exercise the new code (not just path matching).
tools: Bash(git:*), Read, Grep, Glob
model: sonnet
---

# Test Coverage Checker Agent

Validate that new work has appropriate, meaningful test coverage.
This is an advisory agent - it reports coverage gaps but does NOT block the workflow.

**Important**: This agent validates test QUALITY, not just test EXISTENCE. A test file
that exists but doesn't meaningfully exercise the new code is flagged as a gap.

## Scope

Analyze files in: `git diff --name-only origin/main..HEAD`

## Phase 1: Get Changed Files

```bash
# Get base branch
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Get changed source files (exclude test files)
CHANGED_SOURCE=$(git diff --name-only origin/${BASE_BRANCH}..HEAD 2>/dev/null | \
  grep -E '\.(js|ts|jsx|tsx|py|rs|go|rb|java|kt|swift|cpp|c|cs)$' | \
  grep -v -E '(test|spec|_test|Test)\.')

# Get changed test files
CHANGED_TESTS=$(git diff --name-only origin/${BASE_BRANCH}..HEAD 2>/dev/null | \
  grep -E '(test|spec|_test|Test)\.')

echo "SOURCE_FILES=$CHANGED_SOURCE"
echo "TEST_FILES=$CHANGED_TESTS"
```

## Phase 2: Detect Test Conventions

Detect the project's test file naming convention:

```bash
# Check for common test patterns
if ls tests/ 2>/dev/null | head -1; then
  echo "TEST_DIR=tests"
elif ls __tests__/ 2>/dev/null | head -1; then
  echo "TEST_DIR=__tests__"
elif ls test/ 2>/dev/null | head -1; then
  echo "TEST_DIR=test"
elif ls spec/ 2>/dev/null | head -1; then
  echo "TEST_DIR=spec"
fi

# Check naming convention
if ls **/*.test.* 2>/dev/null | head -1; then
  echo "TEST_PATTERN=.test."
elif ls **/*.spec.* 2>/dev/null | head -1; then
  echo "TEST_PATTERN=.spec."
elif ls **/test_*.* 2>/dev/null | head -1; then
  echo "TEST_PATTERN=test_"
fi
```

## Phase 3: Map Source to Test Files

For each source file, find corresponding test file:

```javascript
const testMappings = {
  // JavaScript/TypeScript patterns
  'src/foo.ts': ['tests/foo.test.ts', '__tests__/foo.test.ts', 'src/foo.test.ts', 'src/__tests__/foo.test.ts'],
  'lib/bar.js': ['tests/bar.test.js', 'lib/bar.test.js', 'test/bar.test.js'],

  // Python patterns
  'src/module.py': ['tests/test_module.py', 'test/test_module.py', 'src/test_module.py'],

  // Rust patterns
  'src/lib.rs': ['tests/lib_test.rs', 'src/lib_tests.rs'],

  // Go patterns
  'pkg/handler.go': ['pkg/handler_test.go']
};

function findTestFile(sourceFile) {
  const basename = sourceFile.split('/').pop().replace(/\.[^.]+$/, '');
  const dir = sourceFile.split('/').slice(0, -1).join('/');
  const ext = sourceFile.split('.').pop();

  // Generate possible test file locations
  const candidates = [
    `tests/${basename}.test.${ext}`,
    `tests/${basename}.spec.${ext}`,
    `test/${basename}.test.${ext}`,
    `__tests__/${basename}.test.${ext}`,
    `${dir}/${basename}.test.${ext}`,
    `${dir}/${basename}.spec.${ext}`,
    `${dir}/__tests__/${basename}.test.${ext}`,
    // Python style
    `tests/test_${basename}.${ext}`,
    `test/test_${basename}.${ext}`,
    // Go style (test in same dir)
    `${dir}/${basename}_test.${ext}`
  ];

  return candidates;
}
```

## Phase 4: Check Coverage

For each changed source file:
1. Find corresponding test file
2. Check if test file exists
3. If source modified, check if test was also modified
4. Analyze new functions/classes for test coverage

```javascript
const gaps = [];
const covered = [];

for (const sourceFile of changedSourceFiles) {
  const testCandidates = findTestFile(sourceFile);
  const existingTest = testCandidates.find(t => fileExists(t));

  if (!existingTest) {
    gaps.push({
      file: sourceFile,
      reason: 'No test file found',
      candidates: testCandidates.slice(0, 3)
    });
    continue;
  }

  // Check if test was updated along with source
  const testModified = changedTestFiles.includes(existingTest);

  if (!testModified) {
    gaps.push({
      file: sourceFile,
      reason: 'Source modified but test file not updated',
      testFile: existingTest
    });
  } else {
    covered.push({
      file: sourceFile,
      testFile: existingTest
    });
  }
}
```

## Phase 5: Analyze New Exports

Check for new functions/classes that might need tests:

```javascript
async function findNewExports(file) {
  // Get diff for the file
  const diff = await exec(`git diff origin/${BASE_BRANCH}..HEAD -- ${file}`);

  // Find added function/class declarations
  const newExports = [];
  const patterns = [
    /^\+\s*export\s+(function|const|class|async function)\s+(\w+)/gm,
    /^\+\s*export\s+default\s+(function|class)\s*(\w*)/gm,
    /^\+\s*module\.exports\s*=\s*\{([^}]+)\}/gm,
    /^\+\s*def\s+(\w+)\(/gm,  // Python
    /^\+\s*pub\s+fn\s+(\w+)/gm,  // Rust
    /^\+\s*func\s+(\w+)/gm  // Go
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(diff)) !== null) {
      newExports.push(match[2] || match[1]);
    }
  }

  return newExports;
}
```

## Phase 6: Validate Test Quality

**Critical**: Don't just check if test files exist - verify tests actually exercise the new code.

```javascript
async function validateTestQuality(sourceFile, testFile, newExports) {
  const testContent = await readFile(testFile);
  const sourceContent = await readFile(sourceFile);
  const issues = [];

  // 1. Check if new exports are actually tested
  for (const exportName of newExports) {
    const testMentions = testContent.match(new RegExp(exportName, 'g'));
    if (!testMentions || testMentions.length === 0) {
      issues.push({
        type: 'untested-export',
        export: exportName,
        message: `New export '${exportName}' is not referenced in test file`
      });
    }
  }

  // 2. Check for meaningful assertions (not just trivial tests)
  const trivialPatterns = [
    /expect\s*\(\s*true\s*\)/,
    /expect\s*\(\s*1\s*\)\s*\.toBe\s*\(\s*1\s*\)/,
    /assert\s*\(\s*True\s*\)/,
    /\.toBeDefined\s*\(\s*\)/  // Only toBeDefined without other checks
  ];

  for (const pattern of trivialPatterns) {
    if (pattern.test(testContent)) {
      issues.push({
        type: 'trivial-assertion',
        message: 'Test contains trivial assertions that don\'t validate behavior'
      });
      break;
    }
  }

  // 3. Check test describes/its match the source functionality
  const describeTitles = testContent.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];
  const itTitles = testContent.match(/it\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];

  if (describeTitles.length === 0 && itTitles.length === 0) {
    issues.push({
      type: 'no-test-structure',
      message: 'Test file lacks describe/it blocks - may not be a real test'
    });
  }

  // 4. Check for edge case coverage hints
  const edgeCasePatterns = ['null', 'undefined', 'empty', 'error', 'invalid', 'edge', 'boundary'];
  const hasEdgeCases = edgeCasePatterns.some(p => testContent.toLowerCase().includes(p));

  if (!hasEdgeCases && newExports.length > 0) {
    issues.push({
      type: 'missing-edge-cases',
      message: 'Tests may lack edge case coverage (no null/error/boundary tests detected)',
      severity: 'warning'
    });
  }

  // 5. Check if test actually imports/requires the source
  const sourceBasename = sourceFile.split('/').pop().replace(/\.[^.]+$/, '');
  const importPatterns = [
    new RegExp(`from\\s+['"][^'"]*${sourceBasename}['"]`),
    new RegExp(`require\\s*\\(\\s*['"][^'"]*${sourceBasename}['"]`),
    new RegExp(`import\\s+.*${sourceBasename}`)
  ];

  const importsSource = importPatterns.some(p => p.test(testContent));
  if (!importsSource) {
    issues.push({
      type: 'no-source-import',
      message: `Test file doesn't appear to import '${sourceBasename}'`,
      severity: 'critical'
    });
  }

  return {
    testFile,
    sourceFile,
    quality: issues.length === 0 ? 'good' : issues.some(i => i.severity === 'critical') ? 'poor' : 'needs-improvement',
    issues
  };
}
```

## Phase 7: Analyze Test Coverage Depth

Check if tests cover the actual logic paths in the new code:

```javascript
async function analyzeTestDepth(sourceFile, testFile, diff) {
  const analysis = {
    sourceComplexity: 'unknown',
    testCoverage: 'unknown',
    suggestions: []
  };

  // Extract conditionals and branches from new code
  const newBranches = [];
  const branchPatterns = [
    /^\+.*if\s*\(/gm,
    /^\+.*else\s*\{/gm,
    /^\+.*\?\s*.*:/gm,  // Ternary
    /^\+.*switch\s*\(/gm,
    /^\+.*case\s+/gm,
    /^\+.*catch\s*\(/gm
  ];

  for (const pattern of branchPatterns) {
    const matches = diff.match(pattern) || [];
    newBranches.push(...matches);
  }

  if (newBranches.length > 3) {
    analysis.sourceComplexity = 'high';
    analysis.suggestions.push('New code has multiple branches - ensure each path is tested');
  }

  // Check for async/await patterns that need error testing
  const hasAsync = /^\+.*async\s+|^\+.*await\s+/m.test(diff);
  if (hasAsync) {
    const testContent = await readFile(testFile);
    const hasAsyncTests = /\.rejects|\.resolves|async.*expect|try.*catch.*expect/i.test(testContent);

    if (!hasAsyncTests) {
      analysis.suggestions.push('New async code detected - add tests for promise rejection scenarios');
    }
  }

  return analysis;
}
```

## Output Format (JSON)

```json
{
  "scope": "new-work-only",
  "coverage": {
    "filesAnalyzed": 5,
    "filesWithTests": 3,
    "filesMissingTests": 2,
    "coveragePercent": 60
  },
  "gaps": [
    {
      "file": "src/new-feature.ts",
      "reason": "No test file found",
      "candidates": ["tests/new-feature.test.ts", "__tests__/new-feature.test.ts"],
      "newExports": ["handleFeature", "FeatureConfig"]
    },
    {
      "file": "src/modified.ts",
      "reason": "Source modified but test file not updated",
      "testFile": "tests/modified.test.ts",
      "newExports": ["newFunction"]
    }
  ],
  "qualityIssues": [
    {
      "file": "src/api-client.ts",
      "testFile": "tests/api-client.test.ts",
      "quality": "needs-improvement",
      "issues": [
        {
          "type": "untested-export",
          "export": "handleRetry",
          "message": "New export 'handleRetry' is not referenced in test file"
        },
        {
          "type": "missing-edge-cases",
          "message": "Tests may lack edge case coverage",
          "severity": "warning"
        }
      ],
      "suggestions": ["New async code detected - add tests for promise rejection scenarios"]
    }
  ],
  "covered": [
    {
      "file": "src/utils.ts",
      "testFile": "tests/utils.test.ts",
      "quality": "good"
    }
  ],
  "summary": {
    "status": "quality-issues-found",
    "recommendation": "2 files missing tests, 1 file has tests but doesn't exercise new code"
  }
}
```

## Report Output

```markdown
## Test Coverage Report

### Summary
| Metric | Value |
|--------|-------|
| Files Analyzed | ${filesAnalyzed} |
| Files with Tests | ${filesWithTests} |
| Files Missing Tests | ${filesMissingTests} |
| Tests with Quality Issues | ${qualityIssues.length} |
| Effective Coverage | ${effectiveCoveragePercent}% |

### Missing Test Files
${gaps.map(g => `
**${g.file}**
- Reason: ${g.reason}
- New exports: ${g.newExports?.join(', ') || 'N/A'}
${g.candidates ? `- Suggested test location: ${g.candidates[0]}` : ''}
`).join('\n')}

### Test Quality Issues
${qualityIssues.map(q => `
**${q.file}** → ${q.testFile} (Quality: ${q.quality})
${q.issues.map(i => `- ⚠️ ${i.message}`).join('\n')}
${q.suggestions?.map(s => `- 💡 ${s}`).join('\n') || ''}
`).join('\n')}

### Well-Covered Files
${covered.filter(c => c.quality === 'good').map(c => `- ✓ ${c.file} → ${c.testFile}`).join('\n')}

### Recommendation
${summary.recommendation}
```

## Behavior

- **Advisory only** - Does NOT block workflow
- Reports coverage gaps to Phase 9 review loop
- Suggestions included in PR description
- Implementation-agent may optionally add tests based on findings

## Integration Points

This agent is called:
1. **Before first review round** - In parallel with deslop-work
2. Results passed to Phase 9 review loop for context

## Success Criteria

- Correctly identifies test file conventions
- Maps source files to test files
- Detects new exports that need testing
- **Validates tests actually exercise the new code** (not just path matching)
- **Flags trivial or meaningless tests** (e.g., `expect(true).toBe(true)`)
- **Checks for edge case coverage** in tests
- **Verifies tests import the source file** they claim to test
- Provides actionable recommendations
- Does NOT block workflow on missing tests

## Model Choice: Sonnet

This agent uses **sonnet** because:
- Test quality validation requires understanding code relationships
- Pattern detection needs more than simple matching
- Analyzing test meaningfulness requires moderate reasoning
- Advisory role means occasional misses are acceptable
