/**
 * E2E UI Components Tests
 *
 * Tests for the data types, theme system, streaming display, and
 * UI-layer logic used by the Nimbus TUI -- without rendering React components.
 *
 * Covers: UIMessage, UIToolCall, SessionInfo, DeployPreviewData, Theme,
 * mode cycling, slash-command categorization, streaming buffer, cost formatting,
 * message ordering, permission prompt data, deploy preview aggregation,
 * tool call elapsed timer formatting, and status message updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AgentMode,
  UIMessage,
  UIToolCall,
  SessionInfo,
  DeployChange,
  DeployPreviewData,
} from '../../src/ui/types';
import { THEMES, activeTheme, setTheme, listThemes } from '../../src/ui/theme';
import { StreamingDisplay } from '../../src/ui/streaming';

// ---------------------------------------------------------------------------
// Mock the wizard UI module used by StreamingDisplay
// ---------------------------------------------------------------------------

vi.mock('../../src/wizard/ui', () => ({
  ui: {
    write: vi.fn(),
    print: vi.fn(),
    color: vi.fn((text: string, _color: string) => text),
    dim: vi.fn((text: string) => text),
    error: vi.fn(),
  },
}));

// Mock fs/os used by theme persistence to avoid writing to disk
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. UIMessage represents user messages correctly
// ---------------------------------------------------------------------------

describe('UIMessage — user messages', () => {
  it('should represent a user message with required fields', () => {
    const msg: UIMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Deploy the staging environment',
      timestamp: new Date('2026-04-01T10:00:00Z'),
    };

    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Deploy the staging environment');
    expect(msg.id).toBe('msg-1');
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. UIMessage represents assistant messages with tool calls
// ---------------------------------------------------------------------------

describe('UIMessage — assistant messages with tool calls', () => {
  it('should carry tool calls attached to assistant responses', () => {
    const toolCall: UIToolCall = {
      id: 'tc-1',
      name: 'terraform',
      input: { action: 'plan' },
      status: 'completed',
      result: { output: 'Plan: 2 to add, 0 to change, 0 to destroy.', isError: false },
      duration: 3200,
    };

    const msg: UIMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'I will run terraform plan to preview changes.',
      timestamp: new Date(),
      toolCalls: [toolCall],
    };

    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe('terraform');
    expect(msg.toolCalls![0].result?.isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. UIToolCall tracks tool name, input, output, elapsed
// ---------------------------------------------------------------------------

describe('UIToolCall — tracking fields', () => {
  it('should track name, input, output, and elapsed duration', () => {
    const tc: UIToolCall = {
      id: 'tc-100',
      name: 'bash',
      input: { command: 'ls -la' },
      status: 'completed',
      result: { output: 'total 42\ndrwxr-xr-x ...', isError: false },
      duration: 150,
      startTime: Date.now() - 150,
    };

    expect(tc.name).toBe('bash');
    expect(tc.input).toEqual({ command: 'ls -la' });
    expect(tc.result!.output).toContain('total 42');
    expect(tc.duration).toBe(150);
    expect(tc.startTime).toBeDefined();
  });

  it('should support streaming output while running', () => {
    const tc: UIToolCall = {
      id: 'tc-101',
      name: 'terraform',
      input: { action: 'apply' },
      status: 'running',
      streamingOutput: 'Creating aws_instance.web...\nCreating aws_s3_bucket.data...',
    };

    expect(tc.status).toBe('running');
    expect(tc.streamingOutput).toContain('aws_instance.web');
  });
});

// ---------------------------------------------------------------------------
// 4. SessionInfo includes mode, model, cost
// ---------------------------------------------------------------------------

describe('SessionInfo — metadata', () => {
  it('should include mode, model, and cost information', () => {
    const session: SessionInfo = {
      id: 'sess-abc',
      model: 'claude-sonnet-4-20250514',
      mode: 'build',
      tokenCount: 15000,
      maxTokens: 200000,
      costUSD: 0.042,
      snapshotCount: 3,
      kubectlContext: 'staging-cluster',
      terraformWorkspace: 'staging',
    };

    expect(session.mode).toBe('build');
    expect(session.model).toContain('claude');
    expect(session.costUSD).toBeCloseTo(0.042);
    expect(session.kubectlContext).toBe('staging-cluster');
    expect(session.terraformWorkspace).toBe('staging');
  });

  it('should support LLM health status', () => {
    const session: SessionInfo = {
      id: 'sess-def',
      model: 'gpt-4o',
      mode: 'plan',
      tokenCount: 0,
      maxTokens: 128000,
      costUSD: 0,
      snapshotCount: 0,
      llmHealth: 'ok',
    };

    expect(session.llmHealth).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 5. DeployPreviewData includes resource changes and blast radius
// ---------------------------------------------------------------------------

describe('DeployPreviewData — resource changes and blast radius', () => {
  it('should include changes with blast radius and cost impact', () => {
    const preview: DeployPreviewData = {
      tool: 'terraform',
      changes: [
        { action: 'create', resourceType: 'aws_instance', resourceName: 'web', details: 't3.medium' },
        { action: 'destroy', resourceType: 'aws_instance', resourceName: 'old_web' },
        { action: 'modify', resourceType: 'aws_security_group', resourceName: 'web_sg' },
      ],
      costImpact: '+$45.00/month',
      blastRadius: '3 resources affected',
      affectedServices: ['web-api', 'worker'],
    };

    expect(preview.changes).toHaveLength(3);
    expect(preview.blastRadius).toBe('3 resources affected');
    expect(preview.costImpact).toContain('$45.00');
    expect(preview.affectedServices).toContain('web-api');
  });
});

// ---------------------------------------------------------------------------
// 6. Theme colors for each mode (plan/build/deploy)
// ---------------------------------------------------------------------------

describe('Theme — mode colors', () => {
  it('should define dark and light themes with standard color properties', () => {
    expect(THEMES.dark).toBeDefined();
    expect(THEMES.light).toBeDefined();

    // Both themes should have all required color properties
    for (const theme of [THEMES.dark, THEMES.light]) {
      expect(theme.primary).toBeTruthy();
      expect(theme.secondary).toBeTruthy();
      expect(theme.success).toBeTruthy();
      expect(theme.warning).toBeTruthy();
      expect(theme.error).toBeTruthy();
      expect(theme.muted).toBeTruthy();
      expect(theme.border).toBeTruthy();
    }
  });

  it('should have distinct primary colors between dark and light themes', () => {
    expect(THEMES.dark.primary).not.toBe(THEMES.light.primary);
  });

  it('should have success=green for create, error=red for destroy', () => {
    expect(THEMES.dark.success).toBe('green');
    expect(THEMES.dark.error).toBe('red');
    expect(THEMES.dark.warning).toBe('yellow');
  });
});

// ---------------------------------------------------------------------------
// 7. Mode cycling plan -> build -> deploy -> plan
// ---------------------------------------------------------------------------

describe('Mode cycling', () => {
  it('should cycle through plan -> build -> deploy -> plan', () => {
    const modes: AgentMode[] = ['plan', 'build', 'deploy'];

    const cycle = (current: AgentMode): AgentMode => {
      const idx = modes.indexOf(current);
      return modes[(idx + 1) % modes.length];
    };

    expect(cycle('plan')).toBe('build');
    expect(cycle('build')).toBe('deploy');
    expect(cycle('deploy')).toBe('plan');
  });

  it('should have exactly three valid modes', () => {
    const validModes: AgentMode[] = ['plan', 'build', 'deploy'];
    expect(validModes).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 8. Slash-command list is categorized
// ---------------------------------------------------------------------------

describe('Slash-command categorization', () => {
  it('should categorize commands into navigation, session, and output groups', () => {
    // These are the slash commands from ChatUI.displayHelp()
    const commands = {
      navigation: ['/help', '/exit'],
      session: ['/clear', '/model', '/models', '/mode', '/persona'],
      output: ['/verbose', '/history', '/export'],
      editing: ['/undo', '/redo'],
    };

    // Every category should have at least one command
    expect(commands.navigation.length).toBeGreaterThan(0);
    expect(commands.session.length).toBeGreaterThan(0);
    expect(commands.output.length).toBeGreaterThan(0);
    expect(commands.editing.length).toBeGreaterThan(0);

    // All commands should start with /
    const allCommands = Object.values(commands).flat();
    for (const cmd of allCommands) {
      expect(cmd).toMatch(/^\//);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Streaming helper buffers partial chunks
// ---------------------------------------------------------------------------

describe('StreamingDisplay — buffering', () => {
  it('should buffer appended text and return complete content on complete()', () => {
    const display = new StreamingDisplay({ showCursor: false });
    display.start();
    display.append('Hello ');
    display.append('World');
    const result = display.complete();

    expect(result).toBe('Hello World');
  });

  it('should handle newlines in streamed content', () => {
    const display = new StreamingDisplay({ showCursor: false });
    display.start();
    display.append('line1\nline2\nline3');
    const result = display.complete();

    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('line3');
  });

  it('should accept custom cursor character', () => {
    const display = new StreamingDisplay({
      showCursor: false,
      cursorChar: '_',
      prefix: 'Bot: ',
      prefixColor: 'cyan',
    });

    display.start();
    display.append('test');
    const result = display.complete();
    expect(result).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// 10. Cost display formats USD correctly
// ---------------------------------------------------------------------------

describe('Cost display formatting', () => {
  it('should format small costs with 4 decimal places', () => {
    const cost = 0.0023;
    const formatted = cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
    expect(formatted).toBe('$0.0023');
  });

  it('should format larger costs with 2 decimal places', () => {
    const cost = 1.5;
    const formatted = cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
    expect(formatted).toBe('$1.50');
  });

  it('should format zero cost', () => {
    const cost = 0;
    const formatted = cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
    expect(formatted).toBe('$0.0000');
  });
});

// ---------------------------------------------------------------------------
// 11. Message ordering preserved
// ---------------------------------------------------------------------------

describe('Message ordering', () => {
  it('should preserve chronological message order', () => {
    const messages: UIMessage[] = [
      { id: '1', role: 'user', content: 'first', timestamp: new Date('2026-04-01T10:00:00Z') },
      { id: '2', role: 'assistant', content: 'second', timestamp: new Date('2026-04-01T10:00:01Z') },
      { id: '3', role: 'user', content: 'third', timestamp: new Date('2026-04-01T10:00:02Z') },
    ];

    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp.getTime()).toBeGreaterThan(messages[i - 1].timestamp.getTime());
    }

    expect(messages.map(m => m.content)).toEqual(['first', 'second', 'third']);
  });
});

// ---------------------------------------------------------------------------
// 12. Permission prompt data includes risk level
// ---------------------------------------------------------------------------

describe('Permission prompt data', () => {
  it('should include risk-relevant information for permission decisions', () => {
    // DeployChange captures the destructive nature of operations
    const destructiveChange: DeployChange = {
      action: 'destroy',
      resourceType: 'aws_rds_instance',
      resourceName: 'production_db',
      details: 'This will permanently delete the database',
    };

    expect(destructiveChange.action).toBe('destroy');
    expect(destructiveChange.resourceType).toBe('aws_rds_instance');
    expect(destructiveChange.details).toContain('permanently');
  });

  it('should differentiate between create and destroy actions', () => {
    const changes: DeployChange[] = [
      { action: 'create', resourceType: 'aws_instance', resourceName: 'new_web' },
      { action: 'destroy', resourceType: 'aws_instance', resourceName: 'old_web' },
    ];

    const destroys = changes.filter(c => c.action === 'destroy');
    const creates = changes.filter(c => c.action === 'create');

    expect(destroys).toHaveLength(1);
    expect(creates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 13. Deploy preview aggregates by action type
// ---------------------------------------------------------------------------

describe('Deploy preview — aggregation by action', () => {
  it('should aggregate changes by action type', () => {
    const changes: DeployChange[] = [
      { action: 'create', resourceType: 'aws_instance', resourceName: 'web1' },
      { action: 'create', resourceType: 'aws_instance', resourceName: 'web2' },
      { action: 'modify', resourceType: 'aws_security_group', resourceName: 'sg1' },
      { action: 'destroy', resourceType: 'aws_s3_bucket', resourceName: 'old_bucket' },
    ];

    const counts = {
      create: changes.filter(c => c.action === 'create').length,
      modify: changes.filter(c => c.action === 'modify').length,
      destroy: changes.filter(c => c.action === 'destroy').length,
      replace: changes.filter(c => c.action === 'replace').length,
    };

    expect(counts.create).toBe(2);
    expect(counts.modify).toBe(1);
    expect(counts.destroy).toBe(1);
    expect(counts.replace).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. Tool call elapsed timer formatting
// ---------------------------------------------------------------------------

describe('Tool call elapsed timer formatting', () => {
  it('should format milliseconds to readable duration', () => {
    const formatElapsed = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
    };

    expect(formatElapsed(150)).toBe('150ms');
    expect(formatElapsed(3200)).toBe('3.2s');
    expect(formatElapsed(65000)).toBe('1m 5s');
  });

  it('should compute elapsed from startTime', () => {
    const now = Date.now();
    const tc: UIToolCall = {
      id: 'tc-timer',
      name: 'bash',
      input: { command: 'sleep 2' },
      status: 'running',
      startTime: now - 2000,
    };

    const elapsed = now - tc.startTime!;
    expect(elapsed).toBeGreaterThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// 15. Status message updates correctly
// ---------------------------------------------------------------------------

describe('Status message updates', () => {
  it('should update session info fields independently', () => {
    const session: SessionInfo = {
      id: 'sess-status',
      model: 'claude-sonnet-4-20250514',
      mode: 'plan',
      tokenCount: 0,
      maxTokens: 200000,
      costUSD: 0,
      snapshotCount: 0,
    };

    // Simulate token count update
    const updated: SessionInfo = { ...session, tokenCount: 5000, costUSD: 0.015 };
    expect(updated.tokenCount).toBe(5000);
    expect(updated.costUSD).toBe(0.015);
    expect(updated.mode).toBe('plan'); // mode unchanged

    // Simulate mode switch
    const switched: SessionInfo = { ...updated, mode: 'deploy' };
    expect(switched.mode).toBe('deploy');
    expect(switched.tokenCount).toBe(5000); // tokens preserved
  });

  it('should track infra cost delta', () => {
    const session: SessionInfo = {
      id: 'sess-cost',
      model: 'gpt-4o',
      mode: 'deploy',
      tokenCount: 10000,
      maxTokens: 128000,
      costUSD: 0.05,
      snapshotCount: 1,
      infraCostDelta: '+$23.50/month',
    };

    expect(session.infraCostDelta).toBe('+$23.50/month');
  });
});
