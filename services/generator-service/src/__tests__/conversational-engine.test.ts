import { describe, it, expect, beforeEach } from 'bun:test';
import { ConversationalEngine } from '../conversational/conversational-engine';

describe('ConversationalEngine', () => {
  let engine: ConversationalEngine;

  beforeEach(() => {
    engine = new ConversationalEngine();
  });

  describe('processMessage', () => {
    it('should process generate intent', () => {
      const sessionId = 'test-session-1';
      const message = 'Create a VPC on AWS';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('generate');
      expect(response.intent.entities.some((e) => e.type === 'component')).toBe(true);
      expect(response.intent.entities.some((e) => e.type === 'provider')).toBe(true);
    });

    it('should process modify intent', () => {
      const sessionId = 'test-session-2';
      const message = 'Change the VPC CIDR block';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('modify');
      expect(response.intent.entities.some((e) => e.type === 'component')).toBe(true);
    });

    it('should process explain intent', () => {
      const sessionId = 'test-session-3';
      const message = 'What is a VPC?';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('explain');
      expect(response.message).toContain('VPC');
    });

    it('should process help intent', () => {
      const sessionId = 'test-session-4';
      const message = 'help';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('help');
      expect(response.message).toContain('Nimbus');
    });

    it('should handle unknown intent', () => {
      const sessionId = 'test-session-5';
      const message = 'gibberish nonsense random';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('unknown');
      expect(response.suggested_actions).toBeDefined();
    });
  });

  describe('context management', () => {
    it('should create new session on first message', () => {
      const sessionId = 'test-session-6';
      const message = 'Create a VPC';

      const response = engine.processMessage(sessionId, message);

      expect(response.context).toBeDefined();
      expect(response.context.session_id).toBe(sessionId);
    });

    it('should maintain context across messages', () => {
      const sessionId = 'test-session-7';

      const response1 = engine.processMessage(sessionId, 'Create a VPC on AWS');
      const response2 = engine.processMessage(sessionId, 'Add S3 bucket as well');

      expect(response2.context.infrastructure_stack?.provider).toBe('aws');
      expect(response2.context.infrastructure_stack?.components).toContain('vpc');
      // Context should be maintained from first message
      expect(response2.context.infrastructure_stack?.components?.length).toBeGreaterThanOrEqual(1);
    });

    it('should track conversation history', () => {
      const sessionId = 'test-session-8';

      engine.processMessage(sessionId, 'Create a VPC');
      engine.processMessage(sessionId, 'What components are included?');

      const history = engine.getHistory(sessionId);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.role === 'user')).toBe(true);
      expect(history.some((h) => h.role === 'assistant')).toBe(true);
    });
  });

  describe('requirement extraction', () => {
    it('should extract provider from message', () => {
      const sessionId = 'test-session-9';
      const message = 'Setup infrastructure on GCP';

      const response = engine.processMessage(sessionId, message);

      expect(response.extracted_requirements?.provider).toBe('gcp');
    });

    it('should extract multiple components', () => {
      const sessionId = 'test-session-10';
      const message = 'Create VPC, EKS, and RDS on AWS';

      const response = engine.processMessage(sessionId, message);

      const components = response.extracted_requirements?.components || [];
      expect(components).toContain('vpc');
      expect(components).toContain('eks');
      expect(components).toContain('rds');
    });

    it('should extract environment', () => {
      const sessionId = 'test-session-11';
      const message = 'Setup production environment with VPC';

      const response = engine.processMessage(sessionId, message);

      expect(response.extracted_requirements?.environment).toBe('production');
    });

    it('should identify missing requirements', () => {
      const sessionId = 'test-session-12';
      const message = 'Create infrastructure';

      const response = engine.processMessage(sessionId, message);

      expect(response.needs_clarification).toBeDefined();
      expect(response.needs_clarification!.length).toBeGreaterThan(0);
    });
  });

  describe('suggested actions', () => {
    it('should suggest questionnaire when ready', () => {
      const sessionId = 'test-session-13';
      const message = 'Create a VPC on AWS for production in us-east-1';

      const response = engine.processMessage(sessionId, message);

      const hasQuestionnaireAction = response.suggested_actions?.some(
        (a) => a.type === 'start_questionnaire'
      );
      expect(hasQuestionnaireAction).toBe(true);
    });

    it('should suggest clarification when incomplete', () => {
      const sessionId = 'test-session-14';
      const message = 'Create infrastructure';

      const response = engine.processMessage(sessionId, message);

      expect(response.needs_clarification).toBeDefined();
      expect(response.suggested_actions).toBeDefined();
    });
  });

  describe('session management', () => {
    it('should get session by id', () => {
      const sessionId = 'test-session-15';
      engine.processMessage(sessionId, 'Create VPC');

      const session = engine.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.session_id).toBe(sessionId);
    });

    it('should delete session', () => {
      const sessionId = 'test-session-16';
      engine.processMessage(sessionId, 'Create VPC');

      engine.deleteSession(sessionId);

      const session = engine.getSession(sessionId);
      expect(session).toBeUndefined();
    });

    it('should clear history', () => {
      const sessionId = 'test-session-17';
      engine.processMessage(sessionId, 'Create VPC');
      engine.processMessage(sessionId, 'Add RDS');

      engine.clearHistory(sessionId);

      const history = engine.getHistory(sessionId);
      expect(history.length).toBe(0);
    });
  });

  describe('intent confidence', () => {
    it('should have high confidence for clear intents', () => {
      const sessionId = 'test-session-18';
      const message = 'Create a VPC on AWS';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.confidence).toBeGreaterThan(0.5);
    });

    it('should have low confidence for ambiguous messages', () => {
      const sessionId = 'test-session-19';
      const message = 'thing stuff maybe';

      const response = engine.processMessage(sessionId, message);

      expect(response.intent.type).toBe('unknown');
      expect(response.intent.confidence).toBeLessThanOrEqual(0.5);
    });
  });
});
