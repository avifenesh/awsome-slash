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
  'note', 'notes', 'reason', 'rationale', 'keybindings',
  'purpose', 'prerequisite', 'prerequisites',
  'languages supported', 'language support', 'supported languages'
]);

const LOW_SIGNAL_EXACT = new Set([
  'windows', 'twitter', 'email', 'e-mail', 'architecture', 'openai',
  'experimental', 'example', 'related',
  'location', 'filename', 'reviewed',
  'short', 'tested', 'protip',
  'format', 'important',
  'local data processing',
  'high performance',
  'zero migration',
  'type safety',
  'type safe',
  'try it now',
  'pure vanilla javascript',
  'modern es6 modules',
  'responsive design',
  'nerdy humor',
  'custom svg graphics',
  'works on desktop and mobile devices',
  'ready for growth',
  'no production dependencies',
  'deno compatible',
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
  'user-friendly',
  'user friendly',
  'easy navigation',
  'tech-savvy',
  'tech savvy',
  'your preferences',
  'suit your preferences',
  'on your device',
  'ensuring your privacy',
  'built for ai',
  'built for automation',
  'automation-first',
  'automation first',
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
  'github pages',
  'ci/cd',
  'continuous integration',
  'continuous deployment',
  'svg illustration',
  'svg illustrations',
  'svg graphics',
  'type safety',
  'ide support',
  'native support',
  'third-party',
  'third party',
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
  /^on your (mac|macos|windows|linux)\b/,
  /^(macos|linux|windows)\b/,
  /^number of\b/,
  /^any kind of\b/,
  /^default data\b/
];

const PLAN_NOISE_EXACT = new Set([
  'location',
  'filename',
  'reviewed',
  'last updated',
  'status',
  'branch',
  'source content'
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
