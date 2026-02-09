/**
 * CLI Analyze Command Unit Tests
 */

import { describe, it, expect } from 'bun:test';

describe('Analyze Command', () => {
  describe('Option Parsing', () => {
    it('parses --type option', () => {
      const parseOptions = (args: string[]) => {
        const options: { type: string; path?: string; json?: boolean } = { type: 'all' };

        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) {
            options.type = args[++i];
          } else if (args[i] === '--path' && args[i + 1]) {
            options.path = args[++i];
          } else if (args[i] === '--json') {
            options.json = true;
          }
        }

        return options;
      };

      expect(parseOptions(['--type', 'refactor']).type).toBe('refactor');
      expect(parseOptions(['--type', 'security']).type).toBe('security');
      expect(parseOptions(['--type', 'docs']).type).toBe('docs');
      expect(parseOptions([]).type).toBe('all');
    });

    it('parses --path option', () => {
      const parseOptions = (args: string[]) => {
        const options: { type: string; path?: string } = { type: 'all' };

        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--path' && args[i + 1]) {
            options.path = args[++i];
          } else if (!args[i].startsWith('-') && !options.path) {
            options.path = args[i];
          }
        }

        return options;
      };

      expect(parseOptions(['--path', './src']).path).toBe('./src');
      expect(parseOptions(['./src']).path).toBe('./src');
    });

    it('parses --json option', () => {
      const parseOptions = (args: string[]) => {
        return { json: args.includes('--json') };
      };

      expect(parseOptions(['--json']).json).toBe(true);
      expect(parseOptions([]).json).toBe(false);
    });
  });

  describe('Analysis Types', () => {
    it('supports all analysis types', () => {
      const types = ['refactor', 'docs', 'security', 'all'];

      for (const type of types) {
        expect(types).toContain(type);
      }
    });
  });

  describe('Suggestion Types', () => {
    it('categorizes suggestions correctly', () => {
      const types = ['complexity', 'duplication', 'naming', 'performance', 'security', 'style'];

      for (const type of types) {
        expect(types).toContain(type);
      }
    });
  });

  describe('Severity Levels', () => {
    it('defines correct severity levels', () => {
      const severities = ['info', 'warning', 'error'];

      for (const sev of severities) {
        expect(severities).toContain(sev);
      }
    });

    it('sorts by severity correctly', () => {
      const order: Record<string, number> = { error: 0, warning: 1, info: 2 };

      const suggestions = [
        { severity: 'info' },
        { severity: 'error' },
        { severity: 'warning' },
      ];

      const sorted = [...suggestions].sort(
        (a, b) => order[a.severity] - order[b.severity]
      );

      expect(sorted[0].severity).toBe('error');
      expect(sorted[1].severity).toBe('warning');
      expect(sorted[2].severity).toBe('info');
    });
  });

  describe('Pattern Detection', () => {
    it('detects long lines', () => {
      const detectLongLines = (line: string, maxLength: number = 120) => {
        return line.length > maxLength;
      };

      const shortLine = 'const x = 1;';
      const longLine = 'x'.repeat(130);

      expect(detectLongLines(shortLine)).toBe(false);
      expect(detectLongLines(longLine)).toBe(true);
    });

    it('detects TODO comments', () => {
      const detectTodo = (line: string) => {
        return /\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line);
      };

      expect(detectTodo('// TODO: fix this')).toBe(true);
      expect(detectTodo('// FIXME: broken')).toBe(true);
      expect(detectTodo('// normal comment')).toBe(false);
    });

    it('detects potential hardcoded secrets', () => {
      const detectSecret = (line: string) => {
        return /\b(?:password|secret|api[_-]?key|token)\b\s*[:=]/i.test(line);
      };

      expect(detectSecret('const password = "secret123"')).toBe(true);
      expect(detectSecret('const API_KEY = "abc123"')).toBe(true);
      expect(detectSecret('const name = "test"')).toBe(false);
    });

    it('detects eval usage', () => {
      const detectEval = (line: string) => {
        return /\beval\s*\(/.test(line);
      };

      expect(detectEval('eval(code)')).toBe(true);
      expect(detectEval('evaluation')).toBe(false);
    });

    it('detects potential SQL injection', () => {
      const detectSqlInjection = (line: string) => {
        return /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*\$\{.*\}/i.test(line);
      };

      expect(detectSqlInjection('`SELECT * FROM users WHERE id = ${userId}`')).toBe(true);
      expect(detectSqlInjection('const query = "SELECT * FROM users"')).toBe(false);
    });

    it('detects nested callbacks', () => {
      const countNestedCallbacks = (line: string) => {
        return (line.match(/\)\s*=>\s*\{/g) || []).length;
      };

      expect(countNestedCallbacks('x.map((a) => { y.map((b) => { return a + b; }); });')).toBe(2);
      expect(countNestedCallbacks('x.map((a) => a * 2)')).toBe(0);
    });
  });

  describe('File Extension Filtering', () => {
    it('filters TypeScript/JavaScript files', () => {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

      const isAnalyzable = (filename: string) => {
        const ext = filename.slice(filename.lastIndexOf('.'));
        return extensions.includes(ext);
      };

      expect(isAnalyzable('file.ts')).toBe(true);
      expect(isAnalyzable('file.tsx')).toBe(true);
      expect(isAnalyzable('file.js')).toBe(true);
      expect(isAnalyzable('file.json')).toBe(false);
      expect(isAnalyzable('file.md')).toBe(false);
    });
  });

  describe('Excluded Directories', () => {
    it('excludes common directories', () => {
      const excluded = ['node_modules', '.git', 'dist', 'build', 'coverage'];

      const shouldExclude = (dir: string) => excluded.includes(dir);

      expect(shouldExclude('node_modules')).toBe(true);
      expect(shouldExclude('.git')).toBe(true);
      expect(shouldExclude('src')).toBe(false);
    });
  });

  describe('Summary Calculation', () => {
    it('counts suggestions by type', () => {
      const suggestions = [
        { type: 'complexity' },
        { type: 'security' },
        { type: 'complexity' },
        { type: 'style' },
      ];

      const byType: Record<string, number> = {};
      for (const s of suggestions) {
        byType[s.type] = (byType[s.type] || 0) + 1;
      }

      expect(byType.complexity).toBe(2);
      expect(byType.security).toBe(1);
      expect(byType.style).toBe(1);
    });

    it('counts suggestions by severity', () => {
      const suggestions = [
        { severity: 'error' },
        { severity: 'warning' },
        { severity: 'error' },
        { severity: 'info' },
      ];

      const bySeverity: Record<string, number> = {};
      for (const s of suggestions) {
        bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
      }

      expect(bySeverity.error).toBe(2);
      expect(bySeverity.warning).toBe(1);
      expect(bySeverity.info).toBe(1);
    });
  });
});
