/**
 * Auth Service — OAuth / OIDC Integration Tests
 * Tests the OAuth 2.0 Device Authorization Grant flow end-to-end from
 * the route handler perspective, focusing on the handshake between the
 * initiate → verify → poll sequence as a contract.
 *
 * External OAuth provider calls are fully mocked.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateDeviceCode = mock(() => {});
const mockGetDeviceCode = mock(() => null);
const mockVerifyDeviceCodeRecord = mock(() => false);
const mockDeleteDeviceCode = mock(() => {});
const mockCleanupExpiredDeviceCodes = mock(() => {});
const mockCreateToken = mock(() => {});
const mockGetTokenByAccessToken = mock(() => null);
const mockCleanupExpiredTokens = mock(() => {});

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createDeviceCode: mockCreateDeviceCode,
  getDeviceCode: mockGetDeviceCode,
  getDeviceCodeByUserCode: mock(() => null),
  verifyDeviceCodeRecord: mockVerifyDeviceCodeRecord,
  deleteDeviceCode: mockDeleteDeviceCode,
  cleanupExpiredDeviceCodes: mockCleanupExpiredDeviceCodes,
  createToken: mockCreateToken,
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

import { initiateDeviceFlow, pollDeviceCode, verifyDeviceCode } from '../../../src/routes/device-code';
import { validateToken } from '../../../src/routes/token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePendingRecord(deviceCode: string, userCode: string) {
  return {
    device_code: deviceCode,
    user_code: userCode,
    user_id: null,
    verified: 0,
    expires_at: new Date(Date.now() + 900 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  };
}

function makeVerifiedRecord(deviceCode: string, userCode: string, userId: string) {
  return {
    device_code: deviceCode,
    user_code: userCode,
    user_id: userId,
    verified: 1,
    expires_at: new Date(Date.now() + 900 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Full OAuth Device Flow Contract Tests
// ---------------------------------------------------------------------------

describe('OAuth Device Authorization Grant — full flow contract', () => {
  beforeEach(() => {
    mockCreateDeviceCode.mockReset();
    mockGetDeviceCode.mockReset();
    mockVerifyDeviceCodeRecord.mockReset();
    mockDeleteDeviceCode.mockReset();
    mockCleanupExpiredDeviceCodes.mockReset();
    mockCreateToken.mockReset();
    mockGetTokenByAccessToken.mockReset();
    mockCleanupExpiredTokens.mockReset();
  });

  test('Step 1: initiation returns all required OAuth device flow fields', async () => {
    const flow = await initiateDeviceFlow();

    // RFC 8628 §3.2 response fields
    expect(flow.deviceCode).toBeDefined();
    expect(flow.userCode).toBeDefined();
    expect(flow.verificationUri).toBeDefined();
    expect(flow.expiresIn).toBeDefined();
    expect(flow.interval).toBeDefined();
  });

  test('Step 2 (pending): poll returns authorization_pending before user approves', async () => {
    const flow = await initiateDeviceFlow();
    mockGetDeviceCode.mockReturnValue(makePendingRecord(flow.deviceCode, flow.userCode));

    const pollResult = await pollDeviceCode(flow.deviceCode);

    expect(pollResult.error).toBe('authorization_pending');
    expect(pollResult.accessToken).toBeUndefined();
  });

  test('Step 3: user verifies the user code on the web', async () => {
    const flow = await initiateDeviceFlow();
    mockVerifyDeviceCodeRecord.mockReturnValue(true);

    const verifyResult = await verifyDeviceCode({
      userCode: flow.userCode,
      userId: 'user-from-web',
    });

    expect(verifyResult.verified).toBe(true);
  });

  test('Step 4: poll after verification returns an access token', async () => {
    const flow = await initiateDeviceFlow();
    mockGetDeviceCode.mockReturnValue(
      makeVerifiedRecord(flow.deviceCode, flow.userCode, 'user-from-web')
    );

    const pollResult = await pollDeviceCode(flow.deviceCode);

    expect(pollResult.error).toBeUndefined();
    expect(typeof pollResult.accessToken).toBe('string');
    expect(pollResult.accessToken!.length).toBeGreaterThan(0);
  });

  test('Step 5: the issued access token validates correctly', async () => {
    // Simulate a token that was created after step 4
    const flow = await initiateDeviceFlow();
    mockGetDeviceCode.mockReturnValue(
      makeVerifiedRecord(flow.deviceCode, flow.userCode, 'user-from-web')
    );

    const pollResult = await pollDeviceCode(flow.deviceCode);
    const issuedToken = pollResult.accessToken!;

    // Now mock the token lookup to simulate it being stored in DB
    mockGetTokenByAccessToken.mockReturnValue({
      id: 'tok-1',
      user_id: 'user-from-web',
      team_id: null,
      access_token: issuedToken,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const validation = await validateToken({ accessToken: issuedToken });

    expect(validation.valid).toBe(true);
    expect(validation.userId).toBe('user-from-web');
  });
});

// ---------------------------------------------------------------------------
// OAuth error scenario tests
// ---------------------------------------------------------------------------

describe('OAuth Device Flow — error scenarios', () => {
  beforeEach(() => {
    mockGetDeviceCode.mockReset();
    mockDeleteDeviceCode.mockReset();
    mockVerifyDeviceCodeRecord.mockReset();
  });

  test('polling an expired device code returns expired_token error', async () => {
    mockGetDeviceCode.mockReturnValue({
      device_code: 'expired-dc',
      user_code: 'EXPD-1234',
      user_id: null,
      verified: 0,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    const result = await pollDeviceCode('expired-dc');

    expect(result.error).toBe('expired_token');
    expect(mockDeleteDeviceCode).toHaveBeenCalledWith('expired-dc');
  });

  test('polling a code that never existed returns expired_token error', async () => {
    mockGetDeviceCode.mockReturnValue(null);

    const result = await pollDeviceCode('phantom-code');

    expect(result.error).toBe('expired_token');
  });

  test('verification with wrong user code throws an error', async () => {
    mockVerifyDeviceCodeRecord.mockReturnValue(false);

    await expect(
      verifyDeviceCode({ userCode: 'WRONG-0000', userId: 'user-xyz' })
    ).rejects.toThrow('Invalid or expired user code');
  });

  test('multiple initiations produce different device codes', async () => {
    const flow1 = await initiateDeviceFlow();
    const flow2 = await initiateDeviceFlow();

    expect(flow1.deviceCode).not.toBe(flow2.deviceCode);
    expect(flow1.userCode).not.toBe(flow2.userCode);
  });

  test('verification URI points to expected nimbus domain by default', async () => {
    const flow = await initiateDeviceFlow();
    // Default value when VERIFICATION_URI env var is not set
    expect(flow.verificationUri).toContain('nimbus');
  });
});
