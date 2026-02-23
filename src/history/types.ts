/**
 * History Types
 *
 * Type definitions for command history tracking
 */

export interface HistoryEntry {
  id: string;
  command: string;
  args: string[];
  timestamp: string;
  duration?: number;
  status: 'success' | 'failure' | 'pending';
  result?: {
    output?: string;
    error?: string;
  };
  metadata?: Record<string, any>;
}

export interface HistoryFile {
  version: number;
  entries: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryQueryOptions {
  limit?: number;
  since?: string;
  until?: string;
  command?: string;
  status?: 'success' | 'failure' | 'pending';
}
