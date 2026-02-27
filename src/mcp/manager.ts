/**
 * MCP Manager
 *
 * Manages multiple MCP server connections and provides a unified
 * interface for tool discovery and registration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { MCPClient, type MCPServerConfig } from './client';
import type { ToolDefinition, ToolRegistry } from '../tools/schemas/types';

/** Configuration file format for MCP servers */
export interface MCPConfig {
  mcpServers?: Record<string, Omit<MCPServerConfig, 'name'>>;
}

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private initialized = false;

  /**
   * Load MCP server configurations from config files.
   * Searches: .nimbus/mcp.json, nimbus.json, ~/.nimbus/mcp.json
   */
  async loadConfig(cwd?: string): Promise<void> {
    const configPaths = [
      cwd ? path.join(cwd, '.nimbus', 'mcp.json') : null,
      cwd ? path.join(cwd, 'nimbus.json') : null,
      path.join(homedir(), '.nimbus', 'mcp.json'),
    ].filter((p): p is string => p !== null);

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config: MCPConfig = JSON.parse(content) as MCPConfig;
          if (config.mcpServers) {
            for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
              if (!this.clients.has(name)) {
                this.clients.set(name, new MCPClient({ ...serverConfig, name }));
              }
            }
          }
        } catch {
          // Skip invalid config files
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Connect to all configured MCP servers and discover tools.
   * Lazy servers are skipped until explicitly needed.
   */
  async connectAll(): Promise<void> {
    if (!this.initialized) {
      await this.loadConfig();
    }

    const connectPromises: Promise<void>[] = [];
    for (const [name, client] of this.clients) {
      if (!client.config.lazy) {
        connectPromises.push(
          client
            .connect()
            .then(() => client.listTools())
            .then(() => undefined)
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`MCP server '${name}' failed to connect: ${msg}`);
            })
        );
      }
    }

    await Promise.all(connectPromises);
  }

  /**
   * Get all tool definitions from connected MCP servers.
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const client of this.clients.values()) {
      if (client.isConnected) {
        tools.push(...client.toToolDefinitions());
      }
    }
    return tools;
  }

  /**
   * Register all MCP tools into a tool registry.
   */
  registerTools(registry: ToolRegistry): void {
    for (const tool of this.getAllTools()) {
      try {
        registry.register(tool);
      } catch {
        // Skip duplicate tool names
      }
    }
  }

  /**
   * Get a specific client by server name.
   */
  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Disconnect all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.values()).map(client => client.disconnect());
    await Promise.all(disconnectPromises);
  }

  /** Number of configured servers */
  get serverCount(): number {
    return this.clients.size;
  }

  /** Number of connected servers */
  get connectedCount(): number {
    return Array.from(this.clients.values()).filter(c => c.isConnected).length;
  }
}
