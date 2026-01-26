#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT_DIR, 'plugins');

const errors = [];
const PLUGINS_ROOT = path.resolve(PLUGINS_DIR);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeString(value) {
  return value.replace(/\\'/g, "'");
}

function isPathWithin(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJson(filePath, label) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    errors.push(`${label}: ${err.message}`);
    return null;
  }
}

function listPluginDirs() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    errors.push('plugins/: directory not found');
    return [];
  }
  return fs.readdirSync(PLUGINS_DIR)
    .filter(name => fs.statSync(path.join(PLUGINS_DIR, name)).isDirectory());
}

function extractArrayBlock(content, variableName) {
  const namePattern = escapeRegExp(variableName);
  const assignmentRegex = new RegExp(`\\b(?:const|let|var)\\s+${namePattern}\\s*=\\s*\\[`, 'm');
  const match = assignmentRegex.exec(content);
  if (!match) return null;
  const openIndex = content.indexOf('[', match.index);
  if (openIndex === -1) return null;

  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (ch === '[') depth += 1;
    if (ch === ']') depth -= 1;
    if (depth === 0) {
      return content.slice(openIndex + 1, i);
    }
  }

  return null;
}

function extractStringArray(content, variableName) {
  const block = extractArrayBlock(content, variableName);
  if (!block) return null;
  const regex = /'((?:\\.|[^'\\])*)'/g;
  return [...block.matchAll(regex)].map(match => decodeString(match[1]));
}

function extractCommandMappings(content) {
  const block = extractArrayBlock(content, 'commandMappings');
  if (!block) return null;
  const entries = [];
  const regex = /\[\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*\]/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    entries.push({
      target: decodeString(match[1]),
      plugin: decodeString(match[2]),
      source: decodeString(match[3])
    });
  }
  return entries;
}

function extractSkillMappings(content) {
  const block = extractArrayBlock(content, 'skillMappings');
  if (!block) return null;
  const entries = [];
  const regex = /\[\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*\]/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    entries.push({
      skill: decodeString(match[1]),
      plugin: decodeString(match[2]),
      source: decodeString(match[3])
    });
  }
  return entries;
}

function normalizeList(list) {
  return [...new Set(list)].sort();
}

function compareLists(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const missing = expected.filter(item => !actualSet.has(item));
  const extra = actual.filter(item => !expectedSet.has(item));

  if (missing.length > 0) {
    errors.push(`${label}: missing ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    errors.push(`${label}: extra ${extra.join(', ')}`);
  }
}

function parseRoleBasedAgents() {
  const auditPath = path.join(ROOT_DIR, 'plugins', 'audit-project', 'commands', 'audit-project.md');
  if (!fs.existsSync(auditPath)) {
    errors.push('audit-project.md not found for role-based agents');
    return [];
  }

  const content = fs.readFileSync(auditPath, 'utf8');
  const sectionStart = content.indexOf('### Agent Selection');
  if (sectionStart === -1) {
    errors.push('Agent Selection section missing in audit-project.md');
    return [];
  }
  const section = content.slice(sectionStart);
  const phaseIndex = section.indexOf('## Phase 2');
  const selectionSection = phaseIndex === -1 ? section : section.slice(0, phaseIndex);

  const matches = [...selectionSection.matchAll(/- `([^`]+)`/g)].map(match => match[1]);
  return normalizeList(matches);
}

function listPluginsWithAgents() {
  const plugins = listPluginDirs();
  const pluginsWithAgents = [];
  for (const plugin of plugins) {
    const agentsDir = path.join(PLUGINS_DIR, plugin, 'agents');
    if (!fs.existsSync(agentsDir)) continue;
    const hasAgents = fs.readdirSync(agentsDir).some(file => file.endsWith('.md'));
    if (hasAgents) pluginsWithAgents.push(plugin);
  }
  return normalizeList(pluginsWithAgents);
}

function validateVersions() {
  const pkg = readJson(path.join(ROOT_DIR, 'package.json'), 'package.json');
  const rootPlugin = readJson(path.join(ROOT_DIR, '.claude-plugin', 'plugin.json'), '.claude-plugin/plugin.json');
  const marketplace = readJson(path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json'), '.claude-plugin/marketplace.json');

  if (!pkg || !rootPlugin || !marketplace) return;
  const version = pkg.version;

  if (rootPlugin.version !== version) {
    errors.push(`root plugin.json version ${rootPlugin.version} does not match package.json ${version}`);
  }
  if (marketplace.version !== version) {
    errors.push(`marketplace.json version ${marketplace.version} does not match package.json ${version}`);
  }

  for (const plugin of marketplace.plugins || []) {
    if (plugin.version !== version) {
      errors.push(`marketplace.json plugin ${plugin.name} version ${plugin.version} does not match package.json ${version}`);
    }
  }

  const pluginDirs = listPluginDirs();
  for (const plugin of pluginDirs) {
    const pluginJsonPath = path.join(PLUGINS_DIR, plugin, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
      errors.push(`${plugin}: missing .claude-plugin/plugin.json`);
      continue;
    }
    const pluginJson = readJson(pluginJsonPath, `${plugin} plugin.json`);
    if (pluginJson && pluginJson.version !== version) {
      errors.push(`${plugin} plugin.json version ${pluginJson.version} does not match package.json ${version}`);
    }
  }

  const mcpPath = path.join(ROOT_DIR, 'mcp-server', 'index.js');
  if (fs.existsSync(mcpPath)) {
    const mcpContent = fs.readFileSync(mcpPath, 'utf8');
    const match = mcpContent.match(/version:\s*'([^']+)'/);
    if (!match) {
      errors.push('mcp-server/index.js version not found');
    } else if (match[1] !== version) {
      errors.push(`mcp-server/index.js version ${match[1]} does not match package.json ${version}`);
    }
  }
}

function validateMappings() {
  const cliPath = path.join(ROOT_DIR, 'bin', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    errors.push('bin/cli.js not found');
    return;
  }
  const cliContent = fs.readFileSync(cliPath, 'utf8');

  const cliPlugins = extractStringArray(cliContent, 'plugins');
  if (!cliPlugins || cliPlugins.length === 0) {
    errors.push('bin/cli.js plugins array not found');
  }

  const commandMappings = extractCommandMappings(cliContent);
  if (!commandMappings || commandMappings.length === 0) {
    errors.push('bin/cli.js commandMappings not found');
  }

  const skillMappings = extractSkillMappings(cliContent);
  if (!skillMappings || skillMappings.length === 0) {
    errors.push('bin/cli.js skillMappings not found');
  }

  const pluginDirs = normalizeList(listPluginDirs());
  const marketplace = readJson(path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json'), 'marketplace.json');
  const marketplacePlugins = normalizeList((marketplace?.plugins || []).map(p => p.name));

  if (cliPlugins) {
    compareLists('CLI plugin list vs plugins/', pluginDirs, normalizeList(cliPlugins));
  }
  if (marketplacePlugins.length > 0) {
    compareLists('Marketplace plugins vs plugins/', pluginDirs, marketplacePlugins);
  }
  if (cliPlugins && marketplacePlugins.length > 0) {
    compareLists('Marketplace plugins vs CLI plugin list', marketplacePlugins, normalizeList(cliPlugins));
  }

  const agentsPlugins = listPluginsWithAgents();
  const openCodeAgentPlugins = extractStringArray(cliContent, 'pluginDirs');
  if (openCodeAgentPlugins && openCodeAgentPlugins.length > 0) {
    const normalized = normalizeList(openCodeAgentPlugins);
    const missing = agentsPlugins.filter(plugin => !normalized.includes(plugin));
    if (missing.length > 0) {
      errors.push(`OpenCode agent plugins missing: ${missing.join(', ')}`);
    }
  }

  if (commandMappings) {
    const seenTargets = new Set();
    for (const entry of commandMappings) {
      if (seenTargets.has(entry.target)) {
        errors.push(`commandMappings duplicate target: ${entry.target}`);
      }
      seenTargets.add(entry.target);

      const srcPath = path.join(PLUGINS_DIR, entry.plugin, 'commands', entry.source);
      const resolvedPath = path.resolve(srcPath);
      if (!isPathWithin(PLUGINS_ROOT, resolvedPath)) {
        errors.push(`commandMappings path traversal: ${entry.plugin}/${entry.source}`);
        continue;
      }
      if (!fs.existsSync(resolvedPath)) {
        errors.push(`commandMappings missing source: ${entry.plugin}/${entry.source}`);
      }
    }
  }

  if (skillMappings && commandMappings) {
    const commandMapSet = new Set(commandMappings.map(entry => `${entry.plugin}/${entry.source}`));
    const seenSkills = new Set();
    for (const entry of skillMappings) {
      if (seenSkills.has(entry.skill)) {
        errors.push(`skillMappings duplicate skill: ${entry.skill}`);
      }
      seenSkills.add(entry.skill);

      const srcPath = path.join(PLUGINS_DIR, entry.plugin, 'commands', entry.source);
      const resolvedPath = path.resolve(srcPath);
      if (!isPathWithin(PLUGINS_ROOT, resolvedPath)) {
        errors.push(`skillMappings path traversal: ${entry.plugin}/${entry.source}`);
        continue;
      }
      if (!fs.existsSync(resolvedPath)) {
        errors.push(`skillMappings missing source: ${entry.plugin}/${entry.source}`);
      }
      if (!commandMapSet.has(`${entry.plugin}/${entry.source}`)) {
        errors.push(`skillMappings entry not in commandMappings: ${entry.plugin}/${entry.source}`);
      }
    }
  }
}

function validateAgentCounts() {
  const fileBasedCount = listPluginsWithAgents()
    .map(plugin => {
      const agentsDir = path.join(PLUGINS_DIR, plugin, 'agents');
      return fs.readdirSync(agentsDir).filter(file => file.endsWith('.md')).length;
    })
    .reduce((sum, count) => sum + count, 0);

  const roleBasedAgents = parseRoleBasedAgents();
  const roleBasedCount = roleBasedAgents.length;
  const totalCount = fileBasedCount + roleBasedCount;

  const agentsDocPath = path.join(ROOT_DIR, 'docs', 'reference', 'AGENTS.md');
  const docsIndexPath = path.join(ROOT_DIR, 'docs', 'README.md');
  const readmePath = path.join(ROOT_DIR, 'README.md');

  if (fs.existsSync(agentsDocPath)) {
    const content = fs.readFileSync(agentsDocPath, 'utf8');
    const totalMatch = content.match(/<!--\s*AGENT_COUNT_TOTAL:\s*(\d+)\s*-->/)
      || content.match(/\*\*TL;DR:\*\*\s*(\d+) agents/);
    const fileMatch = content.match(/<!--\s*AGENT_COUNT_FILE_BASED:\s*(\d+)\s*-->/)
      || content.match(/File-based agents(?:\*\*)?\s*\((\d+)\)/);
    const roleMatch = content.match(/<!--\s*AGENT_COUNT_ROLE_BASED:\s*(\d+)\s*-->/)
      || content.match(/Role-based agents(?:\*\*)?\s*\((\d+)\)/);

    if (!totalMatch || Number(totalMatch[1]) !== totalCount) {
      errors.push(`docs/reference/AGENTS.md total count mismatch (${totalMatch ? totalMatch[1] : 'missing'} vs ${totalCount})`);
    }
    if (!fileMatch || Number(fileMatch[1]) !== fileBasedCount) {
      errors.push(`docs/reference/AGENTS.md file-based count mismatch (${fileMatch ? fileMatch[1] : 'missing'} vs ${fileBasedCount})`);
    }
    if (!roleMatch || Number(roleMatch[1]) !== roleBasedCount) {
      errors.push(`docs/reference/AGENTS.md role-based count mismatch (${roleMatch ? roleMatch[1] : 'missing'} vs ${roleBasedCount})`);
    }
  }

  if (fs.existsSync(docsIndexPath)) {
    const content = fs.readFileSync(docsIndexPath, 'utf8');
    const match = content.match(/<!--\s*AGENT_COUNT_TOTAL:\s*(\d+)\s*-->/)
      || content.match(/All\s+(\d+)\s+agents/);
    if (!match || Number(match[1]) !== totalCount) {
      errors.push(`docs/README.md agent count mismatch (${match ? match[1] : 'missing'} vs ${totalCount})`);
    }
  }

  if (fs.existsSync(readmePath)) {
    const content = fs.readFileSync(readmePath, 'utf8');
    const match = content.match(/<!--\s*AGENT_COUNT_ROLE_BASED:\s*(\d+)\s*-->/)
      || content.match(/Up to\s+(\d+)\s+specialized role-based agents/);
    if (!match || Number(match[1]) !== roleBasedCount) {
      errors.push(`README.md role-based agent count mismatch (${match ? match[1] : 'missing'} vs ${roleBasedCount})`);
    }
  }
}

function main() {
  console.log('Repository Consistency Validator');
  console.log('===============================\n');

  validateVersions();
  validateMappings();
  validateAgentCounts();

  if (errors.length > 0) {
    console.log('❌ Consistency checks failed:\n');
    errors.forEach(error => console.log(`- ${error}`));
    process.exit(1);
  }

  console.log('✅ Repository consistency checks passed');
}

main();
