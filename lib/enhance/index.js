/**
 * Enhance Library
 * @author Avi Fenesh
 * @license MIT
 */

const pluginAnalyzer = require('./plugin-analyzer');
const pluginPatterns = require('./plugin-patterns');
const toolPatterns = require('./tool-patterns');
const securityPatterns = require('./security-patterns');
const agentAnalyzer = require('./agent-analyzer');
const agentPatterns = require('./agent-patterns');
const docsAnalyzer = require('./docs-analyzer');
const docsPatterns = require('./docs-patterns');
const reporter = require('./reporter');
const fixer = require('./fixer');

module.exports = {
  // Main analyzers
  pluginAnalyzer,
  agentAnalyzer,
  docsAnalyzer,

  // Pattern modules
  pluginPatterns,
  toolPatterns,
  securityPatterns,
  agentPatterns,
  docsPatterns,

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
  agentGenerateReport: agentAnalyzer.generateReport,

  // Convenience exports - Docs
  analyzeDoc: docsAnalyzer.analyzeDoc,
  analyzeAllDocs: docsAnalyzer.analyzeAllDocs,
  docsApplyFixes: docsAnalyzer.applyFixes,
  docsGenerateReport: docsAnalyzer.generateReport
};
