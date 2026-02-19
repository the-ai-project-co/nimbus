import { describe, it, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Command Aliases', () => {
  // Test the alias resolution logic
  const COMMAND_ALIASES: Record<string, string[]> = {
    'pr': ['gh', 'pr'],
    'issue': ['gh', 'issue'],
    'read': ['fs', 'read'],
    'tree': ['fs', 'tree'],
    'search': ['fs', 'search'],
    'write': ['fs', 'write'],
    // Short command aliases
    'terraform': ['tf'],
    'k': ['k8s'],
    'g': ['generate'],
    'h': ['helm'],
  };

  function resolveAlias(args: string[]): string[] {
    if (COMMAND_ALIASES[args[0]]) {
      return [...COMMAND_ALIASES[args[0]], ...args.slice(1)];
    }
    return args;
  }

  describe('GitHub aliases', () => {
    it('should resolve "pr list" to "gh pr list"', () => {
      const result = resolveAlias(['pr', 'list']);
      expect(result).toEqual(['gh', 'pr', 'list']);
    });

    it('should resolve "pr create" to "gh pr create"', () => {
      const result = resolveAlias(['pr', 'create']);
      expect(result).toEqual(['gh', 'pr', 'create']);
    });

    it('should resolve "pr view 123" to "gh pr view 123"', () => {
      const result = resolveAlias(['pr', 'view', '123']);
      expect(result).toEqual(['gh', 'pr', 'view', '123']);
    });

    it('should resolve "pr merge 123" to "gh pr merge 123"', () => {
      const result = resolveAlias(['pr', 'merge', '123']);
      expect(result).toEqual(['gh', 'pr', 'merge', '123']);
    });

    it('should resolve "issue list" to "gh issue list"', () => {
      const result = resolveAlias(['issue', 'list']);
      expect(result).toEqual(['gh', 'issue', 'list']);
    });

    it('should resolve "issue create" to "gh issue create"', () => {
      const result = resolveAlias(['issue', 'create']);
      expect(result).toEqual(['gh', 'issue', 'create']);
    });

    it('should resolve "issue view 42" to "gh issue view 42"', () => {
      const result = resolveAlias(['issue', 'view', '42']);
      expect(result).toEqual(['gh', 'issue', 'view', '42']);
    });
  });

  describe('File system aliases', () => {
    it('should resolve "read package.json" to "fs read package.json"', () => {
      const result = resolveAlias(['read', 'package.json']);
      expect(result).toEqual(['fs', 'read', 'package.json']);
    });

    it('should resolve "tree src" to "fs tree src"', () => {
      const result = resolveAlias(['tree', 'src']);
      expect(result).toEqual(['fs', 'tree', 'src']);
    });

    it('should resolve "search pattern" to "fs search pattern"', () => {
      const result = resolveAlias(['search', 'pattern']);
      expect(result).toEqual(['fs', 'search', 'pattern']);
    });

    it('should resolve "search pattern ./src" to "fs search pattern ./src"', () => {
      const result = resolveAlias(['search', 'pattern', './src']);
      expect(result).toEqual(['fs', 'search', 'pattern', './src']);
    });

    it('should resolve "write file.txt content" to "fs write file.txt content"', () => {
      const result = resolveAlias(['write', 'file.txt', 'content']);
      expect(result).toEqual(['fs', 'write', 'file.txt', 'content']);
    });
  });

  // ==========================================
  // Short command aliases (Gap 10)
  // ==========================================

  describe('Short command aliases', () => {
    it('should resolve "terraform init" to "tf init"', () => {
      const result = resolveAlias(['terraform', 'init']);
      expect(result).toEqual(['tf', 'init']);
    });

    it('should resolve "terraform plan" to "tf plan"', () => {
      const result = resolveAlias(['terraform', 'plan']);
      expect(result).toEqual(['tf', 'plan']);
    });

    it('should resolve "terraform apply" to "tf apply"', () => {
      const result = resolveAlias(['terraform', 'apply']);
      expect(result).toEqual(['tf', 'apply']);
    });

    it('should resolve "terraform fmt" to "tf fmt"', () => {
      const result = resolveAlias(['terraform', 'fmt']);
      expect(result).toEqual(['tf', 'fmt']);
    });

    it('should resolve "terraform workspace list" to "tf workspace list"', () => {
      const result = resolveAlias(['terraform', 'workspace', 'list']);
      expect(result).toEqual(['tf', 'workspace', 'list']);
    });

    it('should resolve "k get pods" to "k8s get pods"', () => {
      const result = resolveAlias(['k', 'get', 'pods']);
      expect(result).toEqual(['k8s', 'get', 'pods']);
    });

    it('should resolve "k apply -f manifest.yaml" to "k8s apply -f manifest.yaml"', () => {
      const result = resolveAlias(['k', 'apply', '-f', 'manifest.yaml']);
      expect(result).toEqual(['k8s', 'apply', '-f', 'manifest.yaml']);
    });

    it('should resolve "k logs my-pod" to "k8s logs my-pod"', () => {
      const result = resolveAlias(['k', 'logs', 'my-pod']);
      expect(result).toEqual(['k8s', 'logs', 'my-pod']);
    });

    it('should resolve "g terraform" to "generate terraform"', () => {
      const result = resolveAlias(['g', 'terraform']);
      expect(result).toEqual(['generate', 'terraform']);
    });

    it('should resolve "g k8s" to "generate k8s"', () => {
      const result = resolveAlias(['g', 'k8s']);
      expect(result).toEqual(['generate', 'k8s']);
    });

    it('should resolve "g helm" to "generate helm"', () => {
      const result = resolveAlias(['g', 'helm']);
      expect(result).toEqual(['generate', 'helm']);
    });

    it('should resolve "h list" to "helm list"', () => {
      const result = resolveAlias(['h', 'list']);
      expect(result).toEqual(['helm', 'list']);
    });

    it('should resolve "h install my-release my-chart" to "helm install my-release my-chart"', () => {
      const result = resolveAlias(['h', 'install', 'my-release', 'my-chart']);
      expect(result).toEqual(['helm', 'install', 'my-release', 'my-chart']);
    });

    it('should resolve "h upgrade my-release my-chart" to "helm upgrade my-release my-chart"', () => {
      const result = resolveAlias(['h', 'upgrade', 'my-release', 'my-chart']);
      expect(result).toEqual(['helm', 'upgrade', 'my-release', 'my-chart']);
    });
  });

  describe('Non-aliased commands', () => {
    it('should not modify "gh pr list"', () => {
      const result = resolveAlias(['gh', 'pr', 'list']);
      expect(result).toEqual(['gh', 'pr', 'list']);
    });

    it('should not modify "fs read file.txt"', () => {
      const result = resolveAlias(['fs', 'read', 'file.txt']);
      expect(result).toEqual(['fs', 'read', 'file.txt']);
    });

    it('should not modify "chat"', () => {
      const result = resolveAlias(['chat']);
      expect(result).toEqual(['chat']);
    });

    it('should not modify "help"', () => {
      const result = resolveAlias(['help']);
      expect(result).toEqual(['help']);
    });

    it('should not modify "generate terraform"', () => {
      const result = resolveAlias(['generate', 'terraform']);
      expect(result).toEqual(['generate', 'terraform']);
    });

    it('should not modify "tf plan"', () => {
      const result = resolveAlias(['tf', 'plan']);
      expect(result).toEqual(['tf', 'plan']);
    });

    it('should not modify "k8s get pods"', () => {
      const result = resolveAlias(['k8s', 'get', 'pods']);
      expect(result).toEqual(['k8s', 'get', 'pods']);
    });

    it('should not modify "helm list"', () => {
      const result = resolveAlias(['helm', 'list']);
      expect(result).toEqual(['helm', 'list']);
    });
  });

  describe('Re-exported command functions', () => {
    it('should export pr commands as aliases', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.prListCommand).toBe('function');
      expect(typeof commands.prCreateCommand).toBe('function');
      expect(typeof commands.prViewCommand).toBe('function');
      expect(typeof commands.prMergeCommand).toBe('function');
    });

    it('should export issue commands as aliases', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.issueListCommand).toBe('function');
      expect(typeof commands.issueCreateCommand).toBe('function');
      expect(typeof commands.issueViewCommand).toBe('function');
    });

    it('should export fs commands as aliases', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.readCommand).toBe('function');
      expect(typeof commands.searchCommand).toBe('function');
      expect(typeof commands.writeCommand).toBe('function');
      expect(typeof commands.diffCommand).toBe('function');
    });

    it('should export terraformCommand alias for tfCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.terraformCommand).toBe('function');
      // Verify it is the same function as tfCommand
      expect(commands.terraformCommand).toBe(commands.tfCommand);
    });

    it('should export kCommand alias for k8sCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.kCommand).toBe('function');
      expect(commands.kCommand).toBe(commands.k8sCommand);
    });

    it('should export hCommand alias for helmCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.hCommand).toBe('function');
      expect(commands.hCommand).toBe(commands.helmCommand);
    });

    it('should export gCommand alias for generateTerraformCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.gCommand).toBe('function');
    });
  });

  // ==========================================
  // Server-side alias wiring tests
  // ==========================================

  describe('Server-side COMMAND_ALIASES map', () => {
    let serverSource: string;

    it('should have terraform -> tf alias in server', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain("'terraform': ['tf']");
    });

    it('should have k -> k8s alias in server', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain("'k': ['k8s']");
    });

    it('should have g -> generate alias in server', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain("'g': ['generate']");
    });

    it('should have h -> helm alias in server', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain("'h': ['helm']");
    });

    it('should have write -> fs write alias in server', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain("'write': ['fs', 'write']");
    });

    it('should list new aliases in help text', async () => {
      serverSource = await fs.readFile(
        path.resolve(__dirname, '../../src/server.ts'),
        'utf-8'
      );
      expect(serverSource).toContain('nimbus terraform <cmd>');
      expect(serverSource).toContain('nimbus k <cmd>');
      expect(serverSource).toContain('nimbus g <type>');
      expect(serverSource).toContain('nimbus h <cmd>');
    });
  });
});
