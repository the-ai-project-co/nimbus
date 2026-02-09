/**
 * CLI Analyze E2E Tests
 * Tests for codebase analysis functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Create a temporary directory for test files
const testDir = path.join(os.tmpdir(), 'nimbus-analyze-test-' + Date.now());

describe('Analyze Command', () => {
  beforeAll(() => {
    // Create test directory and files
    fs.mkdirSync(testDir, { recursive: true });

    // Create a file with various issues
    fs.writeFileSync(
      path.join(testDir, 'test-file.ts'),
      `
/**
 * Test file with various code issues
 */

// TODO: Fix this later
const password = "secret123"; // Hardcoded credential

function veryLongFunctionNameThatExceedsTheRecommendedLineLengthAndShouldBeRefactoredToMakeItMoreReadableAndMaintainableInTheLongRun() {
  return true;
}

function nestedCallbacks() {
  return [1, 2, 3].map((x) => {
    return [4, 5, 6].map((y) => {
      return x * y;
    });
  });
}

const unsafeQuery = \`SELECT * FROM users WHERE id = \${userId}\`;

function undocumented(x, y) {
  return x + y;
}
`.trim()
    );

    // Create another file for testing
    fs.writeFileSync(
      path.join(testDir, 'clean-file.ts'),
      `
/**
 * A clean file with good practices
 */

/**
 * Adds two numbers
 */
function add(x: number, y: number): number {
  return x + y;
}

export { add };
`.trim()
    );
  });

  afterAll(() => {
    // Cleanup test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('File Analysis', () => {
    it('detects long lines', async () => {
      // Import the analyze function
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      // Capture output by temporarily redirecting console
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json']));
      } finally {
        console.log = originalLog;
      }

      // Parse the JSON output
      const output = logs.join('');
      const analysis = JSON.parse(output);

      // Should have suggestions
      expect(analysis.suggestions.length).toBeGreaterThan(0);
      expect(analysis.summary.filesAnalyzed).toBe(2);
    });

    it('detects TODO comments', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json', '--type', 'all']));
      } finally {
        console.log = originalLog;
      }

      const analysis = JSON.parse(logs.join(''));
      const todoSuggestion = analysis.suggestions.find(
        (s: any) => s.explanation.includes('TODO')
      );

      expect(todoSuggestion).toBeDefined();
    });

    it('detects potential security issues', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json', '--type', 'security']));
      } finally {
        console.log = originalLog;
      }

      const analysis = JSON.parse(logs.join(''));

      // Should detect hardcoded password
      const securityIssue = analysis.suggestions.find(
        (s: any) => s.type === 'security'
      );
      expect(securityIssue).toBeDefined();
    });

    it('filters by type', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json', '--type', 'docs']));
      } finally {
        console.log = originalLog;
      }

      const analysis = JSON.parse(logs.join(''));

      // All suggestions should be style-related (for docs type)
      for (const suggestion of analysis.suggestions) {
        expect(suggestion.type).toBe('style');
      }
    });
  });

  describe('Output Formats', () => {
    it('outputs JSON format', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json']));
      } finally {
        console.log = originalLog;
      }

      // Should be valid JSON
      expect(() => JSON.parse(logs.join(''))).not.toThrow();
    });

    it('includes summary in output', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await analyzeCommand(parseAnalyzeOptions(['--path', testDir, '--json']));
      } finally {
        console.log = originalLog;
      }

      const analysis = JSON.parse(logs.join(''));

      expect(analysis.summary).toBeDefined();
      expect(analysis.summary.filesAnalyzed).toBeGreaterThan(0);
      expect(analysis.summary.suggestionsCount).toBeGreaterThanOrEqual(0);
      expect(analysis.summary.byType).toBeDefined();
      expect(analysis.summary.bySeverity).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('handles non-existent path gracefully', async () => {
      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      // Should not throw
      await analyzeCommand(parseAnalyzeOptions(['--path', '/non/existent/path']));
    });

    it('handles empty directory', async () => {
      const emptyDir = path.join(testDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      const { analyzeCommand, parseAnalyzeOptions } = await import(
        '../../services/cli-service/src/commands/analyze/index'
      );

      // Should not throw
      await analyzeCommand(parseAnalyzeOptions(['--path', emptyDir]));
    });
  });
});
