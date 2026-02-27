/**
 * MCP Client
 *
 * Connects to Model Context Protocol servers (local command-based or
 * remote HTTP-based) and dynamically registers their tools into
 * the Nimbus tool registry.
 *
 * MCP specification: https://modelcontextprotocol.io/
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { ToolDefinition, ToolResult } from '../tools/schemas/types';
import { z } from 'zod';

/** MCP server configuration */
export interface MCPServerConfig {
  /** Unique server identifier */
  name: string;
  /** Server type */
  type: 'command' | 'http';
  /** For command servers: the command to spawn */
  command?: string;
  /** For command servers: command arguments */
  args?: string[];
  /** For command servers: environment variables */
  env?: Record<string, string>;
  /** For HTTP servers: the base URL */
  url?: string;
  /** For HTTP servers: authentication token */
  token?: string;
  /** Whether to connect lazily (only when a tool is used) */
  lazy?: boolean;
}

/** MCP tool definition from server */
interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchemaProperty;
}

/** MCP JSON-RPC message */
interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Shape of MCP content blocks returned by tools/call */
interface MCPContentBlock {
  type: string;
  text?: string;
}

/** Shape of MCP tools/call result */
interface MCPCallResult {
  content?: MCPContentBlock[];
  isError?: boolean;
}

/**
 * MCP Client that connects to a single MCP server.
 */
export class MCPClient {
  readonly config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = '';
  private tools: MCPToolDefinition[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /** Whether the client is connected to the server */
  get isConnected(): boolean {
    return this.connected;
  }

  /** The tools discovered from this server */
  get discoveredTools(): readonly MCPToolDefinition[] {
    return this.tools;
  }

  /**
   * Connect to the MCP server.
   * For command servers, spawns the process and initializes via JSON-RPC.
   * For HTTP servers, sends a GET to check availability.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.config.type === 'command') {
      await this.connectCommand();
    } else {
      await this.connectHttp();
    }

    this.connected = true;
  }

  /**
   * Discover tools from the connected server.
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.connected) {
      await this.connect();
    }

    if (this.config.type === 'command') {
      const response = (await this.sendRequest('tools/list', {})) as {
        tools?: MCPToolDefinition[];
      };
      this.tools = response.tools ?? [];
    } else {
      // HTTP server
      const headers: Record<string, string> = {};
      if (this.config.token) {
        headers['Authorization'] = `Bearer ${this.config.token}`;
      }
      const response = await fetch(`${this.config.url}/tools/list`, { headers });
      const data = (await response.json()) as { tools?: MCPToolDefinition[] };
      this.tools = data.tools ?? [];
    }

    return this.tools;
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(name: string, input: unknown): Promise<ToolResult> {
    if (!this.connected) {
      await this.connect();
    }

    try {
      let result: MCPCallResult;

      if (this.config.type === 'command') {
        result = (await this.sendRequest('tools/call', {
          name,
          arguments: input,
        })) as MCPCallResult;
      } else {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.config.token) {
          headers['Authorization'] = `Bearer ${this.config.token}`;
        }
        const response = await fetch(`${this.config.url}/tools/call`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, arguments: input }),
        });
        result = (await response.json()) as MCPCallResult;
      }

      // MCP tool results have content array
      const content = result.content ?? [];
      const textParts = content
        .filter(
          (c): c is MCPContentBlock & { text: string } =>
            c.type === 'text' && typeof c.text === 'string'
        )
        .map(c => c.text);

      return {
        output: textParts.join('\n') || JSON.stringify(result),
        isError: result.isError ?? false,
        error: result.isError ? textParts.join('\n') : undefined,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: `MCP tool call failed: ${msg}`,
        isError: true,
      };
    }
  }

  /**
   * Convert discovered MCP tools to Nimbus ToolDefinition format.
   */
  toToolDefinitions(): ToolDefinition[] {
    return this.tools.map(mcpTool => ({
      name: `mcp_${this.config.name}_${mcpTool.name}`,
      description: `[MCP: ${this.config.name}] ${mcpTool.description}`,
      inputSchema: jsonSchemaToZod(mcpTool.inputSchema),
      execute: async (input: unknown) => this.callTool(mcpTool.name, input),
      permissionTier: 'ask_once' as const,
      category: 'mcp' as const,
    }));
  }

  /**
   * Disconnect from the server.
   */
  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
    this.tools = [];
    this.pendingRequests.clear();
  }

  // ---------------------------------------------------------------
  // Internal: Command-based server
  // ---------------------------------------------------------------

  private async connectCommand(): Promise<void> {
    if (!this.config.command) {
      throw new Error(
        `MCP server '${this.config.name}' has type 'command' but no command specified`
      );
    }

    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
    });

    // Handle stdout (JSON-RPC responses)
    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.on('exit', () => {
      this.connected = false;
    });

    // Send initialize request
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'nimbus', version: '0.2.0' },
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});
  }

  private async connectHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`MCP server '${this.config.name}' has type 'http' but no URL specified`);
    }

    // Ping the server
    const headers: Record<string, string> = {};
    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    const response = await fetch(this.config.url, { headers });

    if (!response.ok) {
      throw new Error(`MCP server '${this.config.name}' returned HTTP ${response.status}`);
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      if (this.process?.stdin) {
        this.process.stdin.write(`${JSON.stringify(message)}\n`);
      } else {
        reject(new Error('MCP server process stdin not available'));
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timed out: ${method}`));
        }
      }, 30_000);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    if (this.process?.stdin) {
      this.process.stdin.write(`${JSON.stringify(message)}\n`);
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const message = JSON.parse(line) as JSONRPCMessage;
        if (message.id !== undefined && this.pendingRequests.has(message.id as number)) {
          const pending = this.pendingRequests.get(message.id as number)!;
          this.pendingRequests.delete(message.id as number);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }
}

// ---------------------------------------------------------------
// JSON Schema -> Zod conversion
// ---------------------------------------------------------------

/** Minimal representation of a JSON Schema property used during conversion */
interface JSONSchemaProperty {
  type?: string;
  description?: string;
  enum?: [string, ...string[]];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * Convert a JSON Schema object to a Zod schema.
 * Handles basic types used in MCP tool definitions.
 */
function jsonSchemaToZod(schema: JSONSchemaProperty | undefined): z.ZodType<unknown> {
  if (!schema || schema.type !== 'object') {
    return z.object({});
  }

  const shape: Record<string, z.ZodType<unknown>> = {};
  const required = new Set(schema.required ?? []);

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    let fieldSchema: z.ZodType<unknown>;

    switch (prop.type) {
      case 'string':
        fieldSchema = prop.enum ? z.enum(prop.enum) : z.string();
        break;
      case 'number':
      case 'integer':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'array':
        fieldSchema = z.array(prop.items ? jsonSchemaToZod(prop.items) : z.unknown());
        break;
      case 'object':
        fieldSchema = jsonSchemaToZod(prop);
        break;
      default:
        fieldSchema = z.unknown();
    }

    if (prop.description) {
      fieldSchema = fieldSchema.describe(prop.description);
    }

    shape[key] = required.has(key) ? fieldSchema : fieldSchema.optional();
  }

  return z.object(shape);
}
