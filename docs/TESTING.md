# Manual Testing Guide

Use this checklist to validate awesome-slash commands in a real repo.

---

## Prerequisites

- Claude Code CLI installed
- Git installed and configured
- Node.js 18+
- GitHub CLI (`gh`) installed and authenticated (required for /ship and GitHub-backed workflows)
- A test project (or create one)

---

## Installation

Follow [docs/INSTALLATION.md](./docs/INSTALLATION.md). For local testing:

```bash
# Clone this repository
git clone https://github.com/avifenesh/awesome-slash.git
cd awesome-slash

# Install into Claude Code
claude plugin add npm:awesome-slash
# or
./scripts/install/claude.sh
```

---

## Test 1: Infrastructure Verification

### Platform Detection

```bash
npm run detect
```

**Expected fields**:
- `ci`, `deployment`, `projectType`, `packageManager`
- `branchStrategy`, `mainBranch`
- `hasPlanFile`, `hasTechDebtFile`
- `timestamp`

**Validation**:
- Detects your project type correctly
- Detects CI platform if you have `.github/workflows`, `.gitlab-ci.yml`, etc.
- Detects deployment if you have `vercel.json`, `railway.json`, etc.

### Tool Verification

```bash
npm run verify
```

**Validation**:
- Shows `available: true` for tools you have installed
- Includes version strings
- Shows `available: false` for missing tools

---

## Test 2: Pattern Libraries (Optional)

### Slop Patterns

```bash
cat > test-slop.js << 'EOF'
function test() {
  console.log("Debug message");
  // TODO: Fix this later
  const API_KEY = "secret123";
}
EOF

git add test-slop.js
git grep -n "console\.log"
git grep -n "TODO"
```

### Review Patterns

```bash
node -e "
const patterns = require('./lib/patterns/review-patterns.js');
console.log('Frameworks:', patterns.getAvailableFrameworks());
console.log('React patterns:', Object.keys(patterns.getPatternsForFramework('react')));
"
```

---

## Test 3: Commands in Claude Code

### Setup Test Project

```bash
mkdir ~/test-project
cd ~/test-project
git init
git checkout -b feature/test-command

cat > app.js << 'EOF'
function app() {
  console.log("Starting app");
  // TODO: Add error handling
  return true;
}
EOF

git add app.js
git commit -m "Add test file"
```

### Test `/deslop`

```text
/deslop
```

**Expected**:
- Detects project type
- Reports slop issues
- Does not modify files in report mode

```text
/deslop apply . 3
```

**Expected**:
- Removes console.log statements
- Removes old TODOs
- Fixes up to 3 issues

### Test `/next-task`

Create a couple of issues:

```bash
gh issue create --title "Add user login" --body "Implement login functionality"
gh issue create --title "Fix timeout bug" --body "Users reporting timeouts"
```

```text
/next-task
```

**Expected**:
- Fetches GitHub issues
- Prioritizes tasks
- Shows top candidates with evidence

```text
/next-task bug
```

**Expected**: Only bug-labeled issues

### Test `/audit-project`

```text
/audit-project
```

**Expected**:
- Detects project type and framework
- Runs review agents
- Reports issues with file:line references and severity

### Test `/ship`

```bash
git status  # should be clean

git checkout -b feature/test-ship
echo "console.log('test');" >> app.js
git add app.js
```

```text
/ship --dry-run
```

**Expected**:
- Shows phases and detected CI/deployment platforms
- Does not make changes

```text
/ship
```

**Expected**:
- Commits changes
- Creates PR
- Waits for CI and reviews
- Merges PR and cleans up

### Test `/sync-docs`

```text
/sync-docs
```

**Expected**:
- Scans documentation
- Reports any outdated references

### Test `/delivery-approval`

```text
/delivery-approval --verbose
```

**Expected**:
- Runs tests/build/lint checks where applicable
- Reports pass/fail summary

### Test `/drift-detect`

```text
/drift-detect
```

**Expected**:
- Runs issue/doc/code scans
- Produces a summary of drift and gaps

### Test `/repo-map`

```text
/repo-map init
```

**Expected**:
- Generates repo-map.json in platform state dir
- Reports file and symbol counts
- Validates output with map-validator

---

## Troubleshooting

### "GitHub CLI not found"

```bash
brew install gh  # macOS
winget install GitHub.cli  # Windows

gh auth login
gh auth status
```

### "Module not found"

```bash
cd /path/to/awesome-slash
npm run detect
```

### Commands not showing in Claude Code

1. Reinstall the plugin
2. Restart Claude Code
3. Check Claude Code logs at `~/.claude/logs/`

---

## Validation Checklist

- [ ] Platform detection works on your project
- [ ] Tool verification shows correct tools
- [ ] `/deslop` finds and fixes slop
- [ ] `/next-task` lists prioritized tasks
- [ ] `/audit-project` finds real issues
- [ ] `/ship` creates PR and merges successfully
- [ ] `/sync-docs` reports documentation issues
- [ ] `/delivery-approval` runs validation checks
- [ ] `/drift-detect` produces a drift report
- [ ] `/repo-map` generates a repo map

---

## Performance Notes

Command runtime varies based on:
- Repository size and complexity
- CI/deployment platform latency
- Network conditions
- Number of files to analyze

**Expected behavior:**
- `/deslop`: Fast codebase scan
- `/audit-project`: Thorough multi-agent analysis
- `/next-task`: Full autonomous workflow with multiple phases
- `/ship`: Includes CI wait time and deployment validation

---

## Reporting Issues

If you find bugs during manual testing:

1. Collect:
   - Command used
   - Expected behavior
   - Actual behavior
   - Error messages
   - Project type
   - OS and versions

2. Report on GitHub:

```bash
gh issue create --repo avifenesh/awesome-slash \
  --title "Bug: Command X failed" \
  --body "Detailed description with steps to reproduce"
```

---

Happy testing.
