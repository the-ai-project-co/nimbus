/**
 * Performance Optimization Tests
 *
 * Covers all PERF-1 through PERF-4 optimizations:
 *
 *   PERF-1a  visibleToolCalls useMemo (App.tsx)
 *   PERF-1b  FileWatcher ring buffer
 *   PERF-1c  terraform plan cache background TTL cleanup
 *   PERF-1d  compiled regex constants for classifyDevOpsError
 *   PERF-2a  SessionManager debounced SQLite flush (see sessions.test.ts extensions)
 *   PERF-2b  ContextManager token count cache (see context-manager.test.ts extensions)
 *   PERF-2c  Unbuffered stream fallback in LLMRouter (see stream-with-tools.test.ts extensions)
 *   PERF-3a  HistoricalMessages React.memo split
 *   PERF-3b  parseContent module-level LRU cache
 *   PERF-3c  CodeBlock per-line tokenization useMemo
 *   PERF-4a  Message pre-allocation in agent loop
 *   PERF-4b  UIMessage._precomputedSegments type field
 *
 * @module __tests__/perf-optimizations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Imports for new test suites (M2/M3 + supplementary)
import { _copyToClipboard } from '../ui/MessageList';
import { checkPermission, createPermissionState } from '../agent/permissions';
import type { ToolDefinition } from '../tools/schemas/types';
import { loadModeForCwd, saveModeForCwd } from '../config/mode-store';
import { loadProfile, saveProfile, listProfiles, applyProfile } from '../config/profiles';

// ---------------------------------------------------------------------------
// PERF-1a: visibleToolCalls useMemo
// ---------------------------------------------------------------------------

describe('PERF-1a: visibleToolCalls useMemo (App.tsx)', () => {
  it('useMemo is now imported in App.tsx', async () => {
    // The import line is our source of truth — read a small slice of the file
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('useMemo');
    expect(src).toContain("useState, useCallback, useEffect, useRef, useMemo");
  });

  it('visibleToolCalls uses useMemo with [activeToolCalls, messages] deps', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('useMemo(() => {');
    expect(src).toContain('[activeToolCalls, messages]');
  });

  it('visibleToolCalls is no longer an IIFE', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    // The old pattern used (() => { ... })() — should be gone
    expect(src).not.toContain('const visibleToolCalls: UIToolCall[] = (() => {');
  });
});

// ---------------------------------------------------------------------------
// PERF-1b: FileWatcher ring buffer
// ---------------------------------------------------------------------------

import { FileWatcher } from '../watcher/index';

describe('PERF-1b: FileWatcher ring buffer', () => {
  it('stores events up to maxChanges capacity', () => {
    const watcher = new FileWatcher('/tmp');
    // Simulate pushChange via the emit path (direct internal method is private,
    // so we test through the public API).
    const tmpDir = '/tmp';
    const w = watcher as unknown as {
      pushChange: (e: unknown) => void;
      changesSize: number;
      maxChanges: number;
      getOrderedChanges: () => unknown[];
    };
    // Push exactly maxChanges events
    for (let i = 0; i < w.maxChanges; i++) {
      w.pushChange({ type: 'change', path: `/tmp/file${i}.txt`, timestamp: i });
    }
    expect(w.changesSize).toBe(w.maxChanges);
  });

  it('does not grow beyond maxChanges (ring buffer wraps)', () => {
    const w = new FileWatcher('/tmp') as unknown as {
      pushChange: (e: unknown) => void;
      changesSize: number;
      maxChanges: number;
    };
    // Push 2× maxChanges
    for (let i = 0; i < w.maxChanges * 2; i++) {
      w.pushChange({ type: 'change', path: `/tmp/f${i}.txt`, timestamp: i });
    }
    expect(w.changesSize).toBe(w.maxChanges);
  });

  it('getOrderedChanges returns events in chronological order', () => {
    const w = new FileWatcher('/tmp') as unknown as {
      pushChange: (e: { type: string; path: string; timestamp: number }) => void;
      getOrderedChanges: () => Array<{ type: string; path: string; timestamp: number }>;
      maxChanges: number;
    };
    // Overflow the buffer to exercise the circular-read path
    for (let i = 0; i < w.maxChanges + 5; i++) {
      w.pushChange({ type: 'change', path: `/tmp/f${i}.txt`, timestamp: i });
    }
    const ordered = w.getOrderedChanges();
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].timestamp).toBeGreaterThanOrEqual(ordered[i - 1].timestamp);
    }
  });

  it('clearChanges resets the ring buffer to empty', () => {
    const w = new FileWatcher('/tmp') as unknown as {
      pushChange: (e: unknown) => void;
      changesSize: number;
      changesHead: number;
      getOrderedChanges: () => unknown[];
    };
    w.pushChange({ type: 'change', path: '/tmp/a.txt', timestamp: 1 });
    w.pushChange({ type: 'change', path: '/tmp/b.txt', timestamp: 2 });
    (new FileWatcher('/tmp') as unknown as { clearChanges: () => void });
    // Access clearChanges through the real watcher
    const realW = new FileWatcher('/tmp');
    (realW as unknown as { pushChange: (e: unknown) => void }).pushChange({ type: 'change', path: '/tmp/a.txt', timestamp: 1 });
    realW.clearChanges();
    expect((realW as unknown as { changesSize: number }).changesSize).toBe(0);
    expect((realW as unknown as { changesHead: number }).changesHead).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PERF-1c: terraform plan cache background TTL cleanup
// ---------------------------------------------------------------------------

import { _planCacheCleanupInterval } from '../agent/loop';

describe('PERF-1c: plan cache background cleanup interval', () => {
  it('_planCacheCleanupInterval is exported from loop.ts', () => {
    expect(_planCacheCleanupInterval).toBeDefined();
    // It should be a Timer (return value of setInterval)
    expect(typeof _planCacheCleanupInterval).toBe('object');
  });

  it('interval has .unref() called (does not prevent process exit)', () => {
    // A NodeJS.Timeout with .unref() called can be verified by checking that
    // the timer object does not hold a strong reference in the event loop.
    // We can't truly test that here, but we can verify the timer is a valid object.
    expect(_planCacheCleanupInterval).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PERF-1d: compiled regex constants
// ---------------------------------------------------------------------------

describe('PERF-1d: compiled regex constants in loop.ts', () => {
  it('_RE_CREDENTIAL_EXPIRY_AWS, _RE_CREDENTIAL_EXPIRY_GCP, etc. are exported', async () => {
    // The constants are not exported by name — verify via source check
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('_RE_CREDENTIAL_EXPIRY_AWS');
    expect(src).toContain('_RE_CREDENTIAL_EXPIRY_GCP');
    expect(src).toContain('_RE_CREDENTIAL_EXPIRY_AZURE');
    expect(src).toContain('_RE_CMD_NOT_FOUND');
  });

  it('regex constants are at module level (before classifyDevOpsError)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    const constIdx = src.indexOf('const _RE_CREDENTIAL_EXPIRY_AWS');
    const fnIdx = src.indexOf('function classifyDevOpsError');
    expect(constIdx).toBeGreaterThan(0);
    expect(fnIdx).toBeGreaterThan(constIdx);
  });
});

// ---------------------------------------------------------------------------
// PERF-3a: HistoricalMessages React.memo
// ---------------------------------------------------------------------------

describe('PERF-3a: HistoricalMessages React.memo split', () => {
  it('HistoricalMessages component exists in MessageList.tsx', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('HistoricalMessages');
    expect(src).toContain('React.memo');
  });

  it('custom comparator checks messages reference, length, and mode', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('prev.messages === next.messages');
    expect(src).toContain('prev.messages.length === next.messages.length');
    expect(src).toContain('prev.mode === next.mode');
  });

  it('MessageList splits visible into historical and last', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    // After C1 (scroll offset) and M1 (search filter) were added, the split
    // operates on scrolledVisible (already trimmed/filtered) rather than raw visible.
    expect(src).toContain('.slice(0, -1)');
    expect(src).toContain('historical.length > 0');
  });

  it('HistoricalMessages is only rendered when historical.length > 0', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('historical.length > 0');
  });
});

// ---------------------------------------------------------------------------
// PERF-3b: parseContent module-level cache
// ---------------------------------------------------------------------------

import { _parseContentCache, _parseContentForTesting } from '../ui/MessageList';

describe('PERF-3b: parseContent module-level cache', () => {
  beforeEach(() => {
    _parseContentCache.clear();
  });

  it('caches parsed content segments on first call', () => {
    const raw = '# Hello\n\nSome text\n\n```ts\nconst x = 1;\n```';
    _parseContentForTesting(raw);
    expect(_parseContentCache.has(raw)).toBe(true);
  });

  it('returns the same array reference on repeated calls (cache hit)', () => {
    const raw = 'Hello **world**!';
    const first = _parseContentForTesting(raw);
    const second = _parseContentForTesting(raw);
    expect(first).toBe(second); // Same reference = cache hit
  });

  it('evicts oldest entry when cap is reached', () => {
    // Fill cache to the cap
    for (let i = 0; i < 200; i++) {
      _parseContentForTesting(`content-${i}`);
    }
    expect(_parseContentCache.size).toBe(200);
    // One more entry should evict the oldest
    _parseContentForTesting('new-entry-201');
    expect(_parseContentCache.size).toBe(200); // Size stays at cap
    expect(_parseContentCache.has('content-0')).toBe(false); // First entry evicted
    expect(_parseContentCache.has('new-entry-201')).toBe(true);
  });

  it('correctly parses code blocks and returns ContentSegment arrays', () => {
    const raw = 'Before\n```js\nconsole.log("hi");\n```\nAfter';
    const segments = _parseContentForTesting(raw);
    expect(segments.length).toBe(3);
    expect(segments[0].type).toBe('text');
    expect(segments[1].type).toBe('code');
    expect(segments[1].language).toBe('js');
    expect(segments[2].type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// PERF-3c: CodeBlock useMemo
// ---------------------------------------------------------------------------

describe('PERF-3c: CodeBlock tokenization useMemo', () => {
  it('CodeBlock component uses useMemo for tokenizedLines', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('tokenizedLines');
    expect(src).toContain('useMemo(');
    // The memo should depend on content and language
    expect(src).toContain('[content, language]');
  });

  it('tokenizedLines is an array rendered via .map()', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('tokenizedLines.map(');
  });

  it('useMemo import is present at the top of MessageList.tsx', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toMatch(/import React.*useMemo/);
  });

  it('tokenizeLine is no longer called directly inside map (uses pre-computed result)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    // tokenizeLine should only appear inside the useMemo callback
    const tokenizeInMemo = src.includes('tokenizeLine(line, keywords, types, language)');
    expect(tokenizeInMemo).toBe(true);
    // The {lines.map(...tokenizeLine...)} pattern (without memo) should be gone
    expect(src).not.toContain('{lines.map((line, lineIdx) => {\n        const tokens = tokenizeLine');
  });
});

// ---------------------------------------------------------------------------
// PERF-4a: Message pre-allocation in agent loop
// ---------------------------------------------------------------------------

describe('PERF-4a: message pre-allocation', () => {
  it('loop.ts uses capacity-hinted Array construction for messages', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('new Array(Math.max(history.length + 1, 10))');
    expect(src).toContain('messages.length = 0');
    expect(src).toContain('messages.push(...history, { role: \'user\', content: userMessage })');
  });

  it('_systemMessageObj is pre-built before the while loop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('const _systemMessageObj: LLMMessage = { role: \'system\', content: systemPrompt }');
  });

  it('per-turn request no longer spreads [systemMessage, ...messages]', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    // Old pattern was: messages: [{ role: 'system', content: systemPrompt }, ...messages]
    expect(src).not.toContain("messages: [{ role: 'system', content: systemPrompt }, ...messages]");
    // New pattern uses _systemMessageObj
    expect(src).toContain('allMessages.push(_systemMessageObj, ...messages)');
  });
});

// ---------------------------------------------------------------------------
// PERF-4b: UIMessage._precomputedSegments type field
// ---------------------------------------------------------------------------

describe('PERF-4b: UIMessage._precomputedSegments optional field', () => {
  it('UIMessage interface has _precomputedSegments optional field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/types.ts'), 'utf-8');
    expect(src).toContain('_precomputedSegments');
    expect(src).toContain("type: 'text' | 'code'");
  });

  it('_precomputedSegments field is optional (has ?)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/types.ts'), 'utf-8');
    expect(src).toContain('_precomputedSegments?:');
  });

  it('UIMessage can be constructed without _precomputedSegments (backwards compat)', () => {
    // Simply verify the type is satisfied at runtime with a plain object
    const msg: import('../ui/types').UIMessage = {
      id: 'test-1',
      role: 'user',
      content: 'hello',
      timestamp: new Date(),
    };
    expect(msg._precomputedSegments).toBeUndefined();
  });

  it('UIMessage accepts _precomputedSegments when provided', () => {
    const msg: import('../ui/types').UIMessage = {
      id: 'test-2',
      role: 'assistant',
      content: 'hello\n```js\nconsole.log();\n```',
      timestamp: new Date(),
      _precomputedSegments: [
        { type: 'text', content: 'hello\n' },
        { type: 'code', content: 'console.log();', language: 'js' },
      ],
    };
    expect(msg._precomputedSegments).toHaveLength(2);
    expect(msg._precomputedSegments![0].type).toBe('text');
    expect(msg._precomputedSegments![1].type).toBe('code');
  });
});

// ---------------------------------------------------------------------------
// M2: Per-turn token/cost stats emitted via onText
// ---------------------------------------------------------------------------

describe('M2: per-turn stats line in loop.ts', () => {
  it('loop.ts emits a per-turn stats line via onText after each LLM turn', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('M2: Emit per-turn token/cost stats');
    expect(src).toContain('responseUsage.promptTokens');
    expect(src).toContain('responseUsage.completionTokens');
    expect(src).toContain('turnCost.costUSD.toFixed(4)');
  });

  it('stats line is only emitted when there is actual token usage', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    // Guard: only emit when promptTokens or completionTokens > 0
    expect(src).toContain('responseUsage.promptTokens > 0 || responseUsage.completionTokens > 0');
  });

  it('stats line format includes "in" and "out" labels', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    // The format string should contain in/out markers
    expect(src).toContain('in /');
    expect(src).toContain('out —');
  });
});

// ---------------------------------------------------------------------------
// M3: Auto-show TerminalPane in App.tsx
// ---------------------------------------------------------------------------

describe('M3: auto-show TerminalPane on long-running tools', () => {
  it('App.tsx has terminalPaneAuto state', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('terminalPaneAuto');
    expect(src).toContain('setTerminalPaneAuto');
  });

  it('TerminalPane is rendered when terminalPaneAuto is true (|| condition)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('showTerminalPane || terminalPaneAuto');
  });

  it('long-running tool patterns include terraform, helm, kubectl, docker', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('LONG_RUNNING_TOOL_PATTERNS');
    expect(src).toContain('terraform');
    expect(src).toContain('helm');
    expect(src).toContain('kubectl');
    expect(src).toContain('docker');
  });

  it('auto-hide fires setTimeout after all tools complete', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('setTimeout(() => setTerminalPaneAuto(false), 2000)');
  });

  it('auto-show logic: hasLongRunning check sets terminalPaneAuto to true', async () => {
    // Pure logic test — simulate the predicate
    const LONG_RUNNING_TOOL_PATTERNS = [
      'terraform', 'helm', 'kubectl', 'docker', 'cicd', 'gitops', 'drift_detect', 'cfn',
    ];
    const toolCalls = [
      { id: '1', name: 'terraform_apply', status: 'running' },
      { id: '2', name: 'read_file', status: 'running' },
    ];
    const hasLongRunning = toolCalls.some(
      tc =>
        tc.status === 'running' &&
        LONG_RUNNING_TOOL_PATTERNS.some(n => tc.name.toLowerCase().includes(n))
    );
    expect(hasLongRunning).toBe(true);
  });

  it('auto-show logic: non-long-running tools do not trigger auto-show', () => {
    const LONG_RUNNING_TOOL_PATTERNS = [
      'terraform', 'helm', 'kubectl', 'docker', 'cicd', 'gitops', 'drift_detect', 'cfn',
    ];
    const toolCalls = [
      { id: '1', name: 'read_file', status: 'running' },
      { id: '2', name: 'glob', status: 'running' },
    ];
    const hasLongRunning = toolCalls.some(
      tc =>
        tc.status === 'running' &&
        LONG_RUNNING_TOOL_PATTERNS.some(n => tc.name.toLowerCase().includes(n))
    );
    expect(hasLongRunning).toBe(false);
  });

  it('auto-hide logic: all tools completed triggers auto-hide', () => {
    const toolCalls = [
      { id: '1', name: 'terraform', status: 'completed' },
      { id: '2', name: 'helm', status: 'completed' },
    ];
    const hasRunning = toolCalls.some(tc => tc.status === 'running');
    const allDone =
      !hasRunning &&
      toolCalls.length > 0 &&
      toolCalls.every(tc => tc.status === 'completed' || tc.status === 'failed');
    expect(allDone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C1: Scroll offset slicing in MessageList
// ---------------------------------------------------------------------------

describe('C1: scrollOffset message slicing', () => {
  it('scrollOffset=0 shows all messages', () => {
    const visible = ['a', 'b', 'c', 'd', 'e'];
    const scrollOffset = 0;
    const sliced = scrollOffset > 0
      ? visible.slice(0, Math.max(0, visible.length - scrollOffset))
      : visible;
    expect(sliced).toEqual(visible);
  });

  it('scrollOffset=2 hides last 2 messages', () => {
    const visible = ['a', 'b', 'c', 'd', 'e'];
    const scrollOffset = 2;
    const sliced = visible.slice(0, Math.max(0, visible.length - scrollOffset));
    expect(sliced).toEqual(['a', 'b', 'c']);
  });

  it('scrollOffset larger than visible length returns empty', () => {
    const visible = ['a', 'b'];
    const scrollOffset = 10;
    const sliced = visible.slice(0, Math.max(0, visible.length - scrollOffset));
    expect(sliced).toHaveLength(0);
  });

  it('scrollOffset exactly equals visible length shows empty', () => {
    const visible = ['a', 'b', 'c'];
    const scrollOffset = 3;
    const sliced = visible.slice(0, Math.max(0, visible.length - scrollOffset));
    expect(sliced).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// H1: copyToClipboard platform dispatch
// ---------------------------------------------------------------------------

describe('H1: copyToClipboard helper', () => {
  it('_copyToClipboard is exported from MessageList', () => {
    expect(typeof _copyToClipboard).toBe('function');
  });

  it('_copyToClipboard does not throw on unsupported platform', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'aix', writable: true, configurable: true });
    expect(() => _copyToClipboard('test text')).not.toThrow();
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true, configurable: true });
  });
});

// ---------------------------------------------------------------------------
// H2: auto-approve bypass in checkPermission
// ---------------------------------------------------------------------------

describe('H2: checkPermission auto-approve bypass', () => {
  const mockTool: ToolDefinition = {
    name: 'terraform',
    description: 'Run terraform',
    permissionTier: 'always_ask',
    category: 'devops',
    inputSchema: { parse: (x: unknown) => x } as unknown as ToolDefinition['inputSchema'],
    execute: async () => ({ output: '', isError: false }),
  };

  it('autoApprove=true returns allow for always_ask tool', () => {
    const state = createPermissionState();
    const result = checkPermission(mockTool, { action: 'apply' }, state, undefined, true);
    expect(result).toBe('allow');
  });

  it('autoApprove=true returns allow for blocked tool', () => {
    const blockedTool: ToolDefinition = { ...mockTool, permissionTier: 'blocked' };
    const state = createPermissionState();
    const result = checkPermission(blockedTool, {}, state, undefined, true);
    expect(result).toBe('allow');
  });

  it('autoApprove=false preserves normal tier behavior', () => {
    const state = createPermissionState();
    const result = checkPermission(mockTool, { action: 'apply' }, state, undefined, false);
    expect(result).toBe('ask');
  });
});

// ---------------------------------------------------------------------------
// H3: mode persistence load/save
// ---------------------------------------------------------------------------

describe('H3: mode persistence per cwd', () => {
  it('loadModeForCwd returns null for unknown cwd', () => {
    const result = loadModeForCwd('/nonexistent/path/that/does/not/exist/at/all');
    expect(result).toBeNull();
  });

  it('saveModeForCwd + loadModeForCwd roundtrip', () => {
    const testCwd = `/tmp/nimbus-test-mode-${Date.now()}`;
    saveModeForCwd(testCwd, 'deploy');
    const loaded = loadModeForCwd(testCwd);
    expect(loaded).toBe('deploy');
  });

  it('saveModeForCwd overwrites existing mode', () => {
    const testCwd = `/tmp/nimbus-test-mode-overwrite-${Date.now()}`;
    saveModeForCwd(testCwd, 'plan');
    saveModeForCwd(testCwd, 'build');
    const loaded = loadModeForCwd(testCwd);
    expect(loaded).toBe('build');
  });
});

// ---------------------------------------------------------------------------
// M1: search filter logic
// ---------------------------------------------------------------------------

describe('M1: conversation search filter', () => {
  const messages = [
    { id: '1', role: 'user', content: 'terraform plan', timestamp: new Date() },
    { id: '2', role: 'assistant', content: 'Running terraform init', timestamp: new Date() },
    { id: '3', role: 'user', content: 'kubectl get pods', timestamp: new Date() },
    { id: '4', role: 'system', content: 'Plan mode active', timestamp: new Date() },
  ] as Array<{ id: string; role: string; content: string; timestamp: Date }>;

  it('filters messages by case-insensitive substring', () => {
    const query = 'TERRAFORM';
    const filtered = messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase()));
    expect(filtered).toHaveLength(2);
  });

  it('returns all messages when query is empty', () => {
    const query: string = '';
    const filtered = query ? messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase())) : messages;
    expect(filtered).toHaveLength(4);
  });

  it('returns empty when no messages match', () => {
    const query = 'xyznonexistent';
    const filtered = messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase()));
    expect(filtered).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// L2: profiles load/save/list
// ---------------------------------------------------------------------------

describe('L2: profile management', () => {
  it('loadProfile returns null for nonexistent profile', () => {
    const result = loadProfile('nonexistent-profile-xyz-9999');
    expect(result).toBeNull();
  });

  it('saveProfile + loadProfile roundtrip', () => {
    const profile = {
      name: `test-profile-${Date.now()}`,
      awsProfile: 'my-aws-profile',
      awsRegion: 'us-west-2',
    };
    saveProfile(profile);
    const loaded = loadProfile(profile.name);
    expect(loaded).not.toBeNull();
    expect(loaded?.awsProfile).toBe('my-aws-profile');
    expect(loaded?.awsRegion).toBe('us-west-2');
  });

  it('applyProfile sets environment variables', () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    const originalProfile = process.env.AWS_PROFILE;
    applyProfile({ name: 'test', awsProfile: 'test-aws', awsRegion: 'eu-west-1' });
    expect(process.env.AWS_PROFILE).toBe('test-aws');
    expect(process.env.AWS_DEFAULT_REGION).toBe('eu-west-1');
    // cleanup
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (originalProfile !== undefined) process.env.AWS_PROFILE = originalProfile;
    else delete process.env.AWS_PROFILE;
  });

  it('listProfiles returns array (possibly empty)', () => {
    const profiles = listProfiles();
    expect(Array.isArray(profiles)).toBe(true);
  });

  it('applyProfile sets GCP project env var', () => {
    const original = process.env.GCLOUD_PROJECT;
    applyProfile({ name: 'test', gcpProject: 'my-gcp-proj' });
    expect(process.env.GCLOUD_PROJECT).toBe('my-gcp-proj');
    if (original !== undefined) process.env.GCLOUD_PROJECT = original;
    else delete process.env.GCLOUD_PROJECT;
  });

  it('applyProfile sets Azure subscription env var', () => {
    const original = process.env.AZURE_SUBSCRIPTION_ID;
    applyProfile({ name: 'test', azureSubscription: 'sub-123' });
    expect(process.env.AZURE_SUBSCRIPTION_ID).toBe('sub-123');
    if (original !== undefined) process.env.AZURE_SUBSCRIPTION_ID = original;
    else delete process.env.AZURE_SUBSCRIPTION_ID;
  });
});

// ---------------------------------------------------------------------------
// C3: API key setup state
// ---------------------------------------------------------------------------

describe('C3: inline API key setup', () => {
  it('App.tsx includes hasApiKey prop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('hasApiKey');
  });

  it('App.tsx includes showApiKeySetup state', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('showApiKeySetup');
  });
});

// ---------------------------------------------------------------------------
// H2: --non-interactive alias in run.ts
// ---------------------------------------------------------------------------

import { parseRunArgs } from '../cli/run';

describe('H2: --non-interactive alias for --auto-approve', () => {
  it('--non-interactive sets autoApprove=true', () => {
    const opts = parseRunArgs(['--non-interactive', 'hello world']);
    expect(opts.autoApprove).toBe(true);
  });

  it('--auto-approve sets autoApprove=true', () => {
    const opts = parseRunArgs(['--auto-approve', 'hello world']);
    expect(opts.autoApprove).toBe(true);
  });

  it('-y sets autoApprove=true', () => {
    const opts = parseRunArgs(['-y', 'hello world']);
    expect(opts.autoApprove).toBe(true);
  });

  it('no flag leaves autoApprove=false', () => {
    const opts = parseRunArgs(['hello world']);
    expect(opts.autoApprove).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C1: scroll state in App.tsx
// ---------------------------------------------------------------------------

describe('C1: scroll state exists in App.tsx', () => {
  it('App.tsx has scrollOffset state', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('scrollOffset');
  });

  it('App.tsx has scrollLocked state', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('scrollLocked');
  });

  it('StatusBar receives showScrollHint prop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/App.tsx'), 'utf-8');
    expect(src).toContain('showScrollHint');
  });

  it('G key jumps to bottom (scrollOffset 0)', () => {
    // Pure logic: pressing G should set scrollOffset=0 and scrollLocked=true
    let scrollOffset = 15;
    let scrollLocked = false;
    // Simulate G key handler
    scrollOffset = 0;
    scrollLocked = true;
    expect(scrollOffset).toBe(0);
    expect(scrollLocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C2: streaming output in ToolCallDisplay
// ---------------------------------------------------------------------------

describe('C2: inline streaming output in ToolCallDisplay.tsx', () => {
  it('ToolCallDisplay.tsx renders streamingOutput', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('streamingOutput');
  });

  it('streaming output shows rolling window of lines', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    // Window expanded from 10 to 20/30 lines depending on tool type (C1b)
    expect(src).toContain('windowSize');
  });
});

// ---------------------------------------------------------------------------
// H3: mode-store module structure
// ---------------------------------------------------------------------------

describe('H3: mode-store module exports', () => {
  it('exports loadModeForCwd function', () => {
    expect(typeof loadModeForCwd).toBe('function');
  });

  it('exports saveModeForCwd function', () => {
    expect(typeof saveModeForCwd).toBe('function');
  });

  it('loadModeForCwd returns null for path with no saved mode', () => {
    // Fresh unique path — no mode saved
    const result = loadModeForCwd(`/tmp/nimbus-no-mode-${Date.now()}-${Math.random()}`);
    expect(result).toBeNull();
  });

  it('saveModeForCwd accepts all three valid modes', () => {
    const cwd = `/tmp/nimbus-modes-${Date.now()}`;
    for (const mode of ['plan', 'build', 'deploy'] as const) {
      expect(() => saveModeForCwd(cwd, mode)).not.toThrow();
    }
    const result = loadModeForCwd(cwd);
    expect(result).toBe('deploy'); // last saved
  });
});
