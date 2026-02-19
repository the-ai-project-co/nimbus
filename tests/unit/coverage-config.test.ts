/**
 * Test: Coverage threshold configuration verification (Gap 14)
 *
 * Verifies that coverage threshold enforcement is properly configured
 * in the project tooling (package.json scripts, CI workflow).
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

describe('Coverage Threshold Configuration', () => {
  it('package.json test:coverage script includes --coverage-threshold flag', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const script = pkg.scripts['test:coverage'];

    expect(script).toBeDefined();
    expect(script).toContain('--coverage');
    expect(script).toContain('--coverage-threshold');

    // Extract threshold value
    const match = script.match(/--coverage-threshold=(\d+)/);
    expect(match).not.toBeNull();

    const threshold = parseInt(match![1], 10);
    expect(threshold).toBeGreaterThanOrEqual(80);
  });

  it('package.json test:coverage:check script exists for CI', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const script = pkg.scripts['test:coverage:check'];

    expect(script).toBeDefined();
    expect(script).toContain('--coverage-threshold');
  });

  it('CI workflow includes a coverage threshold check step', () => {
    const ciYaml = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');

    // Should have a step that checks coverage threshold
    expect(ciYaml).toContain('coverage-threshold');
    expect(ciYaml).toContain('Check coverage threshold');
  });

  it('bunfig.toml enables coverage by default for test runs', () => {
    const toml = readFileSync(join(ROOT, 'bunfig.toml'), 'utf-8');

    // The [test] section should have coverage = true
    expect(toml).toContain('[test]');
    expect(toml).toContain('coverage = true');
  });
});
