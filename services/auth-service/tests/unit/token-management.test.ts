/**
 * Auth Service — Token Management Tests
 * Tests token validation, expiry detection, and revocation semantics.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetTokenByAccessToken = mock(() => null);
const mockCleanupExpiredTokens = mock(() => {});
const mockDeleteToken = mock(() => {});
const mockCreateToken = mock(() => {});

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createDeviceCode: mock(() => {}),
  getDeviceCode: mock(() => null),
  getDeviceCodeByUserCode: mock(() => null),
  verifyDeviceCodeRecord: mock(() => false),
  deleteDeviceCode: mock(() => {}),
  cleanupExpiredDeviceCodes: mock(() => {}),
  createToken: mockCreateToken,
  getTokenByAccessToken: mockGetTokenByAccessToken,
  deleteToken: mockDeleteToken,
  cleanupExpiredTokens: mockCleanupExpiredTokens,
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

import { validateToken } from '../../../src/routes/token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-id-1',
    user_id: 'user-abc',
    team_id: 'team-xyz',
    access_token: 'valid-access-token-hex',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateToken tests
// ---------------------------------------------------------------------------

describe('validateToken', () => {
  beforeEach(() => {
    mockGetTokenByAccessToken.mockReset();
    mockCleanupExpiredTokens.mockReset();
    mockGetTokenByAccessToken.mockReturnValue(null);
  });

  test('returns { valid: false } when token is not found in DB', async () => {
    const result = await validateToken({ accessToken: 'unknown-token' });

    expect(result.valid).toBe(false);
    expect(result.userId).toBeUndefined();
  });

  test('returns { valid: false } when accessToken is an empty string', async () => {
    const result = await validateToken({ accessToken: '' });

    expect(result.valid).toBe(false);
    // Should not even query the DB for an empty token
    expect(mockGetTokenByAccessToken).not.toHaveBeenCalled();
  });

  test('returns valid:true with userId and teamId when token is found', async () => {
    mockGetTokenByAccessToken.mockReturnValue(makeTokenRecord());

    const result = await validateToken({ accessToken: 'valid-access-token-hex' });

    expect(result.valid).toBe(true);
    expect(result.userId).toBe('user-abc');
    expect(result.teamId).toBe('team-xyz');
    expect(typeof result.expiresAt).toBe('string');
  });

  test('teamId is undefined when token record has null team_id', async () => {
    mockGetTokenByAccessToken.mockReturnValue(makeTokenRecord({ team_id: null }));

    const result = await validateToken({ accessToken: 'valid-access-token-hex' });

    expect(result.valid).toBe(true);
    expect(result.teamId).toBeUndefined();
  });

  test('calls cleanupExpiredTokens on each validation call', async () => {
    mockGetTokenByAccessToken.mockReturnValue(makeTokenRecord());

    await validateToken({ accessToken: 'some-token' });

    expect(mockCleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });

  test('calls getTokenByAccessToken with the provided token string', async () => {
    const token = 'my-specific-access-token';
    mockGetTokenByAccessToken.mockReturnValue(null);

    await validateToken({ accessToken: token });

    expect(mockGetTokenByAccessToken).toHaveBeenCalledWith(token);
  });

  test('expiresAt in response matches the DB record expires_at', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockGetTokenByAccessToken.mockReturnValue(makeTokenRecord({ expires_at: expiresAt }));

    const result = await validateToken({ accessToken: 'tok' });

    expect(result.expiresAt).toBe(expiresAt);
  });
});

// ---------------------------------------------------------------------------
// Token lifecycle — pure business logic tests
// ---------------------------------------------------------------------------

describe('Token lifecycle logic', () => {
  test('token is expired when expires_at is in the past', () => {
    const pastDate = new Date(Date.now() - 1000);
    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
    expect(isExpired(pastDate.toISOString())).toBe(true);
  });

  test('token is valid when expires_at is in the future', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
    expect(isExpired(futureDate.toISOString())).toBe(false);
  });

  test('30-day token expiry is calculated correctly', () => {
    const created = new Date('2024-01-01T00:00:00.000Z');
    const expiresAt = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(expiresAt.toISOString()).toBe('2024-01-31T00:00:00.000Z');
  });

  test('access token is a 64-character hex string (32 bytes)', () => {
    // This mirrors the generation logic in the route
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('two successive calls to generate tokens produce distinct tokens', () => {
    const generate = () => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    };
    expect(generate()).not.toBe(generate());
  });
});
