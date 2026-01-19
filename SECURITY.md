# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported |
| ------- | --------- |
| 2.x.x   | Yes       |
| 1.x.x   | No        |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Publicly Disclose

Please **do not** open a public issue. Security vulnerabilities should be reported privately.

### 2. Report Via GitHub Security Advisories

Use GitHub's Security Advisory feature:
1. Go to the [Security tab](https://github.com/avifenesh/awesome-slash/security/advisories)
2. Click "Report a vulnerability"
3. Provide detailed information about the vulnerability

### 3. Include in Your Report

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)
- Your contact information

## What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 1 week
- **Status Updates:** We'll keep you informed of our progress
- **Disclosure:** We'll coordinate disclosure timing with you

## Security Best Practices for Users

### When Using Commands

1. **Review Generated Code:** Always review code changes made by agents before committing
2. **Check Credentials:** Never commit secrets, API keys, or credentials
3. **Deployment Caution:** Validate deployments before shipping to production
4. **PR Reviews:** Use `/project-review` quality gates to catch security issues

### Security Hardening (v2.5.0+)

The plugin includes protections against common vulnerabilities:

- **Command Injection Prevention:** Uses `execFileSync` instead of `execSync` for external tool probing, with strict input validation
- **Path Traversal Prevention:** Tool names and file paths are validated with allowlist patterns (`/^[a-zA-Z0-9_-]+$/`)
- **Input Validation:** All user-provided tool names are sanitized before use in file operations or command execution

### Platform Detection Scripts

The platform detection scripts in `lib/` execute shell commands. They:
- Do not execute arbitrary user input
- Only read configuration files
- Do not modify system files
- Run in the project directory only

### Command Safety

Commands that modify your repository:
- `/ship` - Commits, pushes code, creates and merges PRs
- `/next-task` - Full workflow automation including code changes
- `/deslop-around --apply` - Modifies source files

Always review changes with `git status` and `git diff` before running commands that commit or push.

## Scope

This security policy covers:
- Awesome Slash Commands plugin code
- Platform detection scripts
- Command implementations
- Dependencies

Does not cover:
- Vulnerabilities in Claude Code itself (report to Anthropic)
- Vulnerabilities in external tools (gh, git, npm, etc.)
- Issues with deployment platforms (Railway, Vercel, etc.)

## Dependencies

We regularly update dependencies to patch security vulnerabilities. If you find a vulnerability in one of our dependencies:
1. Check if we're using the latest version
2. If not, please report it
3. If we are, please report to the dependency maintainer

## Recognition

We appreciate security researchers who responsibly disclose vulnerabilities. With your permission, we'll acknowledge your contribution in:
- Our CHANGELOG.md
- The security advisory
- This SECURITY.md file

Thank you for helping keep Awesome Slash Commands secure!
