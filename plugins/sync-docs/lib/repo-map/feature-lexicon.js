/**
 * Shared lexicon constants for repo-map feature evidence
 *
 * @module lib/repo-map/feature-lexicon
 */

'use strict';

const STOPWORDS = new Set([
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
  'default', 'auto', 'automatic'
]);

const GENERIC_SYMBOL_NAMES = new Set([
  'use', 'init', 'default', 'config', 'configure', 'setup', 'set', 'get',
  'create', 'new', 'handler', 'helpers', 'helper', 'utils', 'util', 'core',
  'manager', 'builder', 'factory', 'service', 'module', 'plugin'
]);

const PATH_TOKEN_WHITELIST = new Set([
  'tls', 'ssl', 'jwt', 'grpc', 'ssh', 'oauth', 'oidc', 'cli', 'gui'
]);

const TOKEN_ALIASES = {
  routing: ['route', 'router'],
  routes: ['route', 'router'],
  router: ['route'],
  federation: ['federate', 'federation'],
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
  letsencrypt: ['acme', 'autocert']
  ,verification: ['verify']
  ,verifying: ['verify']
  ,streaming: ['stream']
  ,downloads: ['download']
  ,timeouts: ['timeout']
  ,decompression: ['decompress']
  ,decompressing: ['decompress']
  ,decoding: ['decode']
  ,decoded: ['decode']
};

const EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rs', '.go', '.java'
];

module.exports = {
  STOPWORDS,
  GENERIC_TOKENS,
  GENERIC_SYMBOL_NAMES,
  PATH_TOKEN_WHITELIST,
  TOKEN_ALIASES,
  EXTENSIONS
};
