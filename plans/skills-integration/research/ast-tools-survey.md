# AST/Structure-Aware Tooling Survey (LLM Coding Agents)

**Date**: January 26, 2026  
**Scope**: Aider and other LLM coding agents that leverage structure-aware signals (AST/LSP, code graphs, or semantic indexes) for codebase context and navigation.  
**Depth**: Medium (how mapping works + value to users).  

## Summary Snapshot

- **Aider**: Builds a repo map of key symbols/definitions and uses graph ranking + a token budget to send only the most relevant parts. citeturn4search5
- **Continue**: Uses LSP “go to definition” for autocomplete context and can use AST root-path heuristics; `@Codebase` uses embeddings + keyword search for retrieval. citeturn0search1turn0search2turn2search2
- **Sourcegraph Cody**: Uses a Code Graph (definitions, references, symbols, doc comments) produced by indexers/auto-indexing; also offers local keyword indexing. citeturn0search0turn0search3turn0search5
- **Cursor**: Builds a codebase embeddings index per file and updates it incrementally; supports multi-root workspaces and ignore files. citeturn2search0
- **GitHub Copilot Chat**: Uses a semantic code search index per repository that is created automatically and updated quickly to improve repo-aware answers. citeturn1search0turn1search4

## Tool Profiles

### Aider (Repo Map + graph ranking)
**How it uses structure**
- Aider builds a repo map listing files and key symbols, including the critical lines for definitions. citeturn4search5
- It ranks files using a dependency graph and selects only the most relevant parts to fit a token budget (`--map-tokens`, default 1k). citeturn4search5

**Value delivered**
- Gives the model a global, structured view of APIs and symbol usage.
- Provides a token-budgeted, ranked slice of the most referenced identifiers to minimize context bloat. citeturn4search5

### Continue (LSP + AST root-path for autocomplete; embeddings+keyword for retrieval)
**How it uses structure**
- Autocomplete uses LSP “go to definition” to bring in relevant definitions/types based on cursor context. citeturn0search1
- Continue describes using AST root-path heuristics (via tree-sitter) to collect structured context along the cursor path. citeturn0search2

**How codebase retrieval works**
- `@Codebase` uses a combination of embeddings-based retrieval and keyword search, stored locally. citeturn2search2

**Value delivered**
- Low-latency, high-precision autocomplete context.
- Configurable, local codebase retrieval for refactors and broad questions. citeturn0search1turn2search2

### Sourcegraph Cody (Code Graph via indexers/auto-indexing)
**How it uses structure**
- Cody’s Code Graph stores definitions, references, symbols, and doc comments produced by language indexers. citeturn0search0
- Repos can be auto-indexed to generate code graph data. citeturn0search3
- Cody also supports local indexing for keyword search via the symf engine. citeturn0search5

**Value delivered**
- Precise def/ref relationships for navigation and structural context across large repos.
- Fast local keyword retrieval for context discovery. citeturn0search0turn0search5

### Cursor (Embedding-based codebase index)
**How it uses structure**
- Cursor computes embeddings for each file to build a codebase index, updating incrementally. citeturn2search0
- Indexing respects `.gitignore` and `.cursorignore`; multi-root workspaces are supported. citeturn2search0

**Value delivered**
- Faster and more accurate codebase-aware answers using semantic similarity.
- Minimal configuration for ongoing updates. citeturn2search0

### GitHub Copilot Chat (Semantic code search index)
**How it uses structure**
- Copilot Chat builds a semantic code search index per repository when you start a repo-context chat. citeturn1search0
- Indexing runs in the background; after initial indexing, updates are typically fast. citeturn1search0turn1search4

**Value delivered**
- Improved repo-aware answers about code structure and logic using the semantic index. citeturn1search0

## Comparison (Closest to Aider-style mapping)

- **Aider**: Explicit repo map + dependency graph ranking + token budgeting. citeturn4search5
- **Sourcegraph Cody**: Structural def/ref graph via indexers; auto-indexing for precise navigation. citeturn0search0turn0search3
- **Continue autocomplete**: AST root-path + LSP resolution for precise localized context. citeturn0search2turn0search1
- **Cursor/Copilot**: Embeddings/semantic indexing for codebase Q&A; less explicit def/ref structure. citeturn2search0turn1search0

## Takeaways for Repo Map Roadmap

1. **Def/ref graph is a high-value primitive** (Aider ranking and Cody code graph both depend on symbol relationships). citeturn4search5turn0search0
2. **Token-budgeted maps matter** for large repos (Aider’s `--map-tokens` + graph ranking). citeturn4search5
3. **AST+LSP heuristics are effective for localized context** (Continue’s root-path strategy + LSP defs). citeturn0search2turn0search1
4. **Embeddings-only indexing is common** for general Q&A (Cursor/Copilot), but lacks explicit def/ref structure. citeturn2search0turn1search0

---

**Sources**: Aider docs, Continue docs/blog, Sourcegraph docs, Cursor docs, GitHub Copilot docs/changelog. citeturn4search5turn0search1turn0search2turn2search2turn0search0turn0search3turn0search5turn2search0turn1search0turn1search4
