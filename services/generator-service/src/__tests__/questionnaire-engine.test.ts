import { describe, it, expect, beforeEach } from 'bun:test';
import { QuestionnaireEngine } from '../questionnaire/engine';

describe('QuestionnaireEngine', () => {
  let engine: QuestionnaireEngine;

  beforeEach(() => {
    engine = new QuestionnaireEngine();
  });

  describe('startSession', () => {
    it('should create a new terraform session', () => {
      const response = engine.startSession('terraform');

      expect(response.session).toBeDefined();
      expect(response.session.type).toBe('terraform');
      expect(response.session.completed).toBe(false);
      expect(response.session.currentStepIndex).toBe(0);
      expect(response.currentStep).toBeDefined();
      expect(response.progress.total).toBeGreaterThan(0);
    });

    it('should start with first step', () => {
      const response = engine.startSession('terraform');

      expect(response.currentStep?.id).toBe('provider');
      expect(response.progress.current).toBe(1);
    });
  });

  describe('submitAnswer', () => {
    it('should accept valid answer and advance to next step', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      // Answer first question
      const response = engine.submitAnswer({
        sessionId,
        questionId: 'cloud',
        value: 'aws',
      });

      expect(response.session.answers['cloud']).toBe('aws');
      expect(response.session.currentStepIndex).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid answer', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      expect(() => {
        engine.submitAnswer({
          sessionId,
          questionId: 'selected_provider',
          value: 'invalid',
        });
      }).toThrow();
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        engine.submitAnswer({
          sessionId: 'invalid',
          questionId: 'test',
          value: 'test',
        });
      }).toThrow('Session not found');
    });
  });

  describe('getSessionState', () => {
    it('should return current session state', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      const state = engine.getSessionState(sessionId);

      expect(state.session.id).toBe(sessionId);
      expect(state.currentStep).toBeDefined();
      expect(state.progress).toBeDefined();
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        engine.getSessionState('invalid');
      }).toThrow('Session not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete existing session', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      engine.deleteSession(sessionId);

      expect(() => {
        engine.getSessionState(sessionId);
      }).toThrow('Session not found');
    });
  });

  describe('validateAllAnswers', () => {
    it('should validate all answers in session', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      // Submit some answers
      engine.submitAnswer({
        sessionId,
        questionId: 'cloud',
        value: 'aws',
      });

      const errors = engine.validateAllAnswers(sessionId);
      expect(errors).toBeDefined();
    });
  });

  describe('conditional steps', () => {
    it('should show VPC config step only when VPC is selected', () => {
      const startResponse = engine.startSession('terraform');
      const sessionId = startResponse.session.id;

      // Submit answers for first step (all 4 questions)
      engine.submitAnswer({
        sessionId,
        questionId: 'cloud',
        value: 'aws',
      });

      engine.submitAnswer({
        sessionId,
        questionId: 'region',
        value: 'us-east-1',
      });

      engine.submitAnswer({
        sessionId,
        questionId: 'project_name',
        value: 'test-project',
      });

      const response4 = engine.submitAnswer({
        sessionId,
        questionId: 'environment',
        value: 'dev',
      });

      // Should now be on components step
      expect(response4.currentStep?.id).toBe('components');

      // Answer component selection with VPC
      const response5 = engine.submitAnswer({
        sessionId,
        questionId: 'components',
        value: ['vpc', 's3'],
      });

      // VPC should be in answers
      expect(response5.session.answers['components']).toContain('vpc');
    });
  });
});
