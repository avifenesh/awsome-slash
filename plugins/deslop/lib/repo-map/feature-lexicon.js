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
  'data', 'system', 'platform',
  'honoring', 'honouring', 'honor', 'honour'
]);

const GENERIC_TOKENS = new Set([
  'search', 'config', 'configuration', 'api', 'sdk', 'runtime', 'server', 'client',
  'framework', 'library', 'tool', 'engine', 'service', 'core', 'feature', 'features',
  'security', 'management', 'data', 'system', 'platform',
  'test', 'tests', 'testing',
  'request', 'response', 'route', 'router', 'routing', 'handler', 'middleware', 'proxy',
  'method', 'http', 'xml', 'body', 'file', 'files', 'error', 'result',
  'processing', 'handling', 'protection',
  'default', 'auto', 'automatic'
]);

const GENERIC_SYMBOL_NAMES = new Set([
  'use', 'init', 'default', 'config', 'configure', 'setup', 'set', 'get',
  'create', 'new', 'handler', 'helpers', 'helper', 'utils', 'util', 'core',
  'manager', 'builder', 'factory', 'service', 'module', 'plugin'
]);

const PATH_TOKEN_WHITELIST = new Set([
  'tls', 'ssl', 'jwt', 'grpc', 'ssh', 'oauth', 'oidc', 'cli', 'gui',
  'sass', 'scss',
  'auth', 'db', 'sql', 'api', 'http', 'rest', 'rpc', 'orm', 'ui', 'ux',
  'esm', 'cjs', 'mjs', 'ffi'
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
  negotiation: ['accept', 'accepts', 'acceptsencodings', 'acceptscharsets', 'acceptslanguages', 'negotiator'],
  redirection: ['redirect', 'redirects', 'redirected', 'redirecting'],
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
  sass: ['scss', 'sass'],
  commonjs: ['cjs'],
  cjs: ['commonjs'],
  transformation: ['transform', 'transforms', 'transformer', 'transformers'],
  serialization: ['serialize', 'serializes', 'serializer', 'serializers', 'serializing'],
  cancellation: ['cancel', 'canceled', 'cancelled', 'cancels', 'canceling', 'cancelling'],
  connection: ['connect', 'connected', 'connecting', 'connector'],
  decompression: ['decompress', 'decompressed', 'decompressing'],
  decoding: ['decode', 'decoded', 'decoder', 'decoding'],
  streaming: ['stream', 'streamed', 'streaming'],
  sock: ['socks'],
  externalized: ['properties', 'property', 'configurationproperties'],
  associations: ['relation', 'relations'],
  indices: ['index', 'indexes'],
  datamapper: ['repository', 'repositories'],
  activerecord: ['baseentity'],
  preloading: ['preload', 'preloads', 'preloaded', 'preloader'],
  prerendering: ['prerender', 'prerendered', 'prerenderer'],
  optimization: ['optimize', 'optimise', 'optimized', 'optimised', 'optimizing', 'optimising'],
  optimizations: ['optimization', 'optimize', 'optimise'],
  offline: ['service-worker', 'serviceworker', 'service_worker'],
  image: ['images'],
  menus: ['menu']
};

module.exports = {
  STOPWORDS,
  GENERIC_TOKENS,
  GENERIC_SYMBOL_NAMES,
  PATH_TOKEN_WHITELIST,
  TOKEN_ALIASES
};
