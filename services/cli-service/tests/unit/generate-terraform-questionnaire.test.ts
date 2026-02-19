import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE_FILE = path.resolve(
  __dirname,
  '../../src/commands/generate-terraform.ts'
);

const source = fs.readFileSync(SOURCE_FILE, 'utf-8');

describe('generate-terraform --questionnaire flag', () => {
  test('GenerateTerraformOptions interface should include questionnaire field', () => {
    expect(source).toContain('questionnaire?: boolean');
  });

  test('generateTerraformCommand should check options.questionnaire', () => {
    expect(source).toContain('if (options.questionnaire)');
  });

  test('should dynamically import questionnaireCommand', () => {
    expect(source).toContain("await import('./questionnaire')");
  });

  test('should call questionnaireCommand with type terraform', () => {
    expect(source).toContain("type: 'terraform'");
  });

  test('should pass output option as outputDir to questionnaireCommand', () => {
    expect(source).toContain('outputDir: options.output');
  });

  test('questionnaire check should come after nonInteractive check', () => {
    const nonInteractiveIdx = source.indexOf('if (options.nonInteractive)');
    const questionnaireIdx = source.indexOf('if (options.questionnaire)');
    expect(nonInteractiveIdx).toBeGreaterThan(-1);
    expect(questionnaireIdx).toBeGreaterThan(-1);
    expect(questionnaireIdx).toBeGreaterThan(nonInteractiveIdx);
  });

  test('questionnaire branch should return early after calling questionnaireCommand', () => {
    // Find the questionnaire block and verify it returns
    const questionnaireIdx = source.indexOf('if (options.questionnaire)');
    const blockAfter = source.substring(questionnaireIdx, questionnaireIdx + 300);
    expect(blockAfter).toContain('return;');
  });
});
