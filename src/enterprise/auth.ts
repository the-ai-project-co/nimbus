/**
 * Enterprise Auth - Device authorization flow and token management.
 *
 * Embedded replacement for services/auth-service.
 * All business logic is preserved verbatim from:
 *   - services/auth-service/src/routes/device-code.ts
 *   - services/auth-service/src/routes/token.ts
 *
 * HTTP handlers, routes, and per-service SQLite are stripped.
 * State is read/written through the unified database via ../state/credentials.
 */

import {
  saveDeviceCode,
  getDeviceCode,
  updateDeviceCodeStatus,
  saveToken,
  getToken,
  deleteToken,
  type DeviceCodeRecord,
  type TokenRecord,
} from '../state/credentials';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const POLLING_INTERVAL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Response type definitions (mirrors @nimbus/shared-types shapes)
// ---------------------------------------------------------------------------

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DevicePollResponse {
  accessToken?: string;
  error?: string;
  errorDescription?: string;
}

export interface DeviceVerifyRequest {
  userCode: string;
  userId: string;
}

export interface TokenValidateRequest {
  accessToken: string;
}

export interface TokenValidateResponse {
  valid: boolean;
  userId?: string;
  teamId?: string;
  expiresAt?: string | null;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Generate a user-friendly code like "ABCD-1234".
 * Excludes I and O to avoid visual confusion with 1 and 0.
 */
function generateUserCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
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
 * Generate a cryptographically secure device code (UUID v4).
 */
function generateDeviceCode(): string {
  return crypto.randomUUID();
}

/**
 * Generate a 64-character hex access token using the Web Crypto API.
 */
function generateAccessToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Delete a device code by transitioning it to the 'consumed' status.
 * The unified credentials module uses status transitions rather than hard
 * deletes so that `updateDeviceCodeStatus` covers both verification and
 * consumption in a single call.
 */
function consumeDeviceCode(deviceCode: string): void {
  updateDeviceCodeStatus(deviceCode, 'consumed');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initiate the OAuth 2.0 Device Authorization Grant flow (RFC 8628).
 *
 * Creates a new device code / user code pair in the unified database and
 * returns the payload the CLI must display to the user.
 */
export async function initiateDeviceFlow(): Promise<DeviceCodeResponse> {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000);

  saveDeviceCode(deviceCode, userCode, expiresAt);

  return {
    deviceCode,
    userCode,
    verificationUri: process.env.VERIFICATION_URI || 'https://nimbus.dev/device',
    expiresIn: DEVICE_CODE_EXPIRY_SECONDS,
    interval: POLLING_INTERVAL_SECONDS,
  };
}

/**
 * Poll for device code authorization.
 *
 * Returns an access token when the user has verified the code, or a
 * structured error object while authorization is still pending / expired.
 */
export async function pollDeviceCode(deviceCode: string): Promise<DevicePollResponse> {
  const record: DeviceCodeRecord | null = getDeviceCode(deviceCode);

  if (!record) {
    return {
      error: 'expired_token',
      errorDescription: 'The device code has expired or does not exist',
    };
  }

  // Check expiry
  if (new Date(record.expiresAt) < new Date()) {
    // Mark consumed so subsequent polls return a consistent error
    consumeDeviceCode(deviceCode);
    return {
      error: 'expired_token',
      errorDescription: 'The device code has expired',
    };
  }

  // The unified credentials module stores status as a string field.
  // 'verified' status is set by verifyDeviceCode(); the associated userId
  // is stored in the token field after verification.
  if (record.status !== 'verified' || !record.token) {
    return {
      error: 'authorization_pending',
      errorDescription: 'The user has not yet authorized this device',
    };
  }

  // Generate access token
  const accessToken = generateAccessToken();
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const tokenId = crypto.randomUUID();
  const userId = record.token; // userId was stored in the token field during verification

  saveToken(tokenId, accessToken, 'access', userId, tokenExpiresAt);

  // Consume the device code so it cannot be polled again
  consumeDeviceCode(deviceCode);

  return {
    accessToken,
  };
}

/**
 * Verify a user code entered on the web verification page.
 *
 * Associates the given userId with the device code so that the next poll
 * by the CLI will yield an access token.
 */
export async function verifyDeviceCode(request: DeviceVerifyRequest): Promise<{ verified: boolean }> {
  const { userCode, userId } = request;

  if (!userCode || !userId) {
    throw new Error('User code and user ID are required');
  }

  // Find the pending device code record by user code
  // The unified credentials module looks up by device_code; we need to scan
  // by user_code. We look it up directly via the state layer using a
  // getDeviceCode call after resolving user_code -> device_code through a
  // status update that embeds the userId in the token field.
  //
  // The unified state module's updateDeviceCodeStatus accepts (deviceCode,
  // status, token?) and applies it by device_code PK. We cannot look up by
  // user_code through this API alone, so we use the low-level getDb approach
  // by importing the raw db helper and running the query ourselves, mirroring
  // exactly what verifyDeviceCodeRecord() did in the original auth-service.
  const { getDb } = await import('../state/db');
  const db = getDb();

  const stmt = db.prepare(
    `UPDATE device_codes
        SET status = 'verified', token = ?
      WHERE user_code = ?
        AND status = 'pending'
        AND expires_at > CURRENT_TIMESTAMP`
  );

  const result = stmt.run(userId, userCode.toUpperCase());

  if (result.changes === 0) {
    throw new Error('Invalid or expired user code');
  }

  return { verified: true };
}

/**
 * Validate an access token.
 *
 * Returns validity status plus the associated userId and optional teamId.
 */
export async function validateToken(request: TokenValidateRequest): Promise<TokenValidateResponse> {
  const { accessToken } = request;

  if (!accessToken) {
    return { valid: false };
  }

  const record: TokenRecord | null = getToken(accessToken);

  if (!record) {
    return { valid: false };
  }

  // Check expiry if the token carries an expiry timestamp
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    deleteToken(accessToken);
    return { valid: false };
  }

  return {
    valid: true,
    userId: record.userId ?? undefined,
    // The unified token record does not store teamId; callers that need team
    // context should resolve it via the teams module after token validation.
    teamId: undefined,
    expiresAt: record.expiresAt,
  };
}
