#!/usr/bin/env node
/**
 * Validate plugin structure
 * Ensures all plugins have required files and valid configuration
 */

const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const REQUIRED_FILES = ['.claude-plugin/plugin.json'];

let errors = [];
let validated = 0;

// Get all plugin directories
const plugins = fs.readdirSync(PLUGINS_DIR).filter(f => {
  const stat = fs.statSync(path.join(PLUGINS_DIR, f));
  return stat.isDirectory();
});

console.log(`Validating ${plugins.length} plugins...\n`);

for (const plugin of plugins) {
  const pluginPath = path.join(PLUGINS_DIR, plugin);

  // Check required files
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(pluginPath, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`${plugin}: missing ${file}`);
      continue;
    }

    // Validate plugin.json
    if (file.endsWith('plugin.json')) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);

        if (!json.name) {
          errors.push(`${plugin}: plugin.json missing 'name'`);
        }
        if (!json.version) {
          errors.push(`${plugin}: plugin.json missing 'version'`);
        }
      } catch (e) {
        errors.push(`${plugin}: invalid plugin.json - ${e.message}`);
      }
    }
  }

  // Check for at least one of: commands, agents, skills, hooks
  const hasCommands = fs.existsSync(path.join(pluginPath, 'commands'));
  const hasAgents = fs.existsSync(path.join(pluginPath, 'agents'));
  const hasSkills = fs.existsSync(path.join(pluginPath, 'skills'));
  const hasHooks = fs.existsSync(path.join(pluginPath, 'hooks'));

  if (!hasCommands && !hasAgents && !hasSkills && !hasHooks) {
    errors.push(`${plugin}: no commands, agents, skills, or hooks found`);
  }

  validated++;
  console.log(`  ✓ ${plugin}`);
}

console.log('');

if (errors.length > 0) {
  console.error('Validation errors:');
  errors.forEach(e => console.error(`  ✗ ${e}`));
  process.exit(1);
}

console.log(`All ${validated} plugins valid.`);
