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

  // Filter to only HIGH certainty issues with autoFixFn
  const fixableIssues = issues.filter(i =>
    i.certainty === 'HIGH' && i.autoFixFn && i.filePath
  );

  // Group by file to minimize reads/writes
  const byFile = new Map();
  for (const issue of fixableIssues) {
    if (!byFile.has(issue.filePath)) {
      byFile.set(issue.filePath, []);
    }
    byFile.get(issue.filePath).push(issue);
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
      } else {
        // For non-JSON files, skip auto-fix
        results.skipped.push(...fileIssues.map(i => ({
          ...i,
          reason: 'Non-JSON file - manual fix required'
        })));
        continue;
      }

      // Apply each fix
      let modified = data;
      const appliedToFile = [];

      for (const issue of fileIssues) {
        try {
          // Determine what part of data to fix
          if (issue.schemaPath) {
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
        const newContent = JSON.stringify(modified, null, 2);
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
    i.certainty !== 'HIGH' || !i.autoFixFn
  );
  results.skipped.push(...nonFixable.map(i => ({
    ...i,
    reason: i.certainty !== 'HIGH' ? 'Not HIGH certainty' : 'No auto-fix available'
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

  const files = fs.readdirSync(directory, { recursive: true });
  for (const file of files) {
    if (file.endsWith('.backup')) {
      fs.unlinkSync(path.join(directory, file));
      count++;
    }
  }

  return count;
}

module.exports = {
  applyFixes,
  fixAdditionalProperties,
  fixRequiredFields,
  fixVersionMismatch,
  previewFixes,
  restoreFromBackup,
  cleanupBackups
};
