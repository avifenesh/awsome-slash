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
const agentAnalyzer = require('./agent-analyzer');
const agentPatterns = require('./agent-patterns');
const reporter = require('./reporter');
const fixer = require('./fixer');

module.exports = {
  // Main analyzers
  pluginAnalyzer,
  agentAnalyzer,

  // Pattern modules
  pluginPatterns,
  toolPatterns,
  securityPatterns,
  agentPatterns,

  // Output modules
  reporter,
  fixer,

  // Convenience exports - Plugin
  analyze: pluginAnalyzer.analyze,
  analyzePlugin: pluginAnalyzer.analyzePlugin,
  analyzeAllPlugins: pluginAnalyzer.analyzeAllPlugins,
  applyFixes: pluginAnalyzer.applyFixes,
  generateReport: pluginAnalyzer.generateReport,

  // Convenience exports - Agent
  analyzeAgent: agentAnalyzer.analyzeAgent,
  analyzeAllAgents: agentAnalyzer.analyzeAllAgents,
  agentApplyFixes: agentAnalyzer.applyFixes,
  agentGenerateReport: agentAnalyzer.generateReport
};
