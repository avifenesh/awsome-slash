# Security Policy

> **Disclaimer:** This plugin is provided as-is. Usage is entirely at your own responsibility. The maintainers make no guarantees about security or fitness for any particular purpose.

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Use [GitHub Security Advisories](https://github.com/avifenesh/awesome-slash/security/advisories) to report privately
3. Include steps to reproduce and potential impact

## User Responsibility

**You are responsible for:**
- Reviewing all code changes made by agents before committing
- Never committing secrets, API keys, or credentials
- Validating deployments before shipping to production
- Understanding what commands do before running them

**Commands that modify your repository:**
- `/ship` - Commits, pushes, creates and merges PRs
- `/next-task` - Full workflow automation including code changes
- `/deslop-around --apply` - Modifies source files

Always review changes with `git status` and `git diff` before running commands that commit or push.

## Security Measures (v2.5.0+)

The plugin includes basic protections:

- **Command Injection Prevention:** Uses `execFileSync` with input validation
- **Path Traversal Prevention:** Tool names validated with allowlist patterns
- **Input Validation:** User-provided values sanitized before use

These measures reduce risk but do not guarantee security.

## Scope

This policy covers the awesome-slash plugin code only.

**Not covered:**
- Claude Code itself (report to Anthropic)
- External tools (gh, git, npm, etc.)
- Deployment platforms (Railway, Vercel, etc.)
