/**
 * Tool Pipeline End-to-End Tests
 *
 * Tests the full tool execution pipeline with real filesystem
 * operations — from tool registration through Zod validation to execution.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  multiEditTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  standardTools,
} from '../../src/tools/schemas/standard';
import { devopsTools } from '../../src/tools/schemas/devops';
import { ToolRegistry } from '../../src/tools/schemas/types';
import type { ToolResult, ToolExecuteContext } from '../../src/tools/schemas/types';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nimbus-e2e-pipeline-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

async function writeTmp(name: string, content: string): Promise<string> {
  const p = path.join(tmpDir, name);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
  return p;
}

// ---------------------------------------------------------------------------
// Standard Tools — Real File I/O
// ---------------------------------------------------------------------------

describe('read_file — real filesystem', () => {
  it('reads an existing file end-to-end', async () => {
    const filePath = await writeTmp('read-test.txt', 'Hello World');
    const result: ToolResult = await readFileTool.execute({ path: filePath });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Hello World');
  });

  it('returns error for non-existent file', async () => {
    const result = await readFileTool.execute({ path: path.join(tmpDir, 'nonexistent.txt') });
    expect(result.isError).toBe(true);
  });
});

describe('write_file → read_file — chained', () => {
  it('writes then reads back', async () => {
    const filePath = path.join(tmpDir, 'write-read.txt');
    const writeResult = await writeFileTool.execute({ path: filePath, content: 'Written content' });
    expect(writeResult.isError).toBe(false);

    const readResult = await readFileTool.execute({ path: filePath });
    expect(readResult.isError).toBe(false);
    expect(readResult.output).toContain('Written content');
  });
});

describe('edit_file — real modification', () => {
  it('replaces text in an existing file', async () => {
    const filePath = await writeTmp('edit-test.txt', 'old value here');
    const result = await editFileTool.execute({
      path: filePath,
      old_string: 'old value',
      new_string: 'new value',
    });
    expect(result.isError).toBe(false);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('new value here');
  });
});

describe('multi_edit — batch edits', () => {
  it('applies multiple edits to a file', async () => {
    const filePath = await writeTmp('multi-edit.txt', 'aaa bbb ccc');
    const result = await multiEditTool.execute({
      path: filePath,
      edits: [
        { old_string: 'aaa', new_string: 'AAA' },
        { old_string: 'ccc', new_string: 'CCC' },
      ],
    });
    expect(result.isError).toBe(false);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('AAA bbb CCC');
  });
});

describe('bash — real command execution', () => {
  it('executes echo and returns stdout', async () => {
    const result = await bashTool.execute({ command: 'echo "hello from bash"' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello from bash');
  });

  it('returns error for failing command', async () => {
    const result = await bashTool.execute({ command: 'false' });
    expect(result.isError).toBe(true);
  });

  it('captures stderr on error', async () => {
    const result = await bashTool.execute({ command: 'echo "err msg" >&2; exit 1' });
    expect(result.isError).toBe(true);
    expect(result.output + (result.error || '')).toContain('err msg');
  });
});

describe('glob — real file matching', () => {
  it('finds files matching pattern', async () => {
    await writeTmp('glob-dir/a.ts', '');
    await writeTmp('glob-dir/b.ts', '');
    await writeTmp('glob-dir/c.js', '');
    const result = await globTool.execute({ pattern: '*.ts', path: path.join(tmpDir, 'glob-dir') });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('a.ts');
    expect(result.output).toContain('b.ts');
    expect(result.output).not.toContain('c.js');
  });
});

describe('grep — real content search', () => {
  it('finds matching content in files', async () => {
    await writeTmp('grep-dir/file1.txt', 'hello world');
    await writeTmp('grep-dir/file2.txt', 'goodbye world');
    const result = await grepTool.execute({
      pattern: 'hello',
      path: path.join(tmpDir, 'grep-dir'),
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('file1.txt');
  });
});

describe('list_dir — real directory listing', () => {
  it('lists directory contents', async () => {
    await writeTmp('ls-dir/fileA.txt', '');
    await writeTmp('ls-dir/fileB.txt', '');
    const result = await listDirTool.execute({ path: path.join(tmpDir, 'ls-dir') });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('fileA.txt');
    expect(result.output).toContain('fileB.txt');
  });
});

// ---------------------------------------------------------------------------
// Tool chaining — write → edit → read pipeline
// ---------------------------------------------------------------------------

describe('Tool chaining pipeline', () => {
  it('write → edit → read produces correct result', async () => {
    const filePath = path.join(tmpDir, 'chain-test.txt');

    // Step 1: Write
    await writeFileTool.execute({ path: filePath, content: 'version: 1.0.0' });

    // Step 2: Edit
    await editFileTool.execute({
      path: filePath,
      old_string: '1.0.0',
      new_string: '2.0.0',
    });

    // Step 3: Read
    const result = await readFileTool.execute({ path: filePath });
    expect(result.output).toContain('version: 2.0.0');
  });
});

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

describe('ToolRegistry — end-to-end', () => {
  it('registers all standard tools', () => {
    const registry = new ToolRegistry();
    for (const tool of standardTools) {
      registry.register(tool);
    }
    expect(registry.size).toBe(standardTools.length);
  });

  it('registers all devops tools separately', () => {
    const registry = new ToolRegistry();
    for (const tool of devopsTools) {
      registry.register(tool);
    }
    expect(registry.size).toBe(devopsTools.length);
  });

  it('retrieves tool by name', () => {
    const registry = new ToolRegistry();
    for (const tool of standardTools) {
      registry.register(tool);
    }
    const readFile = registry.get('read_file');
    expect(readFile).toBeDefined();
    expect(readFile!.name).toBe('read_file');
  });

  it('filters by category', () => {
    const registry = new ToolRegistry();
    for (const tool of [...standardTools, ...devopsTools]) {
      try { registry.register(tool); } catch { /* skip dups */ }
    }
    const std = registry.getByCategory('standard');
    const devops = registry.getByCategory('devops');
    expect(std.length).toBe(standardTools.length);
    expect(devops.length).toBe(devopsTools.length);
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(standardTools[0]);
    expect(() => registry.register(standardTools[0])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('Tool schema validation — end-to-end', () => {
  it('all standard tools have valid inputSchema', () => {
    for (const tool of standardTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.execute).toBe('function');
      expect(tool.permissionTier).toBeDefined();
      expect(tool.category).toBe('standard');
    }
  });

  it('all devops tools have valid inputSchema', () => {
    for (const tool of devopsTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.category).toBe('devops');
    }
  });

  it('read_file schema rejects missing path', () => {
    const result = readFileTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('read_file schema accepts valid input', () => {
    const result = readFileTool.inputSchema.safeParse({ path: '/tmp/test.txt' });
    expect(result.success).toBe(true);
  });

  it('bash schema rejects missing command', () => {
    const result = bashTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission tiers
// ---------------------------------------------------------------------------

describe('Tool permission tiers', () => {
  it('read_file is auto_allow', () => {
    expect(readFileTool.permissionTier).toBe('auto_allow');
  });

  it('write_file is ask_once', () => {
    expect(writeFileTool.permissionTier).toBe('ask_once');
  });

  it('bash is ask_once', () => {
    expect(bashTool.permissionTier).toBe('ask_once');
  });
});
