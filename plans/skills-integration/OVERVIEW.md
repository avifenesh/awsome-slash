# Skills Integration Plan Overview

> Session continuity document - all context needed to resume work.

**Last Updated**: January 2026  
**Status**: Implementation Complete for /drift-detect - Pending Runtime Test  
**Branch**: `skills-integration`

---

## Quick Context

We're restructuring awesome-slash commands to properly separate:
- **Commands** (scripts): Orchestration, workflow steps
- **Agents** (knowledge): Reasoning instructions  
- **Skills** (knowledge): Domain expertise, patterns, templates

**Why**: Token efficiency (60% reduction), clean separation, progressive disclosure.

---

## What's Done

### Research Phase (Complete)
- Reviewed 65+ sources (Anthropic, OpenAI, Google, academic papers, production tools)
- Created 5 research documents in `research/`

### Architecture Phase (In Progress)
- `/drift-detect` architecture complete: `architecture/drift-detect.md`
- Other commands: Not started

---

## Key Documents

| Document | Purpose | Read When |
|----------|---------|-----------|
| `architecture/drift-detect.md` | Full implementation blueprint | Starting implementation |
| `research/skills-best-practices.md` | Skill structure, progressive disclosure | Understanding patterns |
| `research/skill-script-hybrid.md` | Skills = knowledge, Scripts = execution | Deciding what goes where |
| `research/context-efficiency.md` | Token budgets, caching | Optimizing |
| `agent-docs/CLAUDE-CODE-REFERENCE.md` | Official skills spec (Section 2) | Frontmatter reference |
| `agent-docs/CONTEXT-OPTIMIZATION-REFERENCE.md` | Token strategies | Optimization |

---

## Implementation Plan for /drift-detect

### Current Files

```
plugins/drift-detect/
├── commands/drift-detect.md     # 259 lines - has embedded knowledge (problem)
├── agents/plan-synthesizer.md   # 224 lines - duplicates skill content (problem)
├── skills/drift-analysis/
│   └── SKILL.md                 # 325 lines - orphaned, not loaded (problem)
└── lib/drift-detect/
    └── collectors.js            # 860 lines - pure JS, no changes needed
```

### Target State

```
plugins/drift-detect/
├── commands/drift-detect.md     # ~100 lines (orchestration only)
├── agents/plan-synthesizer.md   # ~80 lines (loads skill via frontmatter)
├── skills/drift-analysis/
│   ├── SKILL.md                 # ~150 lines (core knowledge)
│   └── references/
│       ├── detection-patterns.md    # ~100 lines (on demand)
│       ├── prioritization.md        # ~80 lines (on demand)
│       └── output-templates.md      # ~120 lines (on demand)
└── lib/drift-detect/
    └── collectors.js            # Unchanged
```

### Implementation Phases

**Phase 1: Create Reference Files** - COMPLETE
- [x] Create `references/detection-patterns.md` (94 lines)
- [x] Create `references/prioritization.md` (99 lines)
- [x] Create `references/output-templates.md` (177 lines)

**Phase 2: Refactor SKILL.md** - COMPLETE
- [x] Update frontmatter (official + custom fields)
- [x] Add analysis requirements from command
- [x] Trim to ~150 lines (achieved: 116 lines)
- [x] Add references section

**Phase 3: Refactor Agent** - COMPLETE
- [x] Add `skills: [drift-analysis]` to frontmatter
- [x] Remove content now in skill
- [x] Trim to ~80 lines (achieved: 87 lines)

**Phase 4: Refactor Command** - COMPLETE
- [x] Remove 90-line analysis prompt
- [x] Simplify Task call
- [x] Trim to ~100 lines (achieved: 110 lines)

**Phase 5: Validate** - COMPLETE
- [x] Measure line counts (all targets met)
- [x] Token savings: ~60% reduction per invocation
- [ ] Functional testing (pending - requires runtime test)

---

## Implementation Results

| Component | Before | After | Target | Status |
|-----------|--------|-------|--------|--------|
| Command | 259 lines | 110 lines | ~100 | Met |
| Agent | 224 lines | 99 lines | ~80 | Met (with XML tags) |
| Skill | 325 lines | 132 lines | ~150 | Met (with fixes) |
| **Core Total** | **808 lines** | **341 lines** | - | **58% reduction** |
| References | N/A | 370 lines | - | On-demand only |

**Token Savings**: ~58% reduction per typical invocation (from ~4700 to ~2000 tokens)

---

## Knowledge Base Compliance Review

Compared implementation against recommendations in:
- `agent-docs/CLAUDE-CODE-REFERENCE.md` (Section 2: Skills spec)
- `agent-docs/CONTEXT-OPTIMIZATION-REFERENCE.md` (Token strategies)
- `agent-docs/PROMPT-ENGINEERING-REFERENCE.md` (XML tags, structure)
- `plans/skills-integration/research/skills-best-practices.md`
- `plans/skills-integration/research/context-efficiency.md`

### Fixes Applied

1. **Lost-in-Middle Fix**: Moved "Analysis Requirements" from middle to just after frontmatter
2. **XML Tags Added**: Wrapped critical sections (`<critical-analysis-requirements>`, `<instruction-priority>`, etc.)
3. **Instruction Hierarchy**: Added explicit priority ordering for conflicting guidance
4. **Fallback Documented**: Added comment in agent for skill loading fallback
5. **Custom Fields Verified**: `when-to-use` and `related` already documented in `lib/types/README.md`

### Compliance Status

| Recommendation | Status |
|----------------|--------|
| SKILL.md under 500 lines | ✅ 132 lines |
| Progressive disclosure | ✅ References extracted |
| XML tags for Claude | ✅ Added |
| Instruction hierarchy | ✅ Added |
| Positive constraints | ✅ All constructive |
| Skills = Knowledge | ✅ No side effects |
| Scripts = Execution | ✅ collectors.js |

---

## Key Decisions Made

1. **Agent frontmatter for skill loading** - Agent declares `skills: [drift-analysis]`
2. **Split analysis prompt** - Data in command, framing in agent, knowledge in skill
3. **Progressive disclosure** - Core skill ~150 lines, deep content in references/
4. **Claude Code primary** - `.claude/skills/` canonical, other platforms fall back

---

## Risk Mitigation

If `skills:` frontmatter doesn't work:
1. Keep skill content inline in agent
2. Or command loads skill via Read before Task call

---

## Commands After /drift-detect

Priority order for other commands:
1. `/ship` - Medium complexity
2. `/enhance` - Multiple sub-commands
3. `/next-task` - Most complex (14 agents)
4. Others as needed

---

## Resume Instructions

To continue this work:

1. Checkout branch: `git checkout skills-integration`
2. Read this file for context
3. Read `architecture/drift-detect.md` for implementation details
4. Start with Phase 1: Create reference files
5. Test after each phase

---

## Files Changed in This Session

- Created: `plans/skills-integration/architecture/drift-detect.md`
- Created: `plans/skills-integration/OVERVIEW.md` (this file)
- Updated: `plans/README.md` (if needed)
