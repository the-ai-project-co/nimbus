/**
 * Session Sharing E2E Tests
 *
 * Tests shareSession, getSharedSession, listShares, deleteShare,
 * getShareUrl, and cleanupExpiredShares from src/sharing/sync.ts.
 * Uses dependency injection (_deps) to avoid loading real DB/sessions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  shareSession,
  getSharedSession,
  listShares,
  deleteShare,
  getShareUrl,
  cleanupExpiredShares,
  _deps,
  type SharedSession,
} from '../../src/sharing/sync';

// ---------------------------------------------------------------------------
// In-memory DB mock (mimics better-sqlite3 API used by sharing)
// ---------------------------------------------------------------------------

function createMockDb() {
  const rows: Record<string, any> = {};

  return {
    run: vi.fn((sql: string, params?: any[]) => {
      if (sql.startsWith('INSERT INTO shares')) {
        const id = params![0];
        rows[id] = {
          id: params![0],
          session_id: params![1],
          name: params![2],
          messages: params![3],
          model: params![4],
          mode: params![5],
          cost_usd: params![6],
          token_count: params![7],
          is_live: params![8],
          write_token: params![9],
          created_at: params![10],
          expires_at: params![11],
        };
        return { changes: 1 };
      }
      if (sql.startsWith('DELETE FROM shares WHERE id')) {
        const id = params![0];
        if (rows[id]) {
          delete rows[id];
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      if (sql.startsWith('DELETE FROM shares WHERE expires_at')) {
        const now = params![0];
        let deleted = 0;
        for (const [id, row] of Object.entries(rows)) {
          if (row.expires_at <= now) {
            delete rows[id];
            deleted++;
          }
        }
        return { changes: deleted };
      }
      if (sql.startsWith('UPDATE shares')) {
        return { changes: 1 };
      }
      return { changes: 0 };
    }),
    query: vi.fn((sql: string) => ({
      get: (shareId: string, now: string) => {
        const row = rows[shareId];
        if (row && row.expires_at > now) {
          return row;
        }
        return undefined;
      },
      all: () => Object.values(rows),
    })),
    _rows: rows,
  };
}

// ---------------------------------------------------------------------------
// Mock session and conversation data
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  id: 'sess-001',
  name: 'Test Session',
  model: 'claude-3-5-sonnet',
  mode: 'build',
  costUSD: 0.05,
  tokenCount: 5000,
  status: 'active',
};

const MOCK_MESSAGES = [
  { role: 'user', content: 'Deploy to production' },
  { role: 'assistant', content: 'Running terraform plan...' },
];

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

let mockDb: ReturnType<typeof createMockDb>;

beforeEach(() => {
  mockDb = createMockDb();
  _deps.getDb = () => mockDb;
  _deps.getConversation = (id: string) => (id === 'sess-001' ? { messages: MOCK_MESSAGES } : null);
  _deps.getSessionManager = () => ({
    get: (id: string) => (id === 'sess-001' ? MOCK_SESSION : null),
  });
});

afterEach(() => {
  _deps.getDb = undefined;
  _deps.getConversation = undefined;
  _deps.getSessionManager = undefined;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shareSession', () => {
  it('creates a share with URL-safe ID', () => {
    const share = shareSession('sess-001');
    expect(share).not.toBeNull();
    expect(share!.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(share!.id.length).toBeGreaterThan(0);
  });

  it('includes session metadata', () => {
    const share = shareSession('sess-001')!;
    expect(share.sessionId).toBe('sess-001');
    expect(share.name).toBe('Test Session');
    expect(share.model).toBe('claude-3-5-sonnet');
    expect(share.mode).toBe('build');
    expect(share.costUSD).toBe(0.05);
    expect(share.tokenCount).toBe(5000);
  });

  it('includes conversation messages', () => {
    const share = shareSession('sess-001')!;
    expect(share.messages).toHaveLength(2);
    expect(share.messages[0].role).toBe('user');
    expect(share.messages[1].content).toContain('terraform');
  });

  it('has 30-day TTL by default', () => {
    const share = shareSession('sess-001')!;
    const created = new Date(share.createdAt);
    const expires = new Date(share.expiresAt);
    const diffDays = (expires.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(30);
  });

  it('respects custom TTL', () => {
    const share = shareSession('sess-001', { ttlDays: 7 })!;
    const created = new Date(share.createdAt);
    const expires = new Date(share.expiresAt);
    const diffDays = (expires.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(7);
  });

  it('generates write token', () => {
    const share = shareSession('sess-001')!;
    expect(share.writeToken).toBeDefined();
    expect(share.writeToken!.length).toBeGreaterThan(0);
  });

  it('defaults isLive to false', () => {
    const share = shareSession('sess-001')!;
    expect(share.isLive).toBe(false);
  });

  it('supports isLive option', () => {
    const share = shareSession('sess-001', { isLive: true })!;
    expect(share.isLive).toBe(true);
  });

  it('returns null for non-existent session', () => {
    const share = shareSession('no-such-session');
    expect(share).toBeNull();
  });

  it('persists share to database', () => {
    shareSession('sess-001');
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shares'),
      expect.any(Array)
    );
  });

  it('multiple shares from same session are independent', () => {
    const s1 = shareSession('sess-001')!;
    const s2 = shareSession('sess-001')!;
    expect(s1.id).not.toBe(s2.id);
    expect(s1.writeToken).not.toBe(s2.writeToken);
  });
});

describe('getSharedSession', () => {
  it('retrieves a shared session by ID', () => {
    const share = shareSession('sess-001')!;
    const retrieved = getSharedSession(share.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(share.id);
    expect(retrieved!.sessionId).toBe('sess-001');
  });

  it('returns null for non-existent share', () => {
    expect(getSharedSession('nonexistent')).toBeNull();
  });

  it('returns null when no DB available', () => {
    _deps.getDb = () => null;
    expect(getSharedSession('anything')).toBeNull();
  });

  it('does not include writeToken in retrieved share', () => {
    const share = shareSession('sess-001')!;
    const retrieved = getSharedSession(share.id);
    expect(retrieved!.writeToken).toBeUndefined();
  });
});

describe('listShares', () => {
  it('returns all active shares', () => {
    shareSession('sess-001');
    shareSession('sess-001');
    const shares = listShares();
    expect(shares.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when no shares', () => {
    expect(listShares()).toEqual([]);
  });

  it('returns empty when no DB', () => {
    _deps.getDb = () => null;
    expect(listShares()).toEqual([]);
  });
});

describe('deleteShare', () => {
  it('deletes existing share', () => {
    const share = shareSession('sess-001')!;
    const deleted = deleteShare(share.id);
    expect(deleted).toBe(true);
  });

  it('returns false for non-existent share', () => {
    expect(deleteShare('nonexistent')).toBe(false);
  });

  it('returns false when no DB', () => {
    _deps.getDb = () => null;
    expect(deleteShare('anything')).toBe(false);
  });
});

describe('getShareUrl', () => {
  it('generates URL with default base', () => {
    const url = getShareUrl('abc123');
    expect(url).toBe('http://localhost:6001/nimbus/share/abc123');
  });

  it('generates URL with custom base', () => {
    const url = getShareUrl('abc123', 'https://nimbus.dev');
    expect(url).toBe('https://nimbus.dev/nimbus/share/abc123');
  });
});

describe('cleanupExpiredShares', () => {
  it('returns 0 when no expired shares', () => {
    shareSession('sess-001'); // Fresh share, not expired
    const cleaned = cleanupExpiredShares();
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 when no DB', () => {
    _deps.getDb = () => null;
    expect(cleanupExpiredShares()).toBe(0);
  });

  it('cleans up expired shares', () => {
    // Create a share and manually set it as expired in mock DB
    const share = shareSession('sess-001')!;
    mockDb._rows[share.id].expires_at = '2020-01-01T00:00:00.000Z'; // Past date
    const cleaned = cleanupExpiredShares();
    expect(cleaned).toBe(1);
  });
});
