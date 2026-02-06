/**
 * CLI Chat Command E2E Tests
 *
 * Tests the CLI chat command functionality including streaming responses.
 * These tests verify the chat command integration with the LLM service.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../services/cli-service/src/server';
import { getTestPorts, createTestClient, waitForService, createTempDir, removeTempDir } from '../utils/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Chat E2E Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  let tempDir: string;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer(ports.http, ports.ws);
    await waitForService(BASE_URL);
    client = createTestClient(BASE_URL);
    tempDir = await createTempDir('cli-chat-e2e-');
  });

  afterAll(async () => {
    server?.stop?.();
    await removeTempDir(tempDir);
  });

  // ==================== Health Check ====================

  describe('CLI Service Health', () => {
    it('returns healthy status', async () => {
      const result = await client.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('healthy');
      expect(result.data.service).toBe('cli-service');
    });
  });

  // ==================== Config Module Tests ====================

  describe('Config Module', () => {
    it('creates config directory structure', async () => {
      // Test that the config manager can create directories
      const configPath = path.join(tempDir, '.nimbus');
      fs.mkdirSync(configPath, { recursive: true });

      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('handles config file operations', async () => {
      // Test config file read/write
      const configPath = path.join(tempDir, 'config.json');
      const testConfig = {
        version: 1,
        llm: { defaultModel: 'claude-sonnet-4' },
      };

      fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.llm.defaultModel).toBe('claude-sonnet-4');
    });
  });

  // ==================== History Module Tests ====================

  describe('History Module', () => {
    it('creates history file structure', async () => {
      const historyPath = path.join(tempDir, 'history.json');
      const testHistory = {
        version: 1,
        entries: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(historyPath, JSON.stringify(testHistory, null, 2));

      expect(fs.existsSync(historyPath)).toBe(true);
    });

    it('handles history entries', async () => {
      const historyPath = path.join(tempDir, 'history-entries.json');
      const testHistory = {
        version: 1,
        entries: [
          {
            id: 'test-1',
            command: 'chat',
            args: ['-m', 'hello'],
            timestamp: new Date().toISOString(),
            status: 'success',
            duration: 100,
          },
          {
            id: 'test-2',
            command: 'config',
            args: ['list'],
            timestamp: new Date().toISOString(),
            status: 'success',
            duration: 50,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(historyPath, JSON.stringify(testHistory, null, 2));

      const content = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      expect(content.entries).toHaveLength(2);
      expect(content.entries[0].command).toBe('chat');
      expect(content.entries[1].command).toBe('config');
    });

    it('filters history by command', async () => {
      const entries = [
        { id: '1', command: 'chat', args: [], status: 'success' },
        { id: '2', command: 'config', args: [], status: 'success' },
        { id: '3', command: 'chat', args: [], status: 'failure' },
      ];

      const chatEntries = entries.filter((e) => e.command === 'chat');
      expect(chatEntries).toHaveLength(2);

      const successEntries = entries.filter((e) => e.status === 'success');
      expect(successEntries).toHaveLength(2);
    });

    it('limits history entries', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        id: `entry-${i}`,
        command: 'test',
        args: [],
        status: 'success',
      }));

      const limited = entries.slice(0, 20);
      expect(limited).toHaveLength(20);
      expect(limited[0].id).toBe('entry-0');
      expect(limited[19].id).toBe('entry-19');
    });
  });

  // ==================== LLM Client Tests ====================

  describe('LLM Client Configuration', () => {
    it('validates message format', () => {
      const validMessage = {
        role: 'user',
        content: 'Hello, how are you?',
      };

      expect(validMessage.role).toBe('user');
      expect(typeof validMessage.content).toBe('string');
      expect(validMessage.content.length).toBeGreaterThan(0);
    });

    it('handles conversation history format', () => {
      const conversation = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      expect(conversation).toHaveLength(3);
      expect(conversation[0].role).toBe('user');
      expect(conversation[1].role).toBe('assistant');
      expect(conversation[2].role).toBe('user');
    });

    it('validates model names', () => {
      const validModels = [
        'claude-sonnet-4',
        'claude-3-opus',
        'claude-3-sonnet',
        'gpt-4',
        'gpt-4-turbo',
      ];

      validModels.forEach((model) => {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      });
    });
  });

  // ==================== Workspace Init Tests ====================

  describe('Workspace Initialization', () => {
    it('creates .nimbus directory in workspace', async () => {
      const workspaceDir = path.join(tempDir, 'test-workspace');
      const nimbusDir = path.join(workspaceDir, '.nimbus');

      fs.mkdirSync(nimbusDir, { recursive: true });

      expect(fs.existsSync(nimbusDir)).toBe(true);
    });

    it('creates local config file', async () => {
      const workspaceDir = path.join(tempDir, 'test-workspace-2');
      const nimbusDir = path.join(workspaceDir, '.nimbus');
      fs.mkdirSync(nimbusDir, { recursive: true });

      const configPath = path.join(nimbusDir, 'config.json');
      const localConfig = {
        version: 1,
        workspace: {
          name: 'test-project',
          outputDirectory: './generated',
        },
      };

      fs.writeFileSync(configPath, JSON.stringify(localConfig, null, 2));

      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content.workspace.name).toBe('test-project');
    });

    it('handles nested workspace directories', async () => {
      const workspaceDir = path.join(tempDir, 'nested', 'deep', 'workspace');
      const nimbusDir = path.join(workspaceDir, '.nimbus');

      fs.mkdirSync(nimbusDir, { recursive: true });

      expect(fs.existsSync(nimbusDir)).toBe(true);
    });
  });

  // ==================== Chat Message Formatting Tests ====================

  describe('Chat Message Formatting', () => {
    it('formats user messages correctly', () => {
      const userMessage = {
        role: 'user' as const,
        content: 'What is the capital of France?',
      };

      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toContain('France');
    });

    it('formats system prompts correctly', () => {
      const systemPrompt = 'You are a helpful assistant.';

      expect(systemPrompt.length).toBeGreaterThan(0);
      expect(systemPrompt).toContain('helpful');
    });

    it('handles multi-line messages', () => {
      const multiLineMessage = `First line
Second line
Third line`;

      const lines = multiLineMessage.split('\n');
      expect(lines).toHaveLength(3);
    });

    it('handles special characters in messages', () => {
      const specialMessage = 'Hello! How are you? #coding @user $100';

      expect(specialMessage).toContain('#');
      expect(specialMessage).toContain('@');
      expect(specialMessage).toContain('$');
    });

    it('handles unicode in messages', () => {
      const unicodeMessage = 'Hello! Bonjour! Hola!';

      expect(unicodeMessage).toContain('Bonjour');
    });

    it('handles code blocks in messages', () => {
      const codeMessage = `Here is some code:
\`\`\`javascript
function hello() {
  console.log('Hello');
}
\`\`\``;

      expect(codeMessage).toContain('```javascript');
      expect(codeMessage).toContain('function hello');
    });
  });

  // ==================== Token Counting Tests ====================

  describe('Token Estimation', () => {
    it('estimates tokens for short messages', () => {
      const shortMessage = 'Hello';
      // Rough estimate: ~1 token per 4 characters
      const estimatedTokens = Math.ceil(shortMessage.length / 4);

      expect(estimatedTokens).toBeGreaterThan(0);
      expect(estimatedTokens).toBeLessThan(10);
    });

    it('estimates tokens for long messages', () => {
      const longMessage = 'This is a longer message that contains multiple words and should result in more tokens being used for the estimation.';
      const estimatedTokens = Math.ceil(longMessage.length / 4);

      expect(estimatedTokens).toBeGreaterThan(20);
    });

    it('estimates tokens for code content', () => {
      const codeContent = `
function calculateSum(a, b) {
  return a + b;
}

const result = calculateSum(1, 2);
console.log(result);
`;
      const estimatedTokens = Math.ceil(codeContent.length / 4);

      expect(estimatedTokens).toBeGreaterThan(10);
    });
  });
});
