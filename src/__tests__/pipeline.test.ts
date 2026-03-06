/**
 * Pipeline Command Tests — H2
 *
 * Validates provider auto-detection.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectProvider } from '../commands/pipeline';

describe('detectProvider (H2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-pipeline-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects GitHub Actions from .github/workflows directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    expect(detectProvider(tmpDir)).toBe('github');
  });

  test('detects GitLab CI from .gitlab-ci.yml', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'stages:\n  - test\n', 'utf-8');
    expect(detectProvider(tmpDir)).toBe('gitlab');
  });

  test('detects CircleCI from .circleci/config.yml', () => {
    fs.mkdirSync(path.join(tmpDir, '.circleci'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.circleci', 'config.yml'), 'version: 2\n', 'utf-8');
    expect(detectProvider(tmpDir)).toBe('circleci');
  });

  test('returns null when no CI config is found', () => {
    expect(detectProvider(tmpDir)).toBeNull();
  });

  test('prefers GitHub over GitLab when both exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.gitlab-ci.yml'), '{}', 'utf-8');
    // GitHub is checked first
    expect(detectProvider(tmpDir)).toBe('github');
  });
});
