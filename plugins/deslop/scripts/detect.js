#!/usr/bin/env node
/**
 * Slop Detection CLI
 * Runs the detection pipeline and outputs structured findings
 *
 * Usage: node detect.js [path] [--apply] [--deep] [--compact]
 */

const path = require('path');
const fs = require('fs');

// Resolve lib relative to script location (works with ${PLUGIN_ROOT})
const libPath = path.join(__dirname, '..', 'lib');
const { runPipeline } = require(path.join(libPath, 'patterns', 'pipeline'));

function parseArgs(args) {
  const options = {
    path: '.',
    mode: 'report',
    thoroughness: 'normal',
    compact: false,
    maxFindings: 10
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      options.mode = 'apply';
    } else if (arg === '--deep') {
      options.thoroughness = 'deep';
    } else if (arg === '--quick') {
      options.thoroughness = 'quick';
    } else if (arg === '--compact') {
      options.compact = true;
    } else if (arg === '--max' && args[i + 1]) {
      options.maxFindings = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      options.path = arg;
    }
  }

  return options;
}

function formatFindings(result, compact, maxFindings = 10) {
  // Handle pipeline output format (has 'findings' array or 'summary' object)
  const findings = result.findings || [];
  const summary = result.summary || {};

  if (compact) {
    // Compact table format for token efficiency
    console.log('\n## Slop Detection Results\n');
    console.log('| File | Line | Pattern | Severity | Certainty |');
    console.log('|------|------|---------|----------|-----------|');

    for (const finding of findings.slice(0, maxFindings)) {
      const file = (finding.file || finding.path || '').length > 30
        ? '...' + (finding.file || finding.path || '').slice(-27)
        : (finding.file || finding.path || '');
      const line = finding.line || finding.lineNumber || '-';
      const pattern = finding.patternName || finding.pattern || finding.type || 'unknown';
      const severity = finding.severity || 'medium';
      const certainty = finding.certainty || 'MEDIUM';
      console.log(`| ${file} | ${line} | ${pattern} | ${severity} | ${certainty} |`);
    }

    const total = summary.totalFindings || findings.length;
    const bySeverity = summary.bySeverity || {};
    console.log(`\n**Total**: ${total} findings`);
    console.log(`**By Severity**: critical=${bySeverity.critical || 0}, high=${bySeverity.high || 0}, medium=${bySeverity.medium || 0}, low=${bySeverity.low || 0}`);
  } else {
    // Full JSON output
    console.log(JSON.stringify(result, null, 2));
  }
}

function main() {
  const args = process.argv.slice(2);

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Slop Detection CLI

Usage: node detect.js [path] [options]

Options:
  --apply      Apply auto-fixes (default: report only)
  --deep       Deep analysis with all analyzers
  --quick      Quick regex-only scan
  --compact    Output as markdown table (token efficient)
  --max N      Maximum findings to return (default: 10)
  --help       Show this help

Examples:
  node detect.js                    # Scan current directory
  node detect.js src/               # Scan src/ directory
  node detect.js --apply --compact  # Fix and show compact results
`);
    process.exit(0);
  }

  const options = parseArgs(args);

  // Validate path exists
  if (!fs.existsSync(options.path)) {
    console.error(`Error: Path not found: ${options.path}`);
    process.exit(1);
  }

  try {
    // runPipeline takes (repoPath, options) - synchronous function
    const result = runPipeline(options.path, {
      mode: options.mode,
      thoroughness: options.thoroughness
    });

    formatFindings(result, options.compact, options.maxFindings);

    // Exit with error code if critical findings
    const bySeverity = result.summary?.bySeverity || {};
    if (bySeverity.critical > 0) {
      process.exit(2);
    }
  } catch (error) {
    console.error(`Error running detection: ${error.message}`);
    process.exit(1);
  }
}

main();

