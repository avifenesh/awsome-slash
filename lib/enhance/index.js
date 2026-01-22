/**
 * Enhance Library
 * Plugin structure and tool use analyzer
 *
 * @author Avi Fenesh
 * @license MIT
 */

const pluginAnalyzer = require('./plugin-analyzer');
const pluginPatterns = require('./plugin-patterns');
const toolPatterns = require('./tool-patterns');
const securityPatterns = require('./security-patterns');
const reporter = require('./reporter');
const fixer = require('./fixer');

module.exports = {
  // Main analyzer
  pluginAnalyzer,

  // Pattern modules
  pluginPatterns,
  toolPatterns,
  securityPatterns,

  // Output modules
  reporter,
  fixer,

  // Convenience exports
  analyze: pluginAnalyzer.analyze,
  analyzePlugin: pluginAnalyzer.analyzePlugin,
  analyzeAllPlugins: pluginAnalyzer.analyzeAllPlugins,
  applyFixes: pluginAnalyzer.applyFixes,
  generateReport: pluginAnalyzer.generateReport
};
