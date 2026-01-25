# Detection Patterns Reference

> Deep reference for drift detection patterns. Load when needing specific matching logic.

## Document-to-Code Matching

Use fuzzy matching for feature names since documentation and code often use different terminology.

```javascript
// Fuzzy matching for feature names
function featureMatch(docFeature, codeFeature) {
  const normalize = s => s
    .toLowerCase()
    .replace(/[-_\s]+/g, '')
    .replace(/s$/, ''); // Remove trailing 's'

  const docNorm = normalize(docFeature);
  const codeNorm = normalize(codeFeature);

  return docNorm.includes(codeNorm) ||
         codeNorm.includes(docNorm) ||
         levenshteinDistance(docNorm, codeNorm) < 3;
}
```

## Common Terminology Mismatches

| Documented As | Look For In Code |
|---------------|------------------|
| "user authentication" | auth/, login/, session/, credentials/ |
| "API endpoints" | routes/, api/, handlers/, controllers/ |
| "database models" | models/, entities/, schemas/, db/ |
| "caching layer" | cache/, redis/, memcache/, store/ |
| "logging system" | logger/, logs/, telemetry/, metrics/ |
| "configuration" | config/, settings/, env/, options/ |
| "middleware" | middleware/, interceptors/, pipes/ |
| "validation" | validators/, schemas/, rules/ |

## Feature Name Normalization

When comparing documented features to code:

1. **Strip formatting**: Remove hyphens, underscores, spaces
2. **Case normalize**: Convert to lowercase
3. **Singularize**: Remove trailing 's' for plural/singular matching
4. **Acronym expand**: API → application-programming-interface (optional)

## Matching Categories

After cross-referencing, categorize each feature:

| Category | Definition | Evidence |
|----------|------------|----------|
| **Documented but not implemented** | In docs/issues, no matching code | Feature in README, no files found |
| **Implemented but not documented** | Code exists, docs don't mention | Directory exists, not in README |
| **Partially implemented** | Some code exists but incomplete | Files exist, key functions missing |
| **Fully aligned** | Docs and code match | Feature documented and working |

## Detection Heuristics

### Finding Implemented Features

```
1. Scan top-level directories → likely feature modules
2. Scan exports in index.js/main entry → public API
3. Scan route definitions → API endpoints
4. Scan test file names → tested features
```

### Finding Documented Features

```
1. H2/H3 headers in README → major features
2. Checkboxes in PLAN.md → planned/done items
3. Issue titles → intended work
4. PR titles → shipped features
```

### Matching Confidence

| Confidence | Criteria |
|------------|----------|
| **High** | Exact match or single-word Levenshtein < 2 |
| **Medium** | Contains relationship or multi-word partial match |
| **Low** | Synonym match or conceptual similarity |

## Cross-Reference Workflow

1. Extract feature list from documentation
2. Extract feature list from codebase structure
3. Normalize both lists
4. Perform fuzzy matching
5. Categorize each item
6. Report gaps and alignments
