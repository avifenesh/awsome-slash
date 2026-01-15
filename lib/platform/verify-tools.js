#!/usr/bin/env node
/**
 * Tool Verification System
 * Checks availability and versions of development tools for graceful degradation
 *
 * Usage: node lib/platform/verify-tools.js
 * Output: JSON with tool availability and versions
 *
 * @author Avi Fenesh
 * @license MIT
 */

const { execSync } = require('child_process');

/**
 * Checks if a tool is available and returns its version
 * @param {string} command - Command to check (e.g., 'git', 'node')
 * @param {string} versionFlag - Flag to get version (default: '--version')
 * @returns {Object} { available: boolean, version: string|null }
 */
function checkTool(command, versionFlag = '--version') {
  try {
    const output = execSync(`${command} ${versionFlag}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    // Extract version from first line
    const version = output.split('\n')[0];
    return { available: true, version };
  } catch {
    return { available: false, version: null };
  }
}

/**
 * Verifies all development tools
 * @returns {Object} Tool availability map
 */
function verifyTools() {
  return {
    // Version control
    git: checkTool('git'),
    gh: checkTool('gh'),

    // Node.js ecosystem
    node: checkTool('node'),
    npm: checkTool('npm'),
    pnpm: checkTool('pnpm'),
    yarn: checkTool('yarn'),
    bun: checkTool('bun'),

    // Python ecosystem
    python: checkTool('python', '--version'),
    python3: checkTool('python3', '--version'),
    pip: checkTool('pip', '--version'),
    pip3: checkTool('pip3', '--version'),
    poetry: checkTool('poetry'),

    // Rust ecosystem
    cargo: checkTool('cargo'),
    rustc: checkTool('rustc'),
    rustup: checkTool('rustup'),

    // Go ecosystem
    go: checkTool('go', 'version'),

    // Java ecosystem
    java: checkTool('java', '--version'),
    javac: checkTool('javac', '--version'),
    mvn: checkTool('mvn', '--version'),
    gradle: checkTool('gradle', '--version'),

    // Containerization
    docker: checkTool('docker'),

    // Deployment platforms
    railway: checkTool('railway'),
    vercel: checkTool('vercel'),
    netlify: checkTool('netlify'),
    flyctl: checkTool('flyctl', 'version'),

    // CI/CD tools
    circleci: checkTool('circleci', 'version')
  };
}

// When run directly, output JSON
if (require.main === module) {
  try {
    const result = verifyTools();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }, null, 2));
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  verifyTools,
  checkTool
};
