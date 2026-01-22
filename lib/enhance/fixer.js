/**
 * Plugin Analysis Fixer
 * Applies auto-fixes for HIGH certainty issues
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

/**
 * Apply fixes for issues that have autoFixFn
 * @param {Array} issues - Array of issues with potential fixes
 * @param {Object} options - Fix options
 * @param {boolean} options.dryRun - Show changes without applying
 * @param {boolean} options.backup - Create backup files
 * @returns {Object} Fix results
 */
function applyFixes(issues, options = {}) {
  const { dryRun = false, backup = true } = options;

  const results = {
    applied: [],
    skipped: [],
    errors: []
  };

  // Auto-fixable pattern IDs for markdown files (agent analysis)
  const markdownAutoFixPatternIds = [
    'missing_frontmatter',
    'unrestricted_bash',
    'missing_role'
  ];

  // Filter to only HIGH certainty issues that are auto-fixable
  // Includes: JSON issues with autoFixFn OR markdown issues with known pattern IDs
  const fixableIssues = issues.filter(i =>
    i.certainty === 'HIGH' &&
    (i.filePath || i.file) &&
    (i.autoFixFn || markdownAutoFixPatternIds.includes(i.patternId))
  );

  // Group by file to minimize reads/writes
  const byFile = new Map();
  for (const issue of fixableIssues) {
    const fp = issue.filePath || issue.file;
    if (!byFile.has(fp)) {
      byFile.set(fp, []);
    }
    byFile.get(fp).push(issue);
  }

  // Process each file
  for (const [filePath, fileIssues] of byFile) {
    try {
      // Read current content
      if (!fs.existsSync(filePath)) {
        results.errors.push({ filePath, error: 'File not found' });
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let data;

      // Parse based on file type
      if (filePath.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (filePath.endsWith('.md')) {
        // Markdown files - handle specially
        data = content;
      } else {
        // For other files, skip auto-fix
        results.skipped.push(...fileIssues.map(i => ({
          ...i,
          reason: 'Unsupported file type - manual fix required'
        })));
        continue;
      }

      // Apply each fix
      let modified = data;
      const appliedToFile = [];

      for (const issue of fileIssues) {
        try {
          // Determine what part of data to fix
          if (filePath.endsWith('.md')) {
            // Markdown-specific fixes
            if (issue.patternId === 'missing_frontmatter') {
              modified = fixMissingFrontmatter(modified);
            } else if (issue.patternId === 'unrestricted_bash') {
              modified = fixUnrestrictedBash(modified);
            } else if (issue.patternId === 'missing_role') {
              modified = fixMissingRole(modified);
            } else {
              // No auto-fix available for this markdown issue
              continue;
            }
          } else if (issue.schemaPath) {
            // Fix at specific path in the data
            modified = applyAtPath(modified, issue.schemaPath, issue.autoFixFn);
          } else {
            // Apply to root
            modified = issue.autoFixFn(modified);
          }

          appliedToFile.push({
            issue: issue.issue,
            fix: issue.fix,
            filePath
          });
        } catch (err) {
          results.errors.push({
            issue: issue.issue,
            filePath,
            error: err.message
          });
        }
      }

      // Write changes
      if (!dryRun && appliedToFile.length > 0) {
        // Create backup
        if (backup) {
          const backupPath = `${filePath}.backup`;
          fs.writeFileSync(backupPath, content, 'utf8');
        }

        // Write modified content
        let newContent;
        if (filePath.endsWith('.md')) {
          newContent = modified; // Already a string
        } else {
          newContent = JSON.stringify(modified, null, 2);
        }
        fs.writeFileSync(filePath, newContent, 'utf8');
      }

      results.applied.push(...appliedToFile);

    } catch (err) {
      results.errors.push({
        filePath,
        error: err.message
      });
    }
  }

  // Add non-fixable issues to skipped
  const nonFixable = issues.filter(i =>
    i.certainty !== 'HIGH' || !autoFixablePatternIds.includes(i.patternId)
  );
  results.skipped.push(...nonFixable.map(i => ({
    ...i,
    reason: i.certainty !== 'HIGH' ? 'Not HIGH certainty' : 'No auto-fix available for this pattern'
  })));

  return results;
}

/**
 * Apply a fix function at a specific path in an object
 * @private
 */
function applyAtPath(obj, pathStr, fixFn) {
  const parts = pathStr.split('.');
  const result = JSON.parse(JSON.stringify(obj)); // Deep clone

  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part.includes('[')) {
      // Array access
      const match = part.match(/(\w+)\[(\d+)\]/);
      if (match) {
        current = current[match[1]][parseInt(match[2])];
      }
    } else {
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('[')) {
    const match = lastPart.match(/(\w+)\[(\d+)\]/);
    if (match) {
      current[match[1]][parseInt(match[2])] = fixFn(current[match[1]][parseInt(match[2])]);
    }
  } else {
    current[lastPart] = fixFn(current[lastPart]);
  }

  return result;
}

/**
 * Fix missing additionalProperties in a schema
 * @param {Object} schema - JSON Schema object
 * @returns {Object} Fixed schema
 */
function fixAdditionalProperties(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const fixed = { ...schema };

  if (fixed.type === 'object' && fixed.properties) {
    fixed.additionalProperties = false;
  }

  // Recursively fix nested schemas
  if (fixed.properties) {
    fixed.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      fixed.properties[key] = fixAdditionalProperties(value);
    }
  }

  return fixed;
}

/**
 * Fix missing required array
 * @param {Object} schema - JSON Schema object
 * @returns {Object} Fixed schema
 */
function fixRequiredFields(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const fixed = { ...schema };

  if (fixed.type === 'object' && fixed.properties && !fixed.required) {
    // Add all non-optional fields to required
    fixed.required = Object.entries(fixed.properties)
      .filter(([_, prop]) => {
        // Skip if has default or marked optional in description
        if (prop.default !== undefined) return false;
        if (prop.description && /optional/i.test(prop.description)) return false;
        return true;
      })
      .map(([key]) => key);
  }

  return fixed;
}

/**
 * Fix version mismatch by syncing to package.json version
 * @param {Object} pluginJson - Plugin JSON object
 * @param {string} targetVersion - Version to sync to
 * @returns {Object} Fixed plugin JSON
 */
function fixVersionMismatch(pluginJson, targetVersion) {
  return {
    ...pluginJson,
    version: targetVersion
  };
}

/**
 * Generate a fix preview without applying
 * @param {Array} issues - Issues to preview
 * @returns {Array} Preview of changes
 */
function previewFixes(issues) {
  const previews = [];

  for (const issue of issues) {
    if (issue.certainty === 'HIGH' && issue.autoFixFn) {
      previews.push({
        filePath: issue.filePath,
        issue: issue.issue,
        fix: issue.fix,
        willApply: true
      });
    } else {
      previews.push({
        filePath: issue.filePath,
        issue: issue.issue,
        fix: issue.fix || 'No auto-fix available',
        willApply: false,
        reason: issue.certainty !== 'HIGH' ? 'Not HIGH certainty' : 'No auto-fix function'
      });
    }
  }

  return previews;
}

/**
 * Restore from backup
 * @param {string} filePath - Path to file to restore
 * @returns {boolean} True if restored successfully
 */
function restoreFromBackup(filePath) {
  const backupPath = `${filePath}.backup`;

  if (!fs.existsSync(backupPath)) {
    return false;
  }

  const backupContent = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(filePath, backupContent, 'utf8');
  fs.unlinkSync(backupPath);

  return true;
}

/**
 * Clean up backup files
 * @param {string} directory - Directory to clean
 * @returns {number} Number of backups removed
 */
function cleanupBackups(directory) {
  let count = 0;

  /**
   * Recursively find backup files
   * @param {string} dir - Directory to search
   */
  function findBackups(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      // Directory not accessible, skip
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findBackups(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.backup')) {
        try {
          fs.unlinkSync(fullPath);
          count++;
        } catch (err) {
          // File may have been removed already or not accessible
        }
      }
    }
  }

  findBackups(directory);
  return count;
}

/**
 * Fix missing frontmatter in markdown file
 * @param {string} content - Markdown content
 * @returns {string} Fixed content
 */
function fixMissingFrontmatter(content) {
  if (!content || typeof content !== 'string') return content;

  // Add minimal frontmatter template
  const template = `---
name: agent-name
description: Agent description
tools: Read, Glob, Grep
model: sonnet
---

`;

  return template + content.trim();
}

/**
 * Fix unrestricted Bash in markdown frontmatter
 * @param {string} content - Markdown content
 * @returns {string} Fixed content
 */
function fixUnrestrictedBash(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let inFrontmatter = false;

  // Find frontmatter and fix unrestricted Bash
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        break; // End of frontmatter
      }
    } else if (inFrontmatter && lines[i].startsWith('tools:')) {
      // Replace Bash with Bash(git:*)
      lines[i] = lines[i].replace(/\bBash\b(?!\()/g, 'Bash(git:*)');
    }
  }

  return lines.join('\n');
}

/**
 * Fix missing role section in markdown
 * @param {string} content - Markdown content
 * @returns {string} Fixed content
 */
function fixMissingRole(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let frontmatterEnd = -1;
  let inFrontmatter = false;

  // Find end of frontmatter
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        frontmatterEnd = i;
        break;
      }
    }
  }

  // Add role section after frontmatter
  const roleSection = `
## Your Role

You are an agent that [describe agent purpose].
`;

  if (frontmatterEnd >= 0) {
    lines.splice(frontmatterEnd + 1, 0, roleSection);
  } else {
    // No frontmatter, add at beginning
    lines.unshift(roleSection);
  }

  return lines.join('\n');
}

module.exports = {
  applyFixes,
  fixAdditionalProperties,
  fixRequiredFields,
  fixVersionMismatch,
  fixMissingFrontmatter,
  fixUnrestrictedBash,
  fixMissingRole,
  previewFixes,
  restoreFromBackup,
  cleanupBackups
};
