import { describe, it, expect } from 'bun:test';

describe('Command Aliases', () => {
  // Test the alias resolution logic
  const COMMAND_ALIASES: Record<string, string[]> = {
    'pr': ['gh', 'pr'],
    'issue': ['gh', 'issue'],
    'read': ['fs', 'read'],
    'tree': ['fs', 'tree'],
    'search': ['fs', 'search'],
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
    });
  });
});
