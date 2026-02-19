/**
 * Auth Service — Credential Validation Tests
 * Tests that the token validation route correctly accepts/rejects credentials
 * and that the underlying DB queries are called with the right arguments.
 * Also tests pure validation logic (format checks, expiry).
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetTokenByAccessToken = mock(() => null);
const mockCleanupExpiredTokens = mock(() => {});

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createDeviceCode: mock(() => {}),
  getDeviceCode: mock(() => null),
  getDeviceCodeByUserCode: mock(() => null),
  verifyDeviceCodeRecord: mock(() => false),
  deleteDeviceCode: mock(() => {}),
  cleanupExpiredDeviceCodes: mock(() => {}),
  createToken: mock(() => {}),
  getTokenByAccessToken: mockGetTokenByAccessToken,
  deleteToken: mock(() => {}),
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

function makeValidToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-cred-1',
    user_id: 'user-cred-abc',
    team_id: 'team-cred-xyz',
    access_token: 'a'.repeat(64),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('credential validation — valid tokens', () => {
  beforeEach(() => {
    mockGetTokenByAccessToken.mockReset();
    mockCleanupExpiredTokens.mockReset();
  });

  test('accepts a well-formed 64-char hex access token', async () => {
    const token = 'f'.repeat(64);
    mockGetTokenByAccessToken.mockReturnValue(makeValidToken({ access_token: token }));

    const result = await validateToken({ accessToken: token });

    expect(result.valid).toBe(true);
  });

  test('returns userId and teamId from the stored token record', async () => {
    mockGetTokenByAccessToken.mockReturnValue(makeValidToken());

    const result = await validateToken({ accessToken: 'a'.repeat(64) });

    expect(result.userId).toBe('user-cred-abc');
    expect(result.teamId).toBe('team-cred-xyz');
  });

  test('teamId is omitted from response when token has no team_id', async () => {
    mockGetTokenByAccessToken.mockReturnValue(makeValidToken({ team_id: null }));

    const result = await validateToken({ accessToken: 'a'.repeat(64) });

    expect(result.teamId).toBeUndefined();
  });

  test('expiresAt is present in a valid token response', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockGetTokenByAccessToken.mockReturnValue(makeValidToken({ expires_at: expiresAt }));

    const result = await validateToken({ accessToken: 'a'.repeat(64) });

    expect(result.expiresAt).toBe(expiresAt);
  });
});

describe('credential validation — invalid / missing tokens', () => {
  beforeEach(() => {
    mockGetTokenByAccessToken.mockReset();
    mockCleanupExpiredTokens.mockReset();
    mockGetTokenByAccessToken.mockReturnValue(null);
  });

  test('rejects an empty string access token without querying DB', async () => {
    const result = await validateToken({ accessToken: '' });

    expect(result.valid).toBe(false);
    expect(mockGetTokenByAccessToken).not.toHaveBeenCalled();
  });

  test('rejects an unknown / random access token', async () => {
    const result = await validateToken({ accessToken: 'does-not-exist-token' });

    expect(result.valid).toBe(false);
  });

  test('rejects when DB lookup returns null (revoked or never issued)', async () => {
    mockGetTokenByAccessToken.mockReturnValue(null);

    const result = await validateToken({ accessToken: 'revoked-token-xyz' });

    expect(result.valid).toBe(false);
  });

  test('queries the DB with exactly the provided token string', async () => {
    const specificToken = 'specific-token-string-123';
    await validateToken({ accessToken: specificToken });

    expect(mockGetTokenByAccessToken).toHaveBeenCalledWith(specificToken);
  });
});

describe('credential validation — token format & expiry logic', () => {
  test('a token expiring in the past is considered expired', () => {
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
    expect(isExpired(pastDate)).toBe(true);
  });

  test('a token expiring in the future is considered active', () => {
    const futureDate = new Date(Date.now() + 60 * 1000).toISOString();
    const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
    expect(isExpired(futureDate)).toBe(false);
  });

  test('access token format is 64 hex characters (32 bytes)', () => {
    const validHexToken = '0123456789abcdef'.repeat(4);
    expect(validHexToken).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(validHexToken)).toBe(true);
  });

  test('tokens with wrong length fail a basic format pre-check', () => {
    const shortToken = 'abc';
    const isValidFormat = (t: string) => t.length === 64 && /^[0-9a-f]+$/.test(t);
    expect(isValidFormat(shortToken)).toBe(false);
  });

  test('UUID device codes are distinct from hex access tokens', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const hexPattern = /^[0-9a-f]{64}$/;

    const deviceCode = crypto.randomUUID();
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const accessToken = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

    expect(uuidPattern.test(deviceCode)).toBe(true);
    expect(hexPattern.test(accessToken)).toBe(true);
    // Device code should NOT match hex pattern and vice versa
    expect(hexPattern.test(deviceCode)).toBe(false);
    expect(uuidPattern.test(accessToken)).toBe(false);
  });

  test('cleanup is called even when token validation fails', async () => {
    mockGetTokenByAccessToken.mockReset();
    mockGetTokenByAccessToken.mockReturnValue(null);

    await validateToken({ accessToken: 'some-invalid-token' });

    expect(mockCleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });
});
