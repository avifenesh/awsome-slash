/**
 * Plugin Analysis Reporter
 * Generates markdown reports for plugin analysis results
 */

/**
 * Generate a markdown report from analysis results
 * @param {Object} results - Analysis results
 * @param {string} results.pluginName - Name of analyzed plugin
 * @param {Array} results.toolIssues - Tool definition issues
 * @param {Array} results.structureIssues - Plugin structure issues
 * @param {Array} results.securityIssues - Security issues
 * @param {Object} options - Report options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @param {boolean} options.compact - Use compact format
 * @returns {string} Markdown report
 */
function generateReport(results, options = {}) {
  const { verbose = false, compact = false } = options;

  // Filter issues by certainty
  const filterIssues = (issues) => {
    if (verbose) return issues;
    return issues.filter(i => i.certainty !== 'LOW');
  };

  const toolIssues = filterIssues(results.toolIssues || []);
  const structureIssues = filterIssues(results.structureIssues || []);
  const securityIssues = filterIssues(results.securityIssues || []);

  const totalIssues = toolIssues.length + structureIssues.length + securityIssues.length;

  if (compact) {
    return generateCompactReport(results.pluginName, toolIssues, structureIssues, securityIssues);
  }

  const lines = [];

  // Header
  lines.push(`## Plugin Analysis: ${results.pluginName}`);
  lines.push('');
  lines.push(`**Analyzed**: ${new Date().toISOString()}`);
  lines.push(`**Files scanned**: ${results.filesScanned || 0}`);
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push('');

  const highCount = countByCertainty([...toolIssues, ...structureIssues, ...securityIssues], 'HIGH');
  const mediumCount = countByCertainty([...toolIssues, ...structureIssues, ...securityIssues], 'MEDIUM');
  const lowCount = verbose ? countByCertainty([...toolIssues, ...structureIssues, ...securityIssues], 'LOW') : 0;

  lines.push(`| Certainty | Count |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| HIGH | ${highCount} |`);
  lines.push(`| MEDIUM | ${mediumCount} |`);
  if (verbose) {
    lines.push(`| LOW | ${lowCount} |`);
  }
  lines.push(`| **Total** | **${totalIssues}** |`);
  lines.push('');

  // Tool Issues
  if (toolIssues.length > 0) {
    lines.push(`### Tool Definitions (${toolIssues.length} issues)`);
    lines.push('');
    lines.push('| Tool | Issue | Fix | Certainty |');
    lines.push('|------|-------|-----|-----------|');
    for (const issue of toolIssues) {
      lines.push(`| ${issue.tool || '-'} | ${issue.issue} | ${issue.fix || '-'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  // Structure Issues
  if (structureIssues.length > 0) {
    lines.push(`### Structure (${structureIssues.length} issues)`);
    lines.push('');
    lines.push('| File | Issue | Certainty |');
    lines.push('|------|-------|-----------|');
    for (const issue of structureIssues) {
      lines.push(`| ${issue.file || '-'} | ${issue.issue} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  // Security Issues
  if (securityIssues.length > 0) {
    lines.push(`### Security (${securityIssues.length} issues)`);
    lines.push('');
    lines.push('| File | Line | Issue | Certainty |');
    lines.push('|------|------|-------|-----------|');
    for (const issue of securityIssues) {
      lines.push(`| ${issue.file || '-'} | ${issue.line || '-'} | ${issue.issue} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  // No issues
  if (totalIssues === 0) {
    lines.push('No issues found.');
    lines.push('');
  }

  return lines.join('\n');
}

function generateCompactReport(pluginName, toolIssues, structureIssues, securityIssues) {
  const lines = [];

  lines.push(`## ${pluginName}: ${toolIssues.length + structureIssues.length + securityIssues.length} issues`);
  lines.push('');

  const allIssues = [
    ...toolIssues.map(i => ({ ...i, category: 'Tool' })),
    ...structureIssues.map(i => ({ ...i, category: 'Structure' })),
    ...securityIssues.map(i => ({ ...i, category: 'Security' }))
  ];

  // Sort by certainty (HIGH first)
  const certOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  allIssues.sort((a, b) => certOrder[a.certainty] - certOrder[b.certainty]);

  if (allIssues.length > 0) {
    lines.push('| Category | Issue | Certainty |');
    lines.push('|----------|-------|-----------|');
    for (const issue of allIssues) {
      lines.push(`| ${issue.category} | ${issue.issue} | ${issue.certainty} |`);
    }
  } else {
    lines.push('No issues found.');
  }

  return lines.join('\n');
}

function countByCertainty(issues, certainty) {
  return issues.filter(i => i.certainty === certainty).length;
}

/**
 * Generate a diff display for a fix
 * @param {string} original - Original content
 * @param {string} modified - Modified content
 * @param {string} filePath - File path
 * @returns {string} Diff display
 */
function generateDiff(original, modified, filePath) {
  const lines = [];

  lines.push(`\`\`\`diff`);
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);

  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const maxLines = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i];
    const modLine = modLines[i];

    if (origLine === modLine) {
      if (origLine !== undefined) {
        lines.push(` ${origLine}`);
      }
    } else {
      if (origLine !== undefined) {
        lines.push(`-${origLine}`);
      }
      if (modLine !== undefined) {
        lines.push(`+${modLine}`);
      }
    }
  }

  lines.push(`\`\`\``);

  return lines.join('\n');
}

/**
 * Generate a summary report for multiple plugins
 * @param {Array} allResults - Array of plugin analysis results
 * @param {Object} options - Report options
 * @returns {string} Summary markdown report
 */
function generateSummaryReport(allResults, options = {}) {
  const lines = [];

  lines.push('# Plugin Analysis Summary');
  lines.push('');
  lines.push(`**Analyzed**: ${allResults.length} plugins`);
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push('');

  // Overall stats
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;

  for (const result of allResults) {
    const allIssues = [
      ...(result.toolIssues || []),
      ...(result.structureIssues || []),
      ...(result.securityIssues || [])
    ];
    totalHigh += countByCertainty(allIssues, 'HIGH');
    totalMedium += countByCertainty(allIssues, 'MEDIUM');
    totalLow += countByCertainty(allIssues, 'LOW');
  }

  lines.push('## Overall');
  lines.push('');
  lines.push('| Certainty | Count |');
  lines.push('|-----------|-------|');
  lines.push(`| HIGH | ${totalHigh} |`);
  lines.push(`| MEDIUM | ${totalMedium} |`);
  if (options.verbose) {
    lines.push(`| LOW | ${totalLow} |`);
  }
  lines.push('');

  lines.push('## By Plugin');
  lines.push('');
  lines.push('| Plugin | HIGH | MEDIUM | LOW | Total |');
  lines.push('|--------|------|--------|-----|-------|');

  for (const result of allResults) {
    const allIssues = [
      ...(result.toolIssues || []),
      ...(result.structureIssues || []),
      ...(result.securityIssues || [])
    ];
    const h = countByCertainty(allIssues, 'HIGH');
    const m = countByCertainty(allIssues, 'MEDIUM');
    const l = countByCertainty(allIssues, 'LOW');
    lines.push(`| ${result.pluginName} | ${h} | ${m} | ${l} | ${h + m + l} |`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generate report for a single agent analysis
 * @param {Object} results - Agent analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateAgentReport(results, options = {}) {
  const lines = [];

  lines.push(`# Agent Analysis: ${results.agentName}`);
  lines.push('');
  lines.push(`**File**: ${results.agentPath}`);
  lines.push(`**Analyzed**: ${new Date().toISOString()}`);
  lines.push('');

  const allIssues = [
    ...(results.structureIssues || []),
    ...(results.toolIssues || []),
    ...(results.xmlIssues || []),
    ...(results.cotIssues || []),
    ...(results.exampleIssues || []),
    ...(results.antiPatternIssues || []),
    ...(results.crossPlatformIssues || [])
  ];

  // Count by certainty
  const highCount = countByCertainty(allIssues, 'HIGH');
  const mediumCount = countByCertainty(allIssues, 'MEDIUM');
  const lowCount = countByCertainty(allIssues, 'LOW');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Certainty | Count |');
  lines.push('|-----------|-------|');
  lines.push(`| HIGH | ${highCount} |`);
  lines.push(`| MEDIUM | ${mediumCount} |`);
  if (options.verbose) {
    lines.push(`| LOW | ${lowCount} |`);
  }
  lines.push('');

  if (results.structureIssues && results.structureIssues.length > 0) {
    lines.push(`### Structure Issues (${results.structureIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.structureIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.toolIssues && results.toolIssues.length > 0) {
    lines.push(`### Tool Issues (${results.toolIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.toolIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.xmlIssues && results.xmlIssues.length > 0) {
    lines.push(`### XML Structure Issues (${results.xmlIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.xmlIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.cotIssues && results.cotIssues.length > 0) {
    lines.push(`### Chain-of-Thought Issues (${results.cotIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.cotIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.exampleIssues && results.exampleIssues.length > 0) {
    lines.push(`### Example Issues (${results.exampleIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.exampleIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.antiPatternIssues && results.antiPatternIssues.length > 0) {
    lines.push(`### Anti-Pattern Issues (${results.antiPatternIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.antiPatternIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  // Cross-Platform Issues
  if (results.crossPlatformIssues && results.crossPlatformIssues.length > 0) {
    lines.push(`### Cross-Platform Issues (${results.crossPlatformIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.crossPlatformIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate summary report for multiple agent analyses
 * @param {Array} allResults - Array of agent analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateAgentSummaryReport(allResults, options = {}) {
  const lines = [];

  lines.push('# Agent Analysis Summary');
  lines.push('');
  lines.push(`**Analyzed**: ${allResults.length} agents`);
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push('');

  // Overall stats
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;

  for (const result of allResults) {
    const allIssues = [
      ...(result.structureIssues || []),
      ...(result.toolIssues || []),
      ...(result.xmlIssues || []),
      ...(result.cotIssues || []),
      ...(result.exampleIssues || []),
      ...(result.antiPatternIssues || []),
      ...(result.crossPlatformIssues || [])
    ];
    totalHigh += countByCertainty(allIssues, 'HIGH');
    totalMedium += countByCertainty(allIssues, 'MEDIUM');
    totalLow += countByCertainty(allIssues, 'LOW');
  }

  lines.push('## Overall');
  lines.push('');
  lines.push('| Certainty | Count |');
  lines.push('|-----------|-------|');
  lines.push(`| HIGH | ${totalHigh} |`);
  lines.push(`| MEDIUM | ${totalMedium} |`);
  if (options.verbose) {
    lines.push(`| LOW | ${totalLow} |`);
  }
  lines.push('');

  lines.push('## By Agent');
  lines.push('');
  lines.push('| Agent | HIGH | MEDIUM | LOW | Total |');
  lines.push('|-------|------|--------|-----|-------|');

  for (const result of allResults) {
    const allIssues = [
      ...(result.structureIssues || []),
      ...(result.toolIssues || []),
      ...(result.xmlIssues || []),
      ...(result.cotIssues || []),
      ...(result.exampleIssues || []),
      ...(result.antiPatternIssues || [])
    ];
    const h = countByCertainty(allIssues, 'HIGH');
    const m = countByCertainty(allIssues, 'MEDIUM');
    const l = countByCertainty(allIssues, 'LOW');
    lines.push(`| ${result.agentName} | ${h} | ${m} | ${l} | ${h + m + l} |`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generate report for project memory file analysis
 * @param {Object} results - Project memory analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateProjectMemoryReport(results, options = {}) {
  const lines = [];

  if (results.error) {
    lines.push(`# Project Memory Analysis: Error`);
    lines.push('');
    lines.push(`**Error**: ${results.error}`);
    lines.push('');
    if (results.searchedPaths) {
      lines.push('Searched paths:');
      for (const p of results.searchedPaths) {
        lines.push(`- ${p}`);
      }
    }
    return lines.join('\n');
  }

  lines.push(`# Project Memory Analysis: ${results.fileName}`);
  lines.push('');
  lines.push(`**File**: ${results.filePath}`);
  lines.push(`**Type**: ${results.fileType === 'agents' ? 'AGENTS.md (cross-platform)' : 'CLAUDE.md'}`);
  lines.push(`**Analyzed**: ${new Date().toISOString()}`);
  lines.push('');

  if (results.metrics) {
    lines.push('## Metrics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Estimated Tokens | ${results.metrics.estimatedTokens} |`);
    lines.push(`| Characters | ${results.metrics.characterCount} |`);
    lines.push(`| Lines | ${results.metrics.lineCount} |`);
    lines.push(`| Words | ${results.metrics.wordCount} |`);
    if (results.metrics.readmeOverlap !== undefined) {
      lines.push(`| README Overlap | ${Math.round(results.metrics.readmeOverlap * 100)}% |`);
    }
    lines.push('');
  }

  const allIssues = [
    ...(results.structureIssues || []),
    ...(results.referenceIssues || []),
    ...(results.efficiencyIssues || []),
    ...(results.qualityIssues || []),
    ...(results.crossPlatformIssues || [])
  ];

  // Count by certainty
  const highCount = countByCertainty(allIssues, 'HIGH');
  const mediumCount = countByCertainty(allIssues, 'MEDIUM');
  const lowCount = countByCertainty(allIssues, 'LOW');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Certainty | Count |');
  lines.push('|-----------|-------|');
  lines.push(`| HIGH | ${highCount} |`);
  lines.push(`| MEDIUM | ${mediumCount} |`);
  if (options.verbose) {
    lines.push(`| LOW | ${lowCount} |`);
  }
  lines.push(`| **Total** | **${allIssues.length}** |`);
  lines.push('');

  if (results.structureIssues && results.structureIssues.length > 0) {
    lines.push(`### Structure Issues (${results.structureIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.structureIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.referenceIssues && results.referenceIssues.length > 0) {
    lines.push(`### Reference Issues (${results.referenceIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.referenceIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.efficiencyIssues && results.efficiencyIssues.length > 0) {
    lines.push(`### Efficiency Issues (${results.efficiencyIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.efficiencyIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (results.qualityIssues && results.qualityIssues.length > 0) {
    lines.push(`### Quality Issues (${results.qualityIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.qualityIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  // Cross-Platform Issues
  if (results.crossPlatformIssues && results.crossPlatformIssues.length > 0) {
    lines.push(`### Cross-Platform Issues (${results.crossPlatformIssues.length})`);
    lines.push('');
    lines.push('| Issue | Fix | Certainty |');
    lines.push('|-------|-----|-----------|');
    for (const issue of results.crossPlatformIssues) {
      lines.push(`| ${issue.issue} | ${issue.fix || 'N/A'} | ${issue.certainty} |`);
    }
    lines.push('');
  }

  if (allIssues.length === 0) {
    lines.push('No issues found.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate summary report for multiple project memory analyses
 * @param {Array} allResults - Array of project memory analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateProjectMemorySummaryReport(allResults, options = {}) {
  const lines = [];

  lines.push('# Project Memory Analysis Summary');
  lines.push('');
  lines.push(`**Analyzed**: ${allResults.length} files`);
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push('');

  // Overall stats
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;
  let totalTokens = 0;

  for (const result of allResults) {
    if (result.error) continue;

    const allIssues = [
      ...(result.structureIssues || []),
      ...(result.referenceIssues || []),
      ...(result.efficiencyIssues || []),
      ...(result.qualityIssues || []),
      ...(result.crossPlatformIssues || [])
    ];
    totalHigh += countByCertainty(allIssues, 'HIGH');
    totalMedium += countByCertainty(allIssues, 'MEDIUM');
    totalLow += countByCertainty(allIssues, 'LOW');

    if (result.metrics) {
      totalTokens += result.metrics.estimatedTokens || 0;
    }
  }

  lines.push('## Overall');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Tokens | ${totalTokens} |`);
  lines.push(`| HIGH Issues | ${totalHigh} |`);
  lines.push(`| MEDIUM Issues | ${totalMedium} |`);
  if (options.verbose) {
    lines.push(`| LOW Issues | ${totalLow} |`);
  }
  lines.push('');

  lines.push('## By File');
  lines.push('');
  lines.push('| File | Tokens | HIGH | MEDIUM | LOW | Total |');
  lines.push('|------|--------|------|--------|-----|-------|');

  for (const result of allResults) {
    if (result.error) {
      lines.push(`| ${result.filePath || 'Unknown'} | - | Error | - | - | - |`);
      continue;
    }

    const allIssues = [
      ...(result.structureIssues || []),
      ...(result.referenceIssues || []),
      ...(result.efficiencyIssues || []),
      ...(result.qualityIssues || []),
      ...(result.crossPlatformIssues || [])
    ];
    const h = countByCertainty(allIssues, 'HIGH');
    const m = countByCertainty(allIssues, 'MEDIUM');
    const l = countByCertainty(allIssues, 'LOW');
    const tokens = result.metrics?.estimatedTokens || '-';
    lines.push(`| ${result.fileName} | ${tokens} | ${h} | ${m} | ${l} | ${h + m + l} |`);
  }

  lines.push('');

  return lines.join('\n');
}

module.exports = {
  generateReport,
  generateDiff,
  generateSummaryReport,
  generateAgentReport,
  generateAgentSummaryReport,
  generateProjectMemoryReport,
  generateProjectMemorySummaryReport
};
