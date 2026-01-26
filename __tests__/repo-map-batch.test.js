'use strict';

const path = require('path');

const installer = require('../lib/repo-map/installer');
const runner = require('../lib/repo-map/runner');

const fixtureRoot = path.join(__dirname, 'fixtures', 'repo-map');
const languages = Object.keys(runner.LANGUAGE_EXTENSIONS);

function sortByKeys(items, keys) {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const aValue = a[key];
      const bValue = b[key];
      if (aValue == null && bValue == null) continue;
      if (aValue == null) return -1;
      if (bValue == null) return 1;
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
    }
    return 0;
  });
}

function normalizeImports(imports) {
  return sortByKeys(imports || [], ['source', 'kind', 'line']);
}

function normalizeSymbols(symbols) {
  const normalizeList = (list) => sortByKeys(list || [], ['name', 'kind', 'line', 'exported']);
  return {
    exports: normalizeList(symbols.exports),
    functions: normalizeList(symbols.functions),
    classes: normalizeList(symbols.classes),
    types: normalizeList(symbols.types),
    constants: normalizeList(symbols.constants)
  };
}

function normalizeFileData(fileData) {
  return {
    hash: fileData.hash,
    language: fileData.language,
    size: fileData.size,
    symbols: normalizeSymbols(fileData.symbols || {}),
    imports: normalizeImports(fileData.imports || [])
  };
}

function normalizeDependencies(deps) {
  const result = {};
  const entries = Object.entries(deps || {}).sort(([a], [b]) => a.localeCompare(b));
  for (const [file, sources] of entries) {
    result[file] = [...sources].sort();
  }
  return result;
}

function buildExpectedMap(basePath, langs, cmd) {
  const expected = { files: {}, dependencies: {} };

  for (const lang of langs) {
    const files = runner.findFilesForLanguage(basePath, lang);
    for (const file of files) {
      const relativePath = path.relative(basePath, file).replace(/\\/g, '/');
      if (expected.files[relativePath]) continue;

      const fileData = runner.scanSingleFile(cmd, file, basePath);
      if (!fileData) continue;

      expected.files[relativePath] = fileData;

      if (fileData.imports && fileData.imports.length > 0) {
        expected.dependencies[relativePath] = Array.from(new Set(
          fileData.imports.map((imp) => imp.source)
        ));
      }
    }
  }

  return expected;
}

describe('repo-map batch scanning', () => {
  const installed = installer.checkInstalledSync();
  const runTest = installed.found ? test : test.skip;

  runTest('fullScan matches scanSingleFile for fixtures', async () => {
    const actual = await runner.fullScan(fixtureRoot, languages, { includeDocs: false });
    const expected = buildExpectedMap(fixtureRoot, languages, installed.command);

    expect(Object.keys(actual.files).length).toBeGreaterThan(0);
    expect(actual.stats.totalSymbols).toBeGreaterThan(0);

    const actualKeys = Object.keys(actual.files).sort();
    const expectedKeys = Object.keys(expected.files).sort();
    expect(actualKeys).toEqual(expectedKeys);

    for (const file of actualKeys) {
      expect(normalizeFileData(actual.files[file])).toEqual(
        normalizeFileData(expected.files[file])
      );
    }

    expect(normalizeDependencies(actual.dependencies)).toEqual(
      normalizeDependencies(expected.dependencies)
    );
  });
});
