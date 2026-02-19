import { describe, it, expect } from 'bun:test';

describe('Ink Components', () => {
  it('Questionnaire module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Questionnaire');
    expect(typeof mod.Questionnaire).toBe('function');
  });

  it('Table module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Table');
    expect(typeof mod.Table).toBe('function');
  });

  it('Tree module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Tree');
    expect(typeof mod.Tree).toBe('function');
  });

  it('Diff module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Diff');
    expect(typeof mod.Diff).toBe('function');
  });

  it('PRList module exports a function', async () => {
    const mod = await import('../../src/ui/ink/PRList');
    expect(typeof mod.PRList).toBe('function');
  });

  it('IssueList module exports a function', async () => {
    const mod = await import('../../src/ui/ink/IssueList');
    expect(typeof mod.IssueList).toBe('function');
  });

  it('GitStatus module exports a function', async () => {
    const mod = await import('../../src/ui/ink/GitStatus');
    expect(typeof mod.GitStatus).toBe('function');
  });

  it('index re-exports all components', async () => {
    const mod = await import('../../src/ui/ink/index');
    expect(mod.Questionnaire).toBeDefined();
    expect(mod.Table).toBeDefined();
    expect(mod.Tree).toBeDefined();
    expect(mod.Diff).toBeDefined();
    expect(mod.PRList).toBeDefined();
    expect(mod.IssueList).toBeDefined();
    expect(mod.GitStatus).toBeDefined();
  });

  it('each component export is a callable function', async () => {
    const mod = await import('../../src/ui/ink/index');
    const componentNames = [
      'Questionnaire',
      'Table',
      'Tree',
      'Diff',
      'PRList',
      'IssueList',
      'GitStatus',
    ] as const;

    for (const name of componentNames) {
      expect(typeof mod[name]).toBe('function');
    }
  });

  it('startInkChat is exported from index', async () => {
    const mod = await import('../../src/ui/ink/index');
    expect(typeof mod.startInkChat).toBe('function');
  });
});
