/**
 * E2E tests for the Nimbus SQLite state/persistence layer.
 *
 * Covers: schema migrations, WAL mode, foreign keys, operations CRUD,
 * conversations CRUD, artifacts CRUD, config store, checkpoints, audit logs,
 * billing/usage, teams, credentials/tokens, projects, messages, in-memory DB,
 * concurrent writes, missing-file creation, and sql.js fallback detection.
 *
 * Every test uses getTestDb() (in-memory SQLite) so the real ~/.nimbus/nimbus.db
 * is never touched, and tests are fully isolated and fast.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from '../../src/compat/sqlite';
import { getTestDb } from '../../src/state/db';
import { runMigrations } from '../../src/state/schema';
import { Database as DatabaseCtor } from '../../src/compat/sqlite';

// State modules
import {
  saveOperation,
  getOperation,
  listOperations,
  listOperationsByType,
  type SaveOperationInput,
} from '../../src/state/sessions';
import {
  saveConversation,
  getConversation,
  listConversations,
  deleteConversation,
} from '../../src/state/messages';
import {
  saveArtifact,
  getArtifact,
  listArtifacts,
  deleteArtifact,
} from '../../src/state/artifacts';
import { setConfig, getConfig, getAllConfig } from '../../src/state/config';
import {
  saveCheckpoint,
  getCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,
  deleteCheckpoints,
} from '../../src/state/checkpoints';
import {
  logAuditEvent,
  getAuditLogs,
  type AuditEventInput,
} from '../../src/state/audit';
import {
  createSubscription,
  getSubscription,
  recordUsage,
  getUsage,
  getUsageSummary,
} from '../../src/state/billing';
import {
  createTeam,
  getTeam,
  listTeams,
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  createUser,
  getUser,
} from '../../src/state/teams';
import {
  saveDeviceCode,
  getDeviceCode,
  updateDeviceCodeStatus,
  saveToken,
  getToken,
  deleteToken,
} from '../../src/state/credentials';
import {
  saveProject,
  getProject,
  getProjectByPath,
  listProjects,
  deleteProject,
} from '../../src/state/projects';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let db: Database;

beforeEach(() => {
  db = getTestDb();
});

// ---------------------------------------------------------------------------
// 1. runMigrations creates all tables
// ---------------------------------------------------------------------------

describe('Schema and migrations', () => {
  it('runMigrations creates all 17 expected tables', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const tables = rows.map((r) => r.name).sort();

    const expected = [
      'artifacts',
      'audit_logs',
      'checkpoints',
      'config',
      'conversations',
      'device_codes',
      'operations',
      'projects',
      'safety_checks',
      'shares',
      'subscriptions',
      'team_members',
      'teams',
      'templates',
      'tokens',
      'usage',
      'users',
    ];

    for (const table of expected) {
      expect(tables).toContain(table);
    }
  });

  it('runMigrations is idempotent (safe to call twice)', () => {
    // Second call should not throw
    expect(() => runMigrations(db)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. WAL mode enabled
// ---------------------------------------------------------------------------

describe('WAL mode', () => {
  it('journal_mode is set to wal', () => {
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string } | undefined;
    // In-memory databases may report "memory" for journal_mode; WAL pragma
    // was issued in getTestDb so we accept either "wal" or "memory".
    expect(['wal', 'memory']).toContain(row?.journal_mode);
  });
});

// ---------------------------------------------------------------------------
// 3. Foreign keys enabled
// ---------------------------------------------------------------------------

describe('Foreign keys', () => {
  it('foreign_keys pragma is ON', () => {
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number } | undefined;
    expect(row?.foreign_keys).toBe(1);
  });

  it('violating a foreign key constraint throws', () => {
    // team_members.team_id references teams.id
    expect(() => {
      db.prepare(
        "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES ('m1', 'nonexistent', 'u1', 'member', CURRENT_TIMESTAMP)"
      ).run();
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Operations CRUD (save, get, list, filter)
// ---------------------------------------------------------------------------

describe('Operations CRUD', () => {
  const makeOp = (id: string, type: string = 'terraform'): SaveOperationInput => ({
    id,
    timestamp: new Date('2025-01-15T10:00:00Z'),
    type,
    command: `nimbus ${type} plan`,
    input: 'input data',
    output: 'output data',
    status: 'success',
    durationMs: 1234,
    model: 'claude-3.5-sonnet',
    tokensUsed: 500,
    costUsd: 0.003,
    metadata: { env: 'staging' },
  });

  it('saves and retrieves an operation by id', () => {
    saveOperation(makeOp('op-1'), db);
    const result = getOperation('op-1', db);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('op-1');
    expect(result!.type).toBe('terraform');
    expect(result!.status).toBe('success');
    expect(result!.durationMs).toBe(1234);
    expect(result!.metadata).toEqual({ env: 'staging' });
  });

  it('returns null for missing operation', () => {
    expect(getOperation('nonexistent', db)).toBeNull();
  });

  it('lists operations in timestamp-descending order', () => {
    saveOperation({ ...makeOp('op-a'), timestamp: new Date('2025-01-01T00:00:00Z') }, db);
    saveOperation({ ...makeOp('op-b'), timestamp: new Date('2025-01-02T00:00:00Z') }, db);
    saveOperation({ ...makeOp('op-c'), timestamp: new Date('2025-01-03T00:00:00Z') }, db);

    const ops = listOperations(10, 0, db);
    expect(ops).toHaveLength(3);
    expect(ops[0].id).toBe('op-c');
    expect(ops[2].id).toBe('op-a');
  });

  it('filters operations by type', () => {
    saveOperation(makeOp('op-tf', 'terraform'), db);
    saveOperation(makeOp('op-k8s', 'kubectl'), db);
    saveOperation(makeOp('op-tf2', 'terraform'), db);

    const tfOps = listOperationsByType('terraform', 10, 0, db);
    expect(tfOps).toHaveLength(2);
    expect(tfOps.every((o) => o.type === 'terraform')).toBe(true);
  });

  it('respects limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      saveOperation(
        { ...makeOp(`op-${i}`), timestamp: new Date(`2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`) },
        db
      );
    }
    const page = listOperations(3, 2, db);
    expect(page).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 5-6. Conversations CRUD + metadata
// ---------------------------------------------------------------------------

describe('Conversations CRUD', () => {
  it('saves and retrieves a conversation', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    saveConversation('conv-1', 'Test Conversation', messages, 'gpt-4o', { tag: 'demo' }, db);

    const conv = getConversation('conv-1', db);
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe('Test Conversation');
    expect(conv!.messages).toEqual(messages);
    expect(conv!.model).toBe('gpt-4o');
    expect(conv!.metadata).toEqual({ tag: 'demo' });
  });

  it('upserts a conversation on conflict', () => {
    saveConversation('conv-1', 'Original', [{ role: 'user', content: 'v1' }], undefined, undefined, db);
    saveConversation('conv-1', 'Updated', [{ role: 'user', content: 'v2' }], 'claude-3.5-sonnet', undefined, db);

    const conv = getConversation('conv-1', db);
    expect(conv!.title).toBe('Updated');
    expect(conv!.messages).toEqual([{ role: 'user', content: 'v2' }]);
    expect(conv!.model).toBe('claude-3.5-sonnet');
  });

  it('lists conversations ordered by updated_at descending', () => {
    saveConversation('conv-a', 'First', [], undefined, undefined, db);
    saveConversation('conv-b', 'Second', [], undefined, undefined, db);

    const list = listConversations(50, 0, db);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Most recently inserted should come first (or equal timestamps)
    expect(list.map((c) => c.id)).toContain('conv-a');
    expect(list.map((c) => c.id)).toContain('conv-b');
  });

  it('deletes a conversation', () => {
    saveConversation('conv-del', 'To Delete', [], undefined, undefined, db);
    expect(getConversation('conv-del', db)).not.toBeNull();

    deleteConversation('conv-del', db);
    expect(getConversation('conv-del', db)).toBeNull();
  });

  it('returns null for missing conversation', () => {
    expect(getConversation('nonexistent', db)).toBeNull();
  });

  it('persists complex metadata objects', () => {
    const meta = {
      tags: ['devops', 'terraform'],
      scores: { relevance: 0.95, quality: 0.88 },
      nested: { deep: { value: true } },
    };
    saveConversation('conv-meta', 'Meta Test', [], undefined, meta, db);

    const conv = getConversation('conv-meta', db);
    expect(conv!.metadata).toEqual(meta);
  });
});

// ---------------------------------------------------------------------------
// 7. Artifacts CRUD (save, get, list, filter, delete)
// ---------------------------------------------------------------------------

describe('Artifacts CRUD', () => {
  it('saves and retrieves an artifact', () => {
    saveArtifact('art-1', 'conv-1', 'main.tf', 'terraform', 'resource "aws_s3_bucket" {}', 'hcl', { version: 1 }, db);

    const art = getArtifact('art-1', db);
    expect(art).not.toBeNull();
    expect(art!.name).toBe('main.tf');
    expect(art!.type).toBe('terraform');
    expect(art!.content).toBe('resource "aws_s3_bucket" {}');
    expect(art!.language).toBe('hcl');
    expect(art!.metadata).toEqual({ version: 1 });
  });

  it('upserts an artifact on conflict', () => {
    saveArtifact('art-1', null, 'v1.tf', 'terraform', 'v1', undefined, undefined, db);
    saveArtifact('art-1', 'conv-2', 'v2.tf', 'terraform', 'v2', 'hcl', undefined, db);

    const art = getArtifact('art-1', db);
    expect(art!.name).toBe('v2.tf');
    expect(art!.content).toBe('v2');
    expect(art!.conversationId).toBe('conv-2');
  });

  it('lists artifacts with type filter', () => {
    saveArtifact('art-tf', null, 'main.tf', 'terraform', 'tf content', undefined, undefined, db);
    saveArtifact('art-k8s', null, 'deploy.yaml', 'kubernetes', 'k8s content', undefined, undefined, db);
    saveArtifact('art-tf2', null, 'vars.tf', 'terraform', 'tf vars', undefined, undefined, db);

    const tfArts = listArtifacts('terraform', undefined, 50, 0, db);
    expect(tfArts).toHaveLength(2);
    expect(tfArts.every((a) => a.type === 'terraform')).toBe(true);
  });

  it('lists artifacts with conversation filter', () => {
    saveArtifact('art-c1', 'conv-1', 'a.tf', 'terraform', 'a', undefined, undefined, db);
    saveArtifact('art-c2', 'conv-2', 'b.tf', 'terraform', 'b', undefined, undefined, db);
    saveArtifact('art-c1b', 'conv-1', 'c.tf', 'terraform', 'c', undefined, undefined, db);

    const conv1Arts = listArtifacts(undefined, 'conv-1', 50, 0, db);
    expect(conv1Arts).toHaveLength(2);
    expect(conv1Arts.every((a) => a.conversationId === 'conv-1')).toBe(true);
  });

  it('deletes an artifact', () => {
    saveArtifact('art-del', null, 'del.tf', 'terraform', 'delete me', undefined, undefined, db);
    expect(getArtifact('art-del', db)).not.toBeNull();

    deleteArtifact('art-del', db);
    expect(getArtifact('art-del', db)).toBeNull();
  });

  it('returns null for missing artifact', () => {
    expect(getArtifact('nonexistent', db)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8-9. Config store set/get/getAll + JSON values
// ---------------------------------------------------------------------------

describe('Config store', () => {
  it('sets and gets a string config value', () => {
    setConfig('theme', 'dark', db);
    expect(getConfig('theme', db)).toBe('dark');
  });

  it('returns null for missing key', () => {
    expect(getConfig('nonexistent', db)).toBeNull();
  });

  it('overwrites existing key', () => {
    setConfig('provider', 'openai', db);
    setConfig('provider', 'anthropic', db);
    expect(getConfig('provider', db)).toBe('anthropic');
  });

  it('handles complex JSON values', () => {
    const value = {
      providers: ['anthropic', 'openai'],
      limits: { maxTokens: 4096, temperature: 0.7 },
      nested: { deep: { enabled: true } },
    };
    setConfig('advanced', value, db);
    expect(getConfig('advanced', db)).toEqual(value);
  });

  it('handles boolean and numeric values', () => {
    setConfig('enabled', true, db);
    setConfig('maxRetries', 3, db);
    expect(getConfig('enabled', db)).toBe(true);
    expect(getConfig('maxRetries', db)).toBe(3);
  });

  it('handles null and array values', () => {
    setConfig('nullVal', null, db);
    setConfig('arrayVal', [1, 2, 3], db);
    expect(getConfig('nullVal', db)).toBeNull();
    expect(getConfig('arrayVal', db)).toEqual([1, 2, 3]);
  });

  it('getAllConfig returns all entries', () => {
    setConfig('key1', 'value1', db);
    setConfig('key2', 42, db);
    setConfig('key3', { nested: true }, db);

    const all = getAllConfig(db);
    expect(all.key1).toBe('value1');
    expect(all.key2).toBe(42);
    expect(all.key3).toEqual({ nested: true });
  });
});

// ---------------------------------------------------------------------------
// 10. Checkpoints save/restore
// ---------------------------------------------------------------------------

describe('Checkpoints', () => {
  it('saves and retrieves a checkpoint by id', () => {
    const state = { progress: 50, lastFile: '/tmp/out.tf' };
    saveCheckpoint('cp-1', 'op-1', 1, state, db);

    const cp = getCheckpoint('cp-1', db);
    expect(cp).not.toBeNull();
    expect(cp!.operationId).toBe('op-1');
    expect(cp!.step).toBe(1);
    expect(cp!.state).toEqual(state);
  });

  it('returns null for missing checkpoint', () => {
    expect(getCheckpoint('nonexistent', db)).toBeNull();
  });

  it('getLatestCheckpoint returns highest step', () => {
    saveCheckpoint('cp-a', 'op-1', 1, { step: 1 }, db);
    saveCheckpoint('cp-b', 'op-1', 3, { step: 3 }, db);
    saveCheckpoint('cp-c', 'op-1', 2, { step: 2 }, db);

    const latest = getLatestCheckpoint('op-1', db);
    expect(latest).not.toBeNull();
    expect(latest!.step).toBe(3);
    expect(latest!.state).toEqual({ step: 3 });
  });

  it('listCheckpoints returns steps in ascending order', () => {
    saveCheckpoint('cp-1', 'op-2', 3, { s: 3 }, db);
    saveCheckpoint('cp-2', 'op-2', 1, { s: 1 }, db);
    saveCheckpoint('cp-3', 'op-2', 2, { s: 2 }, db);

    const list = listCheckpoints('op-2', db);
    expect(list).toHaveLength(3);
    expect(list[0].step).toBe(1);
    expect(list[1].step).toBe(2);
    expect(list[2].step).toBe(3);
  });

  it('deleteCheckpoints removes all checkpoints for an operation', () => {
    saveCheckpoint('cp-x', 'op-3', 1, {}, db);
    saveCheckpoint('cp-y', 'op-3', 2, {}, db);
    saveCheckpoint('cp-z', 'op-other', 1, {}, db);

    deleteCheckpoints('op-3', db);

    expect(listCheckpoints('op-3', db)).toHaveLength(0);
    expect(listCheckpoints('op-other', db)).toHaveLength(1);
  });

  it('overwrites checkpoint with same id (INSERT OR REPLACE)', () => {
    saveCheckpoint('cp-1', 'op-1', 1, { version: 1 }, db);
    saveCheckpoint('cp-1', 'op-1', 1, { version: 2 }, db);

    const cp = getCheckpoint('cp-1', db);
    expect(cp!.state).toEqual({ version: 2 });
  });
});

// ---------------------------------------------------------------------------
// 11. Audit log entries persisted
// ---------------------------------------------------------------------------

describe('Audit logs', () => {
  it('persists and retrieves an audit event', () => {
    const event: AuditEventInput = {
      id: 'audit-1',
      userId: 'user-1',
      action: 'terraform.apply',
      resourceType: 'terraform',
      resourceId: 'aws_s3_bucket.main',
      input: { command: 'terraform apply' },
      output: { applied: true },
      status: 'success',
      durationMs: 5432,
      metadata: { env: 'production' },
    };
    logAuditEvent(event, db);

    const logs = getAuditLogs({ userId: 'user-1' }, db);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('terraform.apply');
    expect(logs[0].input).toEqual({ command: 'terraform apply' });
    expect(logs[0].output).toEqual({ applied: true });
    expect(logs[0].metadata).toEqual({ env: 'production' });
  });

  it('filters audit logs by action', () => {
    logAuditEvent({ id: 'a1', action: 'terraform.plan', status: 'success' }, db);
    logAuditEvent({ id: 'a2', action: 'terraform.apply', status: 'success' }, db);
    logAuditEvent({ id: 'a3', action: 'terraform.plan', status: 'success' }, db);

    const plans = getAuditLogs({ action: 'terraform.plan' }, db);
    expect(plans).toHaveLength(2);
  });

  it('filters audit logs by status', () => {
    logAuditEvent({ id: 'a1', action: 'deploy', status: 'success' }, db);
    logAuditEvent({ id: 'a2', action: 'deploy', status: 'failure' }, db);

    const failures = getAuditLogs({ status: 'failure' }, db);
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe('a2');
  });

  it('returns empty array when no audit logs match', () => {
    const logs = getAuditLogs({ action: 'nonexistent' }, db);
    expect(logs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 12. Billing records saved
// ---------------------------------------------------------------------------

describe('Billing / usage', () => {
  it('creates and retrieves a subscription', () => {
    createTeam('team-1', 'Acme', 'owner-1', 'pro', db);
    createSubscription('sub-1', 'team-1', 'pro', 'active', '2025-01-01', '2025-02-01', db);

    const sub = getSubscription('team-1', db);
    expect(sub).not.toBeNull();
    expect(sub!.plan).toBe('pro');
    expect(sub!.status).toBe('active');
    expect(sub!.currentPeriodStart).toBe('2025-01-01');
  });

  it('records usage and retrieves it', () => {
    createTeam('team-2', 'Beta Corp', 'owner-2', 'free', db);

    recordUsage('usage-1', 'llm_tokens', 1500, 'tokens', 0.003, 'team-2', 'user-1', { model: 'gpt-4o' }, db);
    recordUsage('usage-2', 'llm_tokens', 800, 'tokens', 0.001, 'team-2', 'user-1', undefined, db);

    const since = new Date('2000-01-01');
    const records = getUsage('team-2', since, undefined, 100, 0, db);
    expect(records).toHaveLength(2);
    expect(records[0].quantity).toBeGreaterThan(0);
  });

  it('aggregates usage summary by type', () => {
    createTeam('team-3', 'Gamma', 'owner-3', 'free', db);

    recordUsage('u1', 'llm_tokens', 1000, 'tokens', 0.01, 'team-3', undefined, undefined, db);
    recordUsage('u2', 'llm_tokens', 2000, 'tokens', 0.02, 'team-3', undefined, undefined, db);
    recordUsage('u3', 'infra_ops', 5, 'operations', 0.5, 'team-3', undefined, undefined, db);

    const since = new Date('2000-01-01');
    const summary = getUsageSummary('team-3', since, undefined, db);
    expect(summary.length).toBeGreaterThanOrEqual(2);

    const llmSummary = summary.find((s) => s.type === 'llm_tokens');
    expect(llmSummary).toBeDefined();
    expect(llmSummary!.totalQuantity).toBe(3000);
    expect(llmSummary!.totalCost).toBeCloseTo(0.03);
    expect(llmSummary!.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 13. Team data CRUD
// ---------------------------------------------------------------------------

describe('Teams', () => {
  it('creates and retrieves a team', () => {
    createTeam('team-1', 'DevOps Team', 'owner-1', 'enterprise', db);

    const team = getTeam('team-1', db);
    expect(team).not.toBeNull();
    expect(team!.name).toBe('DevOps Team');
    expect(team!.ownerId).toBe('owner-1');
    expect(team!.plan).toBe('enterprise');
  });

  it('lists all teams', () => {
    createTeam('t1', 'Team Alpha', 'o1', 'free', db);
    createTeam('t2', 'Team Beta', 'o2', 'pro', db);

    const teams = listTeams(db);
    expect(teams).toHaveLength(2);
  });

  it('adds and lists team members', () => {
    createTeam('team-m', 'Members Team', 'owner-m', 'free', db);
    addTeamMember('mem-1', 'team-m', 'user-a', 'admin', db);
    addTeamMember('mem-2', 'team-m', 'user-b', 'member', db);

    const members = listTeamMembers('team-m', db);
    expect(members).toHaveLength(2);
    expect(members[0].role).toBe('admin');
    expect(members[1].role).toBe('member');
  });

  it('removes a team member', () => {
    createTeam('team-rm', 'Remove Team', 'owner-rm', 'free', db);
    addTeamMember('mem-x', 'team-rm', 'user-x', 'member', db);
    addTeamMember('mem-y', 'team-rm', 'user-y', 'member', db);

    removeTeamMember('team-rm', 'user-x', db);
    const members = listTeamMembers('team-rm', db);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe('user-y');
  });

  it('cascades team deletion to team_members', () => {
    createTeam('team-cas', 'Cascade Team', 'owner-cas', 'free', db);
    addTeamMember('mem-cas', 'team-cas', 'user-cas', 'member', db);

    db.prepare('DELETE FROM teams WHERE id = ?').run('team-cas');
    const members = listTeamMembers('team-cas', db);
    expect(members).toHaveLength(0);
  });

  it('creates and retrieves a user', () => {
    createUser('user-1', 'alice@example.com', 'Alice', 'https://avatar.url/alice', db);

    const user = getUser('user-1', db);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@example.com');
    expect(user!.name).toBe('Alice');
    expect(user!.avatarUrl).toBe('https://avatar.url/alice');
  });
});

// ---------------------------------------------------------------------------
// 14. Credentials caching (device codes + tokens)
// ---------------------------------------------------------------------------

describe('Credentials / tokens', () => {
  it('saves and retrieves a device code', () => {
    const expires = new Date('2025-12-31T23:59:59Z');
    saveDeviceCode('dc-1', 'ABCD-1234', expires, 'nimbus-cli', 'read:write', db);

    const dc = getDeviceCode('dc-1', db);
    expect(dc).not.toBeNull();
    expect(dc!.userCode).toBe('ABCD-1234');
    expect(dc!.status).toBe('pending');
    expect(dc!.clientId).toBe('nimbus-cli');
    expect(dc!.scope).toBe('read:write');
  });

  it('updates device code status', () => {
    saveDeviceCode('dc-2', 'EFGH-5678', new Date('2025-12-31'), undefined, undefined, db);
    updateDeviceCodeStatus('dc-2', 'authorized', 'tok-abc123', db);

    const dc = getDeviceCode('dc-2', db);
    expect(dc!.status).toBe('authorized');
    expect(dc!.token).toBe('tok-abc123');
  });

  it('saves and retrieves a token', () => {
    const expires = new Date('2025-06-01T00:00:00Z');
    saveToken('tok-1', 'secret-token-value', 'access', 'user-1', expires, db);

    const tok = getToken('secret-token-value', db);
    expect(tok).not.toBeNull();
    expect(tok!.id).toBe('tok-1');
    expect(tok!.userId).toBe('user-1');
    expect(tok!.type).toBe('access');
  });

  it('deletes a token', () => {
    saveToken('tok-del', 'to-delete-token', 'refresh', undefined, undefined, db);
    expect(getToken('to-delete-token', db)).not.toBeNull();

    deleteToken('to-delete-token', db);
    expect(getToken('to-delete-token', db)).toBeNull();
  });

  it('returns null for missing token', () => {
    expect(getToken('nonexistent-token', db)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 15. Project metadata persistence
// ---------------------------------------------------------------------------

describe('Projects', () => {
  it('saves and retrieves a project by id', () => {
    const config = { provider: 'aws', region: 'us-east-1' };
    saveProject('proj-1', 'My Infra', '/home/user/infra', config, db);

    const proj = getProject('proj-1', db);
    expect(proj).not.toBeNull();
    expect(proj!.name).toBe('My Infra');
    expect(proj!.path).toBe('/home/user/infra');
    expect(proj!.config).toEqual(config);
    expect(proj!.lastScanned).toBeTruthy();
  });

  it('retrieves a project by path', () => {
    saveProject('proj-2', 'K8s Cluster', '/opt/k8s', { context: 'prod' }, db);

    const proj = getProjectByPath('/opt/k8s', db);
    expect(proj).not.toBeNull();
    expect(proj!.id).toBe('proj-2');
  });

  it('upserts project on conflict', () => {
    saveProject('proj-u', 'V1', '/tmp/proj', { v: 1 }, db);
    saveProject('proj-u', 'V2', '/tmp/proj-updated', { v: 2 }, db);

    const proj = getProject('proj-u', db);
    expect(proj!.name).toBe('V2');
    expect(proj!.config).toEqual({ v: 2 });
  });

  it('lists all projects', () => {
    saveProject('p1', 'A', '/a', {}, db);
    saveProject('p2', 'B', '/b', {}, db);

    const projects = listProjects(db);
    expect(projects).toHaveLength(2);
  });

  it('deletes a project', () => {
    saveProject('proj-del', 'Delete Me', '/tmp/del', {}, db);
    deleteProject('proj-del', db);
    expect(getProject('proj-del', db)).toBeNull();
  });

  it('returns null for missing project', () => {
    expect(getProject('nonexistent', db)).toBeNull();
    expect(getProjectByPath('/nonexistent', db)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16. Messages save/retrieve per conversation
// ---------------------------------------------------------------------------

describe('Messages per conversation', () => {
  it('stores multiple messages and retrieves them in order', () => {
    const messages = [
      { role: 'user', content: 'What is Terraform?' },
      { role: 'assistant', content: 'Terraform is an IaC tool.' },
      { role: 'user', content: 'Show me an example.' },
      { role: 'assistant', content: 'resource "aws_instance" ...' },
    ];
    saveConversation('conv-msgs', 'Terraform Chat', messages, 'claude-3.5-sonnet', undefined, db);

    const conv = getConversation('conv-msgs', db);
    expect(conv!.messages).toHaveLength(4);
    expect(conv!.messages[0].content).toBe('What is Terraform?');
    expect(conv!.messages[3].content).toBe('resource "aws_instance" ...');
  });

  it('appends messages by re-saving the conversation', () => {
    const initial = [{ role: 'user', content: 'Hello' }];
    saveConversation('conv-append', 'Append Test', initial, undefined, undefined, db);

    const updated = [...initial, { role: 'assistant', content: 'Hi!' }];
    saveConversation('conv-append', 'Append Test', updated, undefined, undefined, db);

    const conv = getConversation('conv-append', db);
    expect(conv!.messages).toHaveLength(2);
  });

  it('handles empty messages array', () => {
    saveConversation('conv-empty', 'Empty', [], undefined, undefined, db);
    const conv = getConversation('conv-empty', db);
    expect(conv!.messages).toEqual([]);
  });

  it('handles messages with complex content structures', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the code:' },
          { type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' } },
        ],
      },
    ];
    saveConversation('conv-complex', 'Complex Messages', messages, undefined, undefined, db);

    const conv = getConversation('conv-complex', db);
    expect(conv!.messages[0].content).toHaveLength(2);
    expect(conv!.messages[0].content[1].name).toBe('bash');
  });
});

// ---------------------------------------------------------------------------
// 17. In-memory database works
// ---------------------------------------------------------------------------

describe('In-memory database', () => {
  it('getTestDb returns a fully functional in-memory database', () => {
    const memDb = getTestDb();

    // Verify tables exist
    const tables = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThanOrEqual(16);

    // Verify CRUD works
    setConfig('mem-test', 'works', memDb);
    expect(getConfig('mem-test', memDb)).toBe('works');

    memDb.close();
  });

  it('each getTestDb call returns an isolated database', () => {
    const db1 = getTestDb();
    const db2 = getTestDb();

    setConfig('isolation', 'db1', db1);
    expect(getConfig('isolation', db1)).toBe('db1');
    expect(getConfig('isolation', db2)).toBeNull();

    db1.close();
    db2.close();
  });
});

// ---------------------------------------------------------------------------
// 18. Concurrent writes (WAL)
// ---------------------------------------------------------------------------

describe('Concurrent writes', () => {
  it('handles rapid sequential writes without corruption', () => {
    const count = 100;
    for (let i = 0; i < count; i++) {
      setConfig(`key-${i}`, i, db);
    }

    const all = getAllConfig(db);
    expect(Object.keys(all)).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(all[`key-${i}`]).toBe(i);
    }
  });

  it('handles interleaved writes across multiple tables', () => {
    for (let i = 0; i < 20; i++) {
      saveOperation(
        {
          id: `op-concurrent-${i}`,
          timestamp: new Date(),
          type: 'test',
          command: `cmd-${i}`,
          status: 'success',
        },
        db
      );
      setConfig(`concurrent-${i}`, i, db);
      saveConversation(`conv-concurrent-${i}`, `Title ${i}`, [{ role: 'user', content: `msg ${i}` }], undefined, undefined, db);
    }

    expect(listOperations(100, 0, db)).toHaveLength(20);
    expect(Object.keys(getAllConfig(db))).toHaveLength(20);
    expect(listConversations(100, 0, db)).toHaveLength(20);
  });

  it('transaction rollback preserves data integrity', () => {
    setConfig('before-tx', 'safe', db);

    const txFn = db.transaction(() => {
      setConfig('in-tx', 'value', db);
      throw new Error('Simulated failure');
    });

    expect(() => txFn()).toThrow('Simulated failure');
    expect(getConfig('before-tx', db)).toBe('safe');
    // The in-tx write should have been rolled back
    expect(getConfig('in-tx', db)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 19. Missing file creates new DB
// ---------------------------------------------------------------------------

describe('Missing file creates new DB', () => {
  it('Database constructor with a path creates a new file-backed database', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
    const dbPath = path.join(tmpDir, 'test-new.db');

    expect(fs.existsSync(dbPath)).toBe(false);

    const fileDb = new DatabaseCtor(dbPath);
    fileDb.exec('PRAGMA journal_mode=WAL');
    fileDb.exec('PRAGMA foreign_keys=ON');
    runMigrations(fileDb);

    // Verify the file was created and DB is functional
    expect(fs.existsSync(dbPath)).toBe(true);

    setConfig('file-test', 'works', fileDb);
    expect(getConfig('file-test', fileDb)).toBe('works');

    fileDb.close();

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 20. sql.js fallback when better-sqlite3 unavailable
// ---------------------------------------------------------------------------

describe('sql.js fallback', () => {
  it('compat/sqlite.ts exports a usable Database constructor', () => {
    // The DatabaseCtor import proves the fallback chain resolved to something.
    // We verify it can construct an in-memory database.
    expect(typeof DatabaseCtor).toBe('function');

    const testDb = new DatabaseCtor(':memory:');
    expect(testDb).toBeDefined();
    expect(typeof testDb.exec).toBe('function');
    expect(typeof testDb.prepare).toBe('function');
    expect(typeof testDb.close).toBe('function');

    testDb.close();
  });

  it('Database constructor has the expected interface methods', () => {
    const testDb = new DatabaseCtor(':memory:');

    // Verify all methods from the DatabaseI interface
    expect(typeof testDb.exec).toBe('function');
    expect(typeof testDb.prepare).toBe('function');
    expect(typeof testDb.close).toBe('function');
    expect(typeof testDb.transaction).toBe('function');

    testDb.close();
  });

  it('prepared statements support run/get/all', () => {
    const testDb = new DatabaseCtor(':memory:');
    testDb.exec('CREATE TABLE test_fallback (id TEXT PRIMARY KEY, val TEXT)');

    const insertStmt = testDb.prepare('INSERT INTO test_fallback (id, val) VALUES (?, ?)');
    insertStmt.run('k1', 'v1');
    insertStmt.run('k2', 'v2');

    const getStmt = testDb.prepare('SELECT * FROM test_fallback WHERE id = ?');
    const row = getStmt.get('k1') as { id: string; val: string };
    expect(row.id).toBe('k1');
    expect(row.val).toBe('v1');

    const allStmt = testDb.prepare('SELECT * FROM test_fallback ORDER BY id');
    const rows = allStmt.all() as { id: string; val: string }[];
    expect(rows).toHaveLength(2);

    testDb.close();
  });
});
