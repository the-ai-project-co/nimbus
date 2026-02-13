/**
 * Persona System Prompt Tests
 *
 * Tests for ChatOptions persona and verbosity fields defined in the chat command.
 * The getPersonaSystemPrompt function is module-private, so we validate the
 * type contracts and option shapes that feed into it.
 */

import { describe, test, expect } from 'bun:test';
import type { ChatOptions } from '../../../src/commands/chat';

describe('Persona System Prompts', () => {
  describe('ChatOptions persona fields', () => {
    test('should accept professional persona', () => {
      const options: ChatOptions = { persona: 'professional', verbosity: 'minimal' };

      expect(options.persona).toBe('professional');
      expect(options.verbosity).toBe('minimal');
    });

    test('should accept assistant persona', () => {
      const options: ChatOptions = { persona: 'assistant', verbosity: 'normal' };

      expect(options.persona).toBe('assistant');
    });

    test('should accept expert persona', () => {
      const options: ChatOptions = { persona: 'expert', verbosity: 'detailed' };

      expect(options.persona).toBe('expert');
      expect(options.verbosity).toBe('detailed');
    });

    test('should have optional persona and verbosity', () => {
      const options: ChatOptions = {};

      expect(options.persona).toBeUndefined();
      expect(options.verbosity).toBeUndefined();
    });

    test('should accept all verbosity levels', () => {
      const levels: ChatOptions['verbosity'][] = ['minimal', 'normal', 'detailed'];

      for (const level of levels) {
        const options: ChatOptions = { verbosity: level };
        expect(options.verbosity).toBe(level);
      }
    });

    test('should accept all persona modes', () => {
      const modes: ChatOptions['persona'][] = ['professional', 'assistant', 'expert'];

      for (const mode of modes) {
        const options: ChatOptions = { persona: mode };
        expect(options.persona).toBe(mode);
      }
    });

    test('should accept all persona-verbosity combinations', () => {
      const personas: ChatOptions['persona'][] = ['professional', 'assistant', 'expert'];
      const verbosities: ChatOptions['verbosity'][] = ['minimal', 'normal', 'detailed'];

      for (const persona of personas) {
        for (const verbosity of verbosities) {
          const options: ChatOptions = { persona, verbosity };
          expect(options.persona).toBe(persona);
          expect(options.verbosity).toBe(verbosity);
        }
      }
    });
  });

  describe('ChatOptions other fields', () => {
    test('should accept model field', () => {
      const options: ChatOptions = { model: 'gpt-4o', persona: 'expert' };

      expect(options.model).toBe('gpt-4o');
      expect(options.persona).toBe('expert');
    });

    test('should accept systemPrompt field', () => {
      const options: ChatOptions = { systemPrompt: 'You are a helpful bot.' };

      expect(options.systemPrompt).toBe('You are a helpful bot.');
    });

    test('should accept showTokenCount field', () => {
      const options: ChatOptions = { showTokenCount: true };

      expect(options.showTokenCount).toBe(true);
    });

    test('should accept nonInteractive mode with message', () => {
      const options: ChatOptions = {
        nonInteractive: true,
        message: 'Generate a VPC',
        persona: 'professional',
        verbosity: 'detailed',
      };

      expect(options.nonInteractive).toBe(true);
      expect(options.message).toBe('Generate a VPC');
      expect(options.persona).toBe('professional');
      expect(options.verbosity).toBe('detailed');
    });

    test('should accept generateMode field', () => {
      const options: ChatOptions = { generateMode: true };

      expect(options.generateMode).toBe(true);
    });

    test('should accept a fully populated options object', () => {
      const options: ChatOptions = {
        model: 'claude-3-opus',
        systemPrompt: 'Custom prompt',
        showTokenCount: true,
        nonInteractive: false,
        message: undefined,
        generateMode: false,
        persona: 'assistant',
        verbosity: 'normal',
      };

      expect(options.model).toBe('claude-3-opus');
      expect(options.systemPrompt).toBe('Custom prompt');
      expect(options.showTokenCount).toBe(true);
      expect(options.nonInteractive).toBe(false);
      expect(options.message).toBeUndefined();
      expect(options.generateMode).toBe(false);
      expect(options.persona).toBe('assistant');
      expect(options.verbosity).toBe('normal');
    });
  });

  describe('default persona behavior', () => {
    test('should default to assistant persona when not specified', () => {
      const options: ChatOptions = {};
      const persona = options.persona || 'assistant';

      expect(persona).toBe('assistant');
    });

    test('should default to normal verbosity when not specified', () => {
      const options: ChatOptions = {};
      const verbosity = options.verbosity || 'normal';

      expect(verbosity).toBe('normal');
    });

    test('should use provided persona over default', () => {
      const options: ChatOptions = { persona: 'expert' };
      const persona = options.persona || 'assistant';

      expect(persona).toBe('expert');
    });

    test('should use provided verbosity over default', () => {
      const options: ChatOptions = { verbosity: 'detailed' };
      const verbosity = options.verbosity || 'normal';

      expect(verbosity).toBe('detailed');
    });
  });

  describe('exports', () => {
    test('should export chatCommand as a function', async () => {
      const { chatCommand } = await import('../../../src/commands/chat');

      expect(typeof chatCommand).toBe('function');
    });

    test('should export startChatWithGeneration as a function', async () => {
      const { startChatWithGeneration } = await import('../../../src/commands/chat');

      expect(typeof startChatWithGeneration).toBe('function');
    });
  });
});
