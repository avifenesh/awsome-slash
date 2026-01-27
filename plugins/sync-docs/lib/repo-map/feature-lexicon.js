/**
 * Shared lexicon for repo-map feature evidence
 *
 * @module lib/repo-map/feature-lexicon
 */

'use strict';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'with', 'without', 'from', 'by', 'in', 'on', 'into', 'over',
  'after', 'before', 'under', 'per', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'we', 'our', 'you', 'your', 'they', 'their',
  'all', 'any', 'each', 'every', 'some', 'more', 'most', 'less', 'least', 'other', 'another', 'new', 'latest',
  'one', 'two', 'three',
  'supports', 'support', 'supporting',
  'enable', 'enables', 'enabling',
  'build', 'built', 'building',
  'using', 'with', 'without',
  'include', 'includes', 'including',
  'configuration', 'config',
  'auto', 'automatic', 'default', 'content', 'type',
  'via',
  'data', 'system', 'platform'
]);

const GENERIC_TOKENS = new Set([
  'search', 'config', 'configuration', 'api', 'sdk', 'runtime', 'server', 'client',
  'framework', 'library', 'tool', 'engine', 'service', 'core', 'feature', 'features',
  'security', 'management', 'data', 'system', 'platform',
  'request', 'response', 'route', 'router', 'routing', 'handler', 'middleware',
  'method', 'http', 'json', 'xml', 'body', 'file', 'files', 'error', 'result',
  'processing',
  'default', 'auto', 'automatic'
]);

const GENERIC_SYMBOL_NAMES = new Set([
  'use', 'init', 'default', 'config', 'configure', 'setup', 'set', 'get',
  'create', 'new', 'handler', 'helpers', 'helper', 'utils', 'util', 'core',
  'manager', 'builder', 'factory', 'service', 'module', 'plugin'
]);

const PATH_TOKEN_WHITELIST = new Set([
  'tls', 'ssl', 'jwt', 'grpc', 'ssh', 'oauth', 'oidc', 'cli', 'gui',
  'sass', 'scss'
]);

const TOKEN_ALIASES = {
  routing: ['route', 'router'],
  routes: ['route', 'router'],
  router: ['route'],
  authentication: ['auth'],
  authorization: ['auth'],
  authn: ['auth'],
  authz: ['auth'],
  websocket: ['ws', 'websocket'],
  websockets: ['websocket', 'ws'],
  tls: ['ssl', 'tls'],
  ssl: ['tls', 'ssl'],
  logging: ['log', 'logger'],
  logger: ['log'],
  templating: ['template', 'renderer', 'render'],
  rendering: ['render', 'renderer', 'template'],
  database: ['db'],
  databases: ['db'],
  postgres: ['postgresql', 'pg'],
  postgresql: ['postgres', 'pg'],
  mysql: ['mariadb', 'mysql'],
  mariadb: ['mysql', 'mariadb'],
  mongodb: ['mongo', 'mongodb'],
  letsencrypt: ['acme', 'autocert'],
  bundling: ['bundle', 'bundler', 'bundles'],
  bundler: ['bundle', 'bundling', 'bundles'],
  tailwind: ['tailwindcss'],
  sass: ['scss', 'sass']
};

module.exports = {
  STOPWORDS,
  GENERIC_TOKENS,
  GENERIC_SYMBOL_NAMES,
  PATH_TOKEN_WHITELIST,
  TOKEN_ALIASES
};
