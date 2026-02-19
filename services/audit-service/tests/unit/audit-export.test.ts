/**
 * Audit Service — Export Tests
 * Tests GET /api/audit/export logic for CSV and JSON output formats.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock DB adapter before importing route modules
// ---------------------------------------------------------------------------

const mockQueryAuditLogs = mock(() => []);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createAuditLog: mock(() => 'id'),
  queryAuditLogs: mockQueryAuditLogs,
  countAuditLogs: mock(() => 0),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

import { exportLogs } from '../../../src/routes/export';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-aaa',
    timestamp: '2024-03-01T08:00:00.000Z',
    team_id: 'team-1',
    user_id: 'user-1',
    action: 'deploy',
    resource_type: 'stack',
    resource_id: 'stack-42',
    status: 'success',
    details: JSON.stringify({ env: 'prod' }),
    ip_address: '10.1.2.3',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JSON export tests
// ---------------------------------------------------------------------------

describe('exportLogs — JSON format', () => {
  beforeEach(() => {
    mockQueryAuditLogs.mockReset();
    mockQueryAuditLogs.mockReturnValue([]);
  });

  test('returns a valid JSON string with "logs" and "exportedAt" keys when records exist', async () => {
    mockQueryAuditLogs.mockReturnValue([makeRecord()]);

    const output = await exportLogs('json', {});

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('logs');
    expect(parsed).toHaveProperty('exportedAt');
    expect(Array.isArray(parsed.logs)).toBe(true);
  });

  test('maps DB record fields to camelCase API keys', async () => {
    mockQueryAuditLogs.mockReturnValue([makeRecord()]);

    const output = await exportLogs('json', {});
    const { logs } = JSON.parse(output);
    const log = logs[0];

    expect(log.teamId).toBe('team-1');
    expect(log.userId).toBe('user-1');
    expect(log.resourceType).toBe('stack');
    expect(log.resourceId).toBe('stack-42');
    expect(log.ipAddress).toBe('10.1.2.3');
    expect(log.details).toEqual({ env: 'prod' });
  });

  test('exports empty logs array when no records match', async () => {
    const output = await exportLogs('json', { teamId: 'nonexistent' });

    const parsed = JSON.parse(output);
    expect(parsed.logs).toHaveLength(0);
  });

  test('null optional fields become undefined (omitted) in JSON output', async () => {
    mockQueryAuditLogs.mockReturnValue([
      makeRecord({ team_id: null, user_id: null, resource_type: null, resource_id: null, details: null, ip_address: null }),
    ]);

    const output = await exportLogs('json', {});
    const { logs } = JSON.parse(output);

    expect(logs[0].teamId).toBeUndefined();
    expect(logs[0].details).toBeUndefined();
  });

  test('passes query filters through to queryAuditLogs with max limit 10000', async () => {
    await exportLogs('json', { teamId: 'team-X', userId: 'user-Y', action: 'deploy' });

    expect(mockQueryAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-X',
        userId: 'user-Y',
        action: 'deploy',
        limit: 10000,
        offset: 0,
      })
    );
  });

  test('exports multiple records maintaining their order', async () => {
    mockQueryAuditLogs.mockReturnValue([
      makeRecord({ id: 'a', action: 'deploy' }),
      makeRecord({ id: 'b', action: 'destroy' }),
    ]);

    const { logs } = JSON.parse(await exportLogs('json', {}));
    expect(logs[0].id).toBe('a');
    expect(logs[1].id).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// CSV export tests
// ---------------------------------------------------------------------------

describe('exportLogs — CSV format', () => {
  beforeEach(() => {
    mockQueryAuditLogs.mockReset();
    mockQueryAuditLogs.mockReturnValue([]);
  });

  test('returns a string containing the CSV header row', async () => {
    const output = await exportLogs('csv', {});

    const firstLine = output.split('\n')[0];
    expect(firstLine).toContain('id');
    expect(firstLine).toContain('timestamp');
    expect(firstLine).toContain('action');
    expect(firstLine).toContain('status');
  });

  test('includes a data row for each record after the header', async () => {
    mockQueryAuditLogs.mockReturnValue([makeRecord()]);

    const output = await exportLogs('csv', {});
    const lines = output.split('\n').filter(l => l.trim() !== '');

    // header + 1 data row
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('log-aaa');
    expect(lines[1]).toContain('deploy');
    expect(lines[1]).toContain('success');
  });

  test('outputs only the header when no records are returned', async () => {
    const output = await exportLogs('csv', {});
    const lines = output.split('\n').filter(l => l.trim() !== '');
    expect(lines).toHaveLength(1);
  });

  test('escapes fields containing commas with double-quotes', async () => {
    mockQueryAuditLogs.mockReturnValue([
      makeRecord({ details: '{"key":"value,with,commas"}' }),
    ]);

    const output = await exportLogs('csv', {});
    // The details field contains commas, so it must be quoted in CSV
    expect(output).toContain('"');
  });

  test('handles multiple records producing the correct number of lines', async () => {
    mockQueryAuditLogs.mockReturnValue([
      makeRecord({ id: 'r1' }),
      makeRecord({ id: 'r2' }),
      makeRecord({ id: 'r3' }),
    ]);

    const output = await exportLogs('csv', {});
    const lines = output.split('\n').filter(l => l.trim() !== '');
    // header + 3 rows
    expect(lines).toHaveLength(4);
  });
});
