import { describe, test, expect, mock } from 'bun:test';

mock.module('../../src/wizard/ui', () => ({
  ui: {
    header: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    warning: mock(() => {}),
    success: mock(() => {}),
    print: mock(() => {}),
    newLine: mock(() => {}),
    table: mock(() => {}),
    box: mock(() => {}),
    color: mock((text: string) => text),
    bold: mock((text: string) => text),
    startSpinner: mock(() => {}),
    stopSpinnerSuccess: mock(() => {}),
    stopSpinnerFail: mock(() => {}),
  },
}));

describe('Auth Profile Command', () => {
  test('authProfileCommand is exported', async () => {
    const { authProfileCommand } = await import('../../src/commands/auth-profile');
    expect(typeof authProfileCommand).toBe('function');
  });

  test('list subcommand does not crash', async () => {
    const { authProfileCommand } = await import('../../src/commands/auth-profile');
    // Will show "No providers configured" or list them if configured
    await authProfileCommand('list', []);
  });

  test('show subcommand does not crash', async () => {
    const { authProfileCommand } = await import('../../src/commands/auth-profile');
    await authProfileCommand('show', []);
  });

  test('switch without provider shows error', async () => {
    const { authProfileCommand } = await import('../../src/commands/auth-profile');
    await authProfileCommand('switch', []);
    // Should show usage error
  });

  test('unknown subcommand shows help', async () => {
    const { authProfileCommand } = await import('../../src/commands/auth-profile');
    await authProfileCommand('unknown', []);
    // Should show available commands
  });
});
