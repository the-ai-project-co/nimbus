/**
 * CLI Run Mode Tests
 *
 * Validates the parseRunArgs function that converts CLI arguments into
 * structured RunOptions for the non-interactive nimbus run command.
 */

import { describe, test, expect } from 'bun:test';
import { parseRunArgs, type RunOptions } from '../cli/run';

// ===========================================================================
// parseRunArgs
// ===========================================================================

describe('parseRunArgs', () => {
  test('parses prompt from positional args', () => {
    const result = parseRunArgs(['deploy', 'staging', 'environment']);
    expect(result.prompt).toBe('deploy staging environment');
  });

  test('parses --format json', () => {
    const result = parseRunArgs(['--format', 'json', 'some', 'prompt']);
    expect(result.format).toBe('json');
    expect(result.prompt).toBe('some prompt');
  });

  test('parses --json shorthand', () => {
    const result = parseRunArgs(['--json', 'prompt here']);
    expect(result.format).toBe('json');
  });

  test('parses --auto-approve', () => {
    const result = parseRunArgs(['--auto-approve', 'do', 'stuff']);
    expect(result.autoApprove).toBe(true);
  });

  test('parses --stdin flag', () => {
    const result = parseRunArgs(['--stdin']);
    expect(result.stdin).toBe(true);
  });

  test('parses --model override', () => {
    const result = parseRunArgs(['--model', 'anthropic/claude-haiku-4-5', 'prompt']);
    expect(result.model).toBe('anthropic/claude-haiku-4-5');
  });

  test('parses --mode deploy', () => {
    const result = parseRunArgs(['--mode', 'deploy', 'run', 'deployment']);
    expect(result.mode).toBe('deploy');
  });

  test('parses --max-turns', () => {
    const result = parseRunArgs(['--max-turns', '10', 'prompt']);
    expect(result.maxTurns).toBe(10);
  });

  test('parses -y short form for auto-approve', () => {
    const result = parseRunArgs(['-y', 'do', 'it']);
    expect(result.autoApprove).toBe(true);
    expect(result.prompt).toBe('do it');
  });

  test('handles empty args', () => {
    const result = parseRunArgs([]);
    expect(result.prompt).toBe('');
    expect(result.format).toBe('text');
    expect(result.autoApprove).toBe(false);
    expect(result.stdin).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.mode).toBe('build');
    expect(result.maxTurns).toBe(50);
  });

  test('joins multiple positional args as prompt', () => {
    const result = parseRunArgs(['fix', 'the', 'failing', 'tests']);
    expect(result.prompt).toBe('fix the failing tests');
  });

  test('default mode is "build"', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.mode).toBe('build');
  });

  test('default maxTurns is 50', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.maxTurns).toBe(50);
  });

  test('default format is "text"', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.format).toBe('text');
  });

  test('combines multiple flags', () => {
    const result = parseRunArgs([
      '--format', 'json',
      '--auto-approve',
      '--mode', 'deploy',
      '--max-turns', '25',
      '--model', 'openai/gpt-4',
      'deploy', 'everything',
    ]);
    expect(result.format).toBe('json');
    expect(result.autoApprove).toBe(true);
    expect(result.mode).toBe('deploy');
    expect(result.maxTurns).toBe(25);
    expect(result.model).toBe('openai/gpt-4');
    expect(result.prompt).toBe('deploy everything');
  });
});
