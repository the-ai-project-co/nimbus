/**
 * Tests for Session Sharing
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  shareSession,
  getSharedSession,
  listShares,
  deleteShare,
  getShareUrl,
  cleanupExpiredShares,
  _deps,
} from '../sharing/sync';
import { generateShareViewer } from '../sharing/viewer';
import type { SharedSession } from '../sharing/sync';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSession = {
  id: 'test-session-id',
  name: 'Test Session',
  mode: 'build',
  model: 'claude-sonnet',
  status: 'active',
  costUSD: 0.05,
  tokenCount: 5000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockMessages = [
  { role: 'user' as const, content: 'Hello' },
  { role: 'assistant' as const, content: 'Hi there!' },
];

// ---------------------------------------------------------------------------
// Inject test dependencies (no module-level mocks — avoids cross-file leaks)
// ---------------------------------------------------------------------------

beforeEach(() => {
  _deps.getConversation = (id: string) =>
    id === 'test-session-id' ? { messages: mockMessages } : null;
  _deps.getSessionManager = () => ({
    get: (id: string) => id === 'test-session-id' ? mockSession : null,
  });
});

afterEach(() => {
  _deps.getConversation = undefined;
  _deps.getSessionManager = undefined;
});

// ---------------------------------------------------------------------------
// shareSession
// ---------------------------------------------------------------------------

describe('shareSession', () => {
  test('creates a share for a valid session', () => {
    const shared = shareSession('test-session-id');
    expect(shared).not.toBeNull();
    expect(shared!.id).toBeTruthy();
    expect(shared!.sessionId).toBe('test-session-id');
    expect(shared!.name).toBe('Test Session');
    expect(shared!.messages).toEqual(mockMessages);
    expect(shared!.model).toBe('claude-sonnet');
    expect(shared!.mode).toBe('build');
    expect(shared!.costUSD).toBe(0.05);
    expect(shared!.tokenCount).toBe(5000);
    expect(shared!.isLive).toBe(false);
    expect(shared!.expiresAt).toBeTruthy();
    expect(shared!.writeToken).toBeTruthy();
  });

  test('returns null for non-existent session', () => {
    const shared = shareSession('nonexistent-id');
    expect(shared).toBeNull();
  });

  test('respects isLive option', () => {
    const shared = shareSession('test-session-id', { isLive: true });
    expect(shared).not.toBeNull();
    expect(shared!.isLive).toBe(true);
  });

  test('respects custom ttlDays', () => {
    const shared = shareSession('test-session-id', { ttlDays: 7 });
    expect(shared).not.toBeNull();
    const expiresAt = new Date(shared!.expiresAt);
    const now = new Date();
    const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    // Should expire in approximately 7 days (allow some tolerance for execution time)
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});

// ---------------------------------------------------------------------------
// getSharedSession
// ---------------------------------------------------------------------------

describe('getSharedSession', () => {
  test('returns the shared session without writeToken', () => {
    const created = shareSession('test-session-id');
    expect(created).not.toBeNull();

    const retrieved = getSharedSession(created!.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created!.id);
    expect(retrieved!.sessionId).toBe('test-session-id');
    expect(retrieved!.name).toBe('Test Session');
    // The writeToken should NOT be present in the public view
    expect(retrieved!.writeToken).toBeUndefined();
  });

  test('returns null for non-existent share', () => {
    const result = getSharedSession('does-not-exist');
    expect(result).toBeNull();
  });

  test('returns null for expired shares', () => {
    // Create a share with a very short TTL, then manipulate its expiry
    const created = shareSession('test-session-id', { ttlDays: 0 });
    expect(created).not.toBeNull();

    // The share was created with ttlDays: 0, which means it expires immediately
    // Access the internal store to verify expiry behavior
    // Since ttlDays is 0, expiry = now + 0 days = now, which is already expired
    const result = getSharedSession(created!.id);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listShares
// ---------------------------------------------------------------------------

describe('listShares', () => {
  test('returns an array of shares', () => {
    const shares = listShares();
    expect(Array.isArray(shares)).toBe(true);
  });

  test('filters out expired shares', () => {
    // Create a valid share
    const valid = shareSession('test-session-id', { ttlDays: 30 });
    expect(valid).not.toBeNull();

    // Create a share that expires immediately
    const expired = shareSession('test-session-id', { ttlDays: 0 });
    expect(expired).not.toBeNull();

    const shares = listShares();
    const ids = shares.map(s => s.id);

    // The valid share should be in the list
    expect(ids).toContain(valid!.id);
    // The expired share should NOT be in the list
    expect(ids).not.toContain(expired!.id);
  });
});

// ---------------------------------------------------------------------------
// deleteShare
// ---------------------------------------------------------------------------

describe('deleteShare', () => {
  test('removes a share and returns true', () => {
    const created = shareSession('test-session-id');
    expect(created).not.toBeNull();

    const deleted = deleteShare(created!.id);
    expect(deleted).toBe(true);

    // Verify it is gone
    const result = getSharedSession(created!.id);
    expect(result).toBeNull();
  });

  test('returns false for non-existent share', () => {
    expect(deleteShare('nonexistent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredShares
// ---------------------------------------------------------------------------

describe('cleanupExpiredShares', () => {
  test('removes expired shares and returns count', () => {
    // Create an immediately-expiring share
    shareSession('test-session-id', { ttlDays: 0 });

    const cleaned = cleanupExpiredShares();
    expect(typeof cleaned).toBe('number');
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// getShareUrl
// ---------------------------------------------------------------------------

describe('getShareUrl', () => {
  test('generates URL with default base', () => {
    const url = getShareUrl('abc123');
    expect(url).toBe('http://localhost:6001/nimbus/share/abc123');
  });

  test('generates URL with custom base', () => {
    const url = getShareUrl('abc123', 'https://astron.dev');
    expect(url).toBe('https://astron.dev/nimbus/share/abc123');
  });
});

// ---------------------------------------------------------------------------
// generateShareViewer
// ---------------------------------------------------------------------------

describe('generateShareViewer', () => {
  const mockSharedSession: SharedSession = {
    id: 'test-share-id',
    sessionId: 'session-123',
    name: 'Test Session',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there! How can I help?' },
      { role: 'user', content: 'Deploy my app' },
      { role: 'assistant', content: 'I will help you deploy your application.' },
    ],
    model: 'claude-sonnet',
    mode: 'build',
    costUSD: 0.0042,
    tokenCount: 1500,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isLive: false,
  };

  test('generates valid HTML', () => {
    const html = generateShareViewer(mockSharedSession);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Nimbus');
    expect(html).toContain('Test Session');
    expect(html).toContain('claude-sonnet');
    expect(html).toContain('build');
  });

  test('escapes HTML entities', () => {
    const session: SharedSession = {
      ...mockSharedSession,
      messages: [
        { role: 'user', content: '<script>alert("xss")</script>' },
        { role: 'assistant', content: 'Safe response & "quotes"' },
      ],
    };
    const html = generateShareViewer(session);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;quotes&quot;');
  });

  test('shows LIVE badge when isLive=true', () => {
    const liveSession = { ...mockSharedSession, isLive: true };
    const html = generateShareViewer(liveSession);
    expect(html).toContain('LIVE');
  });

  test('does not show LIVE badge when isLive=false', () => {
    const html = generateShareViewer(mockSharedSession);
    expect(html).not.toContain('LIVE');
  });

  test('includes expiry information', () => {
    const html = generateShareViewer(mockSharedSession);
    expect(html).toContain('Expires');
  });

  test('includes all user and assistant messages', () => {
    const html = generateShareViewer(mockSharedSession);
    expect(html).toContain('Hello');
    expect(html).toContain('Hi there! How can I help?');
    expect(html).toContain('Deploy my app');
    expect(html).toContain('I will help you deploy your application.');
  });
});
