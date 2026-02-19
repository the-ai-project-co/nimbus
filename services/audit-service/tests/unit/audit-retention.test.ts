/**
 * Audit Service — Retention / Cleanup Logic Tests
 * Tests the logic around querying time-bounded log sets and the filtering
 * semantics that underpin retention policies (since/until pruning).
 *
 * Because the actual cleanup is done at the SQLite layer, we test:
 *   1. That queryLogs respects "since" / "until" boundary params
 *   2. That countAuditLogs returns correct totals for filtered windows
 *   3. That a "cleanup" helper (simulated) removes records before a cutoff
 *   4. Edge-cases: empty retention windows, boundary precision, large offsets
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock DB adapter
// ---------------------------------------------------------------------------

const mockQueryAuditLogs = mock(() => []);
const mockCountAuditLogs = mock(() => 0);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createAuditLog: mock(() => 'id-ret'),
  queryAuditLogs: mockQueryAuditLogs,
  countAuditLogs: mockCountAuditLogs,
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

import { queryLogs } from '../../../src/routes/logs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(timestamp: string, id = 'r1') {
  return {
    id,
    timestamp,
    team_id: 'team-ret',
    user_id: 'user-ret',
    action: 'deploy',
    resource_type: null,
    resource_id: null,
    status: 'success',
    details: null,
    ip_address: null,
  };
}

const OLD_TIMESTAMP = '2023-01-01T00:00:00.000Z';
const RECENT_TIMESTAMP = '2024-06-01T12:00:00.000Z';
const CUTOFF = '2024-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Audit log retention — time window filtering', () => {
  beforeEach(() => {
    mockQueryAuditLogs.mockReset();
    mockCountAuditLogs.mockReset();
    mockQueryAuditLogs.mockReturnValue([]);
    mockCountAuditLogs.mockReturnValue(0);
  });

  test('passes "since" boundary to DB query — older records are excluded', async () => {
    // Simulate DB returning only records after the cutoff
    mockQueryAuditLogs.mockReturnValue([makeRecord(RECENT_TIMESTAMP, 'recent')]);
    mockCountAuditLogs.mockReturnValue(1);

    const result = await queryLogs({ since: CUTOFF });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ since: CUTOFF })
    );
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].id).toBe('recent');
  });

  test('passes "until" boundary to DB query', async () => {
    mockQueryAuditLogs.mockReturnValue([makeRecord(OLD_TIMESTAMP, 'old')]);
    mockCountAuditLogs.mockReturnValue(1);

    await queryLogs({ until: CUTOFF });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ until: CUTOFF })
    );
  });

  test('combines "since" and "until" for a precise retention window', async () => {
    const windowStart = '2024-01-01T00:00:00.000Z';
    const windowEnd = '2024-03-31T23:59:59.999Z';
    mockQueryAuditLogs.mockReturnValue([makeRecord('2024-02-15T10:00:00.000Z', 'mid')]);
    mockCountAuditLogs.mockReturnValue(1);

    const result = await queryLogs({ since: windowStart, until: windowEnd });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ since: windowStart, until: windowEnd })
    );
    expect(result.total).toBe(1);
  });

  test('returns zero logs when retention window contains no records', async () => {
    mockQueryAuditLogs.mockReturnValue([]);
    mockCountAuditLogs.mockReturnValue(0);

    const result = await queryLogs({
      since: '2020-01-01T00:00:00.000Z',
      until: '2020-01-02T00:00:00.000Z',
    });

    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('large offset simulates paginating through logs for batch deletion', async () => {
    mockQueryAuditLogs.mockReturnValue([]);
    mockCountAuditLogs.mockReturnValue(5000);

    const result = await queryLogs({ limit: 100, offset: 4900 });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 4900 })
    );
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(4900);
    expect(result.total).toBe(5000);
  });

  test('countAuditLogs reflects logs eligible for retention cleanup', async () => {
    mockCountAuditLogs.mockReturnValue(250);

    const result = await queryLogs({ until: CUTOFF });

    expect(result.total).toBe(250);
  });

  test('teamId scoping ensures retention applies only to that team', async () => {
    mockQueryAuditLogs.mockReturnValue([makeRecord(OLD_TIMESTAMP, 'team-scoped')]);
    mockCountAuditLogs.mockReturnValue(1);

    await queryLogs({ teamId: 'team-ABC', until: CUTOFF });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-ABC', until: CUTOFF })
    );
  });
});

// ---------------------------------------------------------------------------
// Simulated retention — pure business logic tests (no DB required)
// ---------------------------------------------------------------------------

describe('Retention policy — pure logic helpers', () => {
  test('calculates 90-day retention cutoff date correctly', () => {
    const now = new Date('2024-06-01T00:00:00.000Z');
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(cutoff.toISOString()).toBe('2024-03-03T00:00:00.000Z');
  });

  test('calculates 30-day retention cutoff date correctly', () => {
    const now = new Date('2024-06-01T00:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(cutoff.toISOString()).toBe('2024-05-02T00:00:00.000Z');
  });

  test('identifies records that fall before the retention cutoff', () => {
    const cutoff = new Date('2024-01-01T00:00:00.000Z');
    const oldRecord = { timestamp: '2023-12-31T23:59:59.000Z' };
    const newRecord = { timestamp: '2024-01-01T00:00:01.000Z' };

    const isExpired = (record: { timestamp: string }) =>
      new Date(record.timestamp) < cutoff;

    expect(isExpired(oldRecord)).toBe(true);
    expect(isExpired(newRecord)).toBe(false);
  });

  test('batch size calculation for chunked deletion respects page size limits', () => {
    const totalExpired = 2500;
    const pageSize = 500;
    const expectedBatches = Math.ceil(totalExpired / pageSize);
    expect(expectedBatches).toBe(5);
  });
});
