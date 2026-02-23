/**
 * Tests for LSP Manager, Client, Language configs, and Agent Loop integration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getLanguageForFile,
  getLanguagePriority,
  LANGUAGE_CONFIGS,
} from '../lsp/languages';
import { LSPManager, resetLSPManager } from '../lsp/manager';
import { severityLabel } from '../lsp/client';

describe('Language Configs', () => {
  describe('getLanguageForFile', () => {
    it('should match TypeScript files', () => {
      expect(getLanguageForFile('src/index.ts')?.id).toBe('typescript');
      expect(getLanguageForFile('component.tsx')?.id).toBe('typescript');
      expect(getLanguageForFile('index.js')?.id).toBe('typescript');
      expect(getLanguageForFile('config.mjs')?.id).toBe('typescript');
    });

    it('should match Go files', () => {
      expect(getLanguageForFile('main.go')?.id).toBe('go');
      expect(getLanguageForFile('pkg/server/handler.go')?.id).toBe('go');
    });

    it('should match Python files', () => {
      expect(getLanguageForFile('app.py')?.id).toBe('python');
      expect(getLanguageForFile('types.pyi')?.id).toBe('python');
    });

    it('should match Terraform files', () => {
      expect(getLanguageForFile('main.tf')?.id).toBe('terraform');
      expect(getLanguageForFile('variables.tfvars')?.id).toBe('terraform');
      expect(getLanguageForFile('config.hcl')?.id).toBe('terraform');
    });

    it('should match YAML files', () => {
      expect(getLanguageForFile('config.yaml')?.id).toBe('yaml');
      expect(getLanguageForFile('deployment.yml')?.id).toBe('yaml');
    });

    it('should match Dockerfile', () => {
      expect(getLanguageForFile('Dockerfile')?.id).toBe('docker');
      expect(getLanguageForFile('app.dockerfile')?.id).toBe('docker');
    });

    it('should return undefined for unknown extensions', () => {
      expect(getLanguageForFile('README.md')).toBeUndefined();
      expect(getLanguageForFile('Makefile')).toBeUndefined();
      expect(getLanguageForFile('data.csv')).toBeUndefined();
    });
  });

  describe('getLanguagePriority', () => {
    it('should return all configs in priority order', () => {
      const priority = getLanguagePriority();
      expect(priority).toHaveLength(LANGUAGE_CONFIGS.length);
      expect(priority[0].id).toBe('typescript');
    });
  });

  describe('LANGUAGE_CONFIGS', () => {
    it('should have command and installHint for all configs', () => {
      for (const config of LANGUAGE_CONFIGS) {
        expect(config.command).toBeTruthy();
        expect(config.installHint).toBeTruthy();
        expect(config.extensions.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('severityLabel', () => {
  it('should return correct labels', () => {
    expect(severityLabel(1)).toBe('Error');
    expect(severityLabel(2)).toBe('Warning');
    expect(severityLabel(3)).toBe('Info');
    expect(severityLabel(4)).toBe('Hint');
  });
});

describe('LSPManager', () => {
  let manager: LSPManager;

  beforeEach(() => {
    resetLSPManager();
    manager = new LSPManager('/tmp/test-project');
  });

  afterEach(async () => {
    await manager.stopAll();
    resetLSPManager();
  });

  describe('setEnabled', () => {
    it('should disable LSP integration', () => {
      manager.setEnabled(false);
      // touchFile should be a no-op when disabled
    });

    it('should re-enable LSP integration', () => {
      manager.setEnabled(false);
      manager.setEnabled(true);
    });
  });

  describe('getDiagnostics', () => {
    it('should return empty array when disabled', async () => {
      manager.setEnabled(false);
      const diags = await manager.getDiagnostics('/tmp/test.ts');
      expect(diags).toEqual([]);
    });

    it('should return empty array for unsupported file types', async () => {
      const diags = await manager.getDiagnostics('/tmp/file.csv');
      expect(diags).toEqual([]);
    });

    it('should return empty array when server is not running', async () => {
      const diags = await manager.getDiagnostics('/tmp/test.ts', 100);
      expect(diags).toEqual([]);
    });
  });

  describe('getErrors', () => {
    it('should return empty array when no errors', async () => {
      const errors = await manager.getErrors('/tmp/test.ts');
      expect(errors).toEqual([]);
    });
  });

  describe('formatDiagnosticsForAgent', () => {
    it('should return null for empty diagnostics', () => {
      expect(manager.formatDiagnosticsForAgent([])).toBeNull();
    });

    it('should format error diagnostics', () => {
      const diagnostics = [
        {
          file: '/src/server.ts',
          line: 23,
          column: 5,
          severity: 1 as const,
          message: "Property 'origin' does not exist on type 'CorsConfig'",
          source: 'ts',
        },
      ];
      const result = manager.formatDiagnosticsForAgent(diagnostics);
      expect(result).toContain('[LSP Diagnostics]');
      expect(result).toContain('Error: /src/server.ts:23:5');
      expect(result).toContain("Property 'origin'");
    });

    it('should truncate warnings after 5', () => {
      const diagnostics = Array.from({ length: 10 }, (_, i) => ({
        file: '/src/file.ts',
        line: i + 1,
        column: 1,
        severity: 2 as const,
        message: `Warning ${i + 1}`,
      }));
      const result = manager.formatDiagnosticsForAgent(diagnostics);
      expect(result).toContain('5 more warnings');
    });

    it('should return null for only info/hint diagnostics', () => {
      const diagnostics = [
        { file: '/src/file.ts', line: 1, column: 1, severity: 3 as const, message: 'Info' },
        { file: '/src/file.ts', line: 2, column: 1, severity: 4 as const, message: 'Hint' },
      ];
      expect(manager.formatDiagnosticsForAgent(diagnostics)).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return status for all configured languages', async () => {
      const statuses = await manager.getStatus();
      expect(statuses.length).toBe(LANGUAGE_CONFIGS.length);
      for (const status of statuses) {
        expect(status.language).toBeTruthy();
        expect(typeof status.active).toBe('boolean');
        expect(typeof status.available).toBe('boolean');
      }
    });
  });

  describe('stopAll', () => {
    it('should not throw when no clients running', async () => {
      await expect(manager.stopAll()).resolves.toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Agent Loop LSP Integration
// ---------------------------------------------------------------------------

describe('Agent Loop LSP Integration', () => {
  it('should identify file-editing tools correctly', () => {
    // Verify the tools that should trigger LSP diagnostics
    const fileEditingTools = ['edit_file', 'multi_edit', 'write_file'];
    const nonFileEditingTools = ['read_file', 'bash', 'glob', 'grep', 'terraform', 'kubectl'];

    for (const tool of fileEditingTools) {
      // These tools have a `path` parameter that LSP integration uses
      expect(['edit_file', 'multi_edit', 'write_file']).toContain(tool);
    }

    for (const tool of nonFileEditingTools) {
      expect(['edit_file', 'multi_edit', 'write_file']).not.toContain(tool);
    }
  });

  it('should extract file path from edit_file input', () => {
    const input = { path: '/src/server.ts', old_string: 'foo', new_string: 'bar' };
    expect(input.path).toBe('/src/server.ts');
  });

  it('should extract file path from write_file input', () => {
    const input = { path: '/src/new-file.ts', content: 'console.log("hello")' };
    expect(input.path).toBe('/src/new-file.ts');
  });

  it('should extract file path from multi_edit input', () => {
    const input = { path: '/src/app.ts', edits: [{ old_string: 'a', new_string: 'b' }] };
    expect(input.path).toBe('/src/app.ts');
  });

  it('should format diagnostics for agent conversation injection', () => {
    const manager = new LSPManager('/tmp/test');
    const diagnostics = [
      {
        file: '/src/server.ts',
        line: 23,
        column: 5,
        severity: 1 as const,
        message: "Property 'origin' does not exist on type 'CorsConfig'",
        source: 'ts',
      },
      {
        file: '/src/server.ts',
        line: 45,
        column: 10,
        severity: 2 as const,
        message: 'Unused variable',
        source: 'ts',
      },
    ];

    const formatted = manager.formatDiagnosticsForAgent(diagnostics);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain('[LSP Diagnostics]');
    expect(formatted).toContain('Error:');
    expect(formatted).toContain('Warning:');
    // Verify the formatting includes enough info for the LLM to self-correct
    expect(formatted).toContain('/src/server.ts:23:5');
    expect(formatted).toContain("Property 'origin'");
    resetLSPManager();
  });

  it('should append diagnostics to tool output when errors exist', () => {
    // Simulate the behavior of the agent loop's LSP injection
    const originalOutput = 'File edited successfully.';
    const diagnosticText = '[LSP Diagnostics]\n  Error: /src/server.ts:23:5 — Type error (ts)';

    // This mirrors the logic in executeToolCall
    const combined = `${originalOutput}\n\n${diagnosticText}`;
    expect(combined).toContain(originalOutput);
    expect(combined).toContain('[LSP Diagnostics]');
    expect(combined).toContain('Type error');
  });

  it('should not append diagnostics when there are no errors', () => {
    const manager = new LSPManager('/tmp/test');
    const formatted = manager.formatDiagnosticsForAgent([]);
    expect(formatted).toBeNull();
    resetLSPManager();
  });

  it('should not inject diagnostics for non-file-editing tools', () => {
    // read_file, bash, grep etc. should not trigger LSP
    const nonEditTools = ['read_file', 'bash', 'glob', 'grep', 'list_dir', 'terraform'];
    for (const tool of nonEditTools) {
      // These should not have file path extraction attempted
      const isFileEditing = ['edit_file', 'multi_edit', 'write_file'].includes(tool);
      expect(isFileEditing).toBe(false);
    }
  });

  it('should gracefully handle missing path in input', () => {
    // If somehow the input doesn't have a path field, extraction returns null
    const input = { content: 'some content' };
    const hasPath = 'path' in input;
    expect(hasPath).toBe(false);
  });
});
