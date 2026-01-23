/**
 * Tests for docs-analyzer and docs-patterns
 */

const {
  docsPatterns,
  estimateTokens,
  getAllPatterns,
  getPatternsByMode,
  getPatternsByCertainty,
  getPatternsForMode
} = require('../lib/enhance/docs-patterns');

const {
  analyzeDoc,
  analyzeAllDocs,
  analyze,
  fixInconsistentHeadings,
  fixVerboseExplanations
} = require('../lib/enhance/docs-analyzer');

const {
  generateDocsReport,
  generateDocsSummaryReport
} = require('../lib/enhance/reporter');

const {
  fixInconsistentHeadings: fixerFixHeadings,
  fixVerboseExplanations: fixerFixVerbose
} = require('../lib/enhance/fixer');

describe('docs-patterns', () => {
  describe('estimateTokens', () => {
    test('should estimate tokens correctly', () => {
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens('test')).toBe(1); // 4 chars / 4 = 1
      expect(estimateTokens('hello world test')).toBe(4); // 16 chars / 4 = 4
    });
  });

  describe('getAllPatterns', () => {
    test('should return all patterns', () => {
      const patterns = getAllPatterns();
      expect(Object.keys(patterns).length).toBeGreaterThan(0);
      expect(patterns.broken_internal_link).toBeDefined();
      expect(patterns.inconsistent_heading_levels).toBeDefined();
    });
  });

  describe('getPatternsByMode', () => {
    test('should filter by ai mode', () => {
      const aiPatterns = getPatternsByMode('ai');
      expect(Object.keys(aiPatterns).length).toBeGreaterThan(0);
      // Should include AI-specific patterns
      expect(aiPatterns.unnecessary_prose).toBeDefined();
      // Should include shared patterns
      expect(aiPatterns.broken_internal_link).toBeDefined();
    });

    test('should filter by both mode', () => {
      const bothPatterns = getPatternsByMode('both');
      expect(Object.keys(bothPatterns).length).toBeGreaterThan(0);
      expect(bothPatterns.missing_section_headers).toBeDefined();
      // Should include shared patterns
      expect(bothPatterns.broken_internal_link).toBeDefined();
    });
  });

  describe('getPatternsForMode', () => {
    test('should include shared patterns in both modes', () => {
      const aiPatterns = getPatternsForMode('ai');
      const bothPatterns = getPatternsForMode('both');

      // Both should have shared patterns
      expect(aiPatterns.broken_internal_link).toBeDefined();
      expect(bothPatterns.broken_internal_link).toBeDefined();
      expect(aiPatterns.inconsistent_heading_levels).toBeDefined();
      expect(bothPatterns.inconsistent_heading_levels).toBeDefined();
    });
  });

  describe('getPatternsByCertainty', () => {
    test('should filter by HIGH certainty', () => {
      const highPatterns = getPatternsByCertainty('HIGH');
      expect(Object.keys(highPatterns).length).toBeGreaterThan(0);

      for (const pattern of Object.values(highPatterns)) {
        expect(pattern.certainty).toBe('HIGH');
      }
    });

    test('should filter by MEDIUM certainty', () => {
      const mediumPatterns = getPatternsByCertainty('MEDIUM');
      expect(Object.keys(mediumPatterns).length).toBeGreaterThan(0);

      for (const pattern of Object.values(mediumPatterns)) {
        expect(pattern.certainty).toBe('MEDIUM');
      }
    });
  });

  describe('pattern checks', () => {
    describe('broken_internal_link', () => {
      const pattern = docsPatterns.broken_internal_link;

      test('should detect broken anchor links', () => {
        const content = `# Heading One

[Link to section](#non-existent-section)
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('Broken internal links');
      });

      test('should not flag valid anchor links', () => {
        const content = `# Heading One

[Link to heading one](#heading-one)
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });

      test('should ignore external links', () => {
        const content = `[External link](https://example.com)`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });

    describe('inconsistent_heading_levels', () => {
      const pattern = docsPatterns.inconsistent_heading_levels;

      test('should detect skipped heading levels', () => {
        const content = `# H1

### H3 (skipped H2)
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('jumps from H1 to H3');
      });

      test('should not flag consistent heading levels', () => {
        const content = `# H1

## H2

### H3
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });

      test('should allow going back up levels', () => {
        const content = `# H1

## H2

### H3

## H2 again
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });

    describe('missing_code_language', () => {
      const pattern = docsPatterns.missing_code_language;

      test('should detect code blocks without language', () => {
        const content = 'text\n```\nconst x = 1;\n```\nmore';
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('without language specification');
      });

      test('should not flag code blocks with language', () => {
        const content = 'text\n```javascript\nconst x = 1;\n```\nmore';
        const result = pattern.check(content);
        expect(result).toBeNull();
      });

      test('should count mixed blocks correctly', () => {
        const content = 'text\n```\nno lang\n```\n```js\nhas lang\n```\nmore';
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('1 code block');
      });
    });

    describe('section_too_long', () => {
      const pattern = docsPatterns.section_too_long;

      test('should detect sections over 1000 tokens', () => {
        // Create a section with ~1200 tokens (4800+ chars)
        const longText = 'word '.repeat(1200);
        const content = `# Heading

${longText}
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('exceed 1000 tokens');
      });

      test('should not flag short sections', () => {
        const content = `# Heading

Short content here.
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });

    describe('unnecessary_prose (AI mode)', () => {
      const pattern = docsPatterns.unnecessary_prose;

      test('should detect unnecessary prose patterns', () => {
        const content = `
In this document, we will explore the topic.
As you can see, this is important.
Please note that you should read carefully.
It is important to note that this matters.
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('unnecessary prose');
      });

      test('should not flag clean content', () => {
        const content = `
The API accepts JSON requests.
Responses are returned in JSON format.
Authentication is required.
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });

    describe('verbose_explanations (AI mode)', () => {
      const pattern = docsPatterns.verbose_explanations;

      test('should detect verbose phrases', () => {
        const content = `
In order to use this, you need to configure it.
Due to the fact that it is complex, read carefully.
The system has the ability to process requests.
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('verbose phrases');
      });

      test('should not flag concise content', () => {
        const content = `
To use this, configure it.
Because it is complex, read carefully.
The system can process requests.
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });

    describe('missing_section_headers (both mode)', () => {
      const pattern = docsPatterns.missing_section_headers;

      test('should detect long content without headers', () => {
        // Create content with ~600 tokens without any headers
        const longText = 'word '.repeat(600);
        const content = `# Title

${longText}
`;
        const result = pattern.check(content);
        expect(result).not.toBeNull();
        expect(result.issue).toContain('without sub-headers');
      });

      test('should not flag well-structured content', () => {
        const content = `# Title

## Section 1

Some content here.

## Section 2

More content here.
`;
        const result = pattern.check(content);
        expect(result).toBeNull();
      });
    });
  });
});

describe('docs-analyzer', () => {
  describe('fixInconsistentHeadings', () => {
    test('should fix skipped heading levels', () => {
      const content = `# H1

### H3
`;
      const fixed = fixInconsistentHeadings(content);
      expect(fixed).toContain('## H3');
      expect(fixed).not.toContain('### H3');
    });

    test('should preserve valid heading structure', () => {
      const content = `# H1

## H2

### H3
`;
      const fixed = fixInconsistentHeadings(content);
      expect(fixed).toBe(content);
    });

    test('should not modify headings inside code blocks', () => {
      const content = `# H1

\`\`\`markdown
### Code heading
\`\`\`

#### H4
`;
      const fixed = fixInconsistentHeadings(content);
      // Code block heading should be preserved
      expect(fixed).toContain('### Code heading');
      // H4 after H1 should become H2
      expect(fixed).toContain('## H4');
    });
  });

  describe('fixVerboseExplanations', () => {
    test('should replace verbose phrases', () => {
      const content = `In order to proceed, you need to configure the system.`;
      const fixed = fixVerboseExplanations(content);
      expect(fixed).toBe('To proceed, you need to configure the system.');
    });

    test('should replace multiple verbose phrases', () => {
      const content = `In order to proceed, due to the fact that it is complex, the majority of users fail.`;
      const fixed = fixVerboseExplanations(content);
      expect(fixed).toContain('To proceed');
      expect(fixed).toContain('because');
      expect(fixed).toContain('most');
    });

    test('should not modify code blocks', () => {
      const content = `
Use this function:

\`\`\`javascript
// In order to proceed
const x = 1;
\`\`\`
`;
      const fixed = fixVerboseExplanations(content);
      expect(fixed).toContain('// In order to proceed');
    });
  });
});

describe('fixer exports', () => {
  describe('fixInconsistentHeadings', () => {
    test('should be exported from fixer', () => {
      expect(typeof fixerFixHeadings).toBe('function');
    });

    test('should work correctly', () => {
      const content = `# H1\n\n#### H4`;
      const fixed = fixerFixHeadings(content);
      expect(fixed).toContain('## H4');
    });
  });

  describe('fixVerboseExplanations', () => {
    test('should be exported from fixer', () => {
      expect(typeof fixerFixVerbose).toBe('function');
    });

    test('should work correctly', () => {
      const content = `In order to test this`;
      const fixed = fixerFixVerbose(content);
      expect(fixed).toBe('To test this');
    });
  });
});

describe('reporter', () => {
  describe('generateDocsReport', () => {
    test('should generate report for single doc', () => {
      const results = {
        docName: 'test-doc',
        docPath: '/path/to/test-doc.md',
        mode: 'both',
        tokenCount: 500,
        linkIssues: [],
        structureIssues: [{
          issue: 'Heading level jumps',
          fix: 'Fix hierarchy',
          certainty: 'HIGH',
          patternId: 'inconsistent_heading_levels'
        }],
        codeIssues: [],
        efficiencyIssues: [],
        ragIssues: [],
        balanceIssues: []
      };

      const report = generateDocsReport(results);

      expect(report).toContain('# Documentation Analysis: test-doc');
      expect(report).toContain('**Mode**: Both audiences');
      expect(report).toContain('**Token Count**: ~500');
      expect(report).toContain('### Structure Issues (1)');
      expect(report).toContain('Heading level jumps');
    });

    test('should show AI mode label', () => {
      const results = {
        docName: 'test-doc',
        docPath: '/path/to/test-doc.md',
        mode: 'ai',
        tokenCount: 500,
        linkIssues: [],
        structureIssues: [],
        codeIssues: [],
        efficiencyIssues: [],
        ragIssues: [],
        balanceIssues: []
      };

      const report = generateDocsReport(results);
      expect(report).toContain('**Mode**: AI-only (RAG optimized)');
    });
  });

  describe('generateDocsSummaryReport', () => {
    test('should generate summary for multiple docs', () => {
      const results = [
        {
          docName: 'doc1',
          docPath: '/path/to/doc1.md',
          mode: 'both',
          tokenCount: 500,
          linkIssues: [],
          structureIssues: [{ certainty: 'HIGH' }],
          codeIssues: [],
          efficiencyIssues: [],
          ragIssues: [],
          balanceIssues: []
        },
        {
          docName: 'doc2',
          docPath: '/path/to/doc2.md',
          mode: 'both',
          tokenCount: 300,
          linkIssues: [],
          structureIssues: [],
          codeIssues: [{ certainty: 'HIGH' }],
          efficiencyIssues: [],
          ragIssues: [],
          balanceIssues: [{ certainty: 'MEDIUM' }]
        }
      ];

      const report = generateDocsSummaryReport(results);

      expect(report).toContain('# Documentation Analysis Summary');
      expect(report).toContain('**Analyzed**: 2 documents');
      expect(report).toContain('**Total Tokens**: ~800');
      expect(report).toContain('| HIGH | 2 |');
      expect(report).toContain('| MEDIUM | 1 |');
      expect(report).toContain('| doc1 |');
      expect(report).toContain('| doc2 |');
    });
  });
});

describe('index exports', () => {
  test('should export docsAnalyzer', () => {
    const enhance = require('../lib/enhance');
    expect(enhance.docsAnalyzer).toBeDefined();
    expect(enhance.docsAnalyzer.analyzeDoc).toBeDefined();
    expect(enhance.docsAnalyzer.analyzeAllDocs).toBeDefined();
  });

  test('should export docsPatterns', () => {
    const enhance = require('../lib/enhance');
    expect(enhance.docsPatterns).toBeDefined();
    expect(enhance.docsPatterns.docsPatterns).toBeDefined();
    expect(enhance.docsPatterns.getPatternsForMode).toBeDefined();
  });

  test('should export convenience functions', () => {
    const enhance = require('../lib/enhance');
    expect(enhance.analyzeDoc).toBeDefined();
    expect(enhance.analyzeAllDocs).toBeDefined();
    expect(enhance.docsApplyFixes).toBeDefined();
    expect(enhance.docsGenerateReport).toBeDefined();
  });
});
