/**
 * Device Code Flow Routes
 * OAuth 2.0 Device Authorization Grant (RFC 8628)
 */

import type { DeviceCodeResponse, DevicePollResponse, DeviceVerifyRequest } from '@nimbus/shared-types';
import {
  createDeviceCode,
  getDeviceCode,
  verifyDeviceCodeRecord,
  deleteDeviceCode,
  cleanupExpiredDeviceCodes,
  createToken,
} from '../db/adapter';

const DEVICE_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const POLLING_INTERVAL_SECONDS = 5;

/**
 * Generate a user-friendly code like "ABCD-1234"
 */
function generateUserCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I, O to avoid confusion
  const digits = '0123456789';

  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

/**
 * Generate a cryptographically secure device code
 */
function generateDeviceCode(): string {
  return crypto.randomUUID();
}

/**
 * Generate an access token
 */
function generateAccessToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Initiate device code flow
 * Returns device code and user code for the client
 */
export async function initiateDeviceFlow(): Promise<DeviceCodeResponse> {
  // Cleanup expired codes first
  cleanupExpiredDeviceCodes();

  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000);

  createDeviceCode(deviceCode, userCode, expiresAt);

  return {
    deviceCode,
    userCode,
    verificationUri: process.env.VERIFICATION_URI || 'https://nimbus.dev/device',
    expiresIn: DEVICE_CODE_EXPIRY_SECONDS,
    interval: POLLING_INTERVAL_SECONDS,
  };
}

/**
 * Poll for device code authorization
 * Returns token if authorized, error if pending/expired
 */
export async function pollDeviceCode(deviceCode: string): Promise<DevicePollResponse> {
  const record = getDeviceCode(deviceCode);

  if (!record) {
    return {
      error: 'expired_token',
      errorDescription: 'The device code has expired or does not exist',
    };
  }

  // Check if expired
  if (new Date(record.expires_at) < new Date()) {
    deleteDeviceCode(deviceCode);
    return {
      error: 'expired_token',
      errorDescription: 'The device code has expired',
    };
  }

  // Check if verified
  if (!record.verified || !record.user_id) {
    return {
      error: 'authorization_pending',
      errorDescription: 'The user has not yet authorized this device',
    };
  }

  // Generate access token
  const accessToken = generateAccessToken();
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  createToken(
    crypto.randomUUID(),
    record.user_id,
    null, // teamId can be set later
    accessToken,
    tokenExpiresAt
  );

  // Delete the used device code
  deleteDeviceCode(deviceCode);

  return {
    accessToken,
  };
}

/**
 * Verify user code (called when user enters code on web)
 */
export async function verifyDeviceCode(request: DeviceVerifyRequest): Promise<{ verified: boolean }> {
  const { userCode, userId } = request;

  if (!userCode || !userId) {
    throw new Error('User code and user ID are required');
  }

  const success = verifyDeviceCodeRecord(userCode.toUpperCase(), userId);

  if (!success) {
    throw new Error('Invalid or expired user code');
  }

  return { verified: true };
}
