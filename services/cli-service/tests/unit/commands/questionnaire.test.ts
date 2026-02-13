/**
 * Questionnaire Command Tests
 *
 * Tests for questionnaireCommand exports and option structure validation
 */

import { describe, it, expect } from 'bun:test';
import {
  questionnaireCommand,
  type QuestionnaireOptions,
} from '../../../src/commands/questionnaire';

describe('Questionnaire Command', () => {
  describe('exports', () => {
    it('should export questionnaireCommand as a function', () => {
      expect(typeof questionnaireCommand).toBe('function');
    });

    it('should export questionnaireCommand as the default export', async () => {
      const mod = await import('../../../src/commands/questionnaire');

      expect(typeof mod.default).toBe('function');
      expect(mod.default).toBe(questionnaireCommand);
    });
  });

  describe('QuestionnaireOptions type validation', () => {
    it('should accept terraform as a valid type', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
      };

      expect(options.type).toBe('terraform');
    });

    it('should accept kubernetes as a valid type', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
      };

      expect(options.type).toBe('kubernetes');
    });

    it('should accept helm as a valid type', () => {
      const options: QuestionnaireOptions = {
        type: 'helm',
      };

      expect(options.type).toBe('helm');
    });

    it('should default optional fields to undefined', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
      };

      expect(options.nonInteractive).toBeUndefined();
      expect(options.answersFile).toBeUndefined();
      expect(options.outputDir).toBeUndefined();
      expect(options.dryRun).toBeUndefined();
    });

    it('should accept nonInteractive option', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        nonInteractive: true,
      };

      expect(options.nonInteractive).toBe(true);
    });

    it('should accept answersFile option', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
        answersFile: './answers.json',
      };

      expect(options.answersFile).toBe('./answers.json');
    });

    it('should accept outputDir option', () => {
      const options: QuestionnaireOptions = {
        type: 'helm',
        outputDir: './generated',
      };

      expect(options.outputDir).toBe('./generated');
    });

    it('should accept dryRun option', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        dryRun: true,
      };

      expect(options.dryRun).toBe(true);
    });

    it('should accept a fully populated terraform options object', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        nonInteractive: true,
        answersFile: './terraform-answers.json',
        outputDir: './terraform-output',
        dryRun: false,
      };

      expect(options.type).toBe('terraform');
      expect(options.nonInteractive).toBe(true);
      expect(options.answersFile).toBe('./terraform-answers.json');
      expect(options.outputDir).toBe('./terraform-output');
      expect(options.dryRun).toBe(false);
    });

    it('should accept a fully populated kubernetes options object', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
        nonInteractive: true,
        answersFile: './k8s-answers.json',
        outputDir: './k8s-manifests',
        dryRun: true,
      };

      expect(options.type).toBe('kubernetes');
      expect(options.nonInteractive).toBe(true);
      expect(options.answersFile).toBe('./k8s-answers.json');
      expect(options.outputDir).toBe('./k8s-manifests');
      expect(options.dryRun).toBe(true);
    });

    it('should accept a fully populated helm options object', () => {
      const options: QuestionnaireOptions = {
        type: 'helm',
        nonInteractive: false,
        answersFile: './helm-answers.json',
        outputDir: './helm-charts',
        dryRun: false,
      };

      expect(options.type).toBe('helm');
      expect(options.nonInteractive).toBe(false);
      expect(options.answersFile).toBe('./helm-answers.json');
      expect(options.outputDir).toBe('./helm-charts');
      expect(options.dryRun).toBe(false);
    });

    it('should accept nonInteractive with answersFile for batch mode', () => {
      const options: QuestionnaireOptions = {
        type: 'terraform',
        nonInteractive: true,
        answersFile: './ci-answers.json',
      };

      expect(options.nonInteractive).toBe(true);
      expect(options.answersFile).toBe('./ci-answers.json');
    });

    it('should accept dryRun without outputDir', () => {
      const options: QuestionnaireOptions = {
        type: 'kubernetes',
        dryRun: true,
      };

      expect(options.dryRun).toBe(true);
      expect(options.outputDir).toBeUndefined();
    });
  });
});
