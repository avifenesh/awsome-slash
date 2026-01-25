# Release Checklist

Reference this document when preparing a release.

**Quick Reference:** [checklists/release.md](../checklists/release.md) - condensed version with just the file updates.

## Automated Release (Recommended)

Releases are automated via GitHub Actions. The workflow handles:
- Version validation across all files
- Running tests
- Publishing to npm with provenance
- Creating GitHub release with changelog

### Option 1: Tag Push (Recommended)

```bash
# 1. Prepare release (update versions, changelog, README)
# 2. Commit changes
git add -A && git commit -m "chore: release vX.Y.Z"

# 3. Create and push tag
git tag vX.Y.Z
git push origin main --tags
```

The workflow triggers automatically on tag push.

### Pre-release Channels (rc / beta)

Use pre-release tags to publish to npm without moving `latest`. The tag must point to a commit where all version fields have already been bumped to the prerelease version (e.g., `X.Y.Z-rc.N`).

```bash
git tag vX.Y.Z-rc.1
git tag vX.Y.Z-beta.1
git push origin main --tags
```

Behavior:
- `-rc.*` publishes to npm tag `rc` and creates a prerelease on GitHub.
- `-beta.*` publishes to npm tag `beta` and creates a prerelease on GitHub.
- Stable tags (`vX.Y.Z`) publish to npm `latest`.

### Option 2: Manual Dispatch

1. Go to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Optionally enter version (or leave empty to use package.json)
4. Enable **dry_run** to test without publishing

---

## Pre-Release Checklist

Before creating a tag:

- [ ] All tests pass (`npm test`)
- [ ] No uncommitted changes
- [ ] CHANGELOG.md updated with new version entry
- [ ] All version numbers updated (see table below)
- [ ] README.md "What's New" section updated

---

## Version Locations

Update **ALL** these locations before release:

| File | Location |
|------|----------|
| `package.json` | `"version": "X.Y.Z"` |
| `mcp-server/index.js` | `version: 'X.Y.Z'` in Server config (~line 668) |
| `README.md` | Version badge `version-X.Y.Z-blue` |
| `README.md` | "What's New in vX.Y.Z" section |
| `.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `.claude-plugin/marketplace.json` | `"version"` (appears 6x) |
| `plugins/next-task/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `plugins/ship/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `plugins/deslop/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `plugins/audit-project/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `plugins/drift-detect/.claude-plugin/plugin.json` | `"version": "X.Y.Z"` |
| `CHANGELOG.md` | New entry at top |

**Quick version grep:**
```bash
grep -r '"version"' package.json .claude-plugin/ plugins/*/.claude-plugin/ mcp-server/index.js
```

---

## Version Types

- **Patch (x.x.X)**: Bug fixes, security patches, docs updates
- **Minor (x.X.0)**: New features, non-breaking changes
- **Major (X.0.0)**: Breaking changes, API changes
- **RC/Beta (x.y.z-rc.N / x.y.z-beta.N)**: Pre-release validation before stable

---

## CHANGELOG Entry

Add entry **before** bumping version numbers.

**Format** ([Keep a Changelog](https://keepachangelog.com/)):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature Name** - Description (#PR)

### Changed
- **Component** - What changed (#PR)

### Fixed
- **Bug Name** - What was fixed (#PR)

### Performance
- **Optimization** - What improved (#PR)

### Security
- **Vulnerability** - What was patched (#PR)
```

**Guidelines:**
- Group changes under: `Added`, `Changed`, `Fixed`, `Removed`, `Performance`, `Security`
- Reference PR/issue numbers
- Write user-facing descriptions (what changed for plugin users)
- List breaking changes prominently

---

## GitHub Actions Setup

### Required Secrets

| Secret | Description |
|--------|-------------|
| `NPM_TOKEN` | npm automation token with publish access |

### Creating NPM_TOKEN

1. Go to [npmjs.com](https://www.npmjs.com/) → Access Tokens
2. Generate new token → **Automation** (for CI/CD)
3. Copy token
4. In GitHub repo: Settings → Secrets → Actions → New repository secret
5. Name: `NPM_TOKEN`, Value: paste token

### Environment Protection (Optional)

For additional security, create an "npm" environment:

1. Settings → Environments → New environment → `npm`
2. Add protection rules:
   - Required reviewers (optional)
   - Deployment branches: `main` only
3. Add `NPM_TOKEN` secret to this environment

---

## npm Provenance

The release workflow publishes with `--provenance`, which:
- Links the npm package to the exact GitHub commit
- Shows a verified badge on npmjs.com
- Provides supply chain transparency

Provenance requires:
- `id-token: write` permission (configured in workflow)
- Publishing from GitHub Actions (not locally)

---

## Post-Release Verification

The workflow provides a summary, but you can also verify manually:

- [ ] npm package published: `npm view awesome-slash version`
- [ ] GitHub release created: check Releases page
- [ ] Provenance visible on npm package page
- [ ] Claude Code can install: `claude plugin add npm:awesome-slash`

---

## Troubleshooting

### Version mismatch error

The workflow validates all version numbers match. If it fails:
```bash
grep -r '"version"' package.json .claude-plugin/ plugins/*/.claude-plugin/ mcp-server/index.js
```
Update any mismatched files.

### npm publish fails

- Verify `NPM_TOKEN` secret is set and valid
- Check npm account has publish access to `awesome-slash`
- For scoped packages, ensure `--access public` is set

### Tag already exists

If re-releasing the same version:
```bash
git tag -d vX.Y.Z          # delete local
git push origin :vX.Y.Z    # delete remote
git tag vX.Y.Z             # recreate
git push origin --tags     # push
```
