/**
 * Export Command Tests — G19
 *
 * Tests exportCommand for JSON, Markdown, HTML formats and
 * file-write / process.exit behaviors.
 *
 * The export command uses `await import('../sessions/manager')` dynamically,
 * so we use vi.mock at module scope (hoisted) and vi.doMock for the empty-
 * session scenario.
 *
 * writeFileSync is tested by spying on the module-level import inside the
 * command via a top-level vi.mock on 'node:fs'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  id: 'session-abc-123',
  name: 'Test Session',
  model: 'claude-3-5-sonnet',
  mode: 'build',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  cwd: '/tmp',
  tokenCount: 100,
  costUSD: 0.01,
  snapshotCount: 0,
};

const MOCK_MESSAGES = [
  { role: 'user', content: 'Hello agent' },
  { role: 'assistant', content: 'Hello! How can I help?' },
];

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

// Mock sessions/manager with a factory function so the mock survives
// dynamic import() calls inside exportCommand.
vi.mock('../sessions/manager', () => {
  const listFn = vi.fn(() => [MOCK_SESSION]);
  const loadConversationFn = vi.fn(() => MOCK_MESSAGES);
  return {
    SessionManager: {
      getInstance: vi.fn(() => ({
        list: listFn,
        loadConversation: loadConversationFn,
      })),
      resetInstance: vi.fn(),
    },
  };
});

// Track writeFileSync calls via a hoisted mock on node:fs
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let writeFileSyncMock: ReturnType<typeof vi.fn> = vi.fn();

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    // Delegate to the mutable reference so we can swap it per-test
    writeFileSync: (path: string, data: string, enc: string) => writeFileSyncMock(path, data, enc),
  };
});

// ---------------------------------------------------------------------------
// Import the command (uses hoisted mocks above)
// ---------------------------------------------------------------------------

import { exportCommand } from '../commands/export';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStdout(): { chunks: string[]; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
  return { chunks, restore: () => spy.mockRestore() };
}

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

describe('exportCommand JSON format (G19)', () => {
  it('writes valid JSON with session and messages fields', async () => {
    const { chunks, restore } = captureStdout();
    try {
      await exportCommand({ format: 'json' });
    } finally {
      restore();
    }

    const output = chunks.join('');
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output) as { session: { id: string }; messages: unknown[] };
    expect(parsed.session.id).toBe('session-abc-123');
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Markdown format
// ---------------------------------------------------------------------------

describe('exportCommand Markdown format (G19)', () => {
  it('returns markdown with session metadata table', async () => {
    const { chunks, restore } = captureStdout();
    try {
      await exportCommand({ format: 'md' });
    } finally {
      restore();
    }

    const output = chunks.join('');
    expect(output).toContain('# Nimbus Session Export');
    expect(output).toContain('session-abc-123');
    expect(output).toContain('## Conversation');
  });

  it('default format is markdown when not specified', async () => {
    const { chunks, restore } = captureStdout();
    try {
      await exportCommand({});
    } finally {
      restore();
    }

    const output = chunks.join('');
    expect(output).toContain('# Nimbus Session Export');
  });
});

// ---------------------------------------------------------------------------
// HTML format
// ---------------------------------------------------------------------------

describe('exportCommand HTML format (G19)', () => {
  it('returns HTML output with DOCTYPE and html tag', async () => {
    const { chunks, restore } = captureStdout();
    try {
      await exportCommand({ format: 'html' });
    } finally {
      restore();
    }

    const output = chunks.join('');
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('<html>');
    expect(output).toContain('Nimbus Session');
  });

  it('HTML output contains session name', async () => {
    const { chunks, restore } = captureStdout();
    try {
      await exportCommand({ format: 'html' });
    } finally {
      restore();
    }

    const output = chunks.join('');
    expect(output).toContain('Test Session');
  });
});

// ---------------------------------------------------------------------------
// File output
// ---------------------------------------------------------------------------

describe('exportCommand file output (G19)', () => {
  beforeEach(() => {
    // Reset to a fresh spy each test
    writeFileSyncMock = vi.fn();
  });

  it('calls writeFileSync when --output path is specified', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await exportCommand({ format: 'md', output: '/tmp/test-export.md' });
    } finally {
      logSpy.mockRestore();
    }

    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    const [filePath, content] = writeFileSyncMock.mock.calls[0] as [string, string, string];
    expect(filePath).toBe('/tmp/test-export.md');
    expect(content).toContain('Nimbus Session Export');
  });
});

// ---------------------------------------------------------------------------
// No session — process.exit(1)
// ---------------------------------------------------------------------------

describe('exportCommand no session (G19)', () => {
  it('calls process.exit(1) when no sessions exist', async () => {
    vi.resetModules();

    vi.doMock('../sessions/manager', () => ({
      SessionManager: {
        getInstance: vi.fn(() => ({
          list: vi.fn(() => []),
          loadConversation: vi.fn(() => []),
        })),
        resetInstance: vi.fn(),
      },
    }));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    try {
      const { exportCommand: exportCmd } = await import('../commands/export');
      await expect(exportCmd({})).rejects.toThrow('process.exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      errSpy.mockRestore();
      exitSpy.mockRestore();
      vi.resetModules();
    }
  });
});
