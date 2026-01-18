#!/usr/bin/env node
/**
 * Convert Claude Code agent markdown files to OpenCode/Codex formats
 *
 * Usage:
 *   node scripts/convert-agents.js --target opencode --input path/to/agent.md --output path/to/output.json
 *   node scripts/convert-agents.js --target codex --input path/to/agent.md --output path/to/output.yaml
 */

const fs = require('fs').promises;
const path = require('path');

// Check for js-yaml dependency early
let yaml;
try {
  yaml = require('js-yaml');
} catch (error) {
  console.error('Error: js-yaml is not installed');
  console.error('Run: npm install js-yaml');
  process.exit(1);
}

/**
 * Parse YAML frontmatter from markdown file
 * @param {string} content - Markdown content
 * @returns {Object} Parsed frontmatter and body
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]+?)\n---\s*\n([\s\S]*)/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = yaml.load(match[1]);
    const body = match[2];
    return { frontmatter, body };
  } catch (error) {
    console.error('Error parsing YAML frontmatter:', error.message);
    return { frontmatter: {}, body: content };
  }
}

/**
 * Convert to OpenCode format
 * @param {Object} frontmatter - Parsed frontmatter
 * @param {string} body - Markdown body
 * @returns {Object} OpenCode agent configuration
 */
function convertToOpenCode(frontmatter, body) {
  return {
    version: '1.0',
    name: frontmatter.name || 'unnamed-agent',
    description: frontmatter.description || '',
    model: frontmatter.model || 'default',
    capabilities: {
      tools: frontmatter.tools || [],
      permissions: frontmatter.permissions || []
    },
    behavior: {
      instructions: body,
      temperature: frontmatter.temperature || 0.7,
      maxTokens: frontmatter.maxTokens || 4096
    },
    metadata: {
      category: frontmatter.category || 'general',
      tags: frontmatter.tags || [],
      author: frontmatter.author || 'awesome-slash',
      created: new Date().toISOString()
    }
  };
}

/**
 * Convert to Codex format
 * @param {Object} frontmatter - Parsed frontmatter
 * @param {string} body - Markdown body
 * @returns {Object} Codex agent configuration
 */
function convertToCodex(frontmatter, body) {
  return {
    apiVersion: 'v1',
    kind: 'Agent',
    metadata: {
      name: frontmatter.name || 'unnamed-agent',
      namespace: 'awesome-slash',
      labels: {
        app: 'awesome-slash',
        model: frontmatter.model || 'default'
      }
    },
    spec: {
      description: frontmatter.description || '',
      model: {
        provider: 'openai',
        name: frontmatter.model || 'gpt-4',
        temperature: frontmatter.temperature || 0.7,
        maxTokens: frontmatter.maxTokens || 4096
      },
      tools: frontmatter.tools || [],
      instructions: body,
      context: {
        files: frontmatter.context?.files || [],
        variables: frontmatter.context?.variables || {}
      }
    }
  };
}

/**
 * Main conversion function
 */
async function main() {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const inputIndex = args.indexOf('--input');
  const outputIndex = args.indexOf('--output');

  if (targetIndex === -1 || inputIndex === -1) {
    console.error('Usage: node convert-agents.js --target <opencode|codex> --input <path> [--output <path>]');
    process.exit(1);
  }

  const target = args[targetIndex + 1];
  const inputPath = args[inputIndex + 1];
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

  if (!['opencode', 'codex'].includes(target)) {
    console.error('Error: Target must be either "opencode" or "codex"');
    process.exit(1);
  }

  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    let result;
    let outputFormat;

    if (target === 'opencode') {
      result = convertToOpenCode(frontmatter, body);
      outputFormat = 'json';
    } else {
      result = convertToCodex(frontmatter, body);
      outputFormat = 'yaml';
    }

    let outputContent;
    if (outputFormat === 'json') {
      outputContent = JSON.stringify(result, null, 2);
    } else {
      outputContent = yaml.dump(result, { indent: 2 });
    }

    if (outputPath) {
      await fs.writeFile(outputPath, outputContent);
      console.log(`✓ Converted ${inputPath} to ${target} format`);
      console.log(`  Output: ${outputPath}`);
    } else {
      console.log(outputContent);
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle batch conversion mode
async function batchConvert() {
  const args = process.argv.slice(2);
  const target = args[args.indexOf('--target') + 1];
  const inputDir = args[args.indexOf('--input-dir') + 1];
  const outputDir = args[args.indexOf('--output-dir') + 1];

  if (!target || !inputDir || !outputDir) {
    console.error('Batch mode requires: --target <opencode|codex> --input-dir <path> --output-dir <path>');
    process.exit(1);
  }

  try {
    await fs.mkdir(outputDir, { recursive: true });

    const stats = await fs.stat(outputDir);
    if (!stats.isDirectory()) {
      throw new Error(`${outputDir} exists but is not a directory`);
    }

    const files = await fs.readdir(inputDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    console.log(`Converting ${mdFiles.length} agent files to ${target} format...`);

    for (const file of mdFiles) {
      const inputPath = path.join(inputDir, file);
      const outputExt = target === 'opencode' ? '.json' : '.yaml';
      const outputName = file.replace('.md', outputExt);
      const outputPath = path.join(outputDir, outputName);

      try {
        const content = await fs.readFile(inputPath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);

        let result;
        if (target === 'opencode') {
          result = convertToOpenCode(frontmatter, body);
        } else {
          result = convertToCodex(frontmatter, body);
        }

        const outputContent = target === 'opencode'
          ? JSON.stringify(result, null, 2)
          : yaml.dump(result, { indent: 2 });

        await fs.writeFile(outputPath, outputContent);
        console.log(`  ✓ ${file} → ${outputName}`);

      } catch (error) {
        console.error(`  ✗ ${file}: ${error.message}`);
      }
    }

    console.log(`\nConversion complete! Output in: ${outputDir}`);

  } catch (error) {
    console.error(`Batch conversion error: ${error.message}`);
    process.exit(1);
  }
}

// No need for checkDependencies as we check at the top
if (process.argv.includes('--batch')) {
  batchConvert().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
} else {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}