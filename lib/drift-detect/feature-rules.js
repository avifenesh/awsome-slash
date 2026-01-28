/**
 * Heuristic word lists for feature extraction
 *
 * @module lib/drift-detect/feature-rules
 */

'use strict';

const DESCRIPTIVE_HINTS = [
  'easy to use',
  'easy-to-use',
  'lightweight',
  'cross browser',
  'cross-browser',
  'general purpose',
  'general-purpose',
  'fast',
  'high performance',
  'high-performance',
  'scalable',
  'extensible',
  'secure',
  'modern',
  'feature rich',
  'feature-rich',
  'command line',
  'command-line',
  'framework',
  'library',
  'tool',
  'cli',
  'open source',
  'efficient'
];

const GENERIC_LABELS = new Set([
  'name', 'type', 'default', 'options', 'windows', 'mac', 'linux', 'twitter',
  'e-mail', 'email', 'renderer', 'addons', 'architecture', 'forums', 'github issues',
  'slack', 'newsletter', 'facebook page', 'resources', 'communication', 'documentation',
  'source code', 'docs', 'dependency', 'prerequisites', 'installation', 'requirements', 'module',
  'note', 'notes', 'reason', 'rationale'
]);

const LOW_SIGNAL_EXACT = new Set([
  'windows', 'twitter', 'email', 'e-mail', 'architecture',
  'experimental', 'example', 'related',
  'location', 'filename', 'reviewed',
  'short', 'tested', 'protip',
  'format', 'important',
  'high performance',
  'zero migration',
  'type safety',
  'type safe',
  'performance', 'reliability', 'high availability',
  'stability', 'fault tolerance', 'stability and fault tolerance',
  'community and open source',
  'backed and supported by aws and gcp',
  'normalization of node inconsistencies',
  'backed and supported'
]);

const LOW_SIGNAL_PREFIXES = [
  'layout',
  'unlike ',
  'vite ',
  'node.js',
  'please note',
  'please ',
  '--',
  '-',
  'want to',
  'wants to',
  'aims to',
  'provide the foundation',
  'provides the foundation'
];

const LOW_SIGNAL_CONTAINS = [
  'spoiler alert',
  'support the project',
  'and much more',
  'fun to use',
  'production-ready',
  'open source',
  'open-source',
  'official open-source',
  'scales to',
  'written in',
  'trillions of requests',
  'millions of tls',
  'buy me a coffee',
  'cup of coffee',
  'funding provider',
  'support contract',
  'trademark',
  'sponsor',
  'framework for building',
  'out of the box',
  'compatibility with a wide range',
  'following out of the box',
  'build optimizations',
  'build optimization',
  'for example',
  'for instance',
  'equivalent',
  'refer to',
  'aims to be',
  'rewrite',
  'no longer',
  'migrated',
  'deprecated',
  'eol',
  'required',
  'this is done',
  'developer experience',
  'time traveling',
  'feature-rich development experience',
  'convenience functions',
  'without additional dependencies',
  'work on any platform'
];

const LOW_SIGNAL_REGEX = [
  /^(it|after|since|returns|return|argument|many|additional|in the)\b/,
  /^(element|elements)\b/,
  /^(users to|add \w+ todos)\b/,
  /(developer\s+ready|instant\s+feedback)/,
  /^pure\s+.*\barchitecture\b/,
  /^number of\b/,
  /^any kind of\b/,
  /^default data\b/
];

const PLAN_NOISE_EXACT = new Set([
  'location', 'filename', 'reviewed'
]);

const PLAN_NOISE_PREFIXES = [
  'layout',
  'keybindings'
];

module.exports = {
  DESCRIPTIVE_HINTS,
  GENERIC_LABELS,
  LOW_SIGNAL_EXACT,
  LOW_SIGNAL_PREFIXES,
  LOW_SIGNAL_CONTAINS,
  LOW_SIGNAL_REGEX,
  PLAN_NOISE_EXACT,
  PLAN_NOISE_PREFIXES
};
