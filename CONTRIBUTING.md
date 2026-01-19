# Contributing to Awesome Slash Commands

Thank you for your interest in contributing.

## What We Care About

**This is a plugin for OTHER projects** - it provides workflow automation for developers using Claude Code, Codex CLI, and OpenCode in their repositories.

### Core Priorities (In Order)

1. **User DX** - The developer experience when using this plugin in external projects
2. **Controlled, worry-free automation** - Users should trust the plugin to run autonomously
3. **Minimal context/token consumption** - Agents should be efficient, not verbose
4. **Quality agent output** - Code written by agents must be production-ready
5. **Simplicity over features** - Remove complexity that doesn't serve users

### What To Avoid

- **Overengineering** - No config systems nobody asked for, no schemas for the sake of schemas
- **Internal tooling focus** - We don't optimize for developing THIS repo
- **Complexity creep** - Every abstraction must justify its existence
- **Summary/audit files** - Don't create files that clutter the repo

### Before Contributing, Ask

- "Does this help plugin users?" - Not internal tooling, not developer convenience here
- "Is this simple enough?" - If it feels overengineered, it probably is
- "Will agents using this consume fewer tokens?" - Efficiency matters
- "Does this make the automation more reliable?" - Trust is everything

---

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/avifenesh/awesome-slash/issues)
2. If not, create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node version, Claude version)

### Suggesting Features

1. Check [Issues](https://github.com/avifenesh/awesome-slash/issues) and [Discussions](https://github.com/avifenesh/awesome-slash/discussions)
2. Create a new discussion describing:
   - The problem you are trying to solve for **plugin users**
   - Your proposed solution
   - Why it's worth the added complexity (if any)

### Pull Requests

1. Fork and create a branch from `main`
2. Make your changes following our standards
3. Test thoroughly
4. Update CHANGELOG.md
5. Submit PR with clear description

---

## Development Setup

### Prerequisites

- Node.js 18+
- Git
- GitHub CLI (`gh`)

### Initial Setup

```bash
git clone https://github.com/YOUR-USERNAME/awesome-slash.git
cd awesome-slash
npm install
npm test
```

### Library Architecture

Claude Code installs each plugin separately, so each plugin needs its own `lib/` directory.

- **`lib/` (root)** = canonical source - always edit files here
- **`plugins/*/lib/`** = copies for installation - never edit directly

**When you modify any file in `lib/`:**

```bash
# 1. Edit files in lib/
vim lib/platform/detect-platform.js

# 2. Sync changes to all plugins
./scripts/sync-lib.sh

# 3. Commit both the source and copies
git add lib/ plugins/*/lib/
git commit -m "fix(lib): your change description"
```

---

## Coding Standards

### Keep It Simple

- Prefer flat data structures over nested objects
- Avoid abstractions until you need them three times
- Delete unused code completely - no backwards-compatibility hacks
- One file doing one thing well beats a complex module system

### JavaScript/Node.js

- Modern JavaScript (ES2020+)
- `const` over `let`, no `var`
- async/await over callbacks
- Handle errors explicitly
- JSDoc for exported functions

### Agent Prompts

- Be concise - every token costs
- Be specific - vague prompts waste iterations
- Include constraints - prevent scope creep
- Test with real tasks

---

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Examples:**
```
feat(sources): add GitLab support
fix(ship): correct CI status polling
docs(readme): update installation steps
```

---

## PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] CHANGELOG.md updated
- [ ] Commit messages follow convention
- [ ] No unnecessary complexity added
- [ ] Helps plugin users (not just internal dev)

---

## Getting Help

- **Questions**: [Discussions](https://github.com/avifenesh/awesome-slash/discussions)
- **Bugs**: [Issues](https://github.com/avifenesh/awesome-slash/issues)

Thank you for contributing.
