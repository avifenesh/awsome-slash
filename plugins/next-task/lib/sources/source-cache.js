/**
 * Source Cache
 * File-based persistence for task source preferences
 *
 * @module lib/sources/source-cache
 */

const fs = require('fs');
const path = require('path');

const SOURCES_DIR = '.claude/sources';
const PREFERENCE_FILE = 'preference.json';

/**
 * Validate tool name to prevent path traversal
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if valid
 */
function isValidToolName(toolName) {
  // Prevent path traversal and shell metacharacters
  return /^[a-zA-Z0-9_-]+$/.test(toolName);
}

/**
 * Ensure sources directory exists
 * @returns {string} Path to sources directory
 */
function ensureDir() {
  if (!fs.existsSync(SOURCES_DIR)) {
    fs.mkdirSync(SOURCES_DIR, { recursive: true });
  }
  return SOURCES_DIR;
}

/**
 * Get cached source preference
 * @returns {Object|null} Preference object or null if not cached
 * @example
 * // Returns: { source: 'github' }
 * // Or: { source: 'custom', type: 'cli', tool: 'tea' }
 */
function getPreference() {
  const filePath = path.join(SOURCES_DIR, PREFERENCE_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read preference file:`, err.message);
    return null;
  }
}

/**
 * Save source preference
 * @param {Object} preference - Preference object
 * @param {string} preference.source - Source type (github, gitlab, local, custom, other)
 * @param {string} [preference.type] - For custom: mcp, cli, skill, file
 * @param {string} [preference.tool] - Tool name or path
 * @param {string} [preference.description] - For other: user's free text
 */
function savePreference(preference) {
  ensureDir();
  const filePath = path.join(SOURCES_DIR, PREFERENCE_FILE);
  fs.writeFileSync(filePath, JSON.stringify({
    ...preference,
    savedAt: new Date().toISOString()
  }, null, 2));
}

/**
 * Get cached tool capabilities (for custom sources)
 * @param {string} toolName - Tool identifier (e.g., 'tea', 'glab')
 * @returns {Object|null} Capabilities object or null
 */
function getToolCapabilities(toolName) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return null;
  }
  const filePath = path.join(SOURCES_DIR, `${toolName}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read tool capabilities for ${toolName}:`, err.message);
    return null;
  }
}

/**
 * Save tool capabilities after discovery
 * @param {string} toolName - Tool identifier
 * @param {Object} capabilities - Discovered capabilities
 * @param {string[]} capabilities.features - Available features (issues, prs, ci)
 * @param {Object} capabilities.commands - Command mappings
 */
function saveToolCapabilities(toolName, capabilities) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return;
  }
  ensureDir();
  const filePath = path.join(SOURCES_DIR, `${toolName}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    ...capabilities,
    discoveredAt: new Date().toISOString()
  }, null, 2));
}

/**
 * Clear all cached preferences
 */
function clearCache() {
  if (fs.existsSync(SOURCES_DIR)) {
    const files = fs.readdirSync(SOURCES_DIR);
    for (const file of files) {
      const filePath = path.join(SOURCES_DIR, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/**
 * Check if preference matches a specific source
 * @param {string} source - Source to check
 * @returns {boolean} True if preference matches
 */
function isPreferred(source) {
  const pref = getPreference();
  return pref?.source === source;
}

module.exports = {
  getPreference,
  savePreference,
  getToolCapabilities,
  saveToolCapabilities,
  clearCache,
  isPreferred
};
