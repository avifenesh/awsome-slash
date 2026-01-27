/**
 * Shared lexicon constants for feature extraction
 *
 * @module lib/drift-detect/feature-lexicon
 */

'use strict';

const FEATURE_SECTION_PATTERNS = [
  /^features?$/i,
  /^key features?$/i,
  /^capabilities?$/i,
  /^highlights?$/i,
  /^overview$/i,
  /^why choose\b/i,
  /^why use\b/i,
  /^what it does$/i,
  /^description$/i,
  /^functionality$/i,
  /^core features?$/i,
  /^packages?$/i
];

const NON_FEATURE_SECTION_PATTERNS = [
  /^current status\b/i,
  /^upcoming releases?\b/i,
  /^previous releases?\b/i,
  /^supported engine versions?\b/i,
  /^getting started\b/i,
  /^getting help\b/i,
  /^get involved\b/i,
  /^community support\b/i,
  /^requirements?$/i,
  /^prerequisites?$/i,
  /^goals?$/i,
  /^project goals?$/i,
  /^table of contents$/i,
  /^installation$/i,
  /^installing$/i,
  /^prerequisites$/i,
  /^documentation$/i,
  /^docs?$/i,
  /^usage$/i,
  /^examples$/i,
  /^contributing$/i,
  /^license$/i,
  /^support$/i,
  /^community$/i,
  /^resources$/i,
  /^communication$/i,
  /^sponsors?$/i,
  /^opinions?$/i,
  /^testimonials?$/i,
  /^important$/i,
  /^configuration/i,
  /^output template$/i,
  /^format selection$/i,
  /^post[-\s]processing$/i,
  /^plugins?$/i,
  /^changelog$/i,
  /^release notes?$/i,
  /^changes?$/i,
  /^differences?$/i,
  /^new features?$/i,
  /^dependencies$/i,
  /^performance$/i,
  /^faq$/i,
  /^governance$/i,
  /^release(?:s)?$/i,
  /^release types$/i,
  /^download(?:s)?$/i,
  /^build$/i,
  /^testing$/i,
  /^tests?$/i,
  /^unit tests?$/i,
  /^api(?: reference)?$/i,
  /^current project team members$/i,
  /^current project members$/i,
  /^team$/i,
  /^maintainers?$/i,
  /^maintenance$/i,
  /^collaborators?$/i,
  /^triagers?$/i,
  /^tsc\b/i,
  /^sponsoring$/i,
  /^sponsors?$/i,
  /^backers?$/i,
  /^partners?$/i,
  /^donations?$/i,
  /^funding$/i,
  /^special thanks/i,
  /^thanks$/i,
  /^module formats$/i
];

const CATEGORY_SECTION_PATTERNS = [
  { label: 'Chart type', regex: /chart types?/i, pathHint: /\/charts\//i },
  { label: 'Scale', regex: /scales?/i, pathHint: /\/axes\//i },
  { label: 'Axis', regex: /axes?/i, pathHint: /\/axes\//i },
  { label: 'Controller', regex: /controllers?/i },
  { label: 'Element', regex: /elements?/i, pathHint: /\/elements\//i },
  { label: 'Plugin', regex: /plugins?/i, pathHint: /\/plugins\//i },
  { label: 'Adapter', regex: /adapters?/i },
  { label: 'Dataset', regex: /datasets?/i },
  { label: 'Animation', regex: /animations?/i },
  { label: 'Interaction', regex: /interactions?/i },
  { label: 'Renderer', regex: /renderers?/i },
  { label: 'Layout', regex: /layouts?/i },
  { label: 'Tooltip', regex: /tooltips?/i },
  { label: 'Legend', regex: /legends?/i },
  { label: 'Module', regex: /modules?/i },
  { label: 'Framework', regex: /supported frameworks?/i },
  { label: 'Addon', regex: /^addons?$/i }
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'with', 'in', 'on', 'by',
  'add', 'adds', 'adding', 'implement', 'implements', 'implementing',
  'support', 'supports', 'supporting', 'allow', 'allows', 'allowing',
  'provide', 'provides', 'providing', 'enable', 'enables', 'enabling',
  'feature', 'features', 'capability', 'capabilities', 'ability', 'abilities',
  'include', 'includes', 'including', 'using', 'use', 'used', 'based'
]);

const FEATURE_BULLET_KEYWORDS = [
  'support', 'supports', 'supporting',
  'include', 'includes', 'including',
  'provide', 'provides', 'providing',
  'enable', 'enables', 'enabling',
  'automatic', 'automated',
  'hosted',
  'bundle', 'bundles', 'bundling',
  'preprocess', 'transform', 'compile',
  'plugin', 'plugins',
  'fast', 'faster', 'lightweight',
  'built-in', 'built in', 'zero-config', 'zero config',
  'secure', 'safe', 'typed', 'type-safe', 'type safe'
];

module.exports = {
  FEATURE_SECTION_PATTERNS,
  NON_FEATURE_SECTION_PATTERNS,
  CATEGORY_SECTION_PATTERNS,
  STOPWORDS,
  FEATURE_BULLET_KEYWORDS
};
