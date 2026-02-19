import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Gap 2: --conversational flag on nimbus generate terraform
 *
 * Source verification tests that confirm the conversational option
 * and routing logic exist in generate-terraform.ts without requiring
 * actual service connections.
 */
describe('Gap 2: --conversational flag for generate terraform', () => {
  const sourcePath = path.resolve(
    __dirname,
    '../../src/commands/generate-terraform.ts'
  );
  const source = fs.readFileSync(sourcePath, 'utf-8');

  test('source file should exist', () => {
    expect(fs.existsSync(sourcePath)).toBe(true);
    expect(source.length).toBeGreaterThan(0);
  });

  describe('GenerateTerraformOptions interface', () => {
    test('should have conversational option', () => {
      expect(source).toContain('conversational?: boolean');
    });
  });

  describe('conversational mode routing', () => {
    test('should check options.conversational', () => {
      expect(source).toContain('options.conversational');
    });

    test('should call runConversational', () => {
      expect(source).toContain('runConversational');
    });

    test('should define runConversational function', () => {
      expect(source).toMatch(/async function runConversational/);
    });
  });

  describe('conversational API calls', () => {
    test('should call /api/conversational/message endpoint', () => {
      expect(source).toContain('/api/conversational/message');
    });

    test('should call /api/generate/from-conversation endpoint', () => {
      expect(source).toContain('/api/generate/from-conversation');
    });

    test('should send sessionId in API calls', () => {
      expect(source).toContain('sessionId');
    });

    test('should use applyBestPractices flag', () => {
      expect(source).toContain('applyBestPractices');
    });
  });

  describe('conversational UX', () => {
    test('should support exit command', () => {
      expect(source).toContain("'exit'");
    });

    test('should support generate command', () => {
      expect(source).toContain("'generate'");
    });

    test('should support done command', () => {
      expect(source).toContain("'done'");
    });

    test('should check suggested_actions for generate type', () => {
      expect(source).toContain('suggested_actions');
    });
  });
});
