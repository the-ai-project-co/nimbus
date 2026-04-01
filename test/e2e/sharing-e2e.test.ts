/**
 * Session Sharing End-to-End Tests
 *
 * Tests the full sharing flow with real in-memory SQLite via _deps injection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  shareSession,
  getSharedSession,
  listShares,
  deleteShare,
  getShareUrl,
  cleanupExpiredShares,
  _deps,
} from '../../src/sharing/sync';
import { getTestDb, closeDb } from '../../src/state/db';

let db: any;

const MOCK_SESSION = {
  id: 'sess-e2e-001',
  name: 'E2E Session',
  model: 'claude-3-5-sonnet',
  mode: 'build',
  costUSD: 0.12,
  tokenCount: 8000,
};

const MOCK_MESSAGES = [
  { role: 'user', content: 'Deploy to staging' },
  { role: 'assistant', content: 'Running terraform plan...' },
  { role: 'assistant', content: 'Plan: 3 to add, 1 to change, 0 to destroy' },
];

beforeEach(() => {
  db = getTestDb();
  // Create shares table
  db.exec(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY, session_id TEXT, name TEXT, messages TEXT,
    model TEXT, mode TEXT, cost_usd REAL, token_count INTEGER,
    is_live INTEGER DEFAULT 0, write_token TEXT,
    created_at TEXT, expires_at TEXT
  )`);

  _deps.getDb = () => db;
  _deps.getConversation = (id: string) =>
    id === 'sess-e2e-001' ? { messages: MOCK_MESSAGES } : null;
  _deps.getSessionManager = () => ({
    get: (id: string) => (id === 'sess-e2e-001' ? MOCK_SESSION : null),
  });
});

afterEach(() => {
  _deps.getDb = undefined;
  _deps.getConversation = undefined;
  _deps.getSessionManager = undefined;
  db?.close();
});

describe('Full sharing flow — E2E', () => {
  it('create → retrieve → verify → delete', () => {
    const share = shareSession('sess-e2e-001')!;
    expect(share).not.toBeNull();
    expect(share.id).toBeTruthy();

    const retrieved = getSharedSession(share.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sessionId).toBe('sess-e2e-001');
    expect(retrieved!.messages).toHaveLength(3);

    const deleted = deleteShare(share.id);
    expect(deleted).toBe(true);

    expect(getSharedSession(share.id)).toBeNull();
  });

  it('share includes all session metadata', () => {
    const share = shareSession('sess-e2e-001')!;
    expect(share.name).toBe('E2E Session');
    expect(share.model).toBe('claude-3-5-sonnet');
    expect(share.mode).toBe('build');
    expect(share.costUSD).toBe(0.12);
    expect(share.tokenCount).toBe(8000);
  });

  it('share has 30-day TTL by default', () => {
    const share = shareSession('sess-e2e-001')!;
    const created = new Date(share.createdAt).getTime();
    const expires = new Date(share.expiresAt).getTime();
    const days = (expires - created) / (1000 * 60 * 60 * 24);
    expect(Math.round(days)).toBe(30);
  });

  it('custom TTL of 7 days works', () => {
    const share = shareSession('sess-e2e-001', { ttlDays: 7 })!;
    const created = new Date(share.createdAt).getTime();
    const expires = new Date(share.expiresAt).getTime();
    const days = (expires - created) / (1000 * 60 * 60 * 24);
    expect(Math.round(days)).toBe(7);
  });

  it('generates write token (UUID format)', () => {
    const share = shareSession('sess-e2e-001')!;
    expect(share.writeToken).toBeTruthy();
    expect(share.writeToken!.length).toBeGreaterThan(10);
  });

  it('retrieved share does NOT expose writeToken', () => {
    const share = shareSession('sess-e2e-001')!;
    const retrieved = getSharedSession(share.id);
    expect(retrieved!.writeToken).toBeUndefined();
  });

  it('multiple shares from same session are independent', () => {
    const s1 = shareSession('sess-e2e-001')!;
    const s2 = shareSession('sess-e2e-001')!;
    expect(s1.id).not.toBe(s2.id);
    expect(s1.writeToken).not.toBe(s2.writeToken);
  });

  it('share ID is URL-safe', () => {
    const share = shareSession('sess-e2e-001')!;
    expect(share.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('listShares returns all active shares', () => {
    shareSession('sess-e2e-001');
    shareSession('sess-e2e-001');
    shareSession('sess-e2e-001');
    const shares = listShares();
    expect(shares.length).toBeGreaterThanOrEqual(3);
  });

  it('returns null for non-existent session', () => {
    expect(shareSession('nonexistent')).toBeNull();
  });

  it('returns null for non-existent share ID', () => {
    expect(getSharedSession('nonexistent')).toBeNull();
  });

  it('getShareUrl generates correct URL', () => {
    expect(getShareUrl('abc123')).toBe('http://localhost:6001/nimbus/share/abc123');
    expect(getShareUrl('abc123', 'https://nimbus.app')).toBe('https://nimbus.app/nimbus/share/abc123');
  });

  it('cleanupExpiredShares removes expired entries', () => {
    const share = shareSession('sess-e2e-001')!;
    // Manually expire the share
    db.run('UPDATE shares SET expires_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', share.id]);
    const cleaned = cleanupExpiredShares();
    expect(cleaned).toBe(1);
    expect(getSharedSession(share.id)).toBeNull();
  });

  it('live share flag is stored correctly', () => {
    const share = shareSession('sess-e2e-001', { isLive: true })!;
    expect(share.isLive).toBe(true);
    const retrieved = getSharedSession(share.id);
    expect(retrieved!.isLive).toBe(true);
  });
});
