import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SQLiteAdapter } from '../../src/storage/sqlite-adapter';

// Mock the logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  error: () => {},
  warn: () => {},
};

// We'll create an in-memory database for testing
describe('SQLiteAdapter', () => {
  let db: Database;
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        command TEXT NOT NULL,
        input TEXT,
        output TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        model TEXT,
        tokens_used INTEGER,
        cost_usd REAL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        messages TEXT NOT NULL,
        model TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        config TEXT NOT NULL,
        last_scanned TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        input TEXT,
        output TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS safety_checks (
        id TEXT PRIMARY KEY,
        operation_id TEXT,
        check_type TEXT NOT NULL,
        check_name TEXT NOT NULL,
        passed INTEGER NOT NULL,
        severity TEXT,
        message TEXT,
        requires_approval INTEGER DEFAULT 0,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    adapter = new SQLiteAdapter(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Operations', () => {
    test('should save and retrieve an operation', () => {
      const operation = {
        id: 'op-1',
        timestamp: new Date('2026-02-10T10:00:00Z'),
        type: 'terraform',
        command: 'terraform apply',
        input: 'main.tf',
        output: 'Applied successfully',
        status: 'success',
        durationMs: 5000,
        model: 'claude-3',
        tokensUsed: 100,
        costUsd: 0.01,
        metadata: { environment: 'production' },
      };

      adapter.saveOperation(operation);
      const retrieved = adapter.getOperation('op-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('op-1');
      expect(retrieved?.type).toBe('terraform');
      expect(retrieved?.status).toBe('success');
      expect(retrieved?.metadata).toEqual({ environment: 'production' });
    });

    test('should return null for non-existent operation', () => {
      const result = adapter.getOperation('non-existent');
      expect(result).toBeNull();
    });

    test('should list operations', () => {
      adapter.saveOperation({
        id: 'op-1',
        timestamp: new Date('2026-02-10T10:00:00Z'),
        type: 'terraform',
        command: 'apply',
        status: 'success',
      });
      adapter.saveOperation({
        id: 'op-2',
        timestamp: new Date('2026-02-10T11:00:00Z'),
        type: 'kubernetes',
        command: 'deploy',
        status: 'success',
      });

      const operations = adapter.listOperations(10, 0);
      expect(operations.length).toBe(2);
    });

    test('should list operations by type', () => {
      adapter.saveOperation({
        id: 'op-1',
        timestamp: new Date(),
        type: 'terraform',
        command: 'apply',
        status: 'success',
      });
      adapter.saveOperation({
        id: 'op-2',
        timestamp: new Date(),
        type: 'kubernetes',
        command: 'deploy',
        status: 'success',
      });

      const operations = adapter.listOperationsByType('terraform', 10, 0);
      expect(operations.length).toBe(1);
      expect(operations[0].type).toBe('terraform');
    });
  });

  describe('Config', () => {
    test('should set and get config', () => {
      adapter.setConfig('theme', { mode: 'dark' });
      const value = adapter.getConfig('theme');

      expect(value).toEqual({ mode: 'dark' });
    });

    test('should return null for non-existent config', () => {
      const result = adapter.getConfig('non-existent');
      expect(result).toBeNull();
    });

    test('should get all config', () => {
      adapter.setConfig('theme', 'dark');
      adapter.setConfig('language', 'en');

      const config = adapter.getAllConfig();
      expect(config.theme).toBe('dark');
      expect(config.language).toBe('en');
    });
  });

  describe('Templates', () => {
    test('should save and retrieve a template', () => {
      adapter.saveTemplate('tpl-1', 'VPC Template', 'terraform', 'resource "aws_vpc" {}', { region: 'us-east-1' });

      const template = adapter.getTemplate('tpl-1');
      expect(template).not.toBeNull();
      expect(template?.name).toBe('VPC Template');
      expect(template?.type).toBe('terraform');
      expect(template?.variables).toEqual({ region: 'us-east-1' });
    });

    test('should list templates', () => {
      adapter.saveTemplate('tpl-1', 'VPC', 'terraform', 'content1');
      adapter.saveTemplate('tpl-2', 'Pod', 'kubernetes', 'content2');

      const all = adapter.listTemplates();
      expect(all.length).toBe(2);

      const terraform = adapter.listTemplates('terraform');
      expect(terraform.length).toBe(1);
      expect(terraform[0].name).toBe('VPC');
    });

    test('should delete a template', () => {
      adapter.saveTemplate('tpl-1', 'Test', 'terraform', 'content');
      adapter.deleteTemplate('tpl-1');

      const template = adapter.getTemplate('tpl-1');
      expect(template).toBeNull();
    });
  });

  describe('Conversations', () => {
    test('should save and retrieve a conversation', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      adapter.saveConversation('conv-1', 'Test Conversation', messages, 'claude-3', { topic: 'greeting' });

      const conversation = adapter.getConversation('conv-1');
      expect(conversation).not.toBeNull();
      expect(conversation?.title).toBe('Test Conversation');
      expect(conversation?.messages).toEqual(messages);
      expect(conversation?.metadata).toEqual({ topic: 'greeting' });
    });

    test('should list conversations', () => {
      adapter.saveConversation('conv-1', 'First', []);
      adapter.saveConversation('conv-2', 'Second', []);

      const conversations = adapter.listConversations(10, 0);
      expect(conversations.length).toBe(2);
    });

    test('should delete a conversation', () => {
      adapter.saveConversation('conv-1', 'Test', []);
      adapter.deleteConversation('conv-1');

      const conversation = adapter.getConversation('conv-1');
      expect(conversation).toBeNull();
    });
  });

  describe('Artifacts', () => {
    test('should save and retrieve an artifact', () => {
      adapter.saveArtifact('art-1', 'conv-1', 'main.tf', 'code', 'resource "aws_vpc" {}', 'hcl', { version: '1.0' });

      const artifact = adapter.getArtifact('art-1');
      expect(artifact).not.toBeNull();
      expect(artifact?.name).toBe('main.tf');
      expect(artifact?.type).toBe('code');
      expect(artifact?.language).toBe('hcl');
    });

    test('should list artifacts by type', () => {
      adapter.saveArtifact('art-1', null, 'file1', 'code', 'content');
      adapter.saveArtifact('art-2', null, 'file2', 'doc', 'content');

      const code = adapter.listArtifacts('code');
      expect(code.length).toBe(1);
      expect(code[0].type).toBe('code');
    });

    test('should delete an artifact', () => {
      adapter.saveArtifact('art-1', null, 'file', 'code', 'content');
      adapter.deleteArtifact('art-1');

      const artifact = adapter.getArtifact('art-1');
      expect(artifact).toBeNull();
    });
  });

  describe('Projects', () => {
    test('should save and retrieve a project', () => {
      const config = { languages: ['typescript'], frameworks: ['express'] };
      adapter.saveProject('proj-1', 'My App', '/path/to/app', config);

      const project = adapter.getProject('proj-1');
      expect(project).not.toBeNull();
      expect(project?.name).toBe('My App');
      expect(project?.path).toBe('/path/to/app');
      expect(project?.config).toEqual(config);
    });

    test('should get project by path', () => {
      adapter.saveProject('proj-1', 'My App', '/path/to/app', {});

      const project = adapter.getProjectByPath('/path/to/app');
      expect(project).not.toBeNull();
      expect(project?.id).toBe('proj-1');
    });

    test('should return null for non-existent project', () => {
      const result = adapter.getProject('non-existent');
      expect(result).toBeNull();

      const byPath = adapter.getProjectByPath('/non/existent');
      expect(byPath).toBeNull();
    });

    test('should list projects', () => {
      adapter.saveProject('proj-1', 'App 1', '/path1', {});
      adapter.saveProject('proj-2', 'App 2', '/path2', {});

      const projects = adapter.listProjects();
      expect(projects.length).toBe(2);
    });

    test('should delete a project', () => {
      adapter.saveProject('proj-1', 'App', '/path', {});
      adapter.deleteProject('proj-1');

      const project = adapter.getProject('proj-1');
      expect(project).toBeNull();
    });
  });

  describe('Audit Logs', () => {
    test('should log and retrieve audit events', () => {
      adapter.logAuditEvent({
        id: 'audit-1',
        userId: 'user-1',
        action: 'terraform-apply',
        resourceType: 'terraform',
        resourceId: 'vpc-123',
        input: { file: 'main.tf' },
        output: { result: 'success' },
        status: 'success',
        durationMs: 5000,
        metadata: { environment: 'prod' },
      });

      const logs = adapter.getAuditLogs({ userId: 'user-1' });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('terraform-apply');
      expect(logs[0].status).toBe('success');
    });

    test('should filter audit logs by action', () => {
      adapter.logAuditEvent({ id: 'a1', action: 'apply', status: 'success' });
      adapter.logAuditEvent({ id: 'a2', action: 'destroy', status: 'success' });

      const logs = adapter.getAuditLogs({ action: 'apply' });
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('apply');
    });

    test('should filter audit logs by status', () => {
      adapter.logAuditEvent({ id: 'a1', action: 'apply', status: 'success' });
      adapter.logAuditEvent({ id: 'a2', action: 'apply', status: 'failure' });

      const logs = adapter.getAuditLogs({ status: 'failure' });
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('failure');
    });

    test('should filter audit logs by resource type', () => {
      adapter.logAuditEvent({ id: 'a1', action: 'apply', resourceType: 'terraform', status: 'success' });
      adapter.logAuditEvent({ id: 'a2', action: 'deploy', resourceType: 'kubernetes', status: 'success' });

      const logs = adapter.getAuditLogs({ resourceType: 'terraform' });
      expect(logs.length).toBe(1);
      expect(logs[0].resourceType).toBe('terraform');
    });
  });

  describe('Safety Checks', () => {
    test('should save and retrieve safety checks', () => {
      adapter.saveSafetyCheck({
        id: 'check-1',
        operationId: 'op-1',
        checkType: 'pre',
        checkName: 'production-environment',
        passed: false,
        severity: 'critical',
        message: 'Production environment detected',
        requiresApproval: true,
      });

      const checks = adapter.getSafetyChecksForOperation('op-1');
      expect(checks.length).toBe(1);
      expect(checks[0].checkName).toBe('production-environment');
      expect(checks[0].passed).toBe(false);
      expect(checks[0].requiresApproval).toBe(true);
    });

    test('should record approval', () => {
      adapter.saveSafetyCheck({
        id: 'check-1',
        operationId: 'op-1',
        checkType: 'pre',
        checkName: 'test-check',
        passed: true,
        requiresApproval: true,
      });

      adapter.recordApproval('check-1', 'admin-user');

      const checks = adapter.getSafetyChecksForOperation('op-1');
      expect(checks[0].approvedBy).toBe('admin-user');
      expect(checks[0].approvedAt).toBeDefined();
    });

    test('should handle multiple safety checks for one operation', () => {
      adapter.saveSafetyCheck({
        id: 'check-1',
        operationId: 'op-1',
        checkType: 'pre',
        checkName: 'env-check',
        passed: true,
      });
      adapter.saveSafetyCheck({
        id: 'check-2',
        operationId: 'op-1',
        checkType: 'pre',
        checkName: 'cost-check',
        passed: false,
      });

      const checks = adapter.getSafetyChecksForOperation('op-1');
      expect(checks.length).toBe(2);
    });
  });
});
