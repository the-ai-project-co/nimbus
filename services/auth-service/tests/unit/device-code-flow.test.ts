/**
 * Auth Service — Device Code Flow Tests
 * Tests RFC 8628 device authorization: initiation, polling, and completion.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks must be set up before importing route modules
// ---------------------------------------------------------------------------

const mockCreateDeviceCode = mock(() => {});
const mockGetDeviceCode = mock(() => null);
const mockVerifyDeviceCodeRecord = mock(() => false);
const mockDeleteDeviceCode = mock(() => {});
const mockCleanupExpiredDeviceCodes = mock(() => {});
const mockCreateToken = mock(() => {});

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
  getTokenByAccessToken: mock(() => null),
  deleteToken: mock(() => {}),
  cleanupExpiredTokens: mock(() => {}),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

import { initiateDeviceFlow, pollDeviceCode, verifyDeviceCode } from '../../../src/routes/device-code';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(secondsFromNow: number): Date {
  return new Date(Date.now() + secondsFromNow * 1000);
}

function pastDate(secondsAgo: number): Date {
  return new Date(Date.now() - secondsAgo * 1000);
}

function makeDeviceCodeRecord(overrides: Record<string, unknown> = {}) {
  return {
    device_code: 'dc-uuid-1234',
    user_code: 'ABCD-5678',
    user_id: null,
    verified: 0,
    expires_at: futureDate(900).toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// initiateDeviceFlow
// ---------------------------------------------------------------------------

describe('initiateDeviceFlow', () => {
  beforeEach(() => {
    mockCreateDeviceCode.mockReset();
    mockCleanupExpiredDeviceCodes.mockReset();
  });

  test('returns a DeviceCodeResponse with required fields', async () => {
    const response = await initiateDeviceFlow();

    expect(typeof response.deviceCode).toBe('string');
    expect(response.deviceCode.length).toBeGreaterThan(0);
    expect(typeof response.userCode).toBe('string');
    expect(typeof response.verificationUri).toBe('string');
    expect(typeof response.expiresIn).toBe('number');
    expect(typeof response.interval).toBe('number');
  });

  test('userCode matches the expected "XXXX-NNNN" pattern', async () => {
    const response = await initiateDeviceFlow();
    expect(response.userCode).toMatch(/^[A-Z]{4}-\d{4}$/);
  });

  test('deviceCode is a valid UUID v4', async () => {
    const response = await initiateDeviceFlow();
    expect(response.deviceCode).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test('expiresIn is 900 seconds (15 minutes)', async () => {
    const response = await initiateDeviceFlow();
    expect(response.expiresIn).toBe(900);
  });

  test('polling interval is 5 seconds', async () => {
    const response = await initiateDeviceFlow();
    expect(response.interval).toBe(5);
  });

  test('calls cleanupExpiredDeviceCodes on each initiation', async () => {
    await initiateDeviceFlow();
    expect(mockCleanupExpiredDeviceCodes).toHaveBeenCalledTimes(1);
  });

  test('calls createDeviceCode with device code, user code, and expiry', async () => {
    await initiateDeviceFlow();
    expect(mockCreateDeviceCode).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Date)
    );
  });
});

// ---------------------------------------------------------------------------
// pollDeviceCode
// ---------------------------------------------------------------------------

describe('pollDeviceCode', () => {
  beforeEach(() => {
    mockGetDeviceCode.mockReset();
    mockDeleteDeviceCode.mockReset();
    mockCreateToken.mockReset();
  });

  test('returns authorization_pending when device code exists but is not verified', async () => {
    mockGetDeviceCode.mockReturnValue(makeDeviceCodeRecord({ verified: 0 }));

    const result = await pollDeviceCode('dc-uuid-1234');

    expect(result.error).toBe('authorization_pending');
    expect(result.errorDescription).toBeDefined();
    expect(result.accessToken).toBeUndefined();
  });

  test('returns expired_token when device code does not exist', async () => {
    mockGetDeviceCode.mockReturnValue(null);

    const result = await pollDeviceCode('nonexistent-code');

    expect(result.error).toBe('expired_token');
  });

  test('returns expired_token and deletes code when the code has expired', async () => {
    mockGetDeviceCode.mockReturnValue(
      makeDeviceCodeRecord({ expires_at: pastDate(10).toISOString() })
    );

    const result = await pollDeviceCode('dc-uuid-1234');

    expect(result.error).toBe('expired_token');
    expect(mockDeleteDeviceCode).toHaveBeenCalledWith('dc-uuid-1234');
  });

  test('returns an accessToken when the device code is verified', async () => {
    mockGetDeviceCode.mockReturnValue(
      makeDeviceCodeRecord({ verified: 1, user_id: 'user-authorized' })
    );

    const result = await pollDeviceCode('dc-uuid-1234');

    expect(result.error).toBeUndefined();
    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken!.length).toBeGreaterThan(0);
  });

  test('creates a token record and deletes the device code upon successful poll', async () => {
    mockGetDeviceCode.mockReturnValue(
      makeDeviceCodeRecord({ verified: 1, user_id: 'user-authorized' })
    );

    await pollDeviceCode('dc-uuid-1234');

    expect(mockCreateToken).toHaveBeenCalledTimes(1);
    expect(mockDeleteDeviceCode).toHaveBeenCalledWith('dc-uuid-1234');
  });
});

// ---------------------------------------------------------------------------
// verifyDeviceCode
// ---------------------------------------------------------------------------

describe('verifyDeviceCode', () => {
  beforeEach(() => {
    mockVerifyDeviceCodeRecord.mockReset();
  });

  test('returns { verified: true } when user code and userId are valid', async () => {
    mockVerifyDeviceCodeRecord.mockReturnValue(true);

    const result = await verifyDeviceCode({ userCode: 'ABCD-1234', userId: 'user-xyz' });

    expect(result.verified).toBe(true);
  });

  test('throws when the user code is invalid or already used', async () => {
    mockVerifyDeviceCodeRecord.mockReturnValue(false);

    await expect(
      verifyDeviceCode({ userCode: 'INVALID-CODE', userId: 'user-xyz' })
    ).rejects.toThrow('Invalid or expired user code');
  });

  test('throws when userCode is missing', async () => {
    await expect(
      verifyDeviceCode({ userCode: '', userId: 'user-xyz' })
    ).rejects.toThrow('User code and user ID are required');
  });

  test('throws when userId is missing', async () => {
    await expect(
      verifyDeviceCode({ userCode: 'ABCD-1234', userId: '' })
    ).rejects.toThrow('User code and user ID are required');
  });

  test('normalises user code to uppercase before verification', async () => {
    mockVerifyDeviceCodeRecord.mockReturnValue(true);

    await verifyDeviceCode({ userCode: 'abcd-1234', userId: 'user-xyz' });

    expect(mockVerifyDeviceCodeRecord).toHaveBeenCalledWith('ABCD-1234', 'user-xyz');
  });
});
