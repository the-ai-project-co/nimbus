/**
 * LSP Manager -- Language Server Lifecycle
 *
 * Manages starting, stopping, and querying multiple language servers.
 * Lazy loading: servers only start when a file of that type is first edited.
 * Auto-stop: servers shut down after 5 minutes of inactivity.
 */

import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { LSPClient, type Diagnostic } from './client';
import { getLanguageForFile, LANGUAGE_CONFIGS, type LanguageConfig } from './languages';

const execAsync = promisify(exec);

/** Default idle timeout: 5 minutes. */
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;

/** Delay after file change before requesting diagnostics. */
const DIAGNOSTIC_DELAY = 500;

export interface LSPStatus {
  language: string;
  active: boolean;
  available: boolean;
}

export class LSPManager {
  private clients = new Map<string, LSPClient>();
  private idleTimers = new Map<string, Timer>();
  private rootUri: string;
  private availabilityCache = new Map<string, boolean>();
  private fileVersions = new Map<string, number>();
  private enabled: boolean = true;

  constructor(rootUri?: string) {
    this.rootUri = rootUri ?? process.cwd();
  }

  /** Enable or disable LSP integration. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  /**
   * Notify the LSP manager that a file was modified.
   * This lazily starts the appropriate language server and sends the update.
   */
  async touchFile(filePath: string): Promise<void> {
    if (!this.enabled) return;

    const config = getLanguageForFile(filePath);
    if (!config) return;

    // Ensure the client is running
    const client = await this.ensureClient(config);
    if (!client) return;

    // Read file content and bump version
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return;
    }

    const version = (this.fileVersions.get(filePath) ?? 0) + 1;
    this.fileVersions.set(filePath, version);

    await client.touchFile(filePath, content, version);
    this.resetIdleTimer(config.id);
  }

  /**
   * Get diagnostics for a file.
   * Waits up to `delayMs` for the LSP to process and return results.
   */
  async getDiagnostics(filePath: string, delayMs: number = DIAGNOSTIC_DELAY): Promise<Diagnostic[]> {
    if (!this.enabled) return [];

    const config = getLanguageForFile(filePath);
    if (!config) return [];

    const client = this.clients.get(config.id);
    if (!client?.isInitialized) return [];

    // Wait a brief moment for the LSP to process
    await new Promise(resolve => setTimeout(resolve, delayMs));

    return client.getDiagnostics(filePath);
  }

  /**
   * Get errors only (severity 1 = Error).
   */
  async getErrors(filePath: string): Promise<Diagnostic[]> {
    const diagnostics = await this.getDiagnostics(filePath);
    return diagnostics.filter(d => d.severity === 1);
  }

  /**
   * Format diagnostics as messages suitable for injection into the agent conversation.
   */
  formatDiagnosticsForAgent(diagnostics: Diagnostic[]): string | null {
    if (diagnostics.length === 0) return null;

    const errors = diagnostics.filter(d => d.severity === 1);
    const warnings = diagnostics.filter(d => d.severity === 2);

    if (errors.length === 0 && warnings.length === 0) return null;

    const lines: string[] = ['[LSP Diagnostics]'];
    for (const d of errors) {
      const loc = `${d.file}:${d.line}:${d.column}`;
      lines.push(`  Error: ${loc} — ${d.message}${d.source ? ` (${d.source})` : ''}`);
    }
    for (const d of warnings.slice(0, 5)) {
      const loc = `${d.file}:${d.line}:${d.column}`;
      lines.push(`  Warning: ${loc} — ${d.message}${d.source ? ` (${d.source})` : ''}`);
    }

    if (warnings.length > 5) {
      lines.push(`  ... and ${warnings.length - 5} more warnings`);
    }

    return lines.join('\n');
  }

  /** Get status of all known language servers. */
  async getStatus(): Promise<LSPStatus[]> {
    const statuses: LSPStatus[] = [];
    for (const config of LANGUAGE_CONFIGS) {
      const client = this.clients.get(config.id);
      const available = await this.isAvailable(config);
      statuses.push({
        language: config.name,
        active: client?.isInitialized ?? false,
        available,
      });
    }
    return statuses;
  }

  /** Stop all running language servers. */
  async stopAll(): Promise<void> {
    for (const [id, client] of this.clients) {
      await client.stop();
      const timer = this.idleTimers.get(id);
      if (timer) clearTimeout(timer);
    }
    this.clients.clear();
    this.idleTimers.clear();
  }

  /** Stop a specific language server. */
  async stop(languageId: string): Promise<void> {
    const client = this.clients.get(languageId);
    if (client) {
      await client.stop();
      this.clients.delete(languageId);
    }
    const timer = this.idleTimers.get(languageId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(languageId);
    }
  }

  /** Ensure a client exists and is initialized for the given language. */
  private async ensureClient(config: LanguageConfig): Promise<LSPClient | null> {
    const existing = this.clients.get(config.id);
    if (existing?.isInitialized) return existing;

    // Check if the binary is available
    const available = await this.isAvailable(config);
    if (!available) return null;

    const client = new LSPClient(config, this.rootUri);
    const started = await client.start();
    if (!started) return null;

    this.clients.set(config.id, client);
    this.resetIdleTimer(config.id);

    client.on('exit', () => {
      this.clients.delete(config.id);
      const timer = this.idleTimers.get(config.id);
      if (timer) {
        clearTimeout(timer);
        this.idleTimers.delete(config.id);
      }
    });

    return client;
  }

  /** Check if a language server binary is available in PATH. */
  private async isAvailable(config: LanguageConfig): Promise<boolean> {
    const cached = this.availabilityCache.get(config.id);
    if (cached !== undefined) return cached;

    try {
      await execAsync(`which ${config.command}`);
      this.availabilityCache.set(config.id, true);
      return true;
    } catch {
      this.availabilityCache.set(config.id, false);
      return false;
    }
  }

  /** Reset the idle timer for a language server. */
  private resetIdleTimer(languageId: string): void {
    const existing = this.idleTimers.get(languageId);
    if (existing) clearTimeout(existing);

    const config = LANGUAGE_CONFIGS.find(c => c.id === languageId);
    const timeout = config?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT;

    const timer = setTimeout(() => {
      this.stop(languageId);
    }, timeout);

    this.idleTimers.set(languageId, timer);
  }
}

/** Singleton LSP manager instance. */
let lspManagerInstance: LSPManager | null = null;

/** Get or create the singleton LSP manager. */
export function getLSPManager(rootUri?: string): LSPManager {
  if (!lspManagerInstance) {
    lspManagerInstance = new LSPManager(rootUri);
  }
  return lspManagerInstance;
}

/** Reset the singleton (for testing). */
export function resetLSPManager(): void {
  lspManagerInstance?.stopAll();
  lspManagerInstance = null;
}
