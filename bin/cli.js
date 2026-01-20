#!/usr/bin/env node
/**
 * awesome-slash CLI installer
 *
 * Install:  npm install -g awesome-slash@latest
 * Run:      awesome-slash
 * Update:   npm update -g awesome-slash
 * Remove:   npm uninstall -g awesome-slash && awesome-slash --remove
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const VERSION = require('../package.json').version;
// Use the installed npm package directory as source (no git clone needed)
const PACKAGE_DIR = path.join(__dirname, '..');

function getInstallDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.awesome-slash');
}

function getConfigPath(platform) {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (platform === 'opencode') {
    return path.join(home, '.config', 'opencode', 'opencode.json');
  }
  if (platform === 'codex') {
    return path.join(home, '.codex', 'config.toml');
  }
  return null;
}

function commandExists(cmd) {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Interactive multi-select prompt
 */
async function multiSelect(question, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const selected = new Set();

  console.log(`\n${question}\n`);
  console.log('Enter numbers separated by spaces (e.g., "1 2" or "1,2,3"), then press Enter:\n');

  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}`);
  });

  console.log();

  return new Promise((resolve) => {
    rl.question('Your selection: ', (answer) => {
      rl.close();

      // Parse input like "1 2 3" or "1,2,3" or "1, 2, 3"
      const nums = answer.split(/[\s,]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

      const result = [];
      for (const num of nums) {
        if (num >= 1 && num <= options.length) {
          result.push(options[num - 1].value);
        }
      }

      resolve([...new Set(result)]); // Dedupe
    });
  });
}

function cleanOldInstallation(installDir) {
  if (fs.existsSync(installDir)) {
    console.log('Removing previous installation...');
    fs.rmSync(installDir, { recursive: true, force: true });
  }
}

function copyFromPackage(installDir) {
  console.log('Installing awesome-slash files...');
  // Copy from npm package to ~/.awesome-slash
  fs.cpSync(PACKAGE_DIR, installDir, {
    recursive: true,
    filter: (src) => {
      // Skip node_modules and .git directories
      const basename = path.basename(src);
      return basename !== 'node_modules' && basename !== '.git';
    }
  });
}

function installDependencies(installDir) {
  console.log('Installing dependencies...');
  execSync('npm install --production', { cwd: installDir, stdio: 'inherit' });

  // Also install MCP server dependencies
  const mcpDir = path.join(installDir, 'mcp-server');
  if (fs.existsSync(path.join(mcpDir, 'package.json'))) {
    console.log('Installing MCP server dependencies...');
    execSync('npm install --production', { cwd: mcpDir, stdio: 'inherit' });
  }
}

function installForClaude() {
  console.log('\n📦 Installing for Claude Code...\n');

  if (!commandExists('claude')) {
    console.log('⚠️  Claude Code CLI not detected.');
    console.log('   Install it first: https://claude.ai/code\n');
    console.log('   Then run in Claude Code:');
    console.log('   /plugin marketplace add avifenesh/awesome-slash');
    console.log('   /plugin install next-task@awesome-slash\n');
    return false;
  }

  try {
    // Add GitHub marketplace
    console.log('Adding marketplace...');
    try {
      execSync('claude plugin marketplace add avifenesh/awesome-slash', { stdio: 'pipe' });
    } catch {
      // May already exist
    }

    // Install or update plugins
    const plugins = ['next-task', 'ship', 'deslop-around', 'project-review', 'reality-check'];
    for (const plugin of plugins) {
      console.log(`  Installing ${plugin}...`);
      try {
        // Try install first
        execSync(`claude plugin install ${plugin}@awesome-slash`, { stdio: 'pipe' });
      } catch {
        // If install fails (already installed), try update
        try {
          execSync(`claude plugin update ${plugin}@awesome-slash`, { stdio: 'pipe' });
        } catch {
          // Ignore if update also fails
        }
      }
    }

    console.log('\n✅ Claude Code installation complete!\n');
    console.log('Commands: /next-task, /ship, /deslop-around, /project-review, /reality-check:scan');
    return true;
  } catch (err) {
    console.log('❌ Auto-install failed. Manual installation:');
    console.log('   /plugin marketplace add avifenesh/awesome-slash');
    console.log('   /plugin install next-task@awesome-slash');
    return false;
  }
}

function installForOpenCode(installDir) {
  console.log('\n📦 Installing for OpenCode...\n');

  const home = process.env.HOME || process.env.USERPROFILE;
  // Commands go to ~/.opencode/commands/awesome-slash/
  const commandsDir = path.join(home, '.opencode', 'commands', 'awesome-slash');
  // MCP config goes to ~/.config/opencode/opencode.json
  const configPath = getConfigPath('opencode');
  const configDir = path.dirname(configPath);

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });

  // Update MCP config
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  config.mcp = config.mcp || {};
  config.mcp['awesome-slash'] = {
    type: 'local',
    command: ['node', path.join(installDir, 'mcp-server', 'index.js')],
    environment: {
      PLUGIN_ROOT: installDir,
      AI_STATE_DIR: '.opencode'
    },
    enabled: true
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Remove old/deprecated command files
  const oldCommands = ['reality-check-set.md', 'pr-merge.md'];
  for (const oldCmd of oldCommands) {
    const oldPath = path.join(commandsDir, oldCmd);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
      console.log(`  Removed deprecated: ${oldCmd}`);
    }
  }

  // Also clean up old wrong location if it exists
  const wrongDir = path.join(home, '.config', 'opencode', 'commands');
  if (fs.existsSync(wrongDir)) {
    fs.rmSync(wrongDir, { recursive: true, force: true });
  }

  // Sync command files (matching install.sh mappings)
  const commandMappings = [
    ['deslop-around.md', 'deslop-around', 'deslop-around.md'],
    ['next-task.md', 'next-task', 'next-task.md'],
    ['delivery-approval.md', 'next-task', 'delivery-approval.md'],
    ['update-docs-around.md', 'next-task', 'update-docs-around.md'],
    ['project-review.md', 'project-review', 'project-review.md'],
    ['ship.md', 'ship', 'ship.md'],
    ['reality-check-scan.md', 'reality-check', 'scan.md']
  ];

  for (const [target, plugin, source] of commandMappings) {
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', source);
    const destPath = path.join(commandsDir, target);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log('✅ OpenCode installation complete!');
  console.log(`   Config: ${configPath}`);
  console.log(`   Commands: ${commandsDir}`);
  console.log('   MCP tools: workflow_start, workflow_status, workflow_resume, task_discover, review_code\n');
  return true;
}

function installForCodex(installDir) {
  console.log('\n📦 Installing for Codex CLI...\n');

  const home = process.env.HOME || process.env.USERPROFILE;
  const configDir = path.join(home, '.codex');
  const configPath = path.join(configDir, 'config.toml');
  const skillsDir = path.join(configDir, 'skills');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // Update MCP config
  const mcpPath = path.join(installDir, 'mcp-server', 'index.js').replace(/\\/g, '\\\\');
  const pluginRoot = installDir.replace(/\\/g, '\\\\');

  let configContent = '';
  if (fs.existsSync(configPath)) {
    configContent = fs.readFileSync(configPath, 'utf8');
  }

  if (configContent.includes('[mcp_servers.awesome-slash]')) {
    configContent = configContent.replace(
      /\[mcp_servers\.awesome-slash\][\s\S]*?(?=\n\[|$)/,
      `[mcp_servers.awesome-slash]
command = "node"
args = ["${mcpPath}"]

[mcp_servers.awesome-slash.env]
PLUGIN_ROOT = "${pluginRoot}"
AI_STATE_DIR = ".codex"
`
    );
  } else {
    configContent += `
[mcp_servers.awesome-slash]
command = "node"
args = ["${mcpPath}"]

[mcp_servers.awesome-slash.env]
PLUGIN_ROOT = "${pluginRoot}"
AI_STATE_DIR = ".codex"
`;
  }

  fs.writeFileSync(configPath, configContent);

  // Remove old/deprecated prompts directory if it exists
  const oldPromptsDir = path.join(configDir, 'prompts');
  if (fs.existsSync(oldPromptsDir)) {
    const oldFiles = ['next-task.md', 'ship.md', 'deslop-around.md', 'project-review.md',
                      'reality-check-scan.md', 'delivery-approval.md', 'update-docs-around.md',
                      'reality-check-set.md', 'pr-merge.md'];
    for (const file of oldFiles) {
      const oldPath = path.join(oldPromptsDir, file);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        console.log(`  Removed old prompt: ${file}`);
      }
    }
  }

  // Remove old/deprecated skills
  const oldSkillDirs = ['deslop', 'review', 'reality-check-set', 'pr-merge'];
  for (const dir of oldSkillDirs) {
    const oldPath = path.join(skillsDir, dir);
    if (fs.existsSync(oldPath)) {
      fs.rmSync(oldPath, { recursive: true, force: true });
      console.log(`  Removed deprecated skill: ${dir}`);
    }
  }

  // Skill mappings: [skillName, plugin, sourceFile, description]
  // Codex skills require SKILL.md with name and description in YAML frontmatter
  const skillMappings = [
    ['next-task', 'next-task', 'next-task.md', 'Master workflow orchestrator with autonomous task-to-production automation'],
    ['ship', 'ship', 'ship.md', 'Complete PR workflow from commit to production with validation'],
    ['deslop-around', 'deslop-around', 'deslop-around.md', 'AI slop cleanup with minimal diffs and behavior preservation'],
    ['project-review', 'project-review', 'project-review.md', 'Multi-agent iterative code review until zero issues remain'],
    ['reality-check-scan', 'reality-check', 'scan.md', 'Deep repository analysis to detect plan drift and code reality gaps'],
    ['delivery-approval', 'next-task', 'delivery-approval.md', 'Validate task completion and approve for shipping'],
    ['update-docs-around', 'next-task', 'update-docs-around.md', 'Sync documentation with actual code state']
  ];

  for (const [skillName, plugin, sourceFile, description] of skillMappings) {
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', sourceFile);
    const skillDir = path.join(skillsDir, skillName);
    const destPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(srcPath)) {
      // Create skill directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Read source file and transform to SKILL.md format
      let content = fs.readFileSync(srcPath, 'utf8');

      // Check if file has existing YAML frontmatter
      if (content.startsWith('---')) {
        // Replace existing frontmatter with Codex-compatible format
        content = content.replace(
          /^---\n[\s\S]*?\n---\n/,
          `---\nname: ${skillName}\ndescription: ${description}\n---\n`
        );
      } else {
        // Add new frontmatter
        content = `---\nname: ${skillName}\ndescription: ${description}\n---\n\n${content}`;
      }

      fs.writeFileSync(destPath, content);
      console.log(`  ✓ Installed skill: ${skillName}`);
    }
  }

  console.log('\n✅ Codex CLI installation complete!');
  console.log(`   Config: ${configPath}`);
  console.log(`   Skills: ${skillsDir}`);
  console.log('   Access via: $next-task, $ship, $deslop-around, etc.');
  console.log('   MCP tools: workflow_start, workflow_status, workflow_resume, task_discover, review_code\n');
  return true;
}

function removeInstallation() {
  const installDir = getInstallDir();

  if (!fs.existsSync(installDir)) {
    console.log('Nothing to remove. awesome-slash is not installed.');
    return;
  }

  console.log('Removing awesome-slash...');
  fs.rmSync(installDir, { recursive: true, force: true });

  console.log('\n✅ Removed ~/.awesome-slash');
  console.log('\nNote: MCP configs in OpenCode/Codex are not removed.');
  console.log('To fully uninstall, also remove:');
  console.log('  - Claude: /plugin marketplace remove awesome-slash');
  console.log('  - OpenCode: Remove "awesome-slash" from ~/.config/opencode/opencode.json');
  console.log('  - Codex: Remove [mcp_servers.awesome-slash] from ~/.codex/config.toml');
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --remove / --uninstall
  if (args.includes('--remove') || args.includes('--uninstall')) {
    removeInstallation();
    return;
  }

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`awesome-slash v${VERSION}`);
    return;
  }

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
awesome-slash v${VERSION}

Install:
  npm install -g awesome-slash@latest
  awesome-slash

Update:
  npm update -g awesome-slash

Remove:
  npm uninstall -g awesome-slash
  awesome-slash --remove

For Claude Code (recommended):
  /plugin marketplace add avifenesh/awesome-slash
  /plugin install next-task@awesome-slash
`);
    return;
  }

  console.log(`
┌─────────────────────────────────────────┐
│     awesome-slash installer v${VERSION}     │
│                                         │
│  Workflow automation for AI assistants  │
└─────────────────────────────────────────┘
`);

  // Multi-select platforms
  const options = [
    { value: 'claude', label: 'Claude Code' },
    { value: 'opencode', label: 'OpenCode' },
    { value: 'codex', label: 'Codex CLI' }
  ];

  const selected = await multiSelect(
    'Which platforms do you want to install for?',
    options
  );

  if (selected.length === 0) {
    console.log('\nNo platforms selected. Exiting.');
    console.log('\nFor Claude Code, you can also install directly:');
    console.log('  /plugin marketplace add avifenesh/awesome-slash');
    process.exit(0);
  }

  console.log(`\nInstalling for: ${selected.join(', ')}\n`);

  // Only copy to ~/.awesome-slash if OpenCode or Codex selected (they need local files)
  const needsLocalInstall = selected.includes('opencode') || selected.includes('codex');
  let installDir = null;

  if (needsLocalInstall) {
    installDir = getInstallDir();
    cleanOldInstallation(installDir);
    copyFromPackage(installDir);
    installDependencies(installDir);
  }

  // Install for each platform
  for (const platform of selected) {
    switch (platform) {
      case 'claude':
        installForClaude();
        break;
      case 'opencode':
        installForOpenCode(installDir);
        break;
      case 'codex':
        installForCodex(installDir);
        break;
    }
  }

  console.log('─'.repeat(45));
  if (installDir) {
    console.log(`\nInstallation directory: ${installDir}`);
  }
  console.log('\nTo update:  npm update -g awesome-slash');
  console.log('To remove:  npm uninstall -g awesome-slash && awesome-slash --remove');
  console.log('\nDocs: https://github.com/avifenesh/awesome-slash');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
