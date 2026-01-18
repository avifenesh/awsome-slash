/**
 * Configuration Management Module
 * Centralized configuration loading and validation
 *
 * Priority (highest to lowest):
 * 1. Environment variables
 * 2. .awesomeslashrc.json (in cwd or home directory)
 * 3. package.json "awesomeSlash" field
 * 4. Defaults
 *
 * @module lib/config
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Default configuration values
 */
const DEFAULTS = {
  // Performance limits
  performance: {
    maxCachedFileSize: 64 * 1024, // 64KB
    cacheSize: 100, // Number of entries
    cacheTTL: 200, // milliseconds
    execTimeout: 5000, // milliseconds
    maxGlobWildcards: 10,
    maxMergeDepth: 50,
    maxLineNumber: 10000000
  },

  // State management
  state: {
    baseDir: '.claude',
    stateFile: '.workflow-state.json',
    schemaVersion: '2.0.0'
  },

  // Task discovery
  tasks: {
    defaultSource: 'gh-issues',
    defaultPriority: 'continue',
    defaultStoppingPoint: 'merged',
    maxTasksPerSource: 100
  },

  // Review configuration
  review: {
    maxIterations: 3,
    defaultReviewers: ['code-reviewer', 'silent-failure-hunter', 'test-analyzer']
  },

  // MCP server
  mcp: {
    serverName: 'awesome-slash',
    serverVersion: '2.0.0',
    port: null // null = stdio transport
  },

  // Security
  security: {
    enablePathValidation: true,
    enableInputSanitization: true,
    maxCommandLength: 10000
  },

  // Logging
  logging: {
    level: 'info', // 'error', 'warn', 'info', 'debug'
    enableColors: true,
    enableTimestamps: false
  }
};

/**
 * Environment variable mappings
 * Maps environment variables to configuration paths
 */
const ENV_MAPPINGS = {
  AWESOME_SLASH_CACHE_SIZE: 'performance.cacheSize',
  AWESOME_SLASH_CACHE_TTL: 'performance.cacheTTL',
  AWESOME_SLASH_EXEC_TIMEOUT: 'performance.execTimeout',
  AWESOME_SLASH_STATE_DIR: 'state.baseDir',
  AWESOME_SLASH_TASK_SOURCE: 'tasks.defaultSource',
  AWESOME_SLASH_LOG_LEVEL: 'logging.level',
  AWESOME_SLASH_MCP_PORT: 'mcp.port'
};

/**
 * Cached configuration instance
 */
let _configCache = null;
let _cacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Set a nested property using dot notation
 * @param {Object} obj - Object to modify
 * @param {string} path - Dot-separated path (e.g., 'performance.cacheSize')
 * @param {*} value - Value to set
 */
function setNestedProperty(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Get a nested property using dot notation
 * @param {Object} obj - Object to read from
 * @param {string} path - Dot-separated path
 * @returns {*} Value at path or undefined
 */
function getNestedProperty(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Load configuration from environment variables
 * @param {Object} config - Configuration object to modify
 */
function loadFromEnvironment(config) {
  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      // Parse numeric values
      const current = getNestedProperty(DEFAULTS, configPath);
      const parsed = typeof current === 'number' ? parseInt(value, 10) : value;

      if (typeof current === 'number' && isNaN(parsed)) {
        console.warn(`Invalid numeric value for ${envVar}: ${value}`);
        continue;
      }

      setNestedProperty(config, configPath, parsed);
    }
  }
}

/**
 * Load configuration from a JSON file
 * @param {string} filePath - Path to configuration file
 * @returns {Object|null} Parsed configuration or null if file doesn't exist
 */
function loadFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Size limit check (1MB max)
    if (content.length > 1024 * 1024) {
      console.warn(`Configuration file too large: ${filePath}`);
      return null;
    }

    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load configuration from ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Load configuration from all sources
 * @param {Object} options - Loading options
 * @param {boolean} options.useCache - Use cached config if available (default: true)
 * @returns {Object} Merged configuration object
 */
function loadConfig(options = {}) {
  const { useCache = true } = options;

  // Return cached config if valid
  if (useCache && _configCache && (Date.now() - _cacheTime) < CACHE_TTL) {
    return _configCache;
  }

  // Start with defaults
  const config = JSON.parse(JSON.stringify(DEFAULTS));

  // 1. Check for package.json "awesomeSlash" field
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = loadFromFile(packageJsonPath);
  if (packageJson && packageJson.awesomeSlash) {
    Object.assign(config, packageJson.awesomeSlash);
  }

  // 2. Check for .awesomeslashrc.json in home directory
  const homeRcPath = path.join(os.homedir(), '.awesomeslashrc.json');
  const homeRc = loadFromFile(homeRcPath);
  if (homeRc) {
    Object.assign(config, homeRc);
  }

  // 3. Check for .awesomeslashrc.json in current directory
  const cwdRcPath = path.join(process.cwd(), '.awesomeslashrc.json');
  const cwdRc = loadFromFile(cwdRcPath);
  if (cwdRc) {
    Object.assign(config, cwdRc);
  }

  // 4. Load from environment variables (highest priority)
  loadFromEnvironment(config);

  // Cache the result
  _configCache = config;
  _cacheTime = Date.now();

  return config;
}

/**
 * Get a configuration value by path
 * @param {string} path - Dot-separated configuration path
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Configuration value
 */
function get(path, defaultValue = undefined) {
  const config = loadConfig();
  const value = getNestedProperty(config, path);
  return value !== undefined ? value : defaultValue;
}

/**
 * Invalidate the configuration cache
 * Useful for testing or when configuration files change
 */
function invalidateCache() {
  _configCache = null;
  _cacheTime = 0;
}

/**
 * Validate configuration schema
 * @param {Object} config - Configuration to validate
 * @returns {{valid: boolean, errors: Array<string>}} Validation result
 */
function validateConfig(config) {
  const errors = [];

  // Validate performance limits
  if (config.performance) {
    if (typeof config.performance.maxCachedFileSize !== 'number' || config.performance.maxCachedFileSize < 1024) {
      errors.push('performance.maxCachedFileSize must be >= 1024 bytes');
    }
    if (typeof config.performance.cacheSize !== 'number' || config.performance.cacheSize < 1) {
      errors.push('performance.cacheSize must be >= 1');
    }
    if (typeof config.performance.cacheTTL !== 'number' || config.performance.cacheTTL < 0) {
      errors.push('performance.cacheTTL must be >= 0');
    }
  }

  // Validate state configuration
  if (config.state) {
    if (typeof config.state.baseDir !== 'string' || config.state.baseDir.length === 0) {
      errors.push('state.baseDir must be a non-empty string');
    }
    if (typeof config.state.stateFile !== 'string' || config.state.stateFile.length === 0) {
      errors.push('state.stateFile must be a non-empty string');
    }
  }

  // Validate task configuration
  if (config.tasks) {
    const validSources = ['gh-issues', 'linear', 'tasks-md', 'custom'];
    if (!validSources.includes(config.tasks.defaultSource)) {
      errors.push(`tasks.defaultSource must be one of: ${validSources.join(', ')}`);
    }
  }

  // Validate logging configuration
  if (config.logging) {
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLevels.includes(config.logging.level)) {
      errors.push(`logging.level must be one of: ${validLevels.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export main API
module.exports = {
  // Configuration loading
  loadConfig,
  get,
  invalidateCache,

  // Validation
  validateConfig,

  // Constants
  DEFAULTS,
  ENV_MAPPINGS,

  // For testing
  _internal: {
    setNestedProperty,
    getNestedProperty,
    loadFromEnvironment,
    loadFromFile
  }
};
