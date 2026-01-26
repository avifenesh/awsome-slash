/**
 * Repo map incremental updater
 *
 * @module lib/repo-map/updater
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const runner = require('./runner');
const cache = require('./cache');
const installer = require('./installer');
const { analyzeDocumentation } = require('../drift-detect/collectors');

/**
 * Perform incremental update based on git diff
 * @param {string} basePath - Repository root
 * @param {Object} map - Existing repo map
 * @returns {Promise<{success: boolean, map?: Object, changes?: Object, error?: string, needsFullRebuild?: boolean}>}
 */
async function incrementalUpdate(basePath, map) {
  // Validate ast-grep
  const installed = installer.checkInstalledSync();
  if (!installed.found) {
    return {
      success: false,
      error: 'ast-grep not found',
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!installer.meetsMinimumVersion(installed.version)) {
    return {
      success: false,
      error: `ast-grep version ${installed.version || 'unknown'} is too old. Minimum required: ${installer.getMinimumVersion()}`,
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!map || !map.files) {
    return {
      success: false,
      error: 'Invalid repo map',
      needsFullRebuild: true
    };
  }

  // Try git-based update first
  const gitInfo = runner.getGitInfo(basePath);
  if (!gitInfo || !map.git?.commit) {
    return updateWithoutGit(basePath, map, installed.command);
  }

  // Check if base commit exists
  if (!commitExists(basePath, map.git.commit)) {
    return {
      success: false,
      error: 'Base commit not found (history rewritten). Full rebuild required.',
      needsFullRebuild: true
    };
  }

  const diff = getGitDiff(basePath, map.git.commit);
  if (diff === null) {
    return updateWithoutGit(basePath, map, installed.command);
  }

  const changes = parseDiff(diff);

  // No changes - just update metadata
  if (changes.total === 0) {
    map.git = gitInfo;
    map.updated = new Date().toISOString();
    return {
      success: true,
      map,
      changes: { total: 0, updated: 0, added: 0, deleted: 0, renamed: 0 }
    };
  }

  // Apply deletions
  for (const file of changes.deleted) {
    delete map.files[file];
    delete map.dependencies[file];
  }

  // Apply renames
  for (const { from, to } of changes.renamed) {
    if (map.files[from]) {
      map.files[to] = map.files[from];
      delete map.files[from];
    }
    if (map.dependencies[from]) {
      map.dependencies[to] = map.dependencies[from];
      delete map.dependencies[from];
    }
  }

  // Apply added/modified
  const updatedFiles = [...changes.added, ...changes.modified];
  for (const file of updatedFiles) {
    const fullPath = path.join(basePath, file);
    if (!fs.existsSync(fullPath)) continue;

    const fileData = runner.scanSingleFile(installed.command, fullPath, basePath);
    if (fileData) {
      map.files[file] = fileData;
      if (fileData.imports && fileData.imports.length > 0) {
        map.dependencies[file] = Array.from(new Set(fileData.imports.map(imp => imp.source)));
      } else {
        delete map.dependencies[file];
      }
    }
  }

  // Update docs if markdown changed and docs exist in map
  if (map.docs && changes.docsChanged) {
    map.docs = analyzeDocumentation({ cwd: basePath, depth: 'thorough' });
  }

  // Recalculate stats
  recalculateStats(map);

  // Update git metadata
  map.git = gitInfo;
  map.updated = new Date().toISOString();

  return {
    success: true,
    map,
    changes: {
      total: changes.total,
      updated: updatedFiles.length,
      added: changes.added.length,
      deleted: changes.deleted.length,
      renamed: changes.renamed.length
    }
  };
}

/**
 * Update without git (hash comparison)
 * @param {string} basePath - Repository root
 * @param {Object} map - Existing repo map
 * @param {string} cmd - ast-grep command
 * @returns {Promise<{success: boolean, map?: Object, changes?: Object}>}
 */
async function updateWithoutGit(basePath, map, cmd) {
  const currentFiles = new Set();
  const languages = map.project?.languages || [];

  for (const lang of languages) {
    const files = runner.findFilesForLanguage(basePath, lang);
    for (const file of files) {
      currentFiles.add(path.relative(basePath, file).replace(/\\/g, '/'));
    }
  }

  const changes = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
    docsChanged: false,
    total: 0
  };

  // Detect deleted or modified files
  for (const file of Object.keys(map.files)) {
    if (!currentFiles.has(file)) {
      changes.deleted.push(file);
      delete map.files[file];
      delete map.dependencies[file];
    } else {
      const fullPath = path.join(basePath, file);
      const fileData = runner.scanSingleFile(cmd, fullPath, basePath);
      if (fileData && fileData.hash !== map.files[file].hash) {
        map.files[file] = fileData;
        if (fileData.imports && fileData.imports.length > 0) {
          map.dependencies[file] = Array.from(new Set(fileData.imports.map(imp => imp.source)));
        } else {
          delete map.dependencies[file];
        }
        changes.modified.push(file);
      }
      currentFiles.delete(file);
    }
  }

  // Remaining files are new
  for (const file of currentFiles) {
    const fullPath = path.join(basePath, file);
    const fileData = runner.scanSingleFile(cmd, fullPath, basePath);
    if (fileData) {
      map.files[file] = fileData;
      if (fileData.imports && fileData.imports.length > 0) {
        map.dependencies[file] = Array.from(new Set(fileData.imports.map(imp => imp.source)));
      }
      changes.added.push(file);
    }
  }

  // Update docs if map has docs
  if (map.docs) {
    map.docs = analyzeDocumentation({ cwd: basePath, depth: 'thorough' });
  }

  changes.total = changes.added.length + changes.modified.length + changes.deleted.length;

  recalculateStats(map);
  map.updated = new Date().toISOString();

  return {
    success: true,
    map,
    changes: {
      total: changes.total,
      updated: changes.modified.length,
      added: changes.added.length,
      deleted: changes.deleted.length,
      renamed: changes.renamed.length
    }
  };
}

/**
 * Check if repo-map is stale
 * @param {string} basePath - Repository root
 * @param {Object} map - Repo map
 * @returns {Object} Staleness info
 */
function checkStaleness(basePath, map) {
  const result = {
    isStale: false,
    reason: null,
    commitsBehind: 0,
    suggestFullRebuild: false
  };

  if (!map?.git?.commit) {
    result.isStale = true;
    result.reason = 'Missing base commit in repo-map';
    result.suggestFullRebuild = true;
    return result;
  }

  if (cache.isMarkedStale(basePath)) {
    result.isStale = true;
    result.reason = 'Marked stale by hook';
  }

  if (!commitExists(basePath, map.git.commit)) {
    result.isStale = true;
    result.reason = 'Base commit no longer exists (rebased?)';
    result.suggestFullRebuild = true;
    return result;
  }

  const currentBranch = getCurrentBranch(basePath);
  if (currentBranch && map.git.branch && currentBranch !== map.git.branch) {
    result.isStale = true;
    result.reason = `Branch changed from ${map.git.branch} to ${currentBranch}`;
    result.suggestFullRebuild = true;
  }

  const commitsBehind = getCommitsBehind(basePath, map.git.commit);
  if (commitsBehind > 0) {
    result.isStale = true;
    result.commitsBehind = commitsBehind;
    if (!result.reason) {
      result.reason = `${commitsBehind} commits behind HEAD`;
    }
  }

  return result;
}

/**
 * Parse git diff output
 * @param {string} diff - Git diff output
 * @returns {Object}
 */
function parseDiff(diff) {
  const changes = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
    docsChanged: false,
    total: 0
  };

  const lines = diff.split('\n').filter(Boolean);
  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0];

    if (status.startsWith('R')) {
      const from = normalizePath(parts[1]);
      const to = normalizePath(parts[2]);
      changes.renamed.push({ from, to });
      if ((from && from.endsWith('.md')) || (to && to.endsWith('.md'))) {
        changes.docsChanged = true;
      }
      const renameScore = Number(status.slice(1));
      if (!Number.isNaN(renameScore) && renameScore < 100 && to) {
        changes.modified.push(to);
      }
      continue;
    }

    const file = normalizePath(parts[1]);
    if (!file) continue;

    if (status === 'A') changes.added.push(file);
    else if (status === 'M') changes.modified.push(file);
    else if (status === 'D') changes.deleted.push(file);

    if (file.endsWith('.md')) changes.docsChanged = true;
  }

  changes.total = changes.added.length + changes.modified.length + changes.deleted.length + changes.renamed.length;
  return changes;
}

/**
 * Get git diff name-status
 * @param {string} basePath - Repository root
 * @param {string} sinceCommit - Base commit
 * @returns {string|null}
 */
function getGitDiff(basePath, sinceCommit) {
  try {
    return execSync(`git diff --name-status -M ${sinceCommit} HEAD`, {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if commit exists
 * @param {string} basePath - Repository root
 * @param {string} commit - Commit hash
 * @returns {boolean}
 */
function commitExists(basePath, commit) {
  try {
    execSync(`git cat-file -e ${commit}`, {
      cwd: basePath,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 * @param {string} basePath - Repository root
 * @returns {string|null}
 */
function getCurrentBranch(basePath) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get number of commits behind HEAD
 * @param {string} basePath - Repository root
 * @param {string} commit - Base commit
 * @returns {number}
 */
function getCommitsBehind(basePath, commit) {
  try {
    const out = execSync(`git rev-list ${commit}..HEAD --count`, {
      cwd: basePath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

/**
 * Normalize file path to forward slashes
 * @param {string} filePath - Path to normalize
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath ? filePath.replace(/\\/g, '/') : filePath;
}

/**
 * Recalculate map stats
 * @param {Object} map - Repo map
 */
function recalculateStats(map) {
  const files = Object.values(map.files || {});
  map.stats.totalFiles = files.length;
  map.stats.totalSymbols = files.reduce((sum, file) => {
    return sum +
      (file.symbols?.functions?.length || 0) +
      (file.symbols?.classes?.length || 0) +
      (file.symbols?.types?.length || 0) +
      (file.symbols?.constants?.length || 0);
  }, 0);
}

module.exports = {
  incrementalUpdate,
  updateWithoutGit,
  checkStaleness
};
