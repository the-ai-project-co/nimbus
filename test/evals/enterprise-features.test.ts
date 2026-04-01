/**
 * E2E tests for Enterprise features: Auth, Teams, Billing, and Audit.
 *
 * Each test creates a fresh in-memory SQLite database via getTestDb() and
 * configures the module mock so enterprise modules operate against the test
 * database instead of the real ~/.nimbus/nimbus.db.
 *
 * No external services are called -- the enterprise modules are fully
 * embedded and backed by SQLite.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../../src/compat/sqlite';
import { runMigrations } from '../../src/state/schema';

// ---------------------------------------------------------------------------
// Database mock -- hoisted to top by vitest
// ---------------------------------------------------------------------------

let _currentDb: Database;

vi.mock('../../src/state/db', () => ({
  getDb: () => _currentDb,
  getTestDb: () => _currentDb,
  closeDb: () => {},
}));

// Enterprise modules under test (imported AFTER mock declaration)
import {
  initiateDeviceFlow,
  pollDeviceCode,
  verifyDeviceCode,
  validateToken,
  type DeviceCodeResponse,
  type TokenValidateResponse,
} from '../../src/enterprise/auth';

import {
  createTeam,
  getTeam,
  inviteMember,
  listMembers,
  listUserTeams,
  type Team,
  type TeamMember,
} from '../../src/enterprise/teams';

import {
  subscribe,
  getBillingStatus,
  recordUsage,
  getUsage,
  type BillingStatus,
  type EnhancedUsageSummary,
} from '../../src/enterprise/billing';

import {
  createLog,
  queryLogs,
  exportLogs,
  type AuditLog,
} from '../../src/enterprise/audit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Enterprise Features E2E', () => {
  beforeEach(() => {
    _currentDb = freshDb();
  });

  afterEach(() => {
    _currentDb.close();
  });

  // =======================================================================
  // Auth
  // =======================================================================

  describe('Enterprise Auth', () => {
    // -------------------------------------------------------------------
    // 1. Device flow returns deviceCode and userCode
    // -------------------------------------------------------------------
    test('initiateDeviceFlow returns deviceCode and userCode', async () => {
      const response: DeviceCodeResponse = await initiateDeviceFlow();

      expect(response.deviceCode).toBeDefined();
      expect(response.deviceCode).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(response.userCode).toBeDefined();
      expect(response.userCode).toMatch(/^[A-Z]{4}-\d{4}$/);
      expect(response.verificationUri).toContain('nimbus');
      expect(response.expiresIn).toBe(900);
      expect(response.interval).toBe(5);
    });

    // -------------------------------------------------------------------
    // 2. Token validation checks expiry
    // -------------------------------------------------------------------
    test('validateToken returns valid:false for unknown token', async () => {
      const result: TokenValidateResponse = await validateToken({
        accessToken: 'nonexistent-token-abc123',
      });
      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    test('validateToken returns valid:false for empty token', async () => {
      const result = await validateToken({ accessToken: '' });
      expect(result.valid).toBe(false);
    });

    // -------------------------------------------------------------------
    // Full device flow: initiate -> verify -> poll -> validate
    // -------------------------------------------------------------------
    test('full device authorization flow produces a valid token', async () => {
      // Step 1: Initiate
      const deviceResponse = await initiateDeviceFlow();
      expect(deviceResponse.deviceCode).toBeDefined();

      // Step 2: Poll before verification -- should be pending
      const pendingPoll = await pollDeviceCode(deviceResponse.deviceCode);
      expect(pendingPoll.error).toBe('authorization_pending');

      // Step 3: Verify the user code
      const userId = 'user-' + crypto.randomUUID().slice(0, 8);
      const verifyResult = await verifyDeviceCode({
        userCode: deviceResponse.userCode,
        userId,
      });
      expect(verifyResult.verified).toBe(true);

      // Step 4: Poll after verification -- should return access token
      const successPoll = await pollDeviceCode(deviceResponse.deviceCode);
      expect(successPoll.accessToken).toBeDefined();
      expect(successPoll.accessToken).toHaveLength(64);
      expect(successPoll.error).toBeUndefined();

      // Step 5: Validate the access token
      const validation = await validateToken({
        accessToken: successPoll.accessToken!,
      });
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);

      // Step 6: Polling again should fail (consumed)
      const consumedPoll = await pollDeviceCode(deviceResponse.deviceCode);
      expect(consumedPoll.error).toBeDefined();
    });
  });

  // =======================================================================
  // Teams
  // =======================================================================

  describe('Enterprise Teams', () => {
    // -------------------------------------------------------------------
    // 3. Team creation with name and owner
    // -------------------------------------------------------------------
    test('createTeam creates a team with correct name and owner', async () => {
      const ownerId = crypto.randomUUID();
      const team: Team = await createTeam({ name: 'Engineering', ownerId });

      expect(team.id).toBeDefined();
      expect(team.name).toBe('Engineering');
      expect(team.ownerId).toBe(ownerId);
      expect(team.plan).toBe('free');
      expect(team.createdAt).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 4. Team member invitation by email
    // -------------------------------------------------------------------
    test('inviteMember adds a member to the team', async () => {
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'DevOps', ownerId });

      const member: TeamMember = await inviteMember(team.id, {
        email: 'alice@example.com',
        role: 'member',
      });

      expect(member.teamId).toBe(team.id);
      expect(member.role).toBe('member');
      expect(member.user?.email).toBe('alice@example.com');
    });

    // -------------------------------------------------------------------
    // 5. Team member listing
    // -------------------------------------------------------------------
    test('listMembers returns all members including owner', async () => {
      const ownerId = crypto.randomUUID();

      // Create a user record for the owner so the JOIN works
      _currentDb
        .prepare('INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)')
        .run(ownerId, 'owner@example.com');

      const team = await createTeam({ name: 'Platform', ownerId });

      await inviteMember(team.id, { email: 'bob@example.com', role: 'admin' });
      await inviteMember(team.id, { email: 'carol@example.com', role: 'viewer' });

      const members = await listMembers(team.id);

      // Owner + 2 invited members = 3
      expect(members.length).toBe(3);

      const roles = members.map(m => m.role).sort();
      expect(roles).toContain('owner');
      expect(roles).toContain('admin');
      expect(roles).toContain('viewer');
    });

    // -------------------------------------------------------------------
    // 6. Team listing for a user
    // -------------------------------------------------------------------
    test('listUserTeams returns teams the user belongs to', async () => {
      const ownerId = crypto.randomUUID();

      const team1 = await createTeam({ name: 'Team Alpha', ownerId });
      const team2 = await createTeam({ name: 'Team Beta', ownerId });

      const teams = await listUserTeams(ownerId);
      expect(teams.length).toBe(2);

      const names = teams.map(t => t.name).sort();
      expect(names).toContain('Team Alpha');
      expect(names).toContain('Team Beta');
    });

    // -------------------------------------------------------------------
    // Teams: validation and edge cases
    // -------------------------------------------------------------------
    test('createTeam throws on missing name', async () => {
      await expect(createTeam({ name: '', ownerId: 'uid' })).rejects.toThrow(
        'Team name and owner ID are required'
      );
    });

    test('inviteMember throws on duplicate membership', async () => {
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'Ops', ownerId });

      await inviteMember(team.id, { email: 'dup@example.com' });
      await expect(inviteMember(team.id, { email: 'dup@example.com' })).rejects.toThrow(
        'already a member'
      );
    });

    test('inviteMember rejects owner role', async () => {
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'Ops', ownerId });

      // 'owner' is not in VALID_MEMBER_ROLES so the role validation fires first
      await expect(
        inviteMember(team.id, { email: 'x@example.com', role: 'owner' })
      ).rejects.toThrow('Invalid role');
    });

    test('getTeam returns null for nonexistent team', async () => {
      const result = await getTeam('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  // =======================================================================
  // Billing
  // =======================================================================

  describe('Enterprise Billing', () => {
    // -------------------------------------------------------------------
    // 7. Billing subscription creation
    // -------------------------------------------------------------------
    test('subscribe creates a subscription with correct plan', async () => {
      // Create a team first to satisfy FK constraint
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'BillingTeam', ownerId });
      const teamId = team.id;
      const result = await subscribe({ teamId, plan: 'pro' });

      expect(result.billing.plan).toBe('pro');
      expect(result.billing.status).toBe('active');
      expect(result.stripe).toBeDefined();
      expect(result.stripe.object).toBe('subscription');
      expect(result.stripe.plan.nickname).toBe('Nimbus Pro');
    });

    // -------------------------------------------------------------------
    // 8. Billing status shows plan
    // -------------------------------------------------------------------
    test('getBillingStatus returns correct plan after subscription', async () => {
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'StatusTeam', ownerId });
      const teamId = team.id;
      await subscribe({ teamId, plan: 'enterprise' });

      const status: BillingStatus = await getBillingStatus(teamId);
      expect(status.plan).toBe('enterprise');
      expect(status.status).toBe('active');
      expect(status.currentPeriodStart).toBeDefined();
      expect(status.currentPeriodEnd).toBeDefined();
      expect(status.cancelAtPeriodEnd).toBe(false);
    });

    test('getBillingStatus returns free defaults when no subscription exists', async () => {
      const teamId = crypto.randomUUID();
      const status = await getBillingStatus(teamId);
      expect(status.plan).toBe('free');
      expect(status.status).toBe('active');
      expect(status.seats.total).toBe(5);
    });

    // -------------------------------------------------------------------
    // 9. Usage recording with tokens and cost
    // -------------------------------------------------------------------
    test('recordUsage records event and returns confirmation', async () => {
      // Usage table does not have FK constraint, so teamId can be anything
      const teamId = crypto.randomUUID();
      const confirmation = await recordUsage({
        teamId,
        userId: 'user-1',
        operationType: 'terraform_plan',
        tokensUsed: 5000,
        costUsd: 0.15,
      });

      expect(confirmation.recorded).toBe(true);
      expect(confirmation.id).toBeDefined();
      expect(confirmation.teamId).toBe(teamId);
      expect(confirmation.operationType).toBe('terraform_plan');
      expect(confirmation.tokensUsed).toBe(5000);
      expect(confirmation.costUsd).toBe(0.15);
      expect(confirmation.timestamp).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 10. Usage summary aggregation
    // -------------------------------------------------------------------
    test('getUsage aggregates usage across multiple records', async () => {
      const teamId = crypto.randomUUID();

      // Record multiple usage events
      await recordUsage({
        teamId,
        userId: 'user-1',
        operationType: 'terraform_plan',
        tokensUsed: 3000,
        costUsd: 0.10,
      });
      await recordUsage({
        teamId,
        userId: 'user-1',
        operationType: 'kubectl_apply',
        tokensUsed: 2000,
        costUsd: 0.05,
      });
      await recordUsage({
        teamId,
        userId: 'user-2',
        operationType: 'terraform_plan',
        tokensUsed: 4000,
        costUsd: 0.12,
      });

      const summary: EnhancedUsageSummary = await getUsage(teamId, 'month');

      expect(summary.totals.operations).toBe(3);
      expect(summary.totals.tokensUsed).toBe(9000);
      expect(summary.totals.costUsd).toBeCloseTo(0.27, 2);
      expect(summary.byOperationType).toBeDefined();
      expect(summary.byOperationType['terraform_plan']).toBeDefined();
      expect(summary.byOperationType['terraform_plan'].count).toBe(2);
      expect(summary.quota).toBeDefined();
      expect(summary.rateLimit).toBeDefined();
      expect(summary.period.start).toBeDefined();
      expect(summary.period.end).toBeDefined();
    });

    // -------------------------------------------------------------------
    // Billing validation
    // -------------------------------------------------------------------
    test('subscribe rejects invalid plan', async () => {
      await expect(
        subscribe({ teamId: 'tid', plan: 'mega-ultra' })
      ).rejects.toThrow('Invalid plan');
    });

    test('recordUsage rejects negative tokensUsed', async () => {
      await expect(
        recordUsage({
          teamId: 'tid',
          operationType: 'test',
          tokensUsed: -1,
          costUsd: 0,
        })
      ).rejects.toThrow('tokensUsed must be a non-negative number');
    });

    test('subscribe updates an existing subscription', async () => {
      const ownerId = crypto.randomUUID();
      const team = await createTeam({ name: 'UpgradeTeam', ownerId });
      const teamId = team.id;
      await subscribe({ teamId, plan: 'pro' });

      // Upgrade to enterprise
      const result = await subscribe({ teamId, plan: 'enterprise' });
      expect(result.billing.plan).toBe('enterprise');

      const status = await getBillingStatus(teamId);
      expect(status.plan).toBe('enterprise');
    });
  });

  // =======================================================================
  // Audit
  // =======================================================================

  describe('Enterprise Audit', () => {
    // -------------------------------------------------------------------
    // 11. Audit log creation
    // -------------------------------------------------------------------
    test('createLog creates an audit log entry', async () => {
      const log: AuditLog = await createLog({
        action: 'terraform.apply',
        status: 'success',
        teamId: 'team-1',
        userId: 'user-1',
        resourceType: 'infrastructure',
        resourceId: 'vpc-12345',
        details: { region: 'us-east-1', changeCount: 3 },
        ipAddress: '10.0.0.1',
      });

      expect(log.id).toBeDefined();
      expect(log.action).toBe('terraform.apply');
      expect(log.status).toBe('success');
      expect(log.teamId).toBe('team-1');
      expect(log.userId).toBe('user-1');
      expect(log.resourceType).toBe('infrastructure');
      expect(log.resourceId).toBe('vpc-12345');
      expect(log.details).toEqual({ region: 'us-east-1', changeCount: 3 });
      expect(log.ipAddress).toBe('10.0.0.1');
      expect(log.timestamp).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 12. Audit log pagination
    // -------------------------------------------------------------------
    test('queryLogs supports pagination with limit and offset', async () => {
      // Create 10 audit logs in a fresh DB
      for (let i = 0; i < 10; i++) {
        await createLog({
          action: `action-${i}`,
          status: 'success',
          userId: 'user-1',
        });
      }

      // Page 1: first 3
      const page1 = await queryLogs({ limit: 3, offset: 0 });
      expect(page1.logs.length).toBe(3);
      expect(page1.limit).toBe(3);
      expect(page1.offset).toBe(0);
      expect(page1.total).toBe(10);

      // Page 2: next 3
      const page2 = await queryLogs({ limit: 3, offset: 3 });
      expect(page2.logs.length).toBe(3);
      expect(page2.offset).toBe(3);

      // Logs from page1 and page2 should not overlap
      const ids1 = new Set(page1.logs.map(l => l.id));
      const ids2 = new Set(page2.logs.map(l => l.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });

    // -------------------------------------------------------------------
    // 13. Audit log filtering
    // -------------------------------------------------------------------
    test('queryLogs filters by action and status', async () => {
      await createLog({ action: 'deploy', status: 'success', userId: 'u1' });
      await createLog({ action: 'deploy', status: 'failure', userId: 'u1' });
      await createLog({ action: 'rollback', status: 'success', userId: 'u1' });

      // Filter by action
      const deployLogs = await queryLogs({ action: 'deploy' });
      expect(deployLogs.logs.length).toBe(2);
      expect(deployLogs.logs.every(l => l.action === 'deploy')).toBe(true);

      // Filter by status
      const successLogs = await queryLogs({ status: 'success' });
      expect(successLogs.logs.length).toBe(2);
      expect(successLogs.logs.every(l => l.status === 'success')).toBe(true);

      // Filter by both
      const deploySuccess = await queryLogs({ action: 'deploy', status: 'success' });
      expect(deploySuccess.logs.length).toBe(1);
    });

    test('queryLogs filters by userId', async () => {
      await createLog({ action: 'a', status: 's', userId: 'user-a' });
      await createLog({ action: 'b', status: 's', userId: 'user-b' });
      await createLog({ action: 'c', status: 's', userId: 'user-a' });

      const result = await queryLogs({ userId: 'user-a' });
      expect(result.logs.length).toBe(2);
      expect(result.logs.every(l => l.userId === 'user-a')).toBe(true);
    });

    // -------------------------------------------------------------------
    // 14. Audit log export JSON
    // -------------------------------------------------------------------
    test('exportLogs JSON format contains valid JSON with logs array', async () => {
      await createLog({
        action: 'terraform.plan',
        status: 'success',
        teamId: 'team-x',
        userId: 'user-1',
      });
      await createLog({
        action: 'kubectl.apply',
        status: 'failure',
        teamId: 'team-x',
        userId: 'user-2',
      });

      const jsonString = await exportLogs('json', {});
      const parsed = JSON.parse(jsonString);

      expect(parsed.logs).toBeDefined();
      expect(Array.isArray(parsed.logs)).toBe(true);
      expect(parsed.logs.length).toBe(2);
      expect(parsed.exportedAt).toBeDefined();

      // Each log should have the standard fields
      for (const log of parsed.logs) {
        expect(log.id).toBeDefined();
        expect(log.action).toBeDefined();
        expect(log.status).toBeDefined();
      }
    });

    // -------------------------------------------------------------------
    // 15. Audit log export CSV
    // -------------------------------------------------------------------
    test('exportLogs CSV format has header and data rows', async () => {
      await createLog({
        action: 'helm.install',
        status: 'success',
        teamId: 'team-y',
        userId: 'user-3',
        resourceType: 'release',
        resourceId: 'nginx-ingress',
      });

      const csvString = await exportLogs('csv', {});
      const lines = csvString.split('\n');

      // First line is header
      expect(lines[0]).toBe(
        'id,timestamp,team_id,user_id,action,resource_type,resource_id,status,details,ip_address'
      );

      // Second line is data
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const dataRow = lines[1];
      expect(dataRow).toContain('helm.install');
      expect(dataRow).toContain('success');
      expect(dataRow).toContain('release');
      expect(dataRow).toContain('nginx-ingress');
    });

    // -------------------------------------------------------------------
    // Audit: export with filters
    // -------------------------------------------------------------------
    test('exportLogs respects action filter', async () => {
      await createLog({ action: 'deploy', status: 'success' });
      await createLog({ action: 'rollback', status: 'success' });

      const jsonString = await exportLogs('json', { action: 'deploy' });
      const parsed = JSON.parse(jsonString);
      expect(parsed.logs.length).toBe(1);
      expect(parsed.logs[0].action).toBe('deploy');
    });

    // -------------------------------------------------------------------
    // Audit: createLog validation
    // -------------------------------------------------------------------
    test('createLog throws when action or status is missing', async () => {
      await expect(createLog({ action: '', status: 'success' })).rejects.toThrow(
        'Action and status are required'
      );
      await expect(createLog({ action: 'test', status: '' })).rejects.toThrow(
        'Action and status are required'
      );
    });
  });
});
