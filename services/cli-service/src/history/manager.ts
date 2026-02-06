/**
 * History Manager
 *
 * Manages command history persistence at ~/.nimbus/history.json
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
 */
export class HistoryManager {
  private historyPath: string;
  private historyFile: HistoryFile | null = null;

  constructor(historyPath?: string) {
    this.historyPath = historyPath || path.join(os.homedir(), '.nimbus', 'history.json');
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
   * Get history entries with optional filtering
   */
  getEntries(options: HistoryQueryOptions = {}): HistoryEntry[] {
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
