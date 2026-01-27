# Decision Memo: Repo Map “Logic Layer” Direction

**Date**: January 26, 2026  
**Context**: We want the repo map to do more than symbols+imports, similar to Aider’s repo map and Sourcegraph’s code graph, with a compact output suitable for LLM context.  

## Decision

Prioritize a **def/ref graph + relevance ranking + token-budgeted summary** as the next repo-map layer. This aligns with how Aider and Sourcegraph Cody create high-leverage, structure-aware context, and enables compact output for large repos. citeturn4search5turn0search0

## Why This Direction

- **Def/ref graphs are a proven high-value primitive** for navigation and context discovery (Aider ranks via dependency graphs; Cody relies on code graph definitions/references). citeturn4search5turn0search0
- **Token-budgeted summaries scale** to large repos; Aider uses a map token budget with ranked identifiers. citeturn4search5
- **Incremental refinement**: We can build the graph from our existing AST map without embedding infrastructure. citeturn0search0

## Alternatives Considered

1. **Embeddings-first indexing (Cursor/Copilot style)**
   - **Pros**: Great for broad Q&A and semantic similarity retrieval. citeturn2search0turn1search0
   - **Cons**: Lacks explicit def/ref structure; harder to explain why a symbol is important or how files relate.

2. **AST+LSP localized heuristics (Continue autocomplete style)**
   - **Pros**: Excellent for near-cursor context and low-latency completion. citeturn0search1turn0search2
   - **Cons**: Doesn’t produce a global, ranked map; better as a later enhancement for local snippet selection.

## Implications for Implementation

- Build a **def/ref graph** from AST-extracted symbols and references.
- Add **ranking** (e.g., PageRank or dependency centrality) across files/symbols.
- Generate a **token-budgeted map summary** of top-ranked files/symbols and short signature snippets.
- Keep embeddings as **optional future work**; consider them for fuzzy retrieval once structural map is solid.

## Success Criteria

- Repo-map can output a ranked, compact summary constrained by a token budget.
- Summary includes symbol definitions and their file context (not just filenames).
- For a large repo, top-ranked files/symbols are stable and reproducible across runs.

---

**Sources**: Aider docs, Sourcegraph Cody code graph docs, Continue autocomplete design docs, Cursor and Copilot semantic indexing docs. citeturn4search5turn0search0turn0search1turn0search2turn2search0turn1search0
