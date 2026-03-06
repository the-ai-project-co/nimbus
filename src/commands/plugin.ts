/**
 * Plugin / Extension System (L3)
 *
 * Manages MCP server plugins that extend Nimbus's tool capabilities.
 * Registry stored at ~/.nimbus/plugins.json
 *
 * Commands:
 *   nimbus plugin list           — list installed plugins
 *   nimbus plugin add <name>     — add a plugin from npm or git URL
 *   nimbus plugin remove <name>  — remove a plugin
 *   nimbus plugin init           — scaffold a minimal MCP server in CWD
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ui } from '../wizard/ui';

export interface PluginEntry {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  installedAt: string;
}

interface PluginRegistry {
  plugins: PluginEntry[];
}

const PLUGINS_FILE = path.join(os.homedir(), '.nimbus', 'plugins.json');

// ---------------------------------------------------------------------------
// M5: MCP Server Management
// ---------------------------------------------------------------------------

/** An MCP server entry in ~/.nimbus/mcp.json */
export interface MCPServerEntry {
  /** Unique server name */
  name: string;
  /** Command to start the server (e.g. "npx") */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Transport type */
  type: 'stdio' | 'http';
  /** HTTP URL (for type=http) */
  url?: string;
  /** Environment variables injected when spawning */
  env?: Record<string, string>;
}

interface MCPConfig {
  servers: MCPServerEntry[];
}

const MCP_FILE = path.join(os.homedir(), '.nimbus', 'mcp.json');

function loadMCPConfig(): MCPConfig {
  try {
    const content = fs.readFileSync(MCP_FILE, 'utf-8');
    return JSON.parse(content) as MCPConfig;
  } catch {
    return { servers: [] };
  }
}

function saveMCPConfig(config: MCPConfig): void {
  const dir = path.dirname(MCP_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MCP_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * M5: MCP server management command.
 * Subcommands: add, list, remove, test
 */
export async function mcpCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list': {
      const config = loadMCPConfig();
      if (config.servers.length === 0) {
        ui.info('No MCP servers configured. Add one with: nimbus mcp add <command-or-url>');
        ui.info(`Config file: ${MCP_FILE}`);
        return;
      }
      ui.header('Configured MCP Servers');
      for (const s of config.servers) {
        const cmd = s.type === 'http' ? `${s.url ?? ''}` : `${s.command} ${(s.args ?? []).join(' ')}`;
        ui.print(`  ${ui.color(s.name, 'cyan')}  [${s.type}]  ${cmd}`);
      }
      ui.newLine();
      ui.info(`Config: ${MCP_FILE}`);
      break;
    }

    case 'add': {
      const commandOrUrl = args[0];
      if (!commandOrUrl) {
        ui.print('Usage: nimbus mcp add <command-or-url> [--name <name>]');
        ui.print('');
        ui.print('Examples:');
        ui.print('  nimbus mcp add "npx -y @my/mcp-server"          (npm package)');
        ui.print('  nimbus mcp add "https://my-server.example.com"  (HTTP)');
        ui.print('  nimbus mcp add "./my-server.js"                 (local script)');
        return;
      }

      // Parse optional --name flag
      let serverName = commandOrUrl;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--name' && args[i + 1]) {
          serverName = args[++i];
        }
      }

      const config = loadMCPConfig();
      if (config.servers.find(s => s.name === serverName)) {
        ui.warning(`MCP server "${serverName}" is already configured.`);
        return;
      }

      // Determine transport type and build entry
      const isHttp = commandOrUrl.startsWith('http://') || commandOrUrl.startsWith('https://');

      let entry: MCPServerEntry;
      if (isHttp) {
        entry = {
          name: serverName,
          command: '',
          type: 'http',
          url: commandOrUrl,
        };
      } else {
        // Parse "npx -y @my/mcp-server" into command + args
        const parts = commandOrUrl.split(/\s+/);
        entry = {
          name: serverName,
          command: parts[0] ?? commandOrUrl,
          args: parts.slice(1),
          type: 'stdio',
        };
      }

      config.servers.push(entry);
      saveMCPConfig(config);

      ui.print(`${ui.color('✓', 'green')} MCP server "${serverName}" added.`);
      ui.info(`Config saved to: ${MCP_FILE}`);
      ui.info('Restart Nimbus for the server to take effect.');
      break;
    }

    case 'remove': {
      const name = args[0];
      if (!name) {
        ui.print('Usage: nimbus mcp remove <name>');
        return;
      }

      const config = loadMCPConfig();
      const idx = config.servers.findIndex(s => s.name === name);
      if (idx === -1) {
        ui.warning(`MCP server "${name}" not found.`);
        ui.info('Run "nimbus mcp list" to see configured servers.');
        return;
      }

      config.servers.splice(idx, 1);
      saveMCPConfig(config);
      ui.print(`${ui.color('✓', 'green')} MCP server "${name}" removed.`);
      break;
    }

    case 'test': {
      const name = args[0];
      if (!name) {
        ui.print('Usage: nimbus mcp test <name>');
        return;
      }

      const config = loadMCPConfig();
      const server = config.servers.find(s => s.name === name);
      if (!server) {
        ui.warning(`MCP server "${name}" not found.`);
        ui.info('Run "nimbus mcp list" to see configured servers.');
        return;
      }

      if (server.type === 'http') {
        // HTTP: send a tools/list request via curl if available
        ui.startSpinner({ message: `Testing MCP server "${name}" at ${server.url ?? ''}...` });
        try {
          const resp = execFileSync('curl', [
            '-s', '--max-time', '5',
            '-X', 'POST',
            '-H', 'Content-Type: application/json',
            '-d', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
            server.url ?? '',
          ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

          const data = JSON.parse(resp) as Record<string, unknown>;
          ui.stopSpinnerSuccess(`Server responded. Result: ${JSON.stringify(data).slice(0, 200)}`);
        } catch (err: unknown) {
          ui.stopSpinnerFail(`Could not reach server: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // stdio: spawn briefly and send a tools/list JSON-RPC message
        ui.startSpinner({ message: `Testing MCP server "${name}" (stdio)...` });
        try {
          const testPayload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n';
          const result = execFileSync(
            server.command,
            server.args ?? [],
            {
              input: testPayload,
              encoding: 'utf-8',
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe'],
            }
          );
          const parsed = JSON.parse(result) as Record<string, unknown>;
          const tools = (parsed.result as Record<string, unknown>)?.tools;
          const toolCount = Array.isArray(tools) ? tools.length : '?';
          ui.stopSpinnerSuccess(`Server responded with ${toolCount} tools.`);
        } catch (err: unknown) {
          ui.stopSpinnerFail(`Server test failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      break;
    }

    default:
      ui.print('Usage: nimbus mcp <list|add|remove|test>');
      ui.print('');
      ui.print('Commands:');
      ui.print('  list              List configured MCP servers');
      ui.print('  add <cmd-or-url>  Add a new MCP server');
      ui.print('  remove <name>     Remove an MCP server');
      ui.print('  test <name>       Test that a server responds');
  }
}

function loadRegistry(): PluginRegistry {
  try {
    const content = fs.readFileSync(PLUGINS_FILE, 'utf-8');
    return JSON.parse(content) as PluginRegistry;
  } catch {
    return { plugins: [] };
  }
}

function saveRegistry(registry: PluginRegistry): void {
  const dir = path.dirname(PLUGINS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLUGINS_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

export async function pluginCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list': {
      const registry = loadRegistry();
      if (registry.plugins.length === 0) {
        ui.info('No plugins installed. Add one with: nimbus plugin add <name>');
        return;
      }
      ui.header('Installed Plugins');
      for (const p of registry.plugins) {
        ui.print(`  ${ui.color(p.name, 'cyan')}  —  ${p.description ?? p.command}`);
        if (p.args) ui.print(`    args: ${p.args.join(' ')}`);
      }
      break;
    }

    case 'add': {
      const name = args[0];
      if (!name) {
        ui.print('Usage: nimbus plugin add <package-name-or-url>');
        return;
      }

      const registry = loadRegistry();
      if (registry.plugins.find(p => p.name === name)) {
        ui.warning(`Plugin "${name}" is already installed.`);
        return;
      }

      // Determine command: npm package → `npx <name>`, git URL → clone first
      const isUrl = name.startsWith('http') || name.startsWith('git@');
      const command = isUrl ? `node` : `npx`;
      const pluginArgs = isUrl ? [name] : [name];

      const entry: PluginEntry = {
        name,
        command,
        args: pluginArgs,
        installedAt: new Date().toISOString(),
      };

      registry.plugins.push(entry);
      saveRegistry(registry);

      ui.print(`${ui.color('✓', 'green')} Plugin "${name}" added.`);
      ui.info('Restart Nimbus for the plugin to take effect.');
      break;
    }

    case 'remove': {
      const name = args[0];
      if (!name) {
        ui.print('Usage: nimbus plugin remove <name>');
        return;
      }

      const registry = loadRegistry();
      const idx = registry.plugins.findIndex(p => p.name === name);
      if (idx === -1) {
        ui.warning(`Plugin "${name}" not found.`);
        return;
      }

      registry.plugins.splice(idx, 1);
      saveRegistry(registry);
      ui.print(`${ui.color('✓', 'green')} Plugin "${name}" removed.`);
      break;
    }

    case 'init': {
      const cwd = process.cwd();
      const serverFile = path.join(cwd, 'nimbus-plugin.js');

      if (fs.existsSync(serverFile)) {
        ui.warning(`${serverFile} already exists.`);
        return;
      }

      const template = `#!/usr/bin/env node
/**
 * Nimbus MCP Plugin Template
 *
 * Implement tools that extend Nimbus's capabilities.
 * See: https://github.com/the-ai-project-co/nimbus
 */

const readline = require('readline');

const tools = [
  {
    name: 'my_tool',
    description: 'A custom tool for Nimbus',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input for the tool' },
      },
      required: ['input'],
    },
  },
];

// MCP server — reads JSON-RPC requests from stdin, writes responses to stdout
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    if (request.method === 'tools/list') {
      respond(request.id, { tools });
    } else if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      if (name === 'my_tool') {
        respond(request.id, { content: [{ type: 'text', text: \`You called my_tool with: \${args.input}\` }] });
      }
    }
  } catch (e) {
    process.stderr.write(\`Error: \${e}\\n\`);
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
}
`;

      fs.writeFileSync(serverFile, template, 'utf-8');
      fs.chmodSync(serverFile, 0o755);

      ui.print(`${ui.color('✓', 'green')} Created ${serverFile}`);
      ui.info('Register with: nimbus plugin add ./nimbus-plugin.js');
      break;
    }

    default:
      ui.print('Usage: nimbus plugin <list|add|remove|init>');
  }
}
