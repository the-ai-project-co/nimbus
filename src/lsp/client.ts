/**
 * LSP Client -- JSON-RPC over stdio
 *
 * Implements the Language Server Protocol client that communicates
 * with language servers via stdin/stdout using JSON-RPC 2.0.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { LanguageConfig } from './languages';

/** LSP Diagnostic severity levels. */
export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error, Warning, Info, Hint

/** A single diagnostic from the language server. */
export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  source?: string;
  code?: string | number;
}

/** Severity labels for display. */
const SEVERITY_LABELS: Record<number, string> = {
  1: 'Error',
  2: 'Warning',
  3: 'Info',
  4: 'Hint',
};

export function severityLabel(severity: DiagnosticSeverity): string {
  return SEVERITY_LABELS[severity] ?? 'Unknown';
}

/**
 * LSP Client that communicates with a single language server.
 */
export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: LanguageConfig;
  private requestId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private buffer = '';
  private initialized = false;
  private rootUri: string;
  private diagnostics = new Map<string, Diagnostic[]>();

  constructor(config: LanguageConfig, rootUri: string) {
    super();
    this.config = config;
    this.rootUri = rootUri;
  }

  /** Whether the client is connected and initialized. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Get the language ID. */
  get languageId(): string {
    return this.config.id;
  }

  /** Start the language server process. */
  async start(): Promise<boolean> {
    try {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      if (!this.process.stdout || !this.process.stdin) {
        this.process.kill();
        this.process = null;
        return false;
      }

      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on('data', () => {
        // Silently ignore stderr from language servers
      });

      this.process.on('exit', () => {
        this.initialized = false;
        this.process = null;
        this.emit('exit');
      });

      // Send initialize request
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${this.rootUri}`,
        capabilities: {
          textDocument: {
            synchronization: { didOpen: true, didChange: true, didClose: true },
            publishDiagnostics: { relatedInformation: true },
          },
        },
        initializationOptions: this.config.initializationOptions ?? {},
      });

      // Send initialized notification
      this.sendNotification('initialized', {});
      this.initialized = true;
      return true;
    } catch {
      this.process = null;
      return false;
    }
  }

  /** Stop the language server. */
  async stop(): Promise<void> {
    if (!this.process) return;

    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch {
      // Server may already be dead
    }

    // Force kill after 2 seconds
    const proc = this.process;
    setTimeout(() => {
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 2000);

    this.process = null;
    this.initialized = false;
  }

  /** Notify the server that a file was opened or changed. */
  async touchFile(filePath: string, content: string, version: number = 1): Promise<void> {
    if (!this.initialized) return;

    const uri = `file://${filePath}`;
    const languageId = this.config.id;

    // Send didOpen (simplified -- in a full implementation we'd track open state)
    this.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text: content },
    });
  }

  /** Request diagnostics for a file by waiting for publishDiagnostics. */
  async getDiagnostics(filePath: string, timeoutMs: number = 2000): Promise<Diagnostic[]> {
    const uri = `file://${filePath}`;

    // Return cached diagnostics if available
    const cached = this.diagnostics.get(uri);

    // Wait for new diagnostics up to timeout
    return new Promise<Diagnostic[]>((resolve) => {
      const timer = setTimeout(() => {
        resolve(cached ?? []);
      }, timeoutMs);

      const handler = (params: any) => {
        if (params.uri === uri) {
          clearTimeout(timer);
          this.removeListener('diagnostics', handler);
          resolve(this.diagnostics.get(uri) ?? []);
        }
      };

      this.on('diagnostics', handler);
    });
  }

  /** Get all cached diagnostics for a file. */
  getCachedDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnostics.get(`file://${filePath}`) ?? [];
  }

  /** Send a JSON-RPC request and wait for response. */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP process not running'));
        return;
      }

      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });

      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
      this.process.stdin.write(header + message);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  private sendNotification(method: string, params: any): void {
    if (!this.process?.stdin) return;

    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
    this.process.stdin.write(header + message);
  }

  /** Handle incoming data from the language server. */
  private handleData(data: string): void {
    this.buffer += data;

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = headerEnd + 4;

      if (this.buffer.length < bodyStart + contentLength) break;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const message = JSON.parse(body);
        this.handleMessage(message);
      } catch {
        // Ignore malformed messages
      }
    }
  }

  /** Handle a parsed JSON-RPC message. */
  private handleMessage(message: any): void {
    // Response to a request
    if (message.id !== undefined && this.pending.has(message.id)) {
      const handler = this.pending.get(message.id)!;
      this.pending.delete(message.id);

      if (message.error) {
        handler.reject(new Error(message.error.message));
      } else {
        handler.resolve(message.result);
      }
      return;
    }

    // Notification from server
    if (message.method === 'textDocument/publishDiagnostics') {
      const { uri, diagnostics: rawDiags } = message.params;
      const parsed: Diagnostic[] = rawDiags.map((d: any) => ({
        file: uri.replace('file://', ''),
        line: (d.range?.start?.line ?? 0) + 1,
        column: (d.range?.start?.character ?? 0) + 1,
        endLine: d.range?.end ? d.range.end.line + 1 : undefined,
        endColumn: d.range?.end ? d.range.end.character + 1 : undefined,
        severity: d.severity ?? 1,
        message: d.message,
        source: d.source,
        code: d.code,
      }));
      this.diagnostics.set(uri, parsed);
      this.emit('diagnostics', message.params);
    }
  }
}
