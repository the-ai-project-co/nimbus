/**
 * Token Management Routes
 * Token validation and management
 */

import type { TokenValidateRequest, TokenValidateResponse } from '@nimbus/shared-types';
import { getTokenByAccessToken, cleanupExpiredTokens } from '../db/adapter';

/**
 * Validate an access token
 */
export async function validateToken(request: TokenValidateRequest): Promise<TokenValidateResponse> {
  const { accessToken } = request;

  if (!accessToken) {
    return { valid: false };
  }

  // Cleanup expired tokens periodically
  cleanupExpiredTokens();

  const token = getTokenByAccessToken(accessToken);

  if (!token) {
    return { valid: false };
  }

  return {
    valid: true,
    userId: token.user_id,
    teamId: token.team_id || undefined,
    expiresAt: token.expires_at,
  };
}
