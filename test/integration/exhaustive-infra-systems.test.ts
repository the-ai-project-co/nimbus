/**
 * Exhaustive Infrastructure Systems Tests
 *
 * Comprehensive source-level assertions covering:
 *   - WATCHER (src/watcher/index.ts)
 *   - MCP (src/mcp/)
 *   - LSP (src/lsp/)
 *   - SHARING (src/sharing/)
 *   - STATE / SQLite (src/state/ and src/compat/)
 *   - CONFIG (src/config/)
 *   - GENERATOR (src/generator/)
 *   - WIZARD (src/wizard/)
 *   - ENGINE (src/engine/)
 *   - SCANNERS (src/scanners/)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';

const ROOT = join(process.cwd(), 'src');

function src(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8');
}

// ============================================================================
// WATCHER
// ============================================================================

describe('WATCHER — FileWatcher export and interface', () => {
  it('FileWatcher is exported from src/watcher/index.ts', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    expect(typeof FileWatcher).toBe('function');
  });

  it('FileChangeEvent interface has type, path, timestamp fields', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('type:');
    expect(source).toContain('path:');
    expect(source).toContain('timestamp:');
  });

  it('FileWatcher extends EventEmitter', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(fw).toBeInstanceOf(EventEmitter);
  });

  it('isWatching is false before start()', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(fw.isWatching).toBe(false);
  });

  it('stop() sets isWatching to false', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    fw.stop(); // stop without start — should be safe
    expect(fw.isWatching).toBe(false);
  });

  it('getSummary() returns empty string when no changes', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(fw.getSummary()).toBe('');
  });

  it('getSummary() returns "Files changed externally" when changes exist (source verify)', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('Files changed externally');
  });

  it('getSummary(since, true) devopsOnly filters .tf files (source verify)', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('.tf');
    expect(source).toContain('devopsOnly');
  });

  it('getSummary() categorizes .tf as [terraform]', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('[terraform]');
  });

  it('getSummary() categorizes .yaml/.yml as [yaml/k8s]', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('[yaml/k8s]');
  });

  it('getSummary() categorizes Dockerfile as [docker]', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('[docker]');
  });

  it('getChangesSince() method exists', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(typeof fw.getChangesSince).toBe('function');
  });

  it('getChangesSince() returns empty array before any events', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(fw.getChangesSince(Date.now() - 10000)).toEqual([]);
  });

  it('clearChanges() method exists', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    expect(typeof fw.clearChanges).toBe('function');
  });

  it('clearChanges() resets buffer (getChangesSince returns [])', async () => {
    const { FileWatcher } = await import('../../src/watcher/index');
    const fw = new FileWatcher('/tmp');
    fw.clearChanges();
    expect(fw.getChangesSince(0)).toEqual([]);
  });

  it('Ring buffer max 100 events defined in source', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('100');
  });

  it('Ignore patterns include node_modules, .git, dist, .nimbus, .terraform', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('node_modules');
    expect(source).toContain('.git');
    expect(source).toContain('dist');
    expect(source).toContain('.nimbus');
    expect(source).toContain('.terraform');
  });

  it('Linux fallback: watches subdirectories individually', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain("process.platform === 'linux'");
    expect(source).toContain('src');
    expect(source).toContain('lib');
  });

  it('emit("change", FileChangeEvent) is called when change detected', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain("emit('change', event)");
  });

  it('emitted event has .path property (string)', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('path: path.join(');
  });

  it('path.endsWith pattern used in getSummary (devopsOnly check)', () => {
    const source = src('src/watcher/index.ts');
    expect(source).toContain('endsWith');
  });
});

// ============================================================================
// MCP
// ============================================================================

describe('MCP — MCPClient', () => {
  it('MCPClient is exported from src/mcp/client.ts', async () => {
    const { MCPClient } = await import('../../src/mcp/client');
    expect(typeof MCPClient).toBe('function');
  });

  it('MCPClient has connect() method', async () => {
    const { MCPClient } = await import('../../src/mcp/client');
    const client = new MCPClient({ name: 'test', type: 'http', url: 'http://localhost:9999' });
    expect(typeof client.connect).toBe('function');
  });

  it('MCPClient has listTools() method', async () => {
    const { MCPClient } = await import('../../src/mcp/client');
    const client = new MCPClient({ name: 'test', type: 'http', url: 'http://localhost:9999' });
    expect(typeof client.listTools).toBe('function');
  });

  it('MCPClient has callTool() method', async () => {
    const { MCPClient } = await import('../../src/mcp/client');
    const client = new MCPClient({ name: 'test', type: 'http', url: 'http://localhost:9999' });
    expect(typeof client.callTool).toBe('function');
  });

  it('MCPClient JSON-RPC over stdio: source uses spawn and stdin', () => {
    const source = src('src/mcp/client.ts');
    expect(source).toContain('spawn');
    expect(source).toContain('stdin');
    expect(source).toContain('jsonrpc');
  });

  it('MCPClient HTTP transport: source calls fetch with URL', () => {
    const source = src('src/mcp/client.ts');
    expect(source).toContain('fetch');
    expect(source).toContain('this.config.url');
  });

  it('MCPClient isConnected property exists', async () => {
    const { MCPClient } = await import('../../src/mcp/client');
    const client = new MCPClient({ name: 'test', type: 'http', url: 'http://localhost:9999' });
    expect(typeof client.isConnected).toBe('boolean');
    expect(client.isConnected).toBe(false);
  });
});

describe('MCP — MCPManager', () => {
  it('MCPManager is exported from src/mcp/manager.ts', async () => {
    const { MCPManager } = await import('../../src/mcp/manager');
    expect(typeof MCPManager).toBe('function');
  });

  it('MCPManager handles multiple servers (serverCount)', async () => {
    const { MCPManager } = await import('../../src/mcp/manager');
    const manager = new MCPManager();
    expect(typeof manager.serverCount).toBe('number');
    expect(manager.serverCount).toBe(0);
  });

  it('MCPManager config loading checks .nimbus/mcp.json path', () => {
    const source = src('src/mcp/manager.ts');
    expect(source).toContain('.nimbus');
    expect(source).toContain('mcp.json');
  });

  it('MCPManager has getAllTools() method', async () => {
    const { MCPManager } = await import('../../src/mcp/manager');
    const manager = new MCPManager();
    expect(typeof manager.getAllTools).toBe('function');
    expect(Array.isArray(manager.getAllTools())).toBe(true);
  });

  it('MCPManager has disconnectAll() method', async () => {
    const { MCPManager } = await import('../../src/mcp/manager');
    const manager = new MCPManager();
    expect(typeof manager.disconnectAll).toBe('function');
  });
});

// ============================================================================
// LSP
// ============================================================================

describe('LSP — LSPManager', () => {
  it('LSPManager is exported from src/lsp/manager.ts', async () => {
    const { LSPManager } = await import('../../src/lsp/manager');
    expect(typeof LSPManager).toBe('function');
  });

  it('LSPManager has touchFile() method', async () => {
    const { LSPManager } = await import('../../src/lsp/manager');
    const mgr = new LSPManager('/tmp');
    expect(typeof mgr.touchFile).toBe('function');
  });

  it('LSPManager has getDiagnostics() method', async () => {
    const { LSPManager } = await import('../../src/lsp/manager');
    const mgr = new LSPManager('/tmp');
    expect(typeof mgr.getDiagnostics).toBe('function');
  });

  it('LSPManager has stopAll() method', async () => {
    const { LSPManager } = await import('../../src/lsp/manager');
    const mgr = new LSPManager('/tmp');
    expect(typeof mgr.stopAll).toBe('function');
  });

  it('5-min idle auto-stop: source contains 5 * 60 pattern', () => {
    const source = src('src/lsp/manager.ts');
    expect(source).toContain('5 * 60');
  });

  it('Lazy loading: servers start on first touchFile call (source inspection)', () => {
    const source = src('src/lsp/manager.ts');
    expect(source).toContain('ensureClient');
    expect(source).toContain('touchFile');
  });

  it('lsp-unavailable event emitted when language server not found', () => {
    const source = src('src/lsp/manager.ts');
    expect(source).toContain("'lsp-unavailable'");
  });
});

describe('LSP — languages.ts', () => {
  it('LANGUAGE_CONFIGS is exported from languages.ts', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    expect(Array.isArray(LANGUAGE_CONFIGS)).toBe(true);
    expect(LANGUAGE_CONFIGS.length).toBeGreaterThan(0);
  });

  it('LANGUAGE_CONFIGS contains typescript/ts config', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    const ts = LANGUAGE_CONFIGS.find(c => c.id === 'typescript');
    expect(ts).toBeDefined();
    expect(ts?.extensions).toContain('.ts');
  });

  it('LANGUAGE_CONFIGS contains go/gopls config', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    const go = LANGUAGE_CONFIGS.find(c => c.id === 'go');
    expect(go).toBeDefined();
    expect(go?.command).toBe('gopls');
  });

  it('LANGUAGE_CONFIGS contains python config', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    const py = LANGUAGE_CONFIGS.find(c => c.id === 'python');
    expect(py).toBeDefined();
    expect(py?.extensions).toContain('.py');
  });

  it('LANGUAGE_CONFIGS contains yaml config', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    const yaml = LANGUAGE_CONFIGS.find(c => c.id === 'yaml');
    expect(yaml).toBeDefined();
  });

  it('LANGUAGE_CONFIGS contains terraform/hcl config', async () => {
    const { LANGUAGE_CONFIGS } = await import('../../src/lsp/languages');
    const tf = LANGUAGE_CONFIGS.find(c => c.id === 'terraform');
    expect(tf).toBeDefined();
    expect(tf?.extensions).toContain('.tf');
  });

  it('getLanguageForFile is exported from languages.ts', async () => {
    const { getLanguageForFile } = await import('../../src/lsp/languages');
    expect(typeof getLanguageForFile).toBe('function');
  });

  it('getLanguageForFile("/foo/main.ts") returns typescript config', async () => {
    const { getLanguageForFile } = await import('../../src/lsp/languages');
    const config = getLanguageForFile('/foo/main.ts');
    expect(config).toBeDefined();
    expect(config?.id).toBe('typescript');
  });

  it('getLanguageForFile("/foo/main.go") returns go config', async () => {
    const { getLanguageForFile } = await import('../../src/lsp/languages');
    const config = getLanguageForFile('/foo/main.go');
    expect(config).toBeDefined();
    expect(config?.id).toBe('go');
  });

  it('getLanguageForFile("/foo/main.py") returns python config', async () => {
    const { getLanguageForFile } = await import('../../src/lsp/languages');
    const config = getLanguageForFile('/foo/main.py');
    expect(config).toBeDefined();
    expect(config?.id).toBe('python');
  });

  it('getLanguageForFile returns undefined for unknown extension', async () => {
    const { getLanguageForFile } = await import('../../src/lsp/languages');
    const config = getLanguageForFile('/foo/unknown.xyz');
    expect(config).toBeUndefined();
  });
});

// ============================================================================
// SHARING
// ============================================================================

describe('SHARING — sync.ts', () => {
  it('shareSession is exported from src/sharing/sync.ts', async () => {
    const { shareSession } = await import('../../src/sharing/sync');
    expect(typeof shareSession).toBe('function');
  });

  it('getSharedSession is exported from src/sharing/sync.ts', async () => {
    const { getSharedSession } = await import('../../src/sharing/sync');
    expect(typeof getSharedSession).toBe('function');
  });

  it('listShares is exported from src/sharing/sync.ts', async () => {
    const { listShares } = await import('../../src/sharing/sync');
    expect(typeof listShares).toBe('function');
  });

  it('30-day TTL is referenced in source', () => {
    const source = src('src/sharing/sync.ts');
    expect(source).toContain('30');
    expect(source).toContain('ttl');
  });

  it('URL-safe base64 share IDs (source inspection)', () => {
    const source = src('src/sharing/sync.ts');
    expect(source).toContain('btoa');
    expect(source).toContain("replace(/\\+/g, '-')");
    expect(source).toContain("replace(/\\//g, '_')");
  });

  it('SharedSession interface has id, sessionId, name, messages fields', () => {
    const source = src('src/sharing/sync.ts');
    expect(source).toContain('id:');
    expect(source).toContain('sessionId:');
    expect(source).toContain('name:');
    expect(source).toContain('messages:');
  });

  it('_deps.getDb override pattern exists (for test isolation)', () => {
    const source = src('src/sharing/sync.ts');
    expect(source).toContain('_deps');
    expect(source).toContain('getDb');
  });

  it('_deps is exported from sync.ts', async () => {
    const { _deps } = await import('../../src/sharing/sync');
    expect(typeof _deps).toBe('object');
    expect(_deps).not.toBeNull();
  });

  it('listShares() returns empty array when db is null', async () => {
    const mod = await import('../../src/sharing/sync');
    const orig = mod._deps.getDb;
    mod._deps.getDb = () => null;
    try {
      const result = mod.listShares();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    } finally {
      mod._deps.getDb = orig;
    }
  });

  it('getSharedSession() returns null when db is null', async () => {
    const mod = await import('../../src/sharing/sync');
    const orig = mod._deps.getDb;
    mod._deps.getDb = () => null;
    try {
      const result = mod.getSharedSession('someShareId');
      expect(result).toBeNull();
    } finally {
      mod._deps.getDb = orig;
    }
  });

  it('shareSession() returns null when session not found', async () => {
    const mod = await import('../../src/sharing/sync');
    const origGetDb = mod._deps.getDb;
    const origGetSession = mod._deps.getSessionManager;
    mod._deps.getDb = () => null;
    mod._deps.getSessionManager = () => ({ get: () => null });
    try {
      const result = mod.shareSession('nonexistent-session-id');
      expect(result).toBeNull();
    } finally {
      mod._deps.getDb = origGetDb;
      mod._deps.getSessionManager = origGetSession;
    }
  });

  it('viewer.ts exists in src/sharing/', () => {
    const exists = existsSync(join(process.cwd(), 'src/sharing/viewer.ts'));
    expect(exists).toBe(true);
  });
});

// ============================================================================
// STATE / SQLite
// ============================================================================

describe('STATE — db.ts', () => {
  it('getDb is exported from src/state/db.ts', async () => {
    const { getDb } = await import('../../src/state/db');
    expect(typeof getDb).toBe('function');
  });

  it('getTestDb is exported from src/state/db.ts', async () => {
    const { getTestDb } = await import('../../src/state/db');
    expect(typeof getTestDb).toBe('function');
  });

  it('getTestDb() returns a usable in-memory DB', async () => {
    const { getTestDb } = await import('../../src/state/db');
    const db = getTestDb();
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe('function');
  });
});

describe('STATE — schema.ts', () => {
  it('runMigrations is exported from src/state/schema.ts', async () => {
    const { runMigrations } = await import('../../src/state/schema');
    expect(typeof runMigrations).toBe('function');
  });

  it('at least 16 tables defined in schema', () => {
    const source = src('src/state/schema.ts');
    const tableMatches = source.match(/CREATE TABLE IF NOT EXISTS/g);
    expect(tableMatches).not.toBeNull();
    expect(tableMatches!.length).toBeGreaterThanOrEqual(16);
  });

  it('WAL mode enabled in schema (PRAGMA journal_mode=WAL)', () => {
    const source = src('src/state/db.ts');
    expect(source).toContain('journal_mode=WAL');
  });

  it('Schema includes sessions-related table (shares)', () => {
    const source = src('src/state/schema.ts');
    expect(source).toContain('shares');
  });

  it('Schema includes conversations table', () => {
    const source = src('src/state/schema.ts');
    expect(source).toContain('conversations');
  });

  it('Schema includes artifacts table', () => {
    const source = src('src/state/schema.ts');
    expect(source).toContain('artifacts');
  });

  it('Schema includes config table', () => {
    const source = src('src/state/schema.ts');
    expect(source).toContain("CREATE TABLE IF NOT EXISTS config");
  });
});

describe('SQLite compat shim', () => {
  it('Database class is exported from src/compat/sqlite.ts', async () => {
    const { Database } = await import('../../src/compat/sqlite');
    expect(typeof Database).toBe('function');
  });

  it('sqlite compat shim: tries better-sqlite3 first (source inspection)', () => {
    const source = src('src/compat/sqlite.ts');
    expect(source).toContain('better-sqlite3');
  });

  it('sqlite compat shim: falls back to sql.js', () => {
    const source = src('src/compat/sqlite.ts');
    expect(source).toContain('sql.js');
  });

  it('Database constructor creates a usable in-memory database', async () => {
    const { Database } = await import('../../src/compat/sqlite');
    const db = new Database(':memory:');
    expect(db).toBeDefined();
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    db.close();
  });
});

describe('STATE — config.ts', () => {
  it('getConfig and setConfig are exported from src/state/config.ts', async () => {
    const stateConfig = await import('../../src/state/config');
    expect(typeof stateConfig.getConfig).toBe('function');
    expect(typeof stateConfig.setConfig).toBe('function');
  });
});

// ============================================================================
// CONFIG
// ============================================================================

describe('CONFIG — manager.ts', () => {
  it('ConfigManager is exported from src/config/manager.ts', async () => {
    const { ConfigManager } = await import('../../src/config/manager');
    expect(typeof ConfigManager).toBe('function');
  });

  it('ConfigManager has load(), save(), get(), set() methods', async () => {
    const { ConfigManager } = await import('../../src/config/manager');
    const tmpPath = join(os.tmpdir(), `nimbus-test-cfg-${Date.now()}.yaml`);
    const mgr = new ConfigManager(tmpPath);
    expect(typeof mgr.load).toBe('function');
    expect(typeof mgr.save).toBe('function');
    expect(typeof mgr.get).toBe('function');
    expect(typeof mgr.set).toBe('function');
  });

  it('ConfigManager.load() returns default config with version field', async () => {
    const { ConfigManager } = await import('../../src/config/manager');
    const tmpPath = join(os.tmpdir(), `nimbus-test-cfg2-${Date.now()}.yaml`);
    const mgr = new ConfigManager(tmpPath);
    const config = mgr.load();
    expect(config).toBeDefined();
    expect(typeof config.version).toBe('number');
  });
});

describe('CONFIG — mode-store.ts', () => {
  it('loadModeForCwd is exported from src/config/mode-store.ts', async () => {
    const { loadModeForCwd } = await import('../../src/config/mode-store');
    expect(typeof loadModeForCwd).toBe('function');
  });

  it('saveModeForCwd is exported from src/config/mode-store.ts', async () => {
    const { saveModeForCwd } = await import('../../src/config/mode-store');
    expect(typeof saveModeForCwd).toBe('function');
  });

  it('loadModeForCwd returns null for unknown cwd', async () => {
    const { loadModeForCwd } = await import('../../src/config/mode-store');
    const result = loadModeForCwd('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });
});

describe('CONFIG — profiles.ts', () => {
  it('loadProfile is exported from src/config/profiles.ts', async () => {
    const { loadProfile } = await import('../../src/config/profiles');
    expect(typeof loadProfile).toBe('function');
  });

  it('saveProfile is exported from src/config/profiles.ts', async () => {
    const { saveProfile } = await import('../../src/config/profiles');
    expect(typeof saveProfile).toBe('function');
  });

  it('listProfiles is exported from src/config/profiles.ts', async () => {
    const { listProfiles } = await import('../../src/config/profiles');
    expect(typeof listProfiles).toBe('function');
  });

  it('applyProfile is exported from src/config/profiles.ts', async () => {
    const { applyProfile } = await import('../../src/config/profiles');
    expect(typeof applyProfile).toBe('function');
  });

  it('listProfiles() returns an array', async () => {
    const { listProfiles } = await import('../../src/config/profiles');
    const profiles = listProfiles();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it('loadProfile() returns null for non-existent profile', async () => {
    const { loadProfile } = await import('../../src/config/profiles');
    const result = loadProfile('nonexistent-profile-xyz-abc');
    expect(result).toBeNull();
  });
});

describe('CONFIG — types.ts', () => {
  it('CONFIG_KEYS is exported from src/config/types.ts', async () => {
    const { CONFIG_KEYS } = await import('../../src/config/types');
    expect(Array.isArray(CONFIG_KEYS)).toBe(true);
    expect(CONFIG_KEYS.length).toBeGreaterThan(0);
  });

  it('CONFIG_KEYS entries have key, description, type fields', async () => {
    const { CONFIG_KEYS } = await import('../../src/config/types');
    const entry = CONFIG_KEYS[0];
    expect(typeof entry.key).toBe('string');
    expect(typeof entry.description).toBe('string');
    expect(typeof entry.type).toBe('string');
  });
});

describe('CONFIG — safety-policy.ts', () => {
  it('safety policy checks for "prod" in protectedEnvironments', () => {
    const source = src('src/config/safety-policy.ts');
    expect(source).toContain('prod');
    expect(source).toContain('protectedEnvironments');
  });

  it('requiresApproval is exported from safety-policy.ts', async () => {
    const { requiresApproval } = await import('../../src/config/safety-policy');
    expect(typeof requiresApproval).toBe('function');
  });

  it('requiresApproval returns true for "prod" environment', async () => {
    const { requiresApproval } = await import('../../src/config/safety-policy');
    const result = requiresApproval('apply', { operation: 'apply', type: 'terraform', environment: 'prod' });
    expect(result).toBe(true);
  });
});

describe('CONFIG — workspace-state.ts', () => {
  it('loadWorkspaceState is exported from workspace-state.ts', async () => {
    const { loadWorkspaceState } = await import('../../src/config/workspace-state');
    expect(typeof loadWorkspaceState).toBe('function');
  });

  it('saveWorkspaceState is exported from workspace-state.ts', async () => {
    const { saveWorkspaceState } = await import('../../src/config/workspace-state');
    expect(typeof saveWorkspaceState).toBe('function');
  });

  it('mergeWorkspaceState is exported from workspace-state.ts', async () => {
    const { mergeWorkspaceState } = await import('../../src/config/workspace-state');
    expect(typeof mergeWorkspaceState).toBe('function');
  });

  it('loadWorkspaceState returns empty object for unknown cwd', async () => {
    const { loadWorkspaceState } = await import('../../src/config/workspace-state');
    const state = loadWorkspaceState('/nonexistent/path/xyz-abc-123');
    expect(typeof state).toBe('object');
  });
});

// ============================================================================
// GENERATOR
// ============================================================================

describe('GENERATOR — terraform.ts', () => {
  it('TerraformProjectGenerator is exported from src/generator/terraform.ts', async () => {
    const { TerraformProjectGenerator } = await import('../../src/generator/terraform');
    expect(typeof TerraformProjectGenerator).toBe('function');
  });

  it('TerraformProjectGenerator has generate() method', async () => {
    const { TerraformProjectGenerator } = await import('../../src/generator/terraform');
    const gen = new TerraformProjectGenerator();
    expect(typeof gen.generate).toBe('function');
  });
});

describe('GENERATOR — kubernetes.ts', () => {
  it('KubernetesGenerator is exported from src/generator/kubernetes.ts', async () => {
    const { KubernetesGenerator } = await import('../../src/generator/kubernetes');
    expect(typeof KubernetesGenerator).toBe('function');
  });
});

describe('GENERATOR — helm.ts', () => {
  it('HelmGenerator is exported from src/generator/helm.ts', async () => {
    const { HelmGenerator } = await import('../../src/generator/helm');
    expect(typeof HelmGenerator).toBe('function');
  });
});

describe('GENERATOR — intent-parser.ts', () => {
  it('IntentParser is exported from src/generator/intent-parser.ts', async () => {
    const { IntentParser } = await import('../../src/generator/intent-parser');
    expect(typeof IntentParser).toBe('function');
  });

  it('NLUPattern type is defined in intent-parser.ts', () => {
    const source = src('src/generator/intent-parser.ts');
    expect(source).toContain('NLUPattern');
  });

  it('ConversationalIntent type is defined in intent-parser.ts', () => {
    const source = src('src/generator/intent-parser.ts');
    expect(source).toContain('ConversationalIntent');
  });
});

describe('GENERATOR — best-practices.ts', () => {
  it('BestPracticesEngine is exported from src/generator/best-practices.ts', async () => {
    const { BestPracticesEngine } = await import('../../src/generator/best-practices');
    expect(typeof BestPracticesEngine).toBe('function');
  });

  it('BestPracticesEngine has analyze() method', async () => {
    const { BestPracticesEngine } = await import('../../src/generator/best-practices');
    const engine = new BestPracticesEngine();
    expect(typeof engine.analyze).toBe('function');
  });

  it('BestPracticesEngine has analyzeAll() method', async () => {
    const { BestPracticesEngine } = await import('../../src/generator/best-practices');
    const engine = new BestPracticesEngine();
    expect(typeof engine.analyzeAll).toBe('function');
  });
});

// ============================================================================
// WIZARD
// ============================================================================

describe('WIZARD — index.ts', () => {
  it('createWizard is exported from src/wizard/', async () => {
    const { createWizard } = await import('../../src/wizard/index');
    expect(typeof createWizard).toBe('function');
  });

  it('Wizard class is exported from src/wizard/', async () => {
    const { Wizard } = await import('../../src/wizard/index');
    expect(typeof Wizard).toBe('function');
  });

  it('select is exported from src/wizard/', async () => {
    const { select } = await import('../../src/wizard/index');
    expect(typeof select).toBe('function');
  });

  it('confirm is exported from src/wizard/', async () => {
    const { confirm } = await import('../../src/wizard/index');
    expect(typeof confirm).toBe('function');
  });

  it('input is exported from src/wizard/', async () => {
    const { input } = await import('../../src/wizard/index');
    expect(typeof input).toBe('function');
  });

  it('multiSelect is exported from src/wizard/', async () => {
    const { multiSelect } = await import('../../src/wizard/index');
    expect(typeof multiSelect).toBe('function');
  });
});

describe('WIZARD — types.ts', () => {
  it('WizardStep interface has id, title, execute fields', () => {
    const source = src('src/wizard/types.ts');
    expect(source).toContain('id:');
    expect(source).toContain('title:');
    expect(source).toContain('execute:');
  });

  it('StepResult type exists with success field', () => {
    const source = src('src/wizard/types.ts');
    expect(source).toContain('StepResult');
    expect(source).toContain('success:');
  });
});

describe('WIZARD — approval.ts', () => {
  it('approval.ts exists in src/wizard/', () => {
    const exists = existsSync(join(process.cwd(), 'src/wizard/approval.ts'));
    expect(exists).toBe(true);
  });
});

// ============================================================================
// ENGINE
// ============================================================================

describe('ENGINE — orchestrator.ts', () => {
  it('AgentOrchestrator is exported from src/engine/orchestrator.ts', () => {
    const source = src('src/engine/orchestrator.ts');
    expect(source).toContain('AgentOrchestrator');
  });

  it('AgentOrchestrator class is importable', async () => {
    const mod = await import('../../src/engine/orchestrator');
    expect(typeof mod.AgentOrchestrator).toBe('function');
  });
});

describe('ENGINE — planner.ts', () => {
  it('Planner is exported from src/engine/planner.ts', async () => {
    const { Planner } = await import('../../src/engine/planner');
    expect(typeof Planner).toBe('function');
  });

  it('AgentTask interface is exported from planner.ts', () => {
    const source = src('src/engine/planner.ts');
    expect(source).toContain('AgentTask');
  });

  it('AgentPlan interface is exported from planner.ts', () => {
    const source = src('src/engine/planner.ts');
    expect(source).toContain('AgentPlan');
  });
});

describe('ENGINE — drift-detector.ts', () => {
  it('DriftDetector is exported from src/engine/drift-detector.ts', async () => {
    const { DriftDetector } = await import('../../src/engine/drift-detector');
    expect(typeof DriftDetector).toBe('function');
  });

  it('DriftReport type has resources and summary fields', () => {
    const source = src('src/engine/drift-detector.ts');
    expect(source).toContain('resources:');
    expect(source).toContain('summary:');
    expect(source).toContain('DriftReport');
  });
});

describe('ENGINE — cost-estimator.ts', () => {
  it('CostEstimator is exported from src/engine/cost-estimator.ts', async () => {
    const { CostEstimator } = await import('../../src/engine/cost-estimator');
    expect(typeof CostEstimator).toBe('function');
  });
});

describe('ENGINE — safety.ts', () => {
  it('SafetyManager is exported from src/engine/safety.ts', async () => {
    const { SafetyManager } = await import('../../src/engine/safety');
    expect(typeof SafetyManager).toBe('function');
  });

  it('SafetyManager has runPreExecutionChecks() method', async () => {
    const { SafetyManager } = await import('../../src/engine/safety');
    const sm = new SafetyManager();
    expect(typeof sm.runPreExecutionChecks).toBe('function');
  });
});

// ============================================================================
// SCANNERS
// ============================================================================

describe('SCANNERS — index.ts', () => {
  it('ProjectScanner is exported from src/scanners/index.ts', async () => {
    const { ProjectScanner } = await import('../../src/scanners/index');
    expect(typeof ProjectScanner).toBe('function');
  });

  it('ProjectScanner has scan() method', async () => {
    const { ProjectScanner } = await import('../../src/scanners/index');
    const scanner = new ProjectScanner();
    expect(typeof scanner.scan).toBe('function');
  });
});

describe('SCANNERS — iac-scanner.ts', () => {
  it('iac-scanner.ts exists', () => {
    const exists = existsSync(join(process.cwd(), 'src/scanners/iac-scanner.ts'));
    expect(exists).toBe(true);
  });

  it('iac-scanner.ts detects terraform', () => {
    const source = src('src/scanners/iac-scanner.ts');
    expect(source).toContain('terraform');
  });

  it('iac-scanner.ts detects kubernetes patterns', () => {
    const source = src('src/scanners/iac-scanner.ts');
    expect(source.toLowerCase()).toContain('kubernetes');
  });

  it('IaCScanner is exported from iac-scanner.ts', async () => {
    const { IaCScanner } = await import('../../src/scanners/iac-scanner');
    expect(typeof IaCScanner).toBe('function');
  });
});

describe('SCANNERS — cloud-scanner.ts', () => {
  it('cloud-scanner.ts exists', () => {
    const exists = existsSync(join(process.cwd(), 'src/scanners/cloud-scanner.ts'));
    expect(exists).toBe(true);
  });

  it('cloud-scanner.ts detects AWS', () => {
    const source = src('src/scanners/cloud-scanner.ts');
    expect(source.toLowerCase()).toContain('aws');
  });

  it('cloud-scanner.ts detects GCP', () => {
    const source = src('src/scanners/cloud-scanner.ts');
    expect(source.toLowerCase()).toContain('gcp');
  });

  it('cloud-scanner.ts detects Azure', () => {
    const source = src('src/scanners/cloud-scanner.ts');
    expect(source.toLowerCase()).toContain('azure');
  });

  it('CloudScanner is exported from cloud-scanner.ts', async () => {
    const { CloudScanner } = await import('../../src/scanners/cloud-scanner');
    expect(typeof CloudScanner).toBe('function');
  });
});
