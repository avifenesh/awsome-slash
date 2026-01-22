#!/usr/bin/env node
/**
 * Cross-Platform Compatibility Validator
 * Validates plugins, agents, commands, and skills work across:
 * - Claude Code (.claude/, CLAUDE.md, ${CLAUDE_PLUGIN_ROOT})
 * - OpenCode (.opencode/, AGENTS.md)
 * - Codex (.codex/, AGENTS.md)
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT_DIR, 'plugins');
const LIB_DIR = path.join(ROOT_DIR, 'lib', 'enhance');

// Try to load the agent analyzer
let agentAnalyzer;
try {
  agentAnalyzer = require(path.join(LIB_DIR, 'agent-analyzer'));
} catch (e) {
  console.error('Error loading agent-analyzer:', e.message);
  process.exit(1);
}

/**
 * Cross-platform patterns for non-agent files (commands, skills, etc.)
 */
const crossPlatformPatterns = {
  hardcoded_claude_dir: {
    pattern: /\.claude\//,
    exclude: /AI_STATE_DIR|\$\{.*STATE.*\}|getStateDir\(\)|State directory is platform-aware/i,
    certainty: 'HIGH',
    issue: 'Hardcoded .claude/ directory',
    fix: 'Use ${STATE_DIR}/ placeholder or getStateDir()'
  },
  claude_md_reference: {
    pattern: /CLAUDE\.md/i,
    certainty: 'MEDIUM',
    issue: 'References CLAUDE.md',
    fix: 'Use generic term or check for both CLAUDE.md and AGENTS.md'
  },
  hardcoded_windows_path: {
    pattern: /[A-Z]:\\(?:Users|Program Files)/i,
    certainty: 'HIGH',
    issue: 'Hardcoded Windows path',
    fix: 'Use relative paths or environment variables'
  },
  hardcoded_unix_path: {
    pattern: /\/(?:home|Users)\/[^\/\s]+/,
    certainty: 'HIGH',
    issue: 'Hardcoded Unix home path',
    fix: 'Use relative paths or environment variables'
  }
};

/**
 * Scan a file for cross-platform issues
 */
function scanFile(filePath, content) {
  const issues = [];

  for (const [id, check] of Object.entries(crossPlatformPatterns)) {
    if (check.pattern.test(content)) {
      // Check exclusion pattern if exists
      if (check.exclude && check.exclude.test(content)) {
        continue;
      }
      issues.push({
        patternId: id,
        file: filePath,
        certainty: check.certainty,
        issue: check.issue,
        fix: check.fix
      });
    }
  }

  return issues;
}

/**
 * Scan all markdown files in a directory
 */
function scanDirectory(dir, category) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md');

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = scanFile(filePath, content);

    if (issues.length > 0) {
      results.push({
        file,
        path: filePath,
        category,
        issues
      });
    }
  }

  return results;
}

/**
 * Analyze agents using the enhanced agent analyzer
 */
function analyzeAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) return [];

  const results = agentAnalyzer.analyzeAllAgents(agentsDir, { verbose: false });

  // Filter to only cross-platform issues
  return results
    .filter(r => r.crossPlatformIssues && r.crossPlatformIssues.length > 0)
    .map(r => ({
      file: r.agentName + '.md',
      path: r.agentPath,
      category: 'agent',
      issues: r.crossPlatformIssues
    }));
}

/**
 * Main validation function
 */
function validate(options = {}) {
  const { verbose = false, fix = false } = options;

  console.log('Cross-Platform Compatibility Validator');
  console.log('======================================\n');
  console.log('Checking compatibility with: Claude Code, OpenCode, Codex\n');

  const allIssues = [];

  // Get all plugins
  const plugins = fs.readdirSync(PLUGINS_DIR).filter(f =>
    fs.statSync(path.join(PLUGINS_DIR, f)).isDirectory()
  );

  for (const plugin of plugins) {
    const pluginPath = path.join(PLUGINS_DIR, plugin);
    console.log(`Scanning: ${plugin}/`);

    // Scan agents
    const agentsDir = path.join(pluginPath, 'agents');
    const agentIssues = analyzeAgents(agentsDir);
    if (agentIssues.length > 0) {
      console.log(`  agents/: ${agentIssues.length} file(s) with issues`);
      allIssues.push(...agentIssues.map(i => ({ ...i, plugin })));
    } else if (fs.existsSync(agentsDir)) {
      console.log('  agents/: ✓');
    }

    // Scan commands
    const commandsDir = path.join(pluginPath, 'commands');
    const commandIssues = scanDirectory(commandsDir, 'command');
    if (commandIssues.length > 0) {
      console.log(`  commands/: ${commandIssues.length} file(s) with issues`);
      allIssues.push(...commandIssues.map(i => ({ ...i, plugin })));
    } else if (fs.existsSync(commandsDir)) {
      console.log('  commands/: ✓');
    }

    // Scan skills
    const skillsDir = path.join(pluginPath, 'skills');
    const skillIssues = scanDirectory(skillsDir, 'skill');
    if (skillIssues.length > 0) {
      console.log(`  skills/: ${skillIssues.length} file(s) with issues`);
      allIssues.push(...skillIssues.map(i => ({ ...i, plugin })));
    } else if (fs.existsSync(skillsDir)) {
      console.log('  skills/: ✓');
    }

    // Scan hooks
    const hooksDir = path.join(pluginPath, 'hooks');
    const hookIssues = scanDirectory(hooksDir, 'hook');
    if (hookIssues.length > 0) {
      console.log(`  hooks/: ${hookIssues.length} file(s) with issues`);
      allIssues.push(...hookIssues.map(i => ({ ...i, plugin })));
    } else if (fs.existsSync(hooksDir)) {
      console.log('  hooks/: ✓');
    }

    console.log('');
  }

  // Also scan lib/ for any hardcoded paths
  const libFiles = findFilesRecursive(path.join(ROOT_DIR, 'lib'), '.js');
  let libIssueCount = 0;
  for (const filePath of libFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = scanFile(filePath, content);
    if (issues.length > 0) {
      libIssueCount++;
      allIssues.push({
        file: path.basename(filePath),
        path: filePath,
        category: 'lib',
        plugin: 'lib',
        issues
      });
    }
  }
  if (libIssueCount > 0) {
    console.log(`lib/: ${libIssueCount} file(s) with issues\n`);
  } else {
    console.log('lib/: ✓\n');
  }

  // Print summary
  console.log('======================================');
  console.log('Summary');
  console.log('======================================\n');

  if (allIssues.length === 0) {
    console.log('✅ No cross-platform issues found!\n');
    return { success: true, issues: [] };
  }

  // Group by certainty
  const highIssues = allIssues.filter(i => i.issues.some(x => x.certainty === 'HIGH'));
  const mediumIssues = allIssues.filter(i => i.issues.some(x => x.certainty === 'MEDIUM') && !highIssues.includes(i));

  console.log(`HIGH certainty:   ${highIssues.length} file(s)`);
  console.log(`MEDIUM certainty: ${mediumIssues.length} file(s)`);
  console.log('');

  // Print detailed issues
  if (verbose || highIssues.length > 0) {
    console.log('Issues:');
    console.log('-------\n');

    for (const item of allIssues) {
      const relPath = path.relative(ROOT_DIR, item.path);
      console.log(`${relPath}:`);
      for (const issue of item.issues) {
        const marker = issue.certainty === 'HIGH' ? '✗' : '!';
        console.log(`  ${marker} [${issue.certainty}] ${issue.issue}`);
        console.log(`    Fix: ${issue.fix}`);
      }
      console.log('');
    }
  }

  const exitCode = highIssues.length > 0 ? 1 : 0;
  if (exitCode === 1) {
    console.log('❌ Found HIGH certainty cross-platform issues');
  } else {
    console.log('⚠️  Found MEDIUM certainty issues (review recommended)');
  }

  return { success: exitCode === 0, issues: allIssues };
}

/**
 * Find files recursively
 */
function findFilesRecursive(dir, ext) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && item !== 'node_modules') {
      results.push(...findFilesRecursive(fullPath, ext));
    } else if (item.endsWith(ext)) {
      results.push(fullPath);
    }
  }

  return results;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  const result = validate({ verbose });
  process.exit(result.success ? 0 : 1);
}

module.exports = { validate, scanFile, crossPlatformPatterns };
