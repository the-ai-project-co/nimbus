/**
 * Session Sharing — Generate share IDs and sync session data
 *
 * Provides local sharing via the nimbus serve API.
 * For hosted sharing via Supabase, the astron-landing web UI handles
 * the sync directly using its existing Supabase integration.
 */

import { getConversation as _getConversation } from '../state/conversations';
import { SessionManager as _SessionManager } from '../sessions/manager';
import type { LLMMessage } from '../llm/types';

/**
 * Dependency overrides for testing. Set these before calling shareSession/etc.
 * In production code these remain undefined and the real implementations are used.
 */
export const _deps = {
  getConversation: undefined as ((id: string) => any) | undefined,
  getSessionManager: undefined as (() => { get: (id: string) => any }) | undefined,
};

function getConversation(id: string) {
  return (_deps.getConversation ?? _getConversation)(id);
}

function getSessionManager() {
  return _deps.getSessionManager ? _deps.getSessionManager() : _SessionManager.getInstance();
}

/** A shared session snapshot. */
export interface SharedSession {
  /** Unique share ID. */
  id: string;
  /** Session ID this share was created from. */
  sessionId: string;
  /** Session name. */
  name: string;
  /** Conversation messages at time of sharing. */
  messages: LLMMessage[];
  /** Model used. */
  model: string;
  /** Session mode. */
  mode: string;
  /** Total cost. */
  costUSD: number;
  /** Total tokens used. */
  tokenCount: number;
  /** When the share was created. */
  createdAt: string;
  /** When the share expires (30-day TTL). */
  expiresAt: string;
  /** Whether this is a live-updating share. */
  isLive: boolean;
  /** Access token for write access (optional). */
  writeToken?: string;
}

/** In-memory store for shared sessions (persisted via serve API). */
const sharedSessions = new Map<string, SharedSession>();

/**
 * Generate a short, URL-safe share ID.
 */
function generateShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a secure write token for controlling write access.
 */
function generateWriteToken(): string {
  return crypto.randomUUID();
}

/**
 * Create a share for a session.
 */
export function shareSession(sessionId: string, options?: {
  isLive?: boolean;
  ttlDays?: number;
}): SharedSession | null {
  const sessionManager = getSessionManager();
  const session = sessionManager.get(sessionId);
  if (!session) return null;

  const conversation = getConversation(sessionId);
  if (!conversation) return null;

  const ttlDays = options?.ttlDays ?? 30;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const shared: SharedSession = {
    id: generateShareId(),
    sessionId,
    name: session.name,
    messages: conversation.messages,
    model: session.model,
    mode: session.mode,
    costUSD: session.costUSD,
    tokenCount: session.tokenCount,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isLive: options?.isLive ?? false,
    writeToken: generateWriteToken(),
  };

  sharedSessions.set(shared.id, shared);
  return shared;
}

/**
 * Get a shared session by share ID.
 * If the share is live, refresh the messages from the current session.
 */
export function getSharedSession(shareId: string): SharedSession | null {
  const shared = sharedSessions.get(shareId);
  if (!shared) return null;

  // Check expiry
  if (new Date(shared.expiresAt) <= new Date()) {
    sharedSessions.delete(shareId);
    return null;
  }

  // Refresh messages for live shares
  if (shared.isLive) {
    const conversation = getConversation(shared.sessionId);
    if (conversation) {
      shared.messages = conversation.messages;
    }
  }

  // Return without write token (read-only view)
  const { writeToken, ...publicData } = shared;
  return publicData as SharedSession;
}

/**
 * List all active shares.
 */
export function listShares(): SharedSession[] {
  const now = new Date();
  const result: SharedSession[] = [];

  for (const [id, shared] of sharedSessions) {
    if (new Date(shared.expiresAt) <= now) {
      sharedSessions.delete(id);
      continue;
    }
    const { writeToken, ...publicData } = shared;
    result.push(publicData as SharedSession);
  }

  return result;
}

/**
 * Delete a share.
 */
export function deleteShare(shareId: string): boolean {
  return sharedSessions.delete(shareId);
}

/**
 * Get the share URL for a shared session.
 */
export function getShareUrl(shareId: string, baseUrl?: string): string {
  const base = baseUrl ?? 'http://localhost:6001';
  return `${base}/nimbus/share/${shareId}`;
}

/**
 * Clean up expired shares.
 */
export function cleanupExpiredShares(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [id, shared] of sharedSessions) {
    if (new Date(shared.expiresAt) <= now) {
      sharedSessions.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}
