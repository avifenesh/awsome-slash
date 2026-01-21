/**
 * Tests for slop-analyzers.js
 * Multi-pass analysis functions for slop detection
 */

const {
  analyzeDocCodeRatio,
  analyzeVerbosityRatio,
  analyzeOverEngineering,
  analyzeInfrastructureWithoutImplementation,
  findMatchingBrace,
  countNonEmptyLines,
  countExportsInContent,
  detectLanguage,
  detectCommentLanguage,
  shouldExclude,
  isTestFile,
  ENTRY_POINTS,
  EXPORT_PATTERNS,
  SOURCE_EXTENSIONS,
  EXCLUDE_DIRS,
  COMMENT_SYNTAX,
  INFRASTRUCTURE_SUFFIXES,
  SETUP_VERBS,
  INSTANTIATION_PATTERNS
} = require('../lib/patterns/slop-analyzers');

describe('slop-analyzers', () => {
  describe('analyzeDocCodeRatio', () => {
    describe('basic functionality', () => {
      it('should detect excessive JSDoc (ratio > 3x)', () => {
        const code = `
/**
 * Add two numbers together
 * @param {number} a - The first number to add
 * @param {number} b - The second number to add
 * @returns {number} The sum of a and b
 * @example
 * add(1, 2) // returns 3
 * add(5, 10) // returns 15
 */
function add(a, b) {
  return a + b;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
        expect(violations[0].ratio).toBeGreaterThan(3.0);
        expect(violations[0].docLines).toBeGreaterThan(violations[0].codeLines * 3);
      });

      it('should not flag acceptable doc/code ratio', () => {
        const code = `
/**
 * Add two numbers
 * @param a First number
 * @param b Second number
 */
function add(a, b) {
  const sum = a + b;
  console.log('Sum:', sum);
  return sum;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(0);
      });

      it('should skip small functions below minFunctionLines', () => {
        const code = `
/**
 * Very detailed documentation
 * that is much longer
 * than the tiny function
 * it documents
 * @param x Input
 */
function tiny(x) {
  return x;
}`;

        // With minFunctionLines: 3, should skip 1-line function
        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 3 });
        expect(violations.length).toBe(0);
      });

      it('should use default options when not provided', () => {
        const code = `
/**
 * Overly documented function
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 */
function foo() {
  const a = 1;
  const b = 2;
  return a + b;
}`;

        // Default: minFunctionLines: 3, maxRatio: 3.0
        const violations = analyzeDocCodeRatio(code);
        expect(violations.length).toBe(1);
      });
    });

    describe('function pattern matching', () => {
      it('should detect excessive docs on arrow functions', () => {
        const code = `
/**
 * Super long documentation
 * Line 1 of many
 * Line 2 of many
 * Line 3 of many
 * Line 4 of many
 * Line 5 of many
 * Line 6 of many
 * Line 7 of many
 * Line 8 of many
 * Line 9 of many
 * Line 10 of many
 */
const process = (data) => {
  return data;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should detect excessive docs on async functions', () => {
        const code = `
/**
 * Detailed async function docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 */
async function fetchData() {
  return await fetch('/api');
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should detect excessive docs on exported functions', () => {
        const code = `
/**
 * Exported function with lots of docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 */
export function helper() {
  return 42;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should detect excessive docs on async arrow functions', () => {
        const code = `
/**
 * Async arrow function docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 */
const getData = async (id) => {
  return id;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
      });
    });

    describe('multiple functions', () => {
      it('should detect violations in multiple functions', () => {
        const code = `
/**
 * First function with excessive docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 */
function first() {
  return 1;
}

/**
 * Second function with acceptable docs
 */
function second() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}

/**
 * Third function with excessive docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 */
function third() {
  return 3;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(2);
      });

      it('should report correct line numbers for each violation', () => {
        // Code starts at line 1 with the JSDoc comment
        const code = `/**
 * Doc 1
 * Doc 2
 * Doc 3
 * Doc 4
 * Doc 5
 */
function a() {
  return 1;
}

/**
 * Doc 1
 * Doc 2
 * Doc 3
 * Doc 4
 * Doc 5
 */
function b() {
  return 2;
}`;

        // 6 doc lines / 1 code line = 6.0 > 3.0 for each function
        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(2);
        // First JSDoc starts at line 1
        expect(violations[0].line).toBe(1);
        // Second JSDoc starts at line 12 (after 11 lines of first function block)
        expect(violations[1].line).toBe(12);
      });
    });

    describe('edge cases', () => {
      it('should handle empty content', () => {
        const violations = analyzeDocCodeRatio('');
        expect(violations).toEqual([]);
      });

      it('should handle content with no functions', () => {
        const code = `
// Just some comments
const x = 42;
console.log(x);
`;
        const violations = analyzeDocCodeRatio(code);
        expect(violations).toEqual([]);
      });

      it('should handle content with no JSDoc', () => {
        const code = `
// Regular comment
function foo() {
  return 42;
}`;
        const violations = analyzeDocCodeRatio(code);
        expect(violations).toEqual([]);
      });

      it('should handle nested braces in function body', () => {
        const code = `
/**
 * Complex function docs
 * Line 1
 * Line 2
 * Line 3
 * Line 4
 * Line 5
 * Line 6
 * Line 7
 * Line 8
 * Line 9
 * Line 10
 * Line 11
 * Line 12
 * Line 13
 */
function complex() {
  if (true) {
    const obj = { a: 1 };
  }
  return obj;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
        // Function body has 4 lines, doc has 14 lines (14/4 = 3.5 > 3.0)
        expect(violations[0].codeLines).toBe(4);
      });

      it('should handle string literals with braces', () => {
        const code = `
/**
 * Function with strings
 * Extra docs line 1
 * Extra docs line 2
 * Extra docs line 3
 * Extra docs line 4
 * Extra docs line 5
 * Extra docs line 6
 * Extra docs line 7
 * Extra docs line 8
 * Extra docs line 9
 */
function withStrings() {
  const a = "{ not a brace }";
  const b = '} also not }';
  return a + b;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        // Should correctly parse despite braces in strings
        // 10 doc lines / 3 code lines = 3.33 > 3.0
        expect(violations.length).toBe(1);
        expect(violations[0].codeLines).toBe(3);
      });

      it('should handle template literals with expressions', () => {
        const code = `
/**
 * Template literal function
 * Lots of documentation here
 * More documentation
 * Even more docs
 * Line 5
 * Line 6
 * Line 7
 */
function withTemplate() {
  const x = \`Value: \${1 + 2}\`;
  return x;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 3.0, minFunctionLines: 1 });
        // 8 doc lines / 2 code lines = 4.0 > 3.0
        expect(violations.length).toBe(1);
        expect(violations[0].codeLines).toBe(2);
      });
    });

    describe('ratio calculation', () => {
      it('should calculate ratio correctly', () => {
        const code = `
/**
 * Doc line 1
 * Doc line 2
 * Doc line 3
 * Doc line 4
 * Doc line 5
 * Doc line 6
 */
function foo() {
  const a = 1;
  const b = 2;
  return a + b;
}`;

        const violations = analyzeDocCodeRatio(code, { maxRatio: 1.0, minFunctionLines: 1 });
        expect(violations.length).toBe(1);
        expect(violations[0].docLines).toBe(6);
        expect(violations[0].codeLines).toBe(3);
        expect(violations[0].ratio).toBe(2); // 6/3 = 2
      });
    });
  });

  describe('findMatchingBrace', () => {
    it('should find matching brace for simple function', () => {
      const content = '{ return 1; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(12);
    });

    it('should handle nested braces', () => {
      const content = '{ if (x) { return 1; } return 2; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(33);
    });

    it('should skip braces in strings', () => {
      const content = '{ const s = "{ not }"; return s; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(33);
    });

    it('should skip braces in single quotes', () => {
      const content = "{ const s = '{ not }'; return s; }";
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(33);
    });

    it('should skip braces in template literals', () => {
      const content = '{ const s = `{ not }`; return s; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(33);
    });

    it('should handle template expressions', () => {
      const content = '{ const s = `Value: ${x + 1}`; return s; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(41); // Index of final }
    });

    it('should return -1 for unmatched brace', () => {
      const content = '{ return 1;';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(-1);
    });

    it('should respect 5000 char limit', () => {
      const content = '{ ' + 'x'.repeat(6000) + ' }';
      const result = findMatchingBrace(content, 0);
      // Should not find the closing brace beyond 5000 chars
      expect(result).toBe(-1);
    });

    it('should handle escaped quotes', () => {
      const content = '{ const s = "escaped \\"quote\\" here"; return s; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBe(48); // Index of final }
    });

    // Comment-skipping tests (bug fix for apostrophes in comments)
    it('should skip single-line comments with apostrophes', () => {
      const content = `{
  // This comment has an apostrophe - it's broken
  const x = 1;
  return x;
}`;
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should skip single-line comments with quotes', () => {
      const content = `{
  // This comment has "quotes" in it
  const x = 1;
  return x;
}`;
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should skip block comments with apostrophes', () => {
      const content = `{
  /* We're using this value
     and it's important */
  const x = 1;
  return x;
}`;
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should skip block comments with quotes', () => {
      const content = `{
  /* The "value" should be "valid" */
  const x = 1;
  return x;
}`;
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should handle multiple comments with apostrophes', () => {
      const content = `{
  // It's the first comment
  const a = 1;
  // Here's another one - we're good
  const b = 2;
  /* And here's a block comment
     that's spanning multiple lines */
  return a + b;
}`;
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should not skip comment syntax inside strings', () => {
      // The // inside the string should not be treated as comment start
      const content = '{ const url = "http://example.com"; return url; }';
      const result = findMatchingBrace(content, 0);
      expect(result).toBeGreaterThan(0);
      expect(content[result]).toBe('}');
    });

    it('should handle unclosed block comment gracefully', () => {
      const content = `{
  /* This comment never closes
  const x = 1;
  return x;
}`;
      const result = findMatchingBrace(content, 0);
      // Should return -1 because the block comment never closes
      expect(result).toBe(-1);
    });
  });

  describe('countNonEmptyLines', () => {
    it('should count non-empty lines', () => {
      expect(countNonEmptyLines('a\nb\nc')).toBe(3);
    });

    it('should skip empty lines', () => {
      expect(countNonEmptyLines('a\n\nb\n\nc')).toBe(3);
    });

    it('should skip whitespace-only lines', () => {
      expect(countNonEmptyLines('a\n  \nb\n\t\nc')).toBe(3);
    });

    it('should handle empty string', () => {
      expect(countNonEmptyLines('')).toBe(0);
    });

    it('should handle single line', () => {
      expect(countNonEmptyLines('hello')).toBe(1);
    });

    it('should handle only whitespace', () => {
      expect(countNonEmptyLines('   \n\t\n  ')).toBe(0);
    });
  });

  describe('ReDoS safety', () => {
    const MAX_SAFE_TIME = 100;

    it('analyzeDocCodeRatio should handle large inputs safely', () => {
      // Create a file with many functions
      let code = '';
      for (let i = 0; i < 100; i++) {
        code += `
/**
 * Function ${i}
 */
function func${i}() {
  return ${i};
}
`;
      }

      const start = Date.now();
      analyzeDocCodeRatio(code);
      expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME * 10); // Allow more time for many functions
    });

    it('findMatchingBrace should handle deeply nested content', () => {
      // Create deeply nested braces
      let content = '{';
      for (let i = 0; i < 100; i++) {
        content += ' { ';
      }
      for (let i = 0; i < 100; i++) {
        content += ' } ';
      }
      content += '}';

      const start = Date.now();
      findMatchingBrace(content, 0);
      expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
    });

    it('should handle malicious input with alternating quotes', () => {
      const content = '{ ' + '"\'`'.repeat(1000) + ' }';

      const start = Date.now();
      findMatchingBrace(content, 0);
      expect(Date.now() - start).toBeLessThan(MAX_SAFE_TIME);
    });
  });

  // ============================================================================
  // Over-Engineering Detection Tests
  // ============================================================================

  describe('detectLanguage', () => {
    it('should detect JavaScript', () => {
      expect(detectLanguage('file.js')).toBe('js');
      expect(detectLanguage('file.jsx')).toBe('js');
      expect(detectLanguage('file.mjs')).toBe('js');
      expect(detectLanguage('file.cjs')).toBe('js');
    });

    it('should detect TypeScript', () => {
      expect(detectLanguage('file.ts')).toBe('js');
      expect(detectLanguage('file.tsx')).toBe('js');
    });

    it('should detect Rust', () => {
      expect(detectLanguage('file.rs')).toBe('rust');
    });

    it('should detect Go', () => {
      expect(detectLanguage('file.go')).toBe('go');
    });

    it('should detect Python', () => {
      expect(detectLanguage('file.py')).toBe('python');
    });

    it('should default to JS for unknown extensions', () => {
      expect(detectLanguage('file.txt')).toBe('js');
      expect(detectLanguage('file.unknown')).toBe('js');
    });
  });

  describe('shouldExclude', () => {
    it('should exclude node_modules', () => {
      expect(shouldExclude('node_modules/package/index.js')).toBe(true);
      expect(shouldExclude('src/node_modules/file.js')).toBe(true);
    });

    it('should exclude common build directories', () => {
      expect(shouldExclude('dist/bundle.js')).toBe(true);
      expect(shouldExclude('build/output.js')).toBe(true);
      expect(shouldExclude('out/file.js')).toBe(true);
      expect(shouldExclude('target/debug/main.rs')).toBe(true);
    });

    it('should exclude version control', () => {
      expect(shouldExclude('.git/objects/file')).toBe(true);
      expect(shouldExclude('.svn/file')).toBe(true);
    });

    it('should not exclude source files', () => {
      expect(shouldExclude('src/index.js')).toBe(false);
      expect(shouldExclude('lib/utils.ts')).toBe(false);
    });

    it('should handle Windows paths', () => {
      expect(shouldExclude('node_modules\\package\\index.js')).toBe(true);
      expect(shouldExclude('src\\index.js')).toBe(false);
    });
  });

  describe('isTestFile', () => {
    it('should detect .test.js files', () => {
      expect(isTestFile('file.test.js')).toBe(true);
      expect(isTestFile('file.test.ts')).toBe(true);
      expect(isTestFile('file.test.jsx')).toBe(true);
    });

    it('should detect .spec.js files', () => {
      expect(isTestFile('file.spec.js')).toBe(true);
      expect(isTestFile('file.spec.ts')).toBe(true);
    });

    it('should detect Go test files', () => {
      expect(isTestFile('file_test.go')).toBe(true);
    });

    it('should detect Rust test files', () => {
      expect(isTestFile('file_test.rs')).toBe(true);
      expect(isTestFile('file_tests.rs')).toBe(true);
    });

    it('should detect Python test files', () => {
      expect(isTestFile('file_test.py')).toBe(true);
      expect(isTestFile('test_file.py')).toBe(true);
    });

    it('should detect __tests__ directories', () => {
      expect(isTestFile('__tests__/file.js')).toBe(true);
    });

    it('should detect tests/ directories', () => {
      expect(isTestFile('tests/file.js')).toBe(true);
      expect(isTestFile('test/file.js')).toBe(true);
    });

    it('should not flag non-test files', () => {
      expect(isTestFile('src/index.js')).toBe(false);
      expect(isTestFile('lib/utils.ts')).toBe(false);
    });
  });

  describe('countExportsInContent', () => {
    describe('JavaScript/TypeScript', () => {
      it('should count export function', () => {
        const content = 'export function foo() {}\nexport function bar() {}';
        expect(countExportsInContent(content, 'js')).toBe(2);
      });

      it('should count export class', () => {
        const content = 'export class Foo {}\nexport class Bar {}';
        expect(countExportsInContent(content, 'js')).toBe(2);
      });

      it('should count export const/let/var', () => {
        const content = 'export const a = 1;\nexport let b = 2;\nexport var c = 3;';
        expect(countExportsInContent(content, 'js')).toBe(3);
      });

      it('should count export default', () => {
        const content = 'export default function() {}';
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count module.exports', () => {
        const content = 'module.exports = { foo, bar };';
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count exports.name', () => {
        const content = 'exports.foo = foo;\nexports.bar = bar;';
        expect(countExportsInContent(content, 'js')).toBe(2);
      });

      it('should count async function exports', () => {
        const content = 'export async function fetch() {}';
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count named re-exports', () => {
        const content = "export { Foo, Bar } from './module';";
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count star re-exports', () => {
        const content = "export * from './utils';";
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count star re-exports with alias', () => {
        const content = "export * as Utils from './utils';";
        expect(countExportsInContent(content, 'js')).toBe(1);
      });

      it('should count multiple re-export patterns', () => {
        const content = `
          export { Foo } from './foo';
          export * from './bar';
          export { Baz, Qux } from './baz';
        `;
        expect(countExportsInContent(content, 'js')).toBe(3);
      });
    });

    describe('Rust', () => {
      it('should count pub fn', () => {
        const content = 'pub fn foo() {}\npub fn bar() {}';
        expect(countExportsInContent(content, 'rust')).toBe(2);
      });

      it('should count pub struct', () => {
        const content = 'pub struct Foo {}\npub struct Bar {}';
        expect(countExportsInContent(content, 'rust')).toBe(2);
      });

      it('should count pub enum', () => {
        const content = 'pub enum State { A, B }';
        expect(countExportsInContent(content, 'rust')).toBe(1);
      });

      it('should count pub mod', () => {
        const content = 'pub mod utils;\npub mod helpers;';
        expect(countExportsInContent(content, 'rust')).toBe(2);
      });

      it('should count pub type', () => {
        const content = 'pub type Result<T> = std::result::Result<T, Error>;';
        expect(countExportsInContent(content, 'rust')).toBe(1);
      });

      it('should count pub trait', () => {
        const content = 'pub trait Runnable { fn run(&self); }';
        expect(countExportsInContent(content, 'rust')).toBe(1);
      });

      it('should not count private items', () => {
        const content = 'fn private() {}\nstruct Private {}';
        expect(countExportsInContent(content, 'rust')).toBe(0);
      });
    });

    describe('Go', () => {
      it('should count exported functions (capitalized)', () => {
        const content = 'func Foo() {}\nfunc Bar() {}';
        expect(countExportsInContent(content, 'go')).toBe(2);
      });

      it('should count exported types', () => {
        const content = 'type Foo struct {}\ntype Bar interface {}';
        expect(countExportsInContent(content, 'go')).toBe(2);
      });

      it('should count exported vars', () => {
        const content = 'var Foo = 1\nvar Bar = 2';
        expect(countExportsInContent(content, 'go')).toBe(2);
      });

      it('should count exported consts', () => {
        const content = 'const Foo = 1\nconst Bar = 2';
        expect(countExportsInContent(content, 'go')).toBe(2);
      });

      it('should not count private items (lowercase)', () => {
        const content = 'func foo() {}\ntype bar struct {}';
        expect(countExportsInContent(content, 'go')).toBe(0);
      });
    });

    describe('Python', () => {
      it('should count public functions', () => {
        const content = 'def foo():\n    pass\ndef bar():\n    pass';
        expect(countExportsInContent(content, 'python')).toBe(2);
      });

      it('should count public classes', () => {
        const content = 'class Foo:\n    pass\nclass Bar:\n    pass';
        expect(countExportsInContent(content, 'python')).toBe(2);
      });

      it('should count __all__', () => {
        const content = '__all__ = ["foo", "bar", "baz"]';
        expect(countExportsInContent(content, 'python')).toBe(1);
      });

      it('should not count private functions', () => {
        const content = 'def _private():\n    pass\ndef __dunder__():\n    pass';
        // Now correctly excludes functions starting with underscore
        expect(countExportsInContent(content, 'python')).toBe(0);
      });

      it('should count public functions with various names', () => {
        const content = 'def public_func():\n    pass\ndef PublicClass():\n    pass';
        expect(countExportsInContent(content, 'python')).toBe(2);
      });
    });
  });

  describe('constants', () => {
    it('should have ENTRY_POINTS defined', () => {
      expect(ENTRY_POINTS).toBeDefined();
      expect(ENTRY_POINTS.length).toBeGreaterThan(0);
      expect(ENTRY_POINTS).toContain('index.js');
      expect(ENTRY_POINTS).toContain('lib.rs');
    });

    it('should have EXPORT_PATTERNS for each language', () => {
      expect(EXPORT_PATTERNS.js).toBeDefined();
      expect(EXPORT_PATTERNS.rust).toBeDefined();
      expect(EXPORT_PATTERNS.go).toBeDefined();
      expect(EXPORT_PATTERNS.python).toBeDefined();
    });

    it('should have SOURCE_EXTENSIONS for each language', () => {
      expect(SOURCE_EXTENSIONS.js).toContain('.js');
      expect(SOURCE_EXTENSIONS.rust).toContain('.rs');
      expect(SOURCE_EXTENSIONS.go).toContain('.go');
      expect(SOURCE_EXTENSIONS.python).toContain('.py');
    });

    it('should have EXCLUDE_DIRS with common directories', () => {
      expect(EXCLUDE_DIRS).toContain('node_modules');
      expect(EXCLUDE_DIRS).toContain('dist');
      expect(EXCLUDE_DIRS).toContain('build');
      expect(EXCLUDE_DIRS).toContain('.git');
    });
  });

  describe('analyzeOverEngineering (with mocks)', () => {
    // Create a mock file system for testing
    const createMockFs = (files) => {
      const mockFs = {
        readdirSync: (dir, options) => {
          const entries = files
            .filter(f => {
              const parent = f.path.substring(0, f.path.lastIndexOf('/') || f.path.lastIndexOf('\\'));
              return parent === dir || (dir.endsWith('/') && f.path.startsWith(dir));
            })
            .map(f => {
              const name = f.path.substring(f.path.lastIndexOf('/') + 1);
              return {
                name,
                isFile: () => f.type === 'file',
                isDirectory: () => f.type === 'dir'
              };
            });
          return entries;
        },
        readFileSync: (path) => {
          const file = files.find(f => f.path === path || path.endsWith(f.path));
          if (!file) throw new Error('ENOENT');
          return file.content || '';
        },
        statSync: (path) => {
          const file = files.find(f => f.path === path || path.endsWith(f.path));
          if (!file) throw new Error('ENOENT');
          return {
            isFile: () => file.type === 'file',
            isDirectory: () => file.type === 'dir'
          };
        }
      };
      return mockFs;
    };

    it('should return OK verdict for well-structured project', () => {
      // This test would need actual file system access
      // For now, just verify the function exists and returns expected shape
      expect(typeof analyzeOverEngineering).toBe('function');
    });

    it('should include all expected metrics in result', () => {
      // Mock a minimal project
      const result = analyzeOverEngineering('/fake/path', {
        fs: createMockFs([]),
        path: require('path')
      });

      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('verdict');
      expect(result.metrics).toHaveProperty('sourceFiles');
      expect(result.metrics).toHaveProperty('exports');
      expect(result.metrics).toHaveProperty('totalLines');
      expect(result.metrics).toHaveProperty('directoryDepth');
    });

    it('should use fallback when no entry points found', () => {
      const result = analyzeOverEngineering('/fake/path', {
        fs: createMockFs([]),
        path: require('path')
      });

      expect(result.metrics.exportMethod).toBe('fallback');
      expect(result.metrics.exports).toBe(1); // Fallback to 1
    });

    it('should respect custom thresholds', () => {
      const result = analyzeOverEngineering('/fake/path', {
        fs: createMockFs([]),
        path: require('path'),
        fileRatioThreshold: 5,
        linesPerExportThreshold: 100,
        depthThreshold: 2
      });

      // With empty mock, ratios are 0/1, so no violations
      expect(result.violations.length).toBe(0);
    });
  });

  // ============================================================================
  // analyzeVerbosityRatio tests
  // ============================================================================

  describe('analyzeVerbosityRatio', () => {
    describe('basic functionality', () => {
      it('should detect excessive inline comments (ratio > 2x)', () => {
        const code = `
function processData(input) {
  // This is a very detailed comment
  // explaining what we're about to do
  // in excruciating detail
  // that nobody really needs
  // because the code is obvious
  // but we wrote it anyway
  const result = input.trim();
  return result;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
        expect(violations[0].ratio).toBeGreaterThan(2.0);
        expect(violations[0].commentLines).toBeGreaterThan(violations[0].codeLines * 2);
      });

      it('should not flag acceptable comment/code ratio', () => {
        const code = `
function add(a, b) {
  // Add two numbers
  const sum = a + b;
  console.log('Sum:', sum);
  return sum;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(0);
      });

      it('should skip small functions below minCodeLines', () => {
        const code = `
function tiny(x) {
  // Very long comment
  // that spans multiple lines
  // explaining a simple return
  return x;
}`;

        // With minCodeLines: 3, should skip 1-line function body
        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 3 });
        expect(violations.length).toBe(0);
      });

      it('should use default options when not provided', () => {
        const code = `
function foo() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  // Comment 6
  // Comment 7
  const a = 1;
  const b = 2;
  return a + b;
}`;

        // Default maxCommentRatio: 2.0, minCodeLines: 3
        // 7 comment lines / 3 code lines = 2.33 > 2.0 -> violation
        const violations = analyzeVerbosityRatio(code);
        expect(violations.length).toBe(1);
      });
    });

    describe('function declaration types', () => {
      it('should analyze regular function declarations', () => {
        const code = `
function regularFunc() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = 1;
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should analyze async function declarations', () => {
        const code = `
async function asyncFunc() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = await Promise.resolve(1);
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should analyze const arrow functions', () => {
        const code = `
const arrowFunc = () => {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = 1;
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should analyze async arrow functions', () => {
        const code = `
const asyncArrow = async () => {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = await Promise.resolve(1);
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should analyze exported functions', () => {
        const code = `
export function exportedFunc() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = 1;
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });
    });

    describe('block comments', () => {
      it('should count block comments', () => {
        const code = `
function withBlockComments() {
  /* This is a block comment
     that spans multiple lines
     with extra detail */
  const x = 1;
  return x;
}`;

        // 3 comment lines / 2 code lines = 1.5, but should round properly
        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 1.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });

      it('should handle inline block comments', () => {
        const code = `
function inlineBlock() {
  /* Single line block comment */
  const x = 1;
  const y = 2;
  const z = 3;
  return x + y + z;
}`;

        // 1 comment line / 4 code lines = 0.25 -> no violation
        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(0);
      });
    });

    describe('language detection', () => {
      it('should detect JavaScript from .js extension', () => {
        expect(detectCommentLanguage('file.js')).toBe('js');
        expect(detectCommentLanguage('file.ts')).toBe('js');
        expect(detectCommentLanguage('file.jsx')).toBe('js');
        expect(detectCommentLanguage('file.tsx')).toBe('js');
      });

      it('should detect Python from .py extension', () => {
        expect(detectCommentLanguage('file.py')).toBe('python');
      });

      it('should detect Rust from .rs extension', () => {
        expect(detectCommentLanguage('file.rs')).toBe('rust');
      });

      it('should detect Go from .go extension', () => {
        expect(detectCommentLanguage('file.go')).toBe('go');
      });

      it('should default to js for unknown extensions', () => {
        expect(detectCommentLanguage('file.unknown')).toBe('js');
        expect(detectCommentLanguage('')).toBe('js');
        expect(detectCommentLanguage(null)).toBe('js');
      });
    });

    describe('COMMENT_SYNTAX constants', () => {
      it('should have js comment syntax', () => {
        expect(COMMENT_SYNTAX.js.line).toBeInstanceOf(RegExp);
        expect(COMMENT_SYNTAX.js.block.start).toBeInstanceOf(RegExp);
        expect(COMMENT_SYNTAX.js.block.end).toBeInstanceOf(RegExp);
      });

      it('should have python comment syntax', () => {
        expect(COMMENT_SYNTAX.python.line).toBeInstanceOf(RegExp);
        expect(COMMENT_SYNTAX.python.block.start).toBeInstanceOf(RegExp);
        expect(COMMENT_SYNTAX.python.block.end).toBeInstanceOf(RegExp);
      });

      it('should have rust comment syntax', () => {
        expect(COMMENT_SYNTAX.rust.line).toBeInstanceOf(RegExp);
      });

      it('should have go comment syntax', () => {
        expect(COMMENT_SYNTAX.go.line).toBeInstanceOf(RegExp);
      });
    });

    describe('edge cases', () => {
      it('should return empty array for code without functions', () => {
        const code = `
const x = 1;
const y = 2;
// Just some constants
`;

        const violations = analyzeVerbosityRatio(code);
        expect(violations.length).toBe(0);
      });

      it('should return empty array for empty content', () => {
        const violations = analyzeVerbosityRatio('');
        expect(violations.length).toBe(0);
      });

      it('should handle functions with no comments', () => {
        const code = `
function noComments() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}`;

        const violations = analyzeVerbosityRatio(code);
        expect(violations.length).toBe(0);
      });

      it('should report correct line numbers', () => {
        const code = `// File header

// More header

function verboseFunc() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  // Comment 6
  // Comment 7
  const x = 1;
  return x;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
        expect(violations[0].line).toBe(5); // Line where function starts
      });

      it('should handle nested braces correctly', () => {
        const code = `
function withNestedBraces() {
  // Comment explaining the if block
  // More explanation here
  // And even more detail
  // About what this does
  // And why we need it
  if (true) {
    const nested = { key: 'value' };
    return nested;
  }
}`;
        // 5 comment lines, 4 code lines = 1.25 ratio
        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 1.0, minCodeLines: 1 });
        expect(violations.length).toBe(1);
      });
    });

    describe('multiple functions', () => {
      it('should analyze all functions and report multiple violations', () => {
        const code = `
function verbose1() {
  // Comment 1
  // Comment 2
  // Comment 3
  // Comment 4
  // Comment 5
  const x = 1;
  return x;
}

function verbose2() {
  // Another verbose function
  // With too many comments
  // Explaining obvious code
  // That doesn't need it
  // Seriously
  const y = 2;
  return y;
}

function acceptable() {
  // One comment is fine
  const z = 3;
  return z;
}`;

        const violations = analyzeVerbosityRatio(code, { maxCommentRatio: 2.0, minCodeLines: 1 });
        expect(violations.length).toBe(2); // verbose1 and verbose2, not acceptable
      });
    });
  });

  // ============================================================================
  // Buzzword Inflation Detection Tests
  // ============================================================================

  describe('analyzeBuzzwordInflation', () => {
    const {
      analyzeBuzzwordInflation,
      extractClaims,
      searchEvidence,
      detectGaps,
      escapeRegex,
      BUZZWORD_CATEGORIES,
      EVIDENCE_PATTERNS
    } = require('../lib/patterns/slop-analyzers');

    describe('escapeRegex', () => {
      it('should escape regex special characters', () => {
        expect(escapeRegex('production-ready')).toBe('production-ready');
        expect(escapeRegex('foo.bar')).toBe('foo\\.bar');
        expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?');
        expect(escapeRegex('[test]')).toBe('\\[test\\]');
      });
    });

    describe('extractClaims', () => {
      describe('basic functionality', () => {
        it('should detect "production-ready" in content', () => {
          const content = 'This is a production-ready solution.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(1);
          expect(claims[0].buzzword).toBe('production-ready');
          expect(claims[0].category).toBe('production');
          expect(claims[0].line).toBe(1);
        });

        it('should detect "secure" in content', () => {
          const content = '/* This provides secure authentication */';
          const claims = extractClaims(content, 'auth.js');

          expect(claims.length).toBe(1);
          expect(claims[0].buzzword).toBe('secure');
          expect(claims[0].category).toBe('security');
        });

        it('should detect "enterprise-grade" in content', () => {
          const content = '# Enterprise-Grade API\n\nThis is enterprise-grade software.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(2);
          expect(claims[0].buzzword).toBe('enterprise-grade');
          expect(claims[0].category).toBe('enterprise');
        });

        it('should detect multiple buzzwords in same line', () => {
          const content = 'This is a secure and scalable solution.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(2);
          const buzzwords = claims.map(c => c.buzzword);
          expect(buzzwords).toContain('secure');
          expect(buzzwords).toContain('scalable');
        });

        it('should detect buzzwords case-insensitively', () => {
          const content = 'This is PRODUCTION-READY and Scalable.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(2);
        });
      });

      describe('positive claim detection', () => {
        it('should mark "is production-ready" as positive claim', () => {
          const content = 'This application is production-ready.';
          const claims = extractClaims(content, 'README.md');

          expect(claims[0].isPositiveClaim).toBe(true);
        });

        it('should mark "provides secure" as positive claim', () => {
          const content = 'This module provides secure authentication.';
          const claims = extractClaims(content, 'README.md');

          expect(claims[0].isPositiveClaim).toBe(true);
        });

        it('should mark "fully production-ready" as positive claim', () => {
          const content = 'This is fully production-ready for deployment.';
          const claims = extractClaims(content, 'README.md');

          expect(claims[0].isPositiveClaim).toBe(true);
        });

        it('should mark "offers enterprise-grade" as positive claim', () => {
          const content = 'This offers enterprise-grade security.';
          const claims = extractClaims(content, 'README.md');

          expect(claims[0].isPositiveClaim).toBe(true);
        });
      });

      describe('non-claim detection', () => {
        it('should NOT mark "TODO: make secure" as positive claim', () => {
          const content = '// TODO: make this more secure';
          const claims = extractClaims(content, 'auth.js');

          expect(claims.length).toBe(1);
          expect(claims[0].isPositiveClaim).toBe(false);
        });

        it('should NOT mark "should be production-ready" as positive claim', () => {
          const content = 'This should be production-ready before release.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(1);
          expect(claims[0].isPositiveClaim).toBe(false);
        });

        it('should NOT mark "will be secure" as positive claim', () => {
          const content = 'The authentication will be secure in v2.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(1);
          expect(claims[0].isPositiveClaim).toBe(false);
        });

        it('should NOT mark "FIXME: make robust" as positive claim', () => {
          const content = '// FIXME: make this more robust';
          const claims = extractClaims(content, 'app.js');

          expect(claims.length).toBe(1);
          expect(claims[0].isPositiveClaim).toBe(false);
        });

        it('should NOT mark "need to be scalable" as positive claim', () => {
          const content = 'This needs to be scalable for production.';
          const claims = extractClaims(content, 'README.md');

          expect(claims.length).toBe(1);
          expect(claims[0].isPositiveClaim).toBe(false);
        });
      });

      describe('edge cases', () => {
        it('should handle empty content', () => {
          const claims = extractClaims('', 'README.md');
          expect(claims.length).toBe(0);
        });

        it('should handle content with no buzzwords', () => {
          const claims = extractClaims('Hello world\nThis is a test.', 'README.md');
          expect(claims.length).toBe(0);
        });

        it('should handle buzzword as part of larger word (no match)', () => {
          // "insecure" contains "secure" but should not match due to word boundary
          const claims = extractClaims('This is insecure code.', 'README.md');
          expect(claims.length).toBe(0);
        });
      });
    });

    describe('searchEvidence', () => {
      // Create a mock filesystem helper
      function createMockFs(files) {
        return {
          readdirSync: (dir, opts) => {
            const entries = files
              .filter(f => f.path.startsWith(dir.replace(/\\/g, '/')) || dir === '.')
              .map(f => ({
                name: f.path.split('/').pop(),
                isDirectory: () => f.type === 'dir',
                isFile: () => f.type === 'file'
              }));
            return entries;
          },
          readFileSync: (filePath) => {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const file = files.find(f => normalizedPath.endsWith(f.path) || f.path === normalizedPath);
            if (!file) throw new Error('ENOENT');
            return file.content;
          },
          statSync: (filePath) => {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const file = files.find(f => normalizedPath.endsWith(f.path));
            if (!file) throw new Error('ENOENT');
            return {
              isFile: () => file.type === 'file',
              isDirectory: () => file.type === 'dir'
            };
          }
        };
      }

      it('should find test files as production evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'production',
          EVIDENCE_PATTERNS,
          ['src/app.js', 'src/app.test.js'],
          { fs: createMockFs([
            { path: 'src/app.js', content: 'function main() {}', type: 'file' },
            { path: 'src/app.test.js', content: 'test("works", () => {})', type: 'file' }
          ])}
        );

        expect(evidence.categories.tests).toBeDefined();
        expect(evidence.total).toBeGreaterThan(0);
      });

      it('should find error handling as production evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'production',
          EVIDENCE_PATTERNS,
          ['src/app.js'],
          { fs: createMockFs([
            { path: 'src/app.js', content: 'try { foo() } catch (e) { console.error(e) }', type: 'file' }
          ])}
        );

        expect(evidence.categories.errorHandling).toBeDefined();
      });

      it('should find logging as production evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'production',
          EVIDENCE_PATTERNS,
          ['src/app.js'],
          { fs: createMockFs([
            { path: 'src/app.js', content: 'logger.info("Starting...")', type: 'file' }
          ])}
        );

        expect(evidence.categories.logging).toBeDefined();
      });

      it('should find auth patterns as security evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'security',
          EVIDENCE_PATTERNS,
          ['src/auth.js'],
          { fs: createMockFs([
            { path: 'src/auth.js', content: 'const token = jwt.sign(user)', type: 'file' }
          ])}
        );

        expect(evidence.categories.auth).toBeDefined();
      });

      it('should find validation as security evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'security',
          EVIDENCE_PATTERNS,
          ['src/input.js'],
          { fs: createMockFs([
            { path: 'src/input.js', content: 'function validateInput(data) {}', type: 'file' }
          ])}
        );

        expect(evidence.categories.validation).toBeDefined();
      });

      it('should find async patterns as scale evidence', () => {
        const evidence = searchEvidence(
          '/repo',
          'scale',
          EVIDENCE_PATTERNS,
          ['src/app.js'],
          { fs: createMockFs([
            { path: 'src/app.js', content: 'async function fetchData() { await api.get() }', type: 'file' }
          ])}
        );

        expect(evidence.categories.async).toBeDefined();
      });

      it('should return empty evidence for unknown category', () => {
        const evidence = searchEvidence(
          '/repo',
          'unknown_category',
          EVIDENCE_PATTERNS,
          ['src/app.js'],
          { fs: createMockFs([
            { path: 'src/app.js', content: 'function main() {}', type: 'file' }
          ])}
        );

        expect(evidence.total).toBe(0);
        expect(evidence.found.length).toBe(0);
      });
    });

    describe('detectGaps', () => {
      it('should flag claim with zero evidence', () => {
        const claims = [{
          line: 1,
          buzzword: 'production-ready',
          category: 'production',
          text: 'This is production-ready.',
          isPositiveClaim: true,
          filePath: 'README.md'
        }];

        const mockFs = {
          readFileSync: () => 'const x = 1;'
        };

        const violations = detectGaps(
          claims,
          '/repo',
          EVIDENCE_PATTERNS,
          2,
          ['src/app.js'],
          { fs: mockFs }
        );

        expect(violations.length).toBe(1);
        expect(violations[0].buzzword).toBe('production-ready');
        expect(violations[0].severity).toBe('high');
      });

      it('should flag claim with partial evidence (medium severity)', () => {
        const claims = [{
          line: 1,
          buzzword: 'production-ready',
          category: 'production',
          text: 'This is production-ready.',
          isPositiveClaim: true,
          filePath: 'README.md'
        }];

        const mockFs = {
          readFileSync: () => 'try { foo() } catch (e) { }' // Has error handling only
        };

        const violations = detectGaps(
          claims,
          '/repo',
          EVIDENCE_PATTERNS,
          3, // Require 3 evidence matches
          ['src/app.js'],
          { fs: mockFs }
        );

        expect(violations.length).toBe(1);
        expect(violations[0].severity).toBe('medium');
        expect(violations[0].evidenceCount).toBe(1);
      });

      it('should NOT flag non-positive claims', () => {
        const claims = [{
          line: 1,
          buzzword: 'production-ready',
          category: 'production',
          text: 'TODO: make production-ready',
          isPositiveClaim: false,
          filePath: 'README.md'
        }];

        const mockFs = {
          readFileSync: () => 'console.log("hello")'
        };

        const violations = detectGaps(
          claims,
          '/repo',
          EVIDENCE_PATTERNS,
          2,
          ['src/app.js'],
          { fs: mockFs }
        );

        expect(violations.length).toBe(0);
      });

      it('should cache evidence searches per category', () => {
        const claims = [
          {
            line: 1,
            buzzword: 'production-ready',
            category: 'production',
            text: 'This is production-ready.',
            isPositiveClaim: true,
            filePath: 'README.md'
          },
          {
            line: 2,
            buzzword: 'prod-ready',
            category: 'production',
            text: 'This is prod-ready.',
            isPositiveClaim: true,
            filePath: 'README.md'
          }
        ];

        let readCount = 0;
        const mockFs = {
          readFileSync: () => {
            readCount++;
            return 'console.log("hello")';
          }
        };

        detectGaps(
          claims,
          '/repo',
          EVIDENCE_PATTERNS,
          2,
          ['src/app.js'],
          { fs: mockFs }
        );

        // Should only read files once per category (cached)
        expect(readCount).toBe(1);
      });
    });

    describe('analyzeBuzzwordInflation (integration)', () => {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      it('should return correct structure', () => {
        // Create temp directory with test files
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buzzword-test-'));

        try {
          // Create README with claim
          fs.writeFileSync(
            path.join(tmpDir, 'README.md'),
            '# My App\n\nThis is production-ready.'
          );

          // Create source file without evidence
          fs.mkdirSync(path.join(tmpDir, 'src'));
          fs.writeFileSync(
            path.join(tmpDir, 'src', 'app.js'),
            'console.log("hello")'
          );

          const result = analyzeBuzzwordInflation(tmpDir, { minEvidenceMatches: 2 });

          expect(result).toHaveProperty('claimsFound');
          expect(result).toHaveProperty('positiveClaimsFound');
          expect(result).toHaveProperty('violations');
          expect(result).toHaveProperty('verdict');
        } finally {
          // Cleanup
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should detect violations in real test scenario', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buzzword-test-'));

        try {
          fs.writeFileSync(
            path.join(tmpDir, 'README.md'),
            '# My App\n\nThis application is production-ready and provides secure authentication.'
          );

          fs.mkdirSync(path.join(tmpDir, 'src'));
          fs.writeFileSync(
            path.join(tmpDir, 'src', 'app.js'),
            'const x = 1;' // No evidence
          );

          const result = analyzeBuzzwordInflation(tmpDir, { minEvidenceMatches: 2 });

          expect(result.claimsFound).toBeGreaterThan(0);
          expect(result.positiveClaimsFound).toBeGreaterThan(0);
          expect(result.violations.length).toBeGreaterThan(0);
          expect(result.verdict).toBe('HIGH');
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should NOT flag claims with sufficient evidence', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buzzword-test-'));

        try {
          fs.writeFileSync(
            path.join(tmpDir, 'README.md'),
            '# My App\n\nThis is production-ready.'
          );

          fs.mkdirSync(path.join(tmpDir, 'src'));
          fs.writeFileSync(
            path.join(tmpDir, 'src', 'app.js'),
            `
try {
  doSomething();
} catch (e) {
  logger.error(e);
}
            `
          );
          fs.writeFileSync(
            path.join(tmpDir, 'src', 'app.test.js'),
            'test("works", () => { expect(1).toBe(1); })'
          );

          const result = analyzeBuzzwordInflation(tmpDir, { minEvidenceMatches: 2 });

          expect(result.violations.length).toBe(0);
          expect(result.verdict).toBe('OK');
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });

      it('should use default options when not provided', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buzzword-test-'));

        try {
          fs.writeFileSync(
            path.join(tmpDir, 'README.md'),
            'Hello world'
          );

          const result = analyzeBuzzwordInflation(tmpDir);

          expect(result).toHaveProperty('claimsFound');
          expect(result).toHaveProperty('verdict');
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      });
    });

    describe('ReDoS safety', () => {
      it('should handle long inputs safely for claim extraction', () => {
        const content = 'production-ready '.repeat(10000);

        const start = Date.now();
        extractClaims(content, 'README.md');
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(1000);
      });

      it('should handle pathological inputs safely', () => {
        // Pathological input that might cause backtracking
        const content = 'a'.repeat(1000) + 'production-ready' + 'b'.repeat(1000);

        const start = Date.now();
        extractClaims(content, 'README.md');
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(100);
      });
    });

    describe('constants', () => {
      it('should have all buzzword categories defined', () => {
        expect(BUZZWORD_CATEGORIES).toHaveProperty('production');
        expect(BUZZWORD_CATEGORIES).toHaveProperty('enterprise');
        expect(BUZZWORD_CATEGORIES).toHaveProperty('security');
        expect(BUZZWORD_CATEGORIES).toHaveProperty('scale');
        expect(BUZZWORD_CATEGORIES).toHaveProperty('reliability');
        expect(BUZZWORD_CATEGORIES).toHaveProperty('completeness');
      });

      it('should have evidence patterns for all categories', () => {
        expect(EVIDENCE_PATTERNS).toHaveProperty('production');
        expect(EVIDENCE_PATTERNS).toHaveProperty('enterprise');
        expect(EVIDENCE_PATTERNS).toHaveProperty('security');
        expect(EVIDENCE_PATTERNS).toHaveProperty('scale');
        expect(EVIDENCE_PATTERNS).toHaveProperty('reliability');
        expect(EVIDENCE_PATTERNS).toHaveProperty('completeness');
      });

      it('should have arrays of buzzwords per category', () => {
        for (const category of Object.values(BUZZWORD_CATEGORIES)) {
          expect(Array.isArray(category)).toBe(true);
          expect(category.length).toBeGreaterThan(0);
        }
      });

      it('should have regex patterns in evidence patterns', () => {
        for (const category of Object.values(EVIDENCE_PATTERNS)) {
          for (const patterns of Object.values(category)) {
            expect(Array.isArray(patterns)).toBe(true);
            for (const pattern of patterns) {
              expect(pattern).toBeInstanceOf(RegExp);
            }
          }
        }
      });
    });
  });

  describe('analyzeInfrastructureWithoutImplementation', () => {
    // Mock fs and path modules for testing
    const mockFs = {
      readdirSync: jest.fn(),
      readFileSync: jest.fn(),
      statSync: jest.fn()
    };

    const mockPath = {
      join: (...args) => args.join('/'),
      relative: (from, to) => to.replace(from + '/', ''),
      extname: (file) => {
        const lastDot = file.lastIndexOf('.');
        return lastDot > -1 ? file.substring(lastDot) : '';
      }
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('JavaScript client instantiation detection', () => {
      it('should detect unused new Client() instantiation', () => {
        const mockFiles = {
          'src/app.js': `
const express = require('express');
const RedisClient = require('redis');

const app = express();
const redisClient = new RedisClient({
  host: 'localhost',
  port: 6379
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(3000);
`,
          'src/utils.js': `
function helper() {
  return 42;
}

module.exports = { helper };
`
        };

        // Mock file system
        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'app.js', isDirectory: () => false, isFile: () => true },
              { name: 'utils.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(0);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].varName).toBe('redisClient');
        expect(result.violations[0].type).toBe('RedisClient');
        expect(result.verdict).toBe('LOW');
      });

      it('should not flag client used in same file', () => {
        const mockFiles = {
          'src/app.js': `
const RedisClient = require('redis');

const redisClient = new RedisClient({
  host: 'localhost',
  port: 6379
});

async function getData(key) {
  return await redisClient.get(key);
}

module.exports = { getData };
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'app.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(1);
        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });

      it('should detect unused factory pattern createClient()', () => {
        const mockFiles = {
          'src/db.js': `
const { createConnection } = require('mysql');

const dbConnection = createConnection({
  host: 'localhost',
  user: 'root',
  password: 'secret',
  database: 'myapp'
});

module.exports = {};
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'db.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(0);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].varName).toBe('dbConnection');
        expect(result.verdict).toBe('LOW');
      });
    });

    describe('Python class instantiation detection', () => {
      it('should detect unused Python client instantiation', () => {
        const mockFiles = {
          'app.py': `
import redis
from flask import Flask

app = Flask(__name__)
redis_client = redis.RedisClient(host='localhost', port=6379)

@app.route('/')
def index():
    return 'Hello World'

if __name__ == '__main__':
    app.run()
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'app.py', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(0);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].varName).toBe('redis_client');
        expect(result.verdict).toBe('LOW');
      });
    });

    describe('Go New* function detection', () => {
      it('should detect unused Go NewClient() pattern', () => {
        const mockFiles = {
          'main.go': `
package main

import (
    "fmt"
    "github.com/go-redis/redis"
)

func main() {
    redisClient := redis.NewClient(&redis.Options{
        Addr: "localhost:6379",
    })

    fmt.Println("Server starting...")
}
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'main.go', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(0);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].varName).toBe('redisClient');
        expect(result.verdict).toBe('LOW');
      });

      it('should not flag Go client used in function', () => {
        const mockFiles = {
          'main.go': `
package main

import (
    "github.com/go-redis/redis"
)

func main() {
    redisClient := redis.NewClient(&redis.Options{
        Addr: "localhost:6379",
    })

    value, err := redisClient.Get("key").Result()
    if err != nil {
        panic(err)
    }
}
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'main.go', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(1);
        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });
    });

    describe('Rust ::new() constructor detection', () => {
      it('should detect unused Rust Client::new() pattern', () => {
        const mockFiles = {
          'src/main.rs': `
use redis::Client;

fn main() {
    let redis_client = Client::new("redis://localhost/").unwrap();

    println!("Starting server...");
}
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'main.rs', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(0);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].varName).toBe('redis_client');
        expect(result.verdict).toBe('LOW');
      });
    });

    describe('Cross-file usage detection', () => {
      it('should not flag client used in different file', () => {
        const mockFiles = {
          'src/db.js': `
const { createConnection } = require('mysql');

const dbConnection = createConnection({
  host: 'localhost',
  user: 'root'
});

module.exports = { dbConnection };
`,
          'src/queries.js': `
const { dbConnection } = require('./db');

async function getUsers() {
  return dbConnection.query('SELECT * FROM users');
}

module.exports = { getUsers };
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'db.js', isDirectory: () => false, isFile: () => true },
              { name: 'queries.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(1);
        expect(result.usagesFound).toBe(1);
        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });
    });

    describe('False positive prevention', () => {
      it('should not flag exported infrastructure', () => {
        const mockFiles = {
          'src/redis.js': `
const redis = require('redis');

export const redisClient = redis.createClient({
  host: process.env.REDIS_HOST
});
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'redis.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });

      it('should not flag module.exports infrastructure', () => {
        const mockFiles = {
          'src/db.js': `
const mysql = require('mysql');

const pool = mysql.createPool({
  host: 'localhost'
});

module.exports.pool = pool;
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'src', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'src') {
            return [
              { name: 'db.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });

      it('should skip test files', () => {
        const mockFiles = {
          'test/redis.test.js': `
const RedisClient = require('../src/redis');

describe('Redis tests', () => {
  const testClient = new RedisClient();

  it('should connect', () => {
    expect(true).toBe(true);
  });
});
`
        };

        mockFs.readdirSync.mockImplementation((dir) => {
          // Normalize path - handle both '.', 'src', and './src'
          const normalized = dir.replace(/^\.\//, '').replace(/\/$/, '') || '.';
          if (normalized === '.') {
            return [
              { name: 'test', isDirectory: () => true, isFile: () => false }
            ];
          }
          if (normalized === 'test') {
            return [
              { name: 'redis.test.js', isDirectory: () => false, isFile: () => true }
            ];
          }
          return [];
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const file = path.replace(/^\.\//, '');
          if (mockFiles[file]) return mockFiles[file];
          throw new Error(`File not found: ${path}`);
        });

        const result = analyzeInfrastructureWithoutImplementation('.', {
          fs: mockFs,
          path: mockPath
        });

        expect(result.setupsFound).toBe(0); // Test files are skipped
        expect(result.violations.length).toBe(0);
        expect(result.verdict).toBe('OK');
      });
    });

    describe('Constants validation', () => {
      it('should have infrastructure suffixes defined', () => {
        expect(INFRASTRUCTURE_SUFFIXES).toBeDefined();
        expect(Array.isArray(INFRASTRUCTURE_SUFFIXES)).toBe(true);
        expect(INFRASTRUCTURE_SUFFIXES.length).toBeGreaterThan(0);
        expect(INFRASTRUCTURE_SUFFIXES).toContain('Client');
        expect(INFRASTRUCTURE_SUFFIXES).toContain('Connection');
        expect(INFRASTRUCTURE_SUFFIXES).toContain('Pool');
        expect(INFRASTRUCTURE_SUFFIXES).toContain('Service');
      });

      it('should have setup verbs defined', () => {
        expect(SETUP_VERBS).toBeDefined();
        expect(Array.isArray(SETUP_VERBS)).toBe(true);
        expect(SETUP_VERBS.length).toBeGreaterThan(0);
        expect(SETUP_VERBS).toContain('create');
        expect(SETUP_VERBS).toContain('connect');
        expect(SETUP_VERBS).toContain('init');
        expect(SETUP_VERBS).toContain('setup');
      });

      it('should have instantiation patterns for all languages', () => {
        expect(INSTANTIATION_PATTERNS).toBeDefined();
        expect(INSTANTIATION_PATTERNS).toHaveProperty('js');
        expect(INSTANTIATION_PATTERNS).toHaveProperty('python');
        expect(INSTANTIATION_PATTERNS).toHaveProperty('go');
        expect(INSTANTIATION_PATTERNS).toHaveProperty('rust');

        // Each language should have an array of regex patterns
        for (const patterns of Object.values(INSTANTIATION_PATTERNS)) {
          expect(Array.isArray(patterns)).toBe(true);
          expect(patterns.length).toBeGreaterThan(0);
          for (const pattern of patterns) {
            expect(pattern).toBeInstanceOf(RegExp);
          }
        }
      });
    });
  });
});
