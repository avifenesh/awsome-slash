/**
 * Documentation scanning rules
 *
 * @module lib/drift-detect/doc-rules
 */

'use strict';

const path = require('path');

const DOC_FILES = [
  'README.md',
  'README.mdx',
  'README.rst',
  'README.adoc',
  'README.asciidoc',
  '.github/README.md',
  '.github/README.mdx',
  '.github/README.rst',
  '.github/README.adoc',
  '.github/README.asciidoc',
  'PLAN.md',
  'CLAUDE.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'HISTORY.md',
  'RELEASES.md',
  'RELEASE_NOTES.md',
  'docs/README.md',
  'docs/README.mdx',
  'docs/README.rst',
  'docs/README.adoc',
  'docs/README.asciidoc',
  'docs/PLAN.md'
];

const FEATURE_DOC_SKIP_FILES = new Set([
  'agents.md',
  'claude.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'license.md',
  'history.md'
]);

const DOC_POINTER_EXT = /\.(md|mdx|rst|adoc|asciidoc)$/i;
const DOC_NAME_ALLOW_REGEX = /(readme|index|overview|introduction|intro|get-started|getting-started|quickstart|features?|capabilities?|doc|tutorial|guide|howto|how-to|blueprints?|cli|async|deploy|patterns?|extensions?)/;
const DOC_STEM_SKIP_REGEX = /^(api|reference|ref|changes?|changelog|release|breaking|migration|deprecated|deprecation|security)$/;
const DOC_PATH_ALLOW_REGEX = /^(docs\/(charts|axes|plugins|elements|markdown|guides|guide|howto|how-to|config|changes|concepts|api)\/)/;

const SKIP_PATH_REGEXES = [
  /^docs\/[a-z-]{2}\//,
  /(^|\/)api\//,
  /(^|\/)reference\//,
  /(^|\/)spec\//,
  /(^|\/)docs\/blog\//,
  /(^|\/)examples?\//,
  /(^|\/)i18n\//,
  /(^|\/)release(s)?\//,
  /(^|\/)checklists?\//,
  /(^|\/)releases?\.md$/
];

const SKIP_PATH_INCLUDES = [
  'migration',
  'migrations',
  'breaking-changes',
  'changes',
  'changelog',
  'release-notes',
  'release_notes',
  'deprecations',
  'deprecated',
  'supportedsites.md'
];

function shouldSkipFeatureDoc(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);
  if (normalized === 'docs/readme.md') return true;
  return FEATURE_DOC_SKIP_FILES.has(name);
}

function shouldSkipFeatureDocPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();

  if (normalized.startsWith('docs/en/docs/')) {
    const baseName = normalized.split('/').pop() || '';
    if (!DOC_NAME_ALLOW_REGEX.test(baseName) && !normalized.includes('/features')) return true;
  }

  for (const pattern of SKIP_PATH_REGEXES) {
    if (pattern.test(normalized)) {
      if (pattern.source === '^docs\\/[a-z-]{2}\\/' && normalized.startsWith('docs/en/')) {
        continue;
      }
      return true;
    }
  }

  for (const needle of SKIP_PATH_INCLUDES) {
    if (normalized.includes(needle)) return true;
  }
  if (normalized.includes('docs/source/') && !normalized.endsWith('docs/source/index.md')) return true;
  if (normalized.includes('docs/content/') && !normalized.endsWith('docs/content/index.md')) return true;

  const baseName = normalized.split('/').pop() || '';
  const baseStem = baseName.replace(/\.[^.]+$/, '');
  if (DOC_STEM_SKIP_REGEX.test(baseStem)) return true;

  const parts = normalized.split('/');
  const docsIndex = parts.indexOf('docs');
  if (docsIndex >= 0) {
    const depthAfterDocs = parts.length - docsIndex - 1;
    const allowDocNames = DOC_NAME_ALLOW_REGEX.test(baseStem);
    const allowDocPath = DOC_PATH_ALLOW_REGEX.test(normalized) || normalized.startsWith('docs/en/docs/');
    if (depthAfterDocs >= 2 && !allowDocPath) return true;
    if (!allowDocNames && !allowDocPath) return true;
  }

  return false;
}

module.exports = {
  DOC_FILES,
  DOC_POINTER_EXT,
  shouldSkipFeatureDoc,
  shouldSkipFeatureDocPath
};
