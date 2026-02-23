/**
 * Tests for the enterprise modules:
 *   - src/enterprise/auth.ts    – initiateDeviceFlow, pollDeviceCode, verifyDeviceCode, validateToken
 *   - src/enterprise/teams.ts   – createTeam, getTeam, listUserTeams, inviteMember, listMembers
 *   - src/enterprise/billing.ts – subscribe, getBillingStatus, recordUsage, getUsage
 *   - src/enterprise/audit.ts   – createLog, queryLogs, exportLogs
 *
 * Every test uses an isolated in-memory SQLite database via NIMBUS_DB_PATH=':memory:'
 * so the real ~/.nimbus/nimbus.db is never touched.
 *
 * IMPORTANT: The enterprise modules use `getDb()` (singleton) internally when
 * they reach for the database.  We set NIMBUS_DB_PATH to ':memory:' before
 * each test group and reset the db singleton afterwards via `closeDb()`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getTestDb, closeDb } from '../state/db';

// ---------------------------------------------------------------------------
// Setup: point every getDb() call to a fresh in-memory database.
// ---------------------------------------------------------------------------

beforeEach(() => {
  // closeDb() resets the db singleton so the next getDb() call re-opens.
  closeDb();
  // Re-initialise using NIMBUS_DB_PATH=':memory:' by creating a test db
  // and setting the env variable so subsequent getDb() calls hit :memory:.
  process.env.NIMBUS_DB_PATH = ':memory:';
  // Warm-up the singleton with migrations applied
  getTestDb(); // just to confirm migration works; enterprise fns call getDb() on their own
});

afterEach(() => {
  closeDb();
  delete process.env.NIMBUS_DB_PATH;
});

// ---------------------------------------------------------------------------
// Auth: device-authorization flow
// ---------------------------------------------------------------------------

describe('enterprise auth – initiateDeviceFlow', () => {
  it('returns a DeviceCodeResponse with all expected fields', async () => {
    const { initiateDeviceFlow } = await import('../enterprise/auth');
    const response = await initiateDeviceFlow();

    expect(typeof response.deviceCode).toBe('string');
    expect(response.deviceCode.length).toBeGreaterThan(0);
    expect(typeof response.userCode).toBe('string');
    // User code format: XXXX-NNNN
    expect(/^[A-Z]{4}-\d{4}$/.test(response.userCode)).toBe(true);
    expect(typeof response.verificationUri).toBe('string');
    expect(response.expiresIn).toBe(900);
    expect(response.interval).toBe(5);
  });

  it('generates a unique deviceCode on each call', async () => {
    const { initiateDeviceFlow } = await import('../enterprise/auth');
    const r1 = await initiateDeviceFlow();
    const r2 = await initiateDeviceFlow();
    expect(r1.deviceCode).not.toBe(r2.deviceCode);
    expect(r1.userCode).not.toBe(r2.userCode);
  });

  it('userCode consists of uppercase letters and digits only', async () => {
    const { initiateDeviceFlow } = await import('../enterprise/auth');
    const { userCode } = await initiateDeviceFlow();
    // Valid chars: uppercase ASCII letters (no I or O) + digits + hyphen
    expect(/^[A-HJ-NP-Z0-9]{4}-[0-9]{4}$/.test(userCode)).toBe(true);
  });
});

describe('enterprise auth – pollDeviceCode', () => {
  it('returns authorization_pending for a newly created device code', async () => {
    const { initiateDeviceFlow, pollDeviceCode } = await import('../enterprise/auth');
    const { deviceCode } = await initiateDeviceFlow();
    const response = await pollDeviceCode(deviceCode);

    expect(response.error).toBe('authorization_pending');
    expect(response.accessToken).toBeUndefined();
  });

  it('returns expired_token for an unknown device code', async () => {
    const { pollDeviceCode } = await import('../enterprise/auth');
    const response = await pollDeviceCode('nonexistent-device-code');
    expect(response.error).toBe('expired_token');
  });
});

describe('enterprise auth – validateToken', () => {
  it('returns valid: false for a non-existent token', async () => {
    const { validateToken } = await import('../enterprise/auth');
    const result = await validateToken({ accessToken: 'not-a-real-token' });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for an empty token string', async () => {
    const { validateToken } = await import('../enterprise/auth');
    const result = await validateToken({ accessToken: '' });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

describe('enterprise teams – createTeam', () => {
  it('creates a team and returns a Team object', async () => {
    const { createTeam } = await import('../enterprise/teams');
    const team = await createTeam({ name: 'Nimbus Core', ownerId: 'user-001' });

    expect(typeof team.id).toBe('string');
    expect(team.id.length).toBeGreaterThan(0);
    expect(team.name).toBe('Nimbus Core');
    expect(team.ownerId).toBe('user-001');
    expect(team.plan).toBe('free');
  });

  it('throws when name is missing', async () => {
    const { createTeam } = await import('../enterprise/teams');
    await expect(createTeam({ name: '', ownerId: 'user-001' })).rejects.toThrow();
  });

  it('throws when ownerId is missing', async () => {
    const { createTeam } = await import('../enterprise/teams');
    await expect(createTeam({ name: 'Team', ownerId: '' })).rejects.toThrow();
  });
});

describe('enterprise teams – getTeam', () => {
  it('retrieves a team that was just created', async () => {
    const { createTeam, getTeam } = await import('../enterprise/teams');
    const created = await createTeam({ name: 'Alpha Team', ownerId: 'u-alpha' });
    const fetched = await getTeam(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('Alpha Team');
  });

  it('returns null for a non-existent team id', async () => {
    const { getTeam } = await import('../enterprise/teams');
    const result = await getTeam('non-existent-id');
    expect(result).toBeNull();
  });
});

describe('enterprise teams – listUserTeams', () => {
  it('returns teams where user is a member', async () => {
    const { createTeam, listUserTeams } = await import('../enterprise/teams');
    await createTeam({ name: 'My Team', ownerId: 'user-list' });
    const teams = await listUserTeams('user-list');

    expect(Array.isArray(teams)).toBe(true);
    expect(teams.length).toBeGreaterThanOrEqual(1);
    expect(teams.some(t => t.name === 'My Team')).toBe(true);
  });

  it('returns empty array for user with no team memberships', async () => {
    const { listUserTeams } = await import('../enterprise/teams');
    const teams = await listUserTeams('user-with-no-teams-xyz');
    expect(Array.isArray(teams)).toBe(true);
    expect(teams.length).toBe(0);
  });
});

describe('enterprise teams – inviteMember', () => {
  it('invites a new member to a team by email', async () => {
    const { createTeam, inviteMember } = await import('../enterprise/teams');
    const team = await createTeam({ name: 'Invite Team', ownerId: 'owner-u' });
    const member = await inviteMember(team.id, { email: 'new@example.com', role: 'member' });

    expect(member.teamId).toBe(team.id);
    expect(member.role).toBe('member');
    expect(member.user?.email).toBe('new@example.com');
  });

  it('throws for an invalid role', async () => {
    const { createTeam, inviteMember } = await import('../enterprise/teams');
    const team = await createTeam({ name: 'Role Team', ownerId: 'owner-r' });
    await expect(
      inviteMember(team.id, { email: 'x@example.com', role: 'superadmin' })
    ).rejects.toThrow();
  });
});

describe('enterprise teams – listMembers', () => {
  it('lists members including the team owner', async () => {
    const { createTeam, listMembers } = await import('../enterprise/teams');
    const team = await createTeam({ name: 'List Members Team', ownerId: 'owner-lm' });
    const members = await listMembers(team.id);

    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(1);
    // Owner is automatically added as a member with role 'owner'
    const ownerEntry = members.find(m => m.role === 'owner');
    expect(ownerEntry).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

describe('enterprise billing – subscribe', () => {
  it('creates a subscription and returns billing status', async () => {
    const { createTeam } = await import('../enterprise/teams');
    const { subscribe } = await import('../enterprise/billing');
    // A subscription has a FK on team_id; create the team first.
    const team = await createTeam({ name: 'Sub Team Pro', ownerId: 'owner-sub-001' });
    const result = await subscribe({ teamId: team.id, plan: 'pro' });

    expect(result).toBeDefined();
    expect(result.billing.plan).toBe('pro');
    expect(result.billing.status).toBe('active');
    expect(result.stripe).toBeDefined();
    expect(result.stripe.object).toBe('subscription');
  });

  it('throws for an invalid plan name', async () => {
    const { subscribe } = await import('../enterprise/billing');
    await expect(subscribe({ teamId: 'team-bad', plan: 'diamond' })).rejects.toThrow();
  });

  it('throws when teamId is empty', async () => {
    const { subscribe } = await import('../enterprise/billing');
    await expect(subscribe({ teamId: '', plan: 'pro' })).rejects.toThrow();
  });
});

describe('enterprise billing – getBillingStatus', () => {
  it('returns free plan defaults for a team with no subscription', async () => {
    const { getBillingStatus } = await import('../enterprise/billing');
    const status = await getBillingStatus('team-no-sub');

    expect(status.plan).toBe('free');
    expect(status.status).toBe('active');
    expect(status.cancelAtPeriodEnd).toBe(false);
  });

  it('returns active status after subscribing', async () => {
    const { createTeam } = await import('../enterprise/teams');
    const { subscribe, getBillingStatus } = await import('../enterprise/billing');
    // A subscription has a FK on team_id; create the team first.
    const team = await createTeam({ name: 'Status Team', ownerId: 'owner-status' });
    await subscribe({ teamId: team.id, plan: 'enterprise' });
    const status = await getBillingStatus(team.id);

    expect(status.plan).toBe('enterprise');
    expect(status.status).toBe('active');
  });
});

describe('enterprise billing – recordUsage', () => {
  it('records a usage event and returns a confirmation receipt', async () => {
    const { recordUsage } = await import('../enterprise/billing');
    const result = await recordUsage({
      teamId: 'team-usage',
      operationType: 'generate',
      tokensUsed: 1000,
      costUsd: 0.003,
    });

    expect(result.recorded).toBe(true);
    expect(typeof result.id).toBe('string');
    expect(result.teamId).toBe('team-usage');
    expect(result.operationType).toBe('generate');
    expect(result.tokensUsed).toBe(1000);
    expect(result.costUsd).toBe(0.003);
    expect(typeof result.timestamp).toBe('string');
  });

  it('throws for negative tokensUsed', async () => {
    const { recordUsage } = await import('../enterprise/billing');
    await expect(
      recordUsage({ teamId: 'team-bad', operationType: 'gen', tokensUsed: -1, costUsd: 0 })
    ).rejects.toThrow();
  });

  it('throws for negative costUsd', async () => {
    const { recordUsage } = await import('../enterprise/billing');
    await expect(
      recordUsage({ teamId: 'team-bad', operationType: 'gen', tokensUsed: 0, costUsd: -0.5 })
    ).rejects.toThrow();
  });
});

describe('enterprise billing – getUsage', () => {
  it('returns an EnhancedUsageSummary with expected shape', async () => {
    const { getUsage } = await import('../enterprise/billing');
    const summary = await getUsage('team-get-usage', 'month');

    expect(summary).toBeDefined();
    expect(typeof summary.totals.operations).toBe('number');
    expect(typeof summary.totals.tokensUsed).toBe('number');
    expect(typeof summary.totals.costUsd).toBe('number');
    expect(summary.quota).toBeDefined();
    expect(summary.quota.plan).toBe('free'); // No subscription → free plan
    expect(typeof summary.rateLimit.requestsPerMinute).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe('enterprise audit – createLog', () => {
  it('creates an audit log entry and returns an AuditLog', async () => {
    const { createLog } = await import('../enterprise/audit');
    const log = await createLog({
      action: 'generate.terraform',
      status: 'success',
      userId: 'user-audit-001',
      resourceType: 'terraform',
      resourceId: 'vpc-module',
    });

    expect(typeof log.id).toBe('string');
    expect(log.id.length).toBeGreaterThan(0);
    expect(log.action).toBe('generate.terraform');
    expect(log.status).toBe('success');
    expect(log.userId).toBe('user-audit-001');
    expect(log.resourceType).toBe('terraform');
    expect(typeof log.timestamp).toBe('string');
  });

  it('throws when action is missing', async () => {
    const { createLog } = await import('../enterprise/audit');
    await expect(createLog({ action: '', status: 'success' })).rejects.toThrow();
  });

  it('throws when status is missing', async () => {
    const { createLog } = await import('../enterprise/audit');
    await expect(createLog({ action: 'do.thing', status: '' })).rejects.toThrow();
  });

  it('stores teamId and ipAddress in the returned log', async () => {
    const { createLog } = await import('../enterprise/audit');
    const log = await createLog({
      action: 'login',
      status: 'success',
      teamId: 'team-audit',
      ipAddress: '127.0.0.1',
    });

    expect(log.teamId).toBe('team-audit');
    expect(log.ipAddress).toBe('127.0.0.1');
  });
});

describe('enterprise audit – queryLogs', () => {
  it('returns paginated results with total count', async () => {
    const { createLog, queryLogs } = await import('../enterprise/audit');

    await createLog({ action: 'action.a', status: 'success' });
    await createLog({ action: 'action.b', status: 'failure' });

    const result = await queryLogs({ limit: 10, offset: 0 });

    expect(Array.isArray(result.logs)).toBe(true);
    expect(typeof result.total).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.offset).toBe('number');
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by action when action param is provided', async () => {
    const { createLog, queryLogs } = await import('../enterprise/audit');

    await createLog({ action: 'filtered.action', status: 'success' });
    await createLog({ action: 'other.action', status: 'success' });

    const result = await queryLogs({ action: 'filtered.action' });
    expect(result.logs.every(l => l.action === 'filtered.action')).toBe(true);
  });
});

describe('enterprise audit – exportLogs', () => {
  it('exports logs as JSON string', async () => {
    const { createLog, exportLogs } = await import('../enterprise/audit');
    await createLog({ action: 'export.test', status: 'success' });

    const json = await exportLogs('json', {});
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.logs)).toBe(true);
    expect(typeof parsed.exportedAt).toBe('string');
  });

  it('exports logs as CSV string', async () => {
    const { createLog, exportLogs } = await import('../enterprise/audit');
    await createLog({ action: 'csv.test', status: 'success' });

    const csv = await exportLogs('csv', {});
    expect(typeof csv).toBe('string');
    // CSV should contain the header row
    expect(csv).toContain('id,timestamp');
    expect(csv).toContain('action');
  });
});
