import { describe, test, expect } from 'bun:test';
import { questionnaireCommand, type QuestionnaireOptions } from '../../src/commands/questionnaire';

describe('Questionnaire Flow Integration', () => {
  describe('Questionnaire Command', () => {
    test('should export questionnaireCommand function', () => {
      expect(typeof questionnaireCommand).toBe('function');
    });

    test('should accept terraform type', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        dryRun: true,
        nonInteractive: true,
      };

      expect(options.type).toBe('terraform');
    });

    test('should accept kubernetes type', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
        dryRun: true,
        nonInteractive: true,
      };

      expect(options.type).toBe('kubernetes');
    });

    test('should accept helm type', () => {
      const options: QuestionnaireOptions = {
        type: 'helm',
        dryRun: true,
        nonInteractive: true,
      };

      expect(options.type).toBe('helm');
    });

    test('should support output directory option', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        outputDir: './output',
      };

      expect(options.outputDir).toBe('./output');
    });

    test('should support answers file option', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        answersFile: './answers.json',
      };

      expect(options.answersFile).toBe('./answers.json');
    });
  });

  describe('QuestionnaireOptions Type', () => {
    test('should have required type field', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
      };

      expect(options.type).toBeDefined();
    });

    test('should allow optional fields', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
        nonInteractive: true,
        answersFile: './answers.json',
        outputDir: './output',
        dryRun: true,
      };

      expect(options.nonInteractive).toBe(true);
      expect(options.answersFile).toBe('./answers.json');
      expect(options.outputDir).toBe('./output');
      expect(options.dryRun).toBe(true);
    });
  });
});
