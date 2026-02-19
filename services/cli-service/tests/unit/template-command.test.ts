import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock RestClient
const mockGet = mock(() => Promise.resolve({ success: true, data: [] }));
const mockPost = mock(() => Promise.resolve({ success: true, data: { id: 'test-id' } }));
const mockDelete = mock(() => Promise.resolve({ success: true }));

mock.module('@nimbus/shared-clients', () => ({
  RestClient: class {
    get = mockGet;
    post = mockPost;
    delete = mockDelete;
  },
  ServiceURLs: { STATE: 'http://localhost:3004' },
}));

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

describe('Template Command', () => {
  beforeEach(() => {
    mockGet.mockClear();
    mockPost.mockClear();
    mockDelete.mockClear();
  });

  test('templateCommand is exported', async () => {
    const { templateCommand } = await import('../../src/commands/template');
    expect(typeof templateCommand).toBe('function');
  });

  test('list subcommand calls GET /api/state/templates', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: [
        { id: '1', name: 'vpc-basic', type: 'terraform', createdAt: '2025-01-01' },
      ],
    });

    const { templateCommand } = await import('../../src/commands/template');
    await templateCommand('list', []);
    expect(mockGet).toHaveBeenCalled();
  });

  test('save subcommand calls POST /api/state/templates', async () => {
    const { templateCommand } = await import('../../src/commands/template');
    await templateCommand('save', ['--name', 'my-template']);
    expect(mockPost).toHaveBeenCalled();
  });

  test('delete subcommand calls DELETE endpoint', async () => {
    const { templateCommand } = await import('../../src/commands/template');
    await templateCommand('delete', ['test-id']);
    expect(mockDelete).toHaveBeenCalled();
  });

  test('get subcommand requires ID', async () => {
    const { templateCommand } = await import('../../src/commands/template');
    await templateCommand('get', []);
    // Should show error - no crash
  });
});
