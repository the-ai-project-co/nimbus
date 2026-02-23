/**
 * History Manager
 *
 * Manages command history persistence at ~/.nimbus/history.json
 * with remote sync to the State Service for cross-session persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HistoryEntry, HistoryFile, HistoryQueryOptions } from './types';

const HISTORY_FILE_VERSION = 1;
const MAX_HISTORY_ENTRIES = 1000;

/**
 * Generate a unique ID for history entries
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty history file structure
 */
function createEmptyHistoryFile(): HistoryFile {
  const now = new Date().toISOString();
  return {
    version: HISTORY_FILE_VERSION,
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * HistoryManager class for command history persistence
 * with optional remote sync to State Service.
 */
export class HistoryManager {
  private historyPath: string;
  private historyFile: HistoryFile | null = null;
  private stateServiceUrl: string;

  constructor(historyPath?: string) {
    this.historyPath = historyPath || path.join(os.homedir(), '.nimbus', 'history.json');
    this.stateServiceUrl = process.env.STATE_SERVICE_URL || 'http://localhost:3004';
  }

  /**
   * Get the path to the history file
   */
  getHistoryPath(): string {
    return this.historyPath;
  }

  /**
   * Ensure the history directory exists
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.historyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load history file from disk, creating if necessary
   */
  load(): HistoryFile {
    if (this.historyFile) {
      return this.historyFile;
    }

    this.ensureDirectory();

    if (!fs.existsSync(this.historyPath)) {
      this.historyFile = createEmptyHistoryFile();
      return this.historyFile;
    }

    try {
      const content = fs.readFileSync(this.historyPath, 'utf-8');
      const parsed = JSON.parse(content) as HistoryFile;

      // Validate version and migrate if needed
      if (parsed.version !== HISTORY_FILE_VERSION) {
        parsed.version = HISTORY_FILE_VERSION;
      }

      // Ensure required fields exist
      parsed.entries = parsed.entries || [];

      this.historyFile = parsed;
      return this.historyFile;
    } catch {
      // If file is corrupted, start fresh
      this.historyFile = createEmptyHistoryFile();
      return this.historyFile;
    }
  }

  /**
   * Save history file to disk
   */
  save(historyFile?: HistoryFile): void {
    this.ensureDirectory();

    const fileToSave = historyFile || this.historyFile;
    if (!fileToSave) {
      throw new Error('No history file to save');
    }

    fileToSave.updatedAt = new Date().toISOString();
    this.historyFile = fileToSave;

    const content = JSON.stringify(fileToSave, null, 2);
    fs.writeFileSync(this.historyPath, content, { mode: 0o600 });
  }

  /**
   * Sync a history entry to the remote State Service.
   * Fire-and-forget: never throws on network or parse errors.
   */
  private async syncToStateService(entry: HistoryEntry): Promise<void> {
    try {
      await fetch(`${this.stateServiceUrl}/api/state/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {
      // Fire-and-forget: swallow all errors silently
      console.warn('[nimbus] Failed to sync history entry to State Service');
    }
  }

  /**
   * Load history entries from the remote State Service.
   * Returns the entries array on success, or null on any failure
   * so the caller can fall back to local storage.
   */
  private async loadFromStateService(
    options: HistoryQueryOptions
  ): Promise<HistoryEntry[] | null> {
    try {
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set('limit', String(options.limit));
      if (options.since) params.set('since', options.since);
      if (options.until) params.set('until', options.until);
      if (options.command) params.set('command', options.command);
      if (options.status) params.set('status', options.status);

      const queryString = params.toString();
      const url = `${this.stateServiceUrl}/api/state/history${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const body = await response.json() as { success?: boolean; data?: HistoryEntry[] };
      if (body.success && Array.isArray(body.data)) {
        return body.data;
      }
      return null;
    } catch {
      // Network error, parse error, etc. — fall back to local
      return null;
    }
  }

  /**
   * Add a new entry to history
   */
  addEntry(command: string, args: string[], metadata?: Record<string, any>): HistoryEntry {
    const historyFile = this.load();

    const entry: HistoryEntry = {
      id: generateId(),
      command,
      args,
      timestamp: new Date().toISOString(),
      status: 'pending',
      metadata,
    };

    historyFile.entries.unshift(entry);

    // Trim to max entries
    if (historyFile.entries.length > MAX_HISTORY_ENTRIES) {
      historyFile.entries = historyFile.entries.slice(0, MAX_HISTORY_ENTRIES);
    }

    this.save(historyFile);

    // Fire-and-forget: sync to State Service without blocking
    this.syncToStateService(entry).catch(() => {});

    return entry;
  }

  /**
   * Update an existing entry
   */
  updateEntry(
    id: string,
    updates: Partial<Pick<HistoryEntry, 'status' | 'duration' | 'result'>>
  ): HistoryEntry | null {
    const historyFile = this.load();

    const entryIndex = historyFile.entries.findIndex((e) => e.id === id);
    if (entryIndex === -1) {
      return null;
    }

    historyFile.entries[entryIndex] = {
      ...historyFile.entries[entryIndex],
      ...updates,
    };

    this.save(historyFile);
    return historyFile.entries[entryIndex];
  }

  /**
   * Complete an entry with success or failure
   */
  completeEntry(
    id: string,
    status: 'success' | 'failure',
    duration: number,
    result?: { output?: string; error?: string }
  ): HistoryEntry | null {
    return this.updateEntry(id, { status, duration, result });
  }

  /**
   * Get history entries with optional filtering.
   * Attempts to load from the remote State Service first;
   * falls back to local file storage on any failure.
   */
  async getEntries(options: HistoryQueryOptions = {}): Promise<HistoryEntry[]> {
    // Try remote State Service first
    const remoteEntries = await this.loadFromStateService(options);
    if (remoteEntries !== null) {
      return remoteEntries;
    }

    // Fall back to local file
    const historyFile = this.load();
    let entries = [...historyFile.entries];

    // Filter by command
    if (options.command) {
      entries = entries.filter((e) =>
        e.command.toLowerCase().includes(options.command!.toLowerCase())
      );
    }

    // Filter by status
    if (options.status) {
      entries = entries.filter((e) => e.status === options.status);
    }

    // Filter by since date
    if (options.since) {
      const sinceDate = new Date(options.since);
      entries = entries.filter((e) => new Date(e.timestamp) >= sinceDate);
    }

    // Filter by until date
    if (options.until) {
      const untilDate = new Date(options.until);
      entries = entries.filter((e) => new Date(e.timestamp) <= untilDate);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get a single entry by ID
   */
  getEntry(id: string): HistoryEntry | null {
    const historyFile = this.load();
    return historyFile.entries.find((e) => e.id === id) || null;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.historyFile = createEmptyHistoryFile();
    this.save();
  }

  /**
   * Reload history file from disk
   */
  reload(): HistoryFile {
    this.historyFile = null;
    return this.load();
  }
}

/**
 * Singleton instance for global access
 */
export const historyManager = new HistoryManager();
