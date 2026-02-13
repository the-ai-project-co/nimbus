/**
 * Feedback Command Tests
 *
 * Tests for parseFeedbackOptions and feedbackCommand exports
 */

import { describe, it, expect } from 'bun:test';
import {
  parseFeedbackOptions,
  feedbackCommand,
  type FeedbackOptions,
} from '../../../src/commands/feedback';

describe('Feedback Command', () => {
  describe('parseFeedbackOptions', () => {
    it('should return empty options for empty args', () => {
      const options = parseFeedbackOptions([]);

      expect(options.bug).toBeUndefined();
      expect(options.feature).toBeUndefined();
      expect(options.question).toBeUndefined();
      expect(options.title).toBeUndefined();
      expect(options.body).toBeUndefined();
      expect(options.open).toBeUndefined();
      expect(options.json).toBeUndefined();
    });

    it('should parse --bug flag', () => {
      const options = parseFeedbackOptions(['--bug']);

      expect(options.bug).toBe(true);
    });

    it('should parse -b shorthand for bug', () => {
      const options = parseFeedbackOptions(['-b']);

      expect(options.bug).toBe(true);
    });

    it('should parse --feature flag', () => {
      const options = parseFeedbackOptions(['--feature']);

      expect(options.feature).toBe(true);
    });

    it('should parse -f shorthand for feature', () => {
      const options = parseFeedbackOptions(['-f']);

      expect(options.feature).toBe(true);
    });

    it('should parse --question flag', () => {
      const options = parseFeedbackOptions(['--question']);

      expect(options.question).toBe(true);
    });

    it('should parse -q shorthand for question', () => {
      const options = parseFeedbackOptions(['-q']);

      expect(options.question).toBe(true);
    });

    it('should parse --title flag with value', () => {
      const options = parseFeedbackOptions(['--title', 'Something is broken']);

      expect(options.title).toBe('Something is broken');
    });

    it('should parse -t shorthand for title', () => {
      const options = parseFeedbackOptions(['-t', 'My Title']);

      expect(options.title).toBe('My Title');
    });

    it('should parse --body flag with value', () => {
      const options = parseFeedbackOptions(['--body', 'Detailed description here']);

      expect(options.body).toBe('Detailed description here');
    });

    it('should parse -m shorthand for body', () => {
      const options = parseFeedbackOptions(['-m', 'Message body']);

      expect(options.body).toBe('Message body');
    });

    it('should parse --open flag', () => {
      const options = parseFeedbackOptions(['--open']);

      expect(options.open).toBe(true);
    });

    it('should parse -o shorthand for open', () => {
      const options = parseFeedbackOptions(['-o']);

      expect(options.open).toBe(true);
    });

    it('should parse --json flag', () => {
      const options = parseFeedbackOptions(['--json']);

      expect(options.json).toBe(true);
    });

    it('should parse bug report with title and body combined', () => {
      const options = parseFeedbackOptions([
        '--bug',
        '--title', 'CLI crashes on init',
        '--body', 'When I run nimbus init it throws an error',
        '--json',
      ]);

      expect(options.bug).toBe(true);
      expect(options.title).toBe('CLI crashes on init');
      expect(options.body).toBe('When I run nimbus init it throws an error');
      expect(options.json).toBe(true);
    });

    it('should parse feature request with all shorthand flags', () => {
      const options = parseFeedbackOptions([
        '-f',
        '-t', 'Add support for Pulumi',
        '-m', 'Would be great to have Pulumi support',
      ]);

      expect(options.feature).toBe(true);
      expect(options.title).toBe('Add support for Pulumi');
      expect(options.body).toBe('Would be great to have Pulumi support');
    });

    it('should handle multiple type flags by setting all of them', () => {
      const options = parseFeedbackOptions(['--bug', '--feature']);

      expect(options.bug).toBe(true);
      expect(options.feature).toBe(true);
    });
  });

  describe('exports', () => {
    it('should export feedbackCommand as a function', () => {
      expect(typeof feedbackCommand).toBe('function');
    });

    it('should export parseFeedbackOptions as a function', () => {
      expect(typeof parseFeedbackOptions).toBe('function');
    });
  });
});
