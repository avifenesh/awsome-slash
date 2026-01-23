/**
 * Enhance Library
 * Plugin structure and tool use analyzer
 */

const pluginAnalyzer = require('./plugin-analyzer');
const pluginPatterns = require('./plugin-patterns');
const toolPatterns = require('./tool-patterns');
const securityPatterns = require('./security-patterns');
const agentAnalyzer = require('./agent-analyzer');
const agentPatterns = require('./agent-patterns');
const projectmemoryAnalyzer = require('./projectmemory-analyzer');
const projectmemoryPatterns = require('./projectmemory-patterns');
const reporter = require('./reporter');
const fixer = require('./fixer');

module.exports = {
  // Main analyzers
  pluginAnalyzer,
  agentAnalyzer,
  projectmemoryAnalyzer,

  // Pattern modules
  pluginPatterns,
  toolPatterns,
  securityPatterns,
  agentPatterns,
  projectmemoryPatterns,

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

  // Convenience exports - Project Memory (CLAUDE.md/AGENTS.md)
  analyzeProjectMemory: projectmemoryAnalyzer.analyze,
  analyzeClaudeMd: projectmemoryAnalyzer.analyze, // Alias for familiarity
  findProjectMemoryFile: projectmemoryAnalyzer.findProjectMemoryFile,
  projectMemoryApplyFixes: projectmemoryAnalyzer.applyFixes,
  projectMemoryGenerateReport: projectmemoryAnalyzer.generateReport
};
