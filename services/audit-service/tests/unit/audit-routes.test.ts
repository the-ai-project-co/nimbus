/**
 * Audit Service — Route Tests
 * Tests POST /api/audit/logs and GET /api/audit/logs route handler logic
 * without starting the actual server or touching SQLite.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock all modules that touch the database or shared utilities BEFORE any
// service module is imported, so Bun's module mock registry is in place.
// ---------------------------------------------------------------------------

const mockCreateAuditLog = mock(() => 'log-id-123');
const mockQueryAuditLogs = mock(() => []);
const mockCountAuditLogs = mock(() => 0);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createAuditLog: mockCreateAuditLog,
  queryAuditLogs: mockQueryAuditLogs,
  countAuditLogs: mockCountAuditLogs,
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

// Import route handlers after mocks are registered
import { createLog, queryLogs } from '../../../src/routes/logs';

// ---------------------------------------------------------------------------
// Sample fixtures
// ---------------------------------------------------------------------------

function makeAuditLogRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-id-123',
    timestamp: '2024-01-15T10:00:00.000Z',
    team_id: 'team-abc',
    user_id: 'user-xyz',
    action: 'deploy',
    resource_type: 'stack',
    resource_id: 'stack-001',
    status: 'success',
    details: JSON.stringify({ region: 'us-east-1' }),
    ip_address: '10.0.0.1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — createLog
// ---------------------------------------------------------------------------

describe('createLog route handler', () => {
  beforeEach(() => {
    mockCreateAuditLog.mockReset();
    mockCreateAuditLog.mockReturnValue('log-id-123');
  });

  test('creates a log entry with required fields and returns AuditLog shape', async () => {
    const result = await createLog({ action: 'deploy', status: 'success' });

    expect(result.id).toBe('log-id-123');
    expect(result.action).toBe('deploy');
    expect(result.status).toBe('success');
    expect(typeof result.timestamp).toBe('string');
  });

  test('passes optional fields (teamId, userId, resourceType, resourceId, details, ipAddress)', async () => {
    const result = await createLog({
      action: 'destroy',
      status: 'failure',
      teamId: 'team-1',
      userId: 'user-1',
      resourceType: 'stack',
      resourceId: 'stack-99',
      details: { reason: 'quota_exceeded' },
      ipAddress: '192.168.1.1',
    });

    expect(result.teamId).toBe('team-1');
    expect(result.userId).toBe('user-1');
    expect(result.resourceType).toBe('stack');
    expect(result.resourceId).toBe('stack-99');
    expect(result.details).toEqual({ reason: 'quota_exceeded' });
    expect(result.ipAddress).toBe('192.168.1.1');
  });

  test('throws when action is missing', async () => {
    await expect(
      createLog({ action: '', status: 'success' })
    ).rejects.toThrow('Action and status are required');
  });

  test('throws when status is missing', async () => {
    await expect(
      createLog({ action: 'deploy', status: '' })
    ).rejects.toThrow('Action and status are required');
  });

  test('calls createAuditLog with correct parameters', async () => {
    await createLog({
      action: 'login',
      status: 'success',
      teamId: 'team-A',
      userId: 'user-B',
    });

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      'login',
      'success',
      expect.objectContaining({ teamId: 'team-A', userId: 'user-B' })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — queryLogs
// ---------------------------------------------------------------------------

describe('queryLogs route handler', () => {
  beforeEach(() => {
    mockQueryAuditLogs.mockReset();
    mockCountAuditLogs.mockReset();
    mockQueryAuditLogs.mockReturnValue([]);
    mockCountAuditLogs.mockReturnValue(0);
  });

  test('returns empty result set with correct pagination defaults', async () => {
    const result = await queryLogs({});

    expect(result.logs).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  test('maps database records to AuditLog API shape', async () => {
    const record = makeAuditLogRecord();
    mockQueryAuditLogs.mockReturnValue([record]);
    mockCountAuditLogs.mockReturnValue(1);

    const result = await queryLogs({ teamId: 'team-abc' });

    expect(result.logs).toHaveLength(1);
    const log = result.logs[0];
    expect(log.id).toBe('log-id-123');
    expect(log.teamId).toBe('team-abc');
    expect(log.userId).toBe('user-xyz');
    expect(log.action).toBe('deploy');
    expect(log.status).toBe('success');
    expect(log.details).toEqual({ region: 'us-east-1' });
    expect(log.ipAddress).toBe('10.0.0.1');
  });

  test('respects custom limit and offset', async () => {
    mockQueryAuditLogs.mockReturnValue([]);
    mockCountAuditLogs.mockReturnValue(42);

    const result = await queryLogs({ limit: 10, offset: 20 });

    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
    expect(result.total).toBe(42);
  });

  test('handles null optional fields in DB records gracefully', async () => {
    const record = makeAuditLogRecord({
      team_id: null,
      user_id: null,
      resource_type: null,
      resource_id: null,
      details: null,
      ip_address: null,
    });
    mockQueryAuditLogs.mockReturnValue([record]);
    mockCountAuditLogs.mockReturnValue(1);

    const result = await queryLogs({});
    const log = result.logs[0];

    expect(log.teamId).toBeUndefined();
    expect(log.userId).toBeUndefined();
    expect(log.resourceType).toBeUndefined();
    expect(log.resourceId).toBeUndefined();
    expect(log.details).toBeUndefined();
    expect(log.ipAddress).toBeUndefined();
  });

  test('filters are passed through to queryAuditLogs and countAuditLogs', async () => {
    await queryLogs({
      teamId: 'team-X',
      userId: 'user-Y',
      action: 'deploy',
      status: 'success',
      since: '2024-01-01',
      until: '2024-12-31',
    });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-X',
        userId: 'user-Y',
        action: 'deploy',
        status: 'success',
        since: '2024-01-01',
        until: '2024-12-31',
      })
    );
    expect(mockCountAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-X',
        userId: 'user-Y',
      })
    );
  });

  test('returns multiple logs in the correct order from the DB response', async () => {
    const records = [
      makeAuditLogRecord({ id: 'log-1', action: 'deploy' }),
      makeAuditLogRecord({ id: 'log-2', action: 'destroy' }),
    ];
    mockQueryAuditLogs.mockReturnValue(records);
    mockCountAuditLogs.mockReturnValue(2);

    const result = await queryLogs({});

    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].id).toBe('log-1');
    expect(result.logs[1].id).toBe('log-2');
  });
});
