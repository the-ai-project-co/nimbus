/**
 * Tests for the SQLite state layer:
 *   - src/state/db.ts        – getTestDb, closeDb
 *   - src/state/sessions.ts  – saveOperation, getOperation, listOperations, listOperationsByType
 *   - src/state/messages.ts  – saveConversation, getConversation, listConversations, deleteConversation
 *   - src/state/config.ts    – setConfig, getConfig, getAllConfig
 *   - src/state/artifacts.ts – saveArtifact, getArtifact, listArtifacts, deleteArtifact
 *
 * Every test uses getTestDb() (in-memory SQLite) so the real ~/.nimbus/nimbus.db
 * is never touched, and tests are fully isolated and fast.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { getTestDb } from '../state/db';
import {
  saveOperation,
  getOperation,
  listOperations,
  listOperationsByType,
  type SaveOperationInput,
} from '../state/sessions';
import {
  saveConversation,
  getConversation,
  listConversations,
  deleteConversation,
} from '../state/messages';
import { setConfig, getConfig, getAllConfig } from '../state/config';
import {
  saveArtifact,
  getArtifact,
  listArtifacts,
  deleteArtifact,
} from '../state/artifacts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fresh in-memory database for every test block. */
let db: Database;

beforeEach(() => {
  db = getTestDb();
});

// ---------------------------------------------------------------------------
// Sessions (operations)
// ---------------------------------------------------------------------------

describe('operations CRUD', () => {
  it('saves and retrieves an operation by id', () => {
    const op: SaveOperationInput = {
      id: 'op-001',
      timestamp: new Date('2025-01-01T00:00:00Z'),
      type: 'generate',
      command: 'nimbus generate vpc',
      status: 'success',
    };

    saveOperation(op, db);
    const record = getOperation('op-001', db);

    expect(record).not.toBeNull();
    expect(record!.id).toBe('op-001');
    expect(record!.type).toBe('generate');
    expect(record!.command).toBe('nimbus generate vpc');
    expect(record!.status).toBe('success');
  });

  it('returns null for a non-existent operation id', () => {
    const record = getOperation('does-not-exist', db);
    expect(record).toBeNull();
  });

  it('saves optional fields and retrieves them correctly', () => {
    const op: SaveOperationInput = {
      id: 'op-002',
      timestamp: new Date('2025-01-02T00:00:00Z'),
      type: 'chat',
      command: 'nimbus ask',
      status: 'success',
      input: 'create a vpc',
      output: 'Generated terraform files',
      durationMs: 1234,
      model: 'claude-sonnet-4-20250514',
      tokensUsed: 500,
      costUsd: 0.0015,
      metadata: { env: 'test' },
    };

    saveOperation(op, db);
    const record = getOperation('op-002', db);

    expect(record!.input).toBe('create a vpc');
    expect(record!.output).toBe('Generated terraform files');
    expect(record!.durationMs).toBe(1234);
    expect(record!.model).toBe('claude-sonnet-4-20250514');
    expect(record!.tokensUsed).toBe(500);
    expect(record!.costUsd).toBeCloseTo(0.0015, 6);
    expect(record!.metadata).toEqual({ env: 'test' });
  });

  it('listOperations returns all saved operations ordered by timestamp desc', () => {
    saveOperation({ id: 'op-a', timestamp: new Date('2025-01-01'), type: 'generate', command: 'cmd1', status: 'success' }, db);
    saveOperation({ id: 'op-b', timestamp: new Date('2025-01-03'), type: 'generate', command: 'cmd2', status: 'success' }, db);
    saveOperation({ id: 'op-c', timestamp: new Date('2025-01-02'), type: 'generate', command: 'cmd3', status: 'success' }, db);

    const ops = listOperations(10, 0, db);
    expect(ops.length).toBe(3);
    // Most recent first
    expect(ops[0].id).toBe('op-b');
    expect(ops[2].id).toBe('op-a');
  });

  it('listOperationsByType filters correctly', () => {
    saveOperation({ id: 'op-gen', timestamp: new Date(), type: 'generate', command: 'g', status: 'success' }, db);
    saveOperation({ id: 'op-chat', timestamp: new Date(), type: 'chat', command: 'c', status: 'success' }, db);

    const generated = listOperationsByType('generate', 10, 0, db);
    const chats = listOperationsByType('chat', 10, 0, db);

    expect(generated.every(o => o.type === 'generate')).toBe(true);
    expect(chats.every(o => o.type === 'chat')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Conversations (messages)
// ---------------------------------------------------------------------------

describe('conversations CRUD', () => {
  it('saves and retrieves a conversation by id', () => {
    const msgs = [{ role: 'user', content: 'hello' }];
    saveConversation('conv-001', 'My Chat', msgs, 'claude-sonnet-4-20250514', undefined, db);

    const record = getConversation('conv-001', db);
    expect(record).not.toBeNull();
    expect(record!.id).toBe('conv-001');
    expect(record!.title).toBe('My Chat');
    expect(record!.model).toBe('claude-sonnet-4-20250514');
    expect(record!.messages).toEqual(msgs);
  });

  it('returns null for a non-existent conversation id', () => {
    expect(getConversation('no-such-id', db)).toBeNull();
  });

  it('upserts an existing conversation on duplicate id', () => {
    const msgs1 = [{ role: 'user', content: 'first' }];
    const msgs2 = [{ role: 'user', content: 'updated' }];

    saveConversation('conv-002', 'Original', msgs1, undefined, undefined, db);
    saveConversation('conv-002', 'Updated Title', msgs2, undefined, undefined, db);

    const record = getConversation('conv-002', db);
    expect(record!.title).toBe('Updated Title');
    expect(record!.messages).toEqual(msgs2);
  });

  it('listConversations returns all saved conversations ordered by updated_at desc', () => {
    saveConversation('c1', 'Chat 1', [], undefined, undefined, db);
    saveConversation('c2', 'Chat 2', [], undefined, undefined, db);
    saveConversation('c3', 'Chat 3', [], undefined, undefined, db);

    const list = listConversations(10, 0, db);
    expect(list.length).toBe(3);
  });

  it('deleteConversation removes the record', () => {
    saveConversation('conv-del', 'To Delete', [], undefined, undefined, db);
    deleteConversation('conv-del', db);
    expect(getConversation('conv-del', db)).toBeNull();
  });

  it('saves metadata and retrieves it correctly', () => {
    const meta = { source: 'cli', version: 2 };
    saveConversation('conv-meta', 'Meta Chat', [], undefined, meta, db);
    const record = getConversation('conv-meta', db);
    expect(record!.metadata).toEqual(meta);
  });
});

// ---------------------------------------------------------------------------
// Config key-value store
// ---------------------------------------------------------------------------

describe('config store', () => {
  it('sets and retrieves a string value', () => {
    setConfig('theme', 'dark', db);
    expect(getConfig('theme', db)).toBe('dark');
  });

  it('returns null for a non-existent key', () => {
    expect(getConfig('no-such-key', db)).toBeNull();
  });

  it('overwrites an existing key (REPLACE semantics)', () => {
    setConfig('count', 1, db);
    setConfig('count', 99, db);
    expect(getConfig('count', db)).toBe(99);
  });

  it('sets and retrieves a complex object value', () => {
    const value = { llm: { provider: 'anthropic', model: 'sonnet' } };
    setConfig('llm-config', value, db);
    expect(getConfig('llm-config', db)).toEqual(value);
  });

  it('getAllConfig returns all stored entries', () => {
    setConfig('key-a', 'alpha', db);
    setConfig('key-b', 42, db);

    const all = getAllConfig(db);
    expect(all['key-a']).toBe('alpha');
    expect(all['key-b']).toBe(42);
  });

  it('getAllConfig returns an empty object when no config exists', () => {
    const all = getAllConfig(db);
    expect(typeof all).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

describe('artifacts CRUD', () => {
  it('saves and retrieves an artifact by id', () => {
    saveArtifact('art-001', null, 'main.tf', 'terraform', 'resource "aws_vpc" "main" {}', 'hcl', undefined, db);

    const record = getArtifact('art-001', db);
    expect(record).not.toBeNull();
    expect(record!.id).toBe('art-001');
    expect(record!.name).toBe('main.tf');
    expect(record!.type).toBe('terraform');
    expect(record!.content).toBe('resource "aws_vpc" "main" {}');
    expect(record!.language).toBe('hcl');
  });

  it('returns null for a non-existent artifact id', () => {
    expect(getArtifact('ghost', db)).toBeNull();
  });

  it('upserts on duplicate artifact id', () => {
    saveArtifact('art-002', null, 'file.tf', 'terraform', 'original', undefined, undefined, db);
    saveArtifact('art-002', null, 'file.tf', 'terraform', 'updated content', undefined, undefined, db);

    const record = getArtifact('art-002', db);
    expect(record!.content).toBe('updated content');
  });

  it('listArtifacts with type filter returns only matching records', () => {
    saveArtifact('art-tf', null, 'a.tf', 'terraform', '', undefined, undefined, db);
    saveArtifact('art-k8s', null, 'b.yaml', 'kubernetes', '', undefined, undefined, db);

    const tfArtifacts = listArtifacts('terraform', undefined, 10, 0, db);
    expect(tfArtifacts.every(a => a.type === 'terraform')).toBe(true);

    const k8sArtifacts = listArtifacts('kubernetes', undefined, 10, 0, db);
    expect(k8sArtifacts.every(a => a.type === 'kubernetes')).toBe(true);
  });

  it('listArtifacts with conversationId filter returns only matching records', () => {
    saveArtifact('art-c1a', 'conv-A', 'x.tf', 'terraform', '', undefined, undefined, db);
    saveArtifact('art-c1b', 'conv-A', 'y.tf', 'terraform', '', undefined, undefined, db);
    saveArtifact('art-c2', 'conv-B', 'z.tf', 'terraform', '', undefined, undefined, db);

    const forConvA = listArtifacts(undefined, 'conv-A', 10, 0, db);
    expect(forConvA.length).toBe(2);
    expect(forConvA.every(a => a.conversationId === 'conv-A')).toBe(true);
  });

  it('deleteArtifact removes the record', () => {
    saveArtifact('art-del', null, 'del.tf', 'terraform', 'x', undefined, undefined, db);
    deleteArtifact('art-del', db);
    expect(getArtifact('art-del', db)).toBeNull();
  });

  it('saves and retrieves artifact metadata', () => {
    const meta = { generated_by: 'nimbus', version: 1 };
    saveArtifact('art-meta', null, 'meta.tf', 'terraform', '', undefined, meta, db);
    const record = getArtifact('art-meta', db);
    expect(record!.metadata).toEqual(meta);
  });
});
