# Feature Extraction Reference

> How documented features are extracted for drift detection.

## Sources Scanned

- README + docs (`docs/`)
- Plans (`plans/`)
- Checklists (`checklists/`)
- Standard files (README.md, PLAN.md, AGENTS.md, etc.)

## Extraction Heuristics

1. **Feature sections**
   - Sections titled “Features”, “Capabilities”, “Highlights”, “What it does”, “Core Features”
   - Bullet and numbered list items under these headings are treated as features

2. **Inline feature statements**
   - Lines starting with “Supports”, “Provides”, “Includes”, “Enables”, “Allows”

3. **Normalization**
   - Lowercase, strip punctuation, collapse whitespace
   - Remove common stopwords
   - Tokens shorter than 3 characters are ignored

## Output Fields

Each feature includes:
- `name`: original text
- `normalized`: normalized string for matching
- `tokens`: cleaned tokens for fuzzy matching
- `sourceFile`, `sourceLine`, `context`: provenance for report evidence

## Interpretation Guidance

- **No feature evidence** does not guarantee absence in code.
- **Partial** means definitions exist but usage evidence is weak or missing.
- **Implemented** requires definition + usage (references/imports).
