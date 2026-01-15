# Contributing to Awesome Slash Commands

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and inclusive. We're all here to make better tools.

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/avifenesh/awsome-slash/issues)
2. If not, create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node version, Claude version)
   - Relevant logs or error messages

### Suggesting Features

1. Check [Issues](https://github.com/avifenesh/awsome-slash/issues) and [Discussions](https://github.com/avifenesh/awsome-slash/discussions)
2. Create a new discussion or issue describing:
   - The problem you're trying to solve
   - Your proposed solution
   - Why it would benefit others
   - Potential implementation approach

### Pull Requests

1. **Fork the repository**
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our coding standards
4. **Test thoroughly** - ensure all commands still work
5. **Update documentation** if needed
6. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add support for BitBucket Pipelines"
   ```
7. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Create a Pull Request** with:
   - Clear description of changes
   - Why the change is needed
   - How to test it
   - Screenshots/examples if applicable

## Development Setup

### Prerequisites

- Node.js 18+ (for running scripts)
- Git
- GitHub CLI (`gh`)
- Code editor (VS Code recommended)

### Initial Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/awsome-slash.git
cd awsome-slash

# Install dependencies
npm install

# Run tests
npm test

# Test platform detection
node lib/platform/detect-platform.js

# Test tool verification
node lib/platform/verify-tools.js
```

### Project Structure

```
awsome-claude-slash/
├── .claude-plugin/      # Plugin manifest
├── lib/                 # CANONICAL shared libraries (edit here!)
│   ├── platform/        # Platform detection
│   ├── patterns/        # Pattern libraries
│   └── utils/           # Helper utilities
├── plugins/             # Individual plugins
│   ├── deslop-around/
│   │   ├── .claude-plugin/
│   │   ├── commands/
│   │   └── lib/         # Copy of shared lib (DO NOT edit directly)
│   ├── next-task/
│   ├── pr-merge/
│   ├── project-review/
│   └── ship/
├── adapters/            # Codex/OpenCode adapters
├── scripts/             # Developer tools
└── docs/                # Documentation
```

### Library Architecture (IMPORTANT!)

Claude Code installs each plugin separately, so each plugin needs its own `lib/` directory. To avoid maintaining 5 copies manually:

- **`lib/`** (root) = **Canonical source** - always edit files here
- **`plugins/*/lib/`** = Copies for installation - never edit directly

**When you modify any file in `lib/`:**

```bash
# 1. Edit files in lib/ (the root directory)
vim lib/platform/detect-platform.js

# 2. Sync changes to all plugins
./scripts/sync-lib.sh

# 3. Commit BOTH the source and copies
git add lib/ plugins/*/lib/
git commit -m "fix(lib): your change description"
```

**Why this matters:**
- If you edit `plugins/ship/lib/detect-platform.js` directly, your changes will be lost next time someone runs `sync-lib.sh`
- All 5 plugins must have identical lib files
- The sync script ensures consistency

## Coding Standards

### JavaScript/Node.js

- Use modern JavaScript (ES2020+)
- Prefer `const` over `let`, avoid `var`
- Use async/await over callbacks
- Handle errors explicitly
- Add JSDoc comments for functions
- Keep functions small and focused
- Use descriptive variable names

### Example

```javascript
/**
 * Detects the CI platform by scanning for configuration files
 * @returns {string|null} CI platform name or null if not detected
 */
function detectCI() {
  if (fs.existsSync('.github/workflows')) return 'github-actions';
  if (fs.existsSync('.gitlab-ci.yml')) return 'gitlab-ci';
  return null;
}
```

### Markdown Commands

- Use YAML frontmatter for metadata
- Include `description` and `argument-hint`
- Provide usage examples
- Document all phases clearly
- Include fallback behavior
- Use context-efficient commands

### Testing

- Write tests for new features
- Update tests when changing behavior
- Ensure all tests pass before submitting PR
- Test on different platforms if possible

### Documentation

- Update README.md for new features
- Add to COMMANDS.md for new commands
- Update PLATFORM_SUPPORT.md for new platforms
- Keep CHANGELOG.md updated

## Adding Support for New Platforms

### CI/CD Platform

1. Add detection logic to `lib/platform/detect-platform.js`:
   ```javascript
   if (fs.existsSync('.bitbucket-pipelines.yml')) return 'bitbucket';
   ```

2. Update detection matrix in `README.md`

3. Test on actual project using that platform

### Deployment Platform

1. Add to `lib/platform/deployment-detector.js`:
   ```javascript
   "platform-name": {
     detect: ["config-file"],
     deployUrl: "command to get URL",
     logs: "command to get logs",
     status: "command to check status"
   }
   ```

2. Update `/ship` and `/pr-merge` commands

3. Test deployment validation

### Framework/Language

1. Add patterns to `lib/patterns/review-patterns.js`:
   ```javascript
   "framework-name": {
     "pattern-category": [
       "Pattern description 1",
       "Pattern description 2"
     ]
   }
   ```

2. Update `lib/platform/detect-platform.js` to detect it

3. Test with actual project

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(commands): add /ship command with deployment support
fix(detection): correct Railway platform detection
docs(readme): update installation instructions
test(platform): add tests for CI detection
```

## Pull Request Process

1. **Fork & Branch**: Create a feature branch
2. **Implement**: Make your changes
3. **Test**: Ensure everything works
4. **Document**: Update relevant docs
5. **PR**: Submit with clear description
6. **Review**: Address feedback
7. **Merge**: Maintainer will merge when approved

### PR Checklist

- [ ] Tests pass (`npm test`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Commit messages follow convention
- [ ] Code follows project standards
- [ ] No sensitive data in commits

## Getting Help

- **Questions**: Use [Discussions](https://github.com/avifenesh/awsome-slash/discussions)
- **Bugs**: Use [Issues](https://github.com/avifenesh/awsome-slash/issues)
- **Chat**: (Coming soon)

## Recognition

Contributors will be recognized in:
- CHANGELOG.md
- README.md contributors section
- GitHub contributors page

Thank you for contributing to Awesome Slash Commands!
