/**
 * Analyze Command
 * Codebase analysis and refactoring suggestions
 */

import { ui } from '../../wizard/ui';
import type { AnalyzeOptions, CodeAnalysis, RefactoringSuggestion } from '../../types';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Parse analyze options
 */
export function parseAnalyzeOptions(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = {
    type: 'all',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--type' && args[i + 1]) {
      options.type = args[++i] as AnalyzeOptions['type'];
    } else if (arg === '--path' && args[i + 1]) {
      options.path = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--security') {
      // Shortcut for --type security
      options.type = 'security';
    } else if (arg === '--compliance' && args[i + 1]) {
      // Set compliance standard (soc2, hipaa, pci)
      options.type = 'security';
      (options as any).compliance = args[++i];
    } else if (!arg.startsWith('-') && !options.path) {
      options.path = arg;
    }
  }

  return options;
}

/**
 * Get files to analyze
 */
function getFilesToAnalyze(basePath: string, extensions: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .git, etc.
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walk(basePath);
  return files;
}

/**
 * Analyze a single file for potential improvements
 */
function analyzeFile(filePath: string, type: AnalyzeOptions['type']): RefactoringSuggestion[] {
  const suggestions: RefactoringSuggestion[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(process.cwd(), filePath);

    // Simple pattern-based analysis
    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Complexity: Long lines
      if (type === 'all' || type === 'refactor') {
        if (line.length > 120) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'style',
            severity: 'info',
            explanation: `Line exceeds 120 characters (${line.length}). Consider breaking it up.`,
          });
        }

        // Nested callbacks (callback hell indicator)
        const nestedCallbacks = (line.match(/\)\s*=>\s*\{/g) || []).length;
        if (nestedCallbacks >= 2) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'complexity',
            severity: 'warning',
            explanation:
              'Multiple nested arrow functions detected. Consider extracting to named functions.',
          });
        }

        // TODO/FIXME comments
        if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'style',
            severity: 'info',
            explanation: 'TODO/FIXME comment found. Consider addressing or tracking this.',
          });
        }
      }

      // Security checks
      if (type === 'all' || type === 'security') {
        // Hardcoded secrets patterns (variable names or quoted strings)
        if (/\b(?:password|secret|api[_-]?key|token)\b\s*[:=]/i.test(line)) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'security',
            severity: 'error',
            explanation:
              'Potential hardcoded credential detected. Use environment variables instead.',
          });
        }

        // eval() usage
        if (/\beval\s*\(/.test(line)) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'security',
            severity: 'error',
            explanation: 'eval() usage detected. This can lead to code injection vulnerabilities.',
          });
        }

        // SQL injection potential
        if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/i.test(line)) {
          suggestions.push({
            file: relativePath,
            line: lineNum,
            type: 'security',
            severity: 'warning',
            explanation:
              'Potential SQL injection. Use parameterized queries instead of string interpolation.',
          });
        }
      }

      // Documentation checks
      if (type === 'all' || type === 'docs') {
        // Functions without JSDoc
        if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line)) {
          const prevLine = index > 0 ? lines[index - 1] : '';
          if (!/\*\/\s*$/.test(prevLine)) {
            suggestions.push({
              file: relativePath,
              line: lineNum,
              type: 'style',
              severity: 'info',
              explanation: 'Function lacks JSDoc documentation.',
            });
          }
        }
      }
    });

    // File-level checks
    if (type === 'all' || type === 'refactor') {
      // Large file
      if (lines.length > 500) {
        suggestions.push({
          file: relativePath,
          line: 1,
          type: 'complexity',
          severity: 'warning',
          explanation: `File has ${lines.length} lines. Consider splitting into smaller modules.`,
        });
      }
    }
  } catch {
    // Skip files we can't read
  }

  return suggestions;
}

/**
 * Display severity with color
 */
function formatSeverity(severity: RefactoringSuggestion['severity']): string {
  switch (severity) {
    case 'error':
      return ui.color('ERROR', 'red');
    case 'warning':
      return ui.color('WARN', 'yellow');
    case 'info':
    default:
      return ui.color('INFO', 'blue');
  }
}

/**
 * Analyze command
 */
export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  const targetPath = options.path || process.cwd();

  if (!fs.existsSync(targetPath)) {
    ui.error(`Path not found: ${targetPath}`);
    return;
  }

  ui.header('Nimbus Analyze', targetPath);
  ui.startSpinner({ message: 'Analyzing codebase...' });

  // Get files to analyze
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
  const files = getFilesToAnalyze(targetPath, extensions);

  if (files.length === 0) {
    ui.stopSpinnerSuccess('No files found to analyze');
    return;
  }

  // Analyze files
  const allSuggestions: RefactoringSuggestion[] = [];

  for (const file of files) {
    const suggestions = analyzeFile(file, options.type);
    allSuggestions.push(...suggestions);
  }

  ui.stopSpinnerSuccess(`Analyzed ${files.length} files`);

  // Track analysis completion
  try {
    const { trackEvent } = await import('../../telemetry');
    trackEvent('analysis_completed', {
      filesAnalyzed: files.length,
      suggestionsCount: allSuggestions.length,
    });
  } catch {
    /* telemetry failure is non-critical */
  }

  // Build analysis result
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const s of allSuggestions) {
    byType[s.type] = (byType[s.type] || 0) + 1;
    bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
  }

  const analysis: CodeAnalysis = {
    path: targetPath,
    analyzedAt: new Date().toISOString(),
    summary: {
      filesAnalyzed: files.length,
      suggestionsCount: allSuggestions.length,
      byType,
      bySeverity,
    },
    suggestions: allSuggestions,
  };

  if (options.json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  // Display results
  ui.newLine();
  ui.section('Summary');
  ui.print(`  Files analyzed:    ${analysis.summary.filesAnalyzed}`);
  ui.print(`  Total suggestions: ${analysis.summary.suggestionsCount}`);

  if (analysis.summary.suggestionsCount > 0) {
    ui.newLine();
    ui.print('  By severity:');
    if (bySeverity.error) {
      ui.print(`    ${ui.color('Errors:', 'red')}   ${bySeverity.error}`);
    }
    if (bySeverity.warning) {
      ui.print(`    ${ui.color('Warnings:', 'yellow')} ${bySeverity.warning}`);
    }
    if (bySeverity.info) {
      ui.print(`    ${ui.color('Info:', 'blue')}     ${bySeverity.info}`);
    }

    ui.newLine();
    ui.print('  By type:');
    for (const [type, count] of Object.entries(byType)) {
      ui.print(`    ${type}: ${count}`);
    }
  }

  // Show top suggestions
  if (allSuggestions.length > 0) {
    ui.section('Suggestions');

    // Sort by severity (error > warning > info)
    const sorted = allSuggestions.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    // Show top 20
    const toShow = sorted.slice(0, 20);

    for (const suggestion of toShow) {
      ui.newLine();
      ui.print(`  ${formatSeverity(suggestion.severity)} ${suggestion.file}:${suggestion.line}`);
      ui.print(`    ${ui.dim(suggestion.type)}: ${suggestion.explanation}`);

      if (suggestion.diff) {
        ui.sideBySideDiff({
          original: suggestion.original || '',
          modified: suggestion.suggested || '',
        });
      }
    }

    if (allSuggestions.length > 20) {
      ui.newLine();
      ui.dim(`  ... and ${allSuggestions.length - 20} more suggestions`);
      ui.dim(`  Use --json for full output`);
    }
  } else {
    ui.newLine();
    ui.success('No issues found!');
  }

  ui.newLine();
}
