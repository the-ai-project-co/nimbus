/**
 * Session types for multi-session support.
 */

/** Status of a session. */
export type SessionStatus = 'active' | 'suspended' | 'completed';

/** Core session information stored in the database. */
export interface SessionRecord {
  id: string;
  name: string;
  status: SessionStatus;
  mode: 'plan' | 'build' | 'deploy';
  model: string;
  cwd: string;
  tokenCount: number;
  costUSD: number;
  snapshotCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/** Event emitted by the session manager. */
export interface SessionEvent {
  type:
    | 'created'
    | 'switched'
    | 'suspended'
    | 'resumed'
    | 'completed'
    | 'destroyed'
    | 'file_conflict';
  sessionId: string;
  timestamp: Date;
  details?: string;
}

/** Info about a file being edited in a session (for conflict detection). */
export interface SessionFileEdit {
  sessionId: string;
  filePath: string;
  timestamp: Date;
}
