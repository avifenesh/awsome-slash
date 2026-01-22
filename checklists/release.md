# Release Checklist

Full release guide: [agent-docs/release.md](../agent-docs/release.md)

## Version Bump Files

Update ALL these files with new version:

```bash
# Quick check current versions
grep -r '"version"' package.json .claude-plugin/ plugins/*/.claude-plugin/ mcp-server/index.js 2>/dev/null
```

- [ ] `package.json` → `"version": "X.Y.Z"`
- [ ] `.claude-plugin/plugin.json` → `"version": "X.Y.Z"`
- [ ] `.claude-plugin/marketplace.json` → `"version"` (6 occurrences)
- [ ] `mcp-server/index.js` → `version: 'X.Y.Z'` (~line 668)
- [ ] `README.md` → Version badge + "What's New" section
- [ ] `plugins/next-task/.claude-plugin/plugin.json`
- [ ] `plugins/ship/.claude-plugin/plugin.json`
- [ ] `plugins/deslop-around/.claude-plugin/plugin.json`
- [ ] `plugins/project-review/.claude-plugin/plugin.json`
- [ ] `plugins/reality-check/.claude-plugin/plugin.json`

## Documentation Updates

- [ ] `CHANGELOG.md` → New entry at top (Added/Changed/Fixed/Removed)
- [ ] `README.md` → "What's New in vX.Y.Z" section
- [ ] `docs/ARCHITECTURE.md` → If architecture changed

## Pre-Release Validation

```bash
npm test                    # All tests pass
npm pack --dry-run          # Package builds correctly
git status                  # No uncommitted changes
```

## Release Commands

```bash
# Commit version bump
git add -A && git commit -m "chore: release vX.Y.Z"

# Create and push tag (triggers GitHub Actions)
git tag vX.Y.Z
git push origin main --tags
```

## Post-Release Verification

- [ ] `npm view awesome-slash version` shows new version
- [ ] GitHub Releases page has new release
- [ ] `awesome-slash --version` shows new version after `npm update -g`
