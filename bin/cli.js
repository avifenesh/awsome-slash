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

const REPO_URL = 'https://github.com/avifenesh/awesome-slash.git';
const VERSION = require('../package.json').version;

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

function cloneRepo(installDir) {
  console.log('Downloading awesome-slash...');
  execSync(`git clone --depth 1 ${REPO_URL} "${installDir}"`, { stdio: 'inherit' });
}

function installDependencies(installDir) {
  console.log('Installing dependencies...');
  execSync('npm install --production', { cwd: installDir, stdio: 'inherit' });
}

function installForClaude(installDir) {
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
    // Add as local marketplace
    console.log('Adding local marketplace...');
    try {
      execSync(`claude plugin marketplace add "${installDir}"`, { stdio: 'pipe' });
    } catch {
      // May already exist
    }

    // Install plugins
    const plugins = ['next-task', 'ship', 'deslop-around', 'project-review', 'reality-check'];
    for (const plugin of plugins) {
      console.log(`  Installing ${plugin}...`);
      try {
        execSync(`claude plugin install ${plugin}@awesome-slash`, { stdio: 'pipe' });
      } catch {
        // May already be installed
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

  const configPath = getConfigPath('opencode');
  const configDir = path.dirname(configPath);

  fs.mkdirSync(configDir, { recursive: true });

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

  console.log('✅ OpenCode installation complete!');
  console.log(`   Config: ${configPath}`);
  console.log('   Commands: /next-task, /ship, /deslop-around\n');
  return true;
}

function installForCodex(installDir) {
  console.log('\n📦 Installing for Codex CLI...\n');

  const home = process.env.HOME || process.env.USERPROFILE;
  const configDir = path.join(home, '.codex');
  const configPath = path.join(configDir, 'config.toml');

  fs.mkdirSync(configDir, { recursive: true });

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
env = { PLUGIN_ROOT = "${pluginRoot}", AI_STATE_DIR = ".codex" }
enabled = true
`
    );
  } else {
    configContent += `
[mcp_servers.awesome-slash]
command = "node"
args = ["${mcpPath}"]
env = { PLUGIN_ROOT = "${pluginRoot}", AI_STATE_DIR = ".codex" }
enabled = true
`;
  }

  fs.writeFileSync(configPath, configContent);

  console.log('✅ Codex CLI installation complete!');
  console.log(`   Config: ${configPath}`);
  console.log('   Commands: $next-task, $ship, $deslop-around (note: $ prefix)\n');
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

  // Download
  const installDir = getInstallDir();
  cleanOldInstallation(installDir);
  cloneRepo(installDir);
  installDependencies(installDir);

  // Install for each platform
  for (const platform of selected) {
    switch (platform) {
      case 'claude':
        installForClaude(installDir);
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
  console.log(`\nInstallation directory: ${installDir}`);
  console.log('\nTo update:  npm update -g awesome-slash');
  console.log('To remove:  npm uninstall -g awesome-slash && awesome-slash --remove');
  console.log('\nDocs: https://github.com/avifenesh/awesome-slash');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
