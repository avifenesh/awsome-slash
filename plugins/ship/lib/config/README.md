# Configuration Management

Centralized configuration module for awesome-slash with priority-based loading, validation, and caching.

## Features

- **Environment Variables**: Override any setting via `AWESOME_SLASH_*` variables
- **Configuration Files**: Support for `.awesomeslashrc.json` in home or project directory
- **package.json Integration**: Use `"awesomeSlash"` field in package.json
- **Priority Merging**: Environment > CWD config > Home config > package.json > Defaults
- **Validation**: Schema validation with detailed error messages
- **Caching**: 5-second cache for rapid successive reads

## Usage

### Basic Usage

```javascript
const { config } = require('awesome-slash');

// Load entire configuration
const fullConfig = config.loadConfig();

// Get specific value
const cacheSize = config.get('performance.cacheSize'); // 100 (default)
const logLevel = config.get('logging.level', 'warn'); // 'info' or fallback to 'warn'
```

### Configuration Priority

Configuration is loaded from multiple sources in priority order (highest first):

1. **Environment Variables** (highest priority)
   - `AWESOME_SLASH_CACHE_SIZE` → `performance.cacheSize`
   - `AWESOME_SLASH_CACHE_TTL` → `performance.cacheTTL`
   - `AWESOME_SLASH_EXEC_TIMEOUT` → `performance.execTimeout`
   - `AWESOME_SLASH_STATE_DIR` → `state.baseDir`
   - `AWESOME_SLASH_TASK_SOURCE` → `tasks.defaultSource`
   - `AWESOME_SLASH_LOG_LEVEL` → `logging.level`
   - `AWESOME_SLASH_MCP_PORT` → `mcp.port`

2. **.awesomeslashrc.json in current directory**
3. **.awesomeslashrc.json in home directory**
4. **package.json "awesomeSlash" field**
5. **Built-in defaults** (lowest priority)

### Configuration Files

Create `.awesomeslashrc.json` in your home directory or project root:

```json
{
  "performance": {
    "cacheSize": 200,
    "cacheTTL": 500
  },
  "logging": {
    "level": "debug"
  },
  "tasks": {
    "defaultSource": "linear",
    "defaultStoppingPoint": "production"
  }
}
```

Or add to your project's `package.json`:

```json
{
  "name": "my-project",
  "awesomeSlash": {
    "logging": {
      "level": "debug"
    },
    "tasks": {
      "defaultSource": "gh-issues"
    }
  }
}
```

### Environment Variables

```bash
# Override cache size
export AWESOME_SLASH_CACHE_SIZE=200

# Set log level
export AWESOME_SLASH_LOG_LEVEL=debug

# Change default task source
export AWESOME_SLASH_TASK_SOURCE=linear

# Run with overrides
node my-script.js
```

### Validation

```javascript
const { config } = require('awesome-slash');

const myConfig = {
  performance: { cacheSize: -1 }, // Invalid!
  logging: { level: 'invalid' }   // Invalid!
};

const result = config.validateConfig(myConfig);

if (!result.valid) {
  console.error('Invalid configuration:');
  result.errors.forEach(err => console.error(`  - ${err}`));
}
// Output:
//   - performance.cacheSize must be >= 1
//   - logging.level must be one of: error, warn, info, debug
```

### Cache Management

```javascript
const { config } = require('awesome-slash');

// Load with cache (default)
const conf1 = config.loadConfig();

// Force reload (bypass cache)
const conf2 = config.loadConfig({ useCache: false });

// Invalidate cache explicitly
config.invalidateCache();
```

## Configuration Schema

### performance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxCachedFileSize` | number | 65536 | Max file size to cache (bytes) |
| `cacheSize` | number | 100 | Number of cache entries |
| `cacheTTL` | number | 200 | Cache time-to-live (ms) |
| `execTimeout` | number | 5000 | Command execution timeout (ms) |
| `maxGlobWildcards` | number | 10 | Max wildcards in glob patterns |
| `maxMergeDepth` | number | 50 | Max depth for deep merge |
| `maxLineNumber` | number | 10000000 | Max line number for git blame |

### state

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseDir` | string | ".claude" | State directory name |
| `stateFile` | string | ".workflow-state.json" | State file name |
| `schemaVersion` | string | "2.0.0" | State schema version |

### tasks

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultSource` | string | "gh-issues" | Default task source (gh-issues, linear, tasks-md, custom) |
| `defaultPriority` | string | "continue" | Default priority filter |
| `defaultStoppingPoint` | string | "merged" | Default workflow stopping point |
| `maxTasksPerSource` | number | 100 | Max tasks to fetch per source |

### review

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxIterations` | number | 3 | Max review iterations |
| `defaultReviewers` | array | ["code-reviewer", "silent-failure-hunter", "test-analyzer"] | Default review agents |

### mcp

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverName` | string | "awesome-slash" | MCP server name |
| `serverVersion` | string | "2.0.0" | MCP server version |
| `port` | number\|null | null | MCP server port (null = stdio) |

### security

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enablePathValidation` | boolean | true | Enable path validation |
| `enableInputSanitization` | boolean | true | Enable input sanitization |
| `maxCommandLength` | number | 10000 | Max command length |

### logging

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | "info" | Log level (error, warn, info, debug) |
| `enableColors` | boolean | true | Enable colored output |
| `enableTimestamps` | boolean | false | Enable timestamps in logs |

## Examples

### Project-Specific Configuration

For a high-performance CI environment:

```json
{
  "performance": {
    "cacheSize": 500,
    "cacheTTL": 1000,
    "execTimeout": 10000
  },
  "logging": {
    "level": "warn",
    "enableColors": false,
    "enableTimestamps": true
  }
}
```

### Developer Workstation

For local development with verbose logging:

```json
{
  "logging": {
    "level": "debug",
    "enableColors": true
  },
  "tasks": {
    "defaultSource": "linear",
    "defaultStoppingPoint": "pr-created"
  }
}
```

### Production Deployment

For production with minimal logging:

```json
{
  "logging": {
    "level": "error",
    "enableColors": false,
    "enableTimestamps": true
  },
  "security": {
    "enablePathValidation": true,
    "enableInputSanitization": true
  },
  "tasks": {
    "defaultStoppingPoint": "production"
  }
}
```

## Testing

The configuration module exports internal functions for testing:

```javascript
const { config } = require('awesome-slash');

// Access internal utilities
const { setNestedProperty, getNestedProperty } = config._internal;

const obj = {};
setNestedProperty(obj, 'foo.bar.baz', 42);
console.log(getNestedProperty(obj, 'foo.bar.baz')); // 42
```

## License

MIT © Avi Fenesh
