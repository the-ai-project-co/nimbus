/**
 * Three-Mode System Tests
 *
 * Validates the plan / build / deploy mode system, including tool filtering,
 * mode cycling, mode state management, and mode metadata (labels, colors).
 */

import { describe, test, expect } from 'bun:test';
import {
  getToolsForMode,
  cycleMode,
  getModes,
  createModeState,
  switchMode,
  isToolAllowedInMode,
  getModeLabel,
  getModeColor,
  MODE_CONFIGS,
} from '../agent/modes';

// ===========================================================================
// getToolsForMode
// ===========================================================================

describe('getToolsForMode', () => {
  // -----------------------------------------------------------------------
  // Plan mode
  // -----------------------------------------------------------------------

  describe('plan mode', () => {
    const planToolNames = getToolsForMode('plan').map(t => t.name);

    test('returns only read-only tools', () => {
      const expected = [
        'read_file',
        'glob',
        'grep',
        'list_dir',
        'webfetch',
        'cost_estimate',
        'drift_detect',
        'todo_read',
        'todo_write',
        'cloud_discover',
      ];
      for (const name of expected) {
        expect(planToolNames).toContain(name);
      }
    });

    test('does NOT include edit_file', () => {
      expect(planToolNames).not.toContain('edit_file');
    });

    test('does NOT include write_file', () => {
      expect(planToolNames).not.toContain('write_file');
    });

    test('does NOT include bash', () => {
      expect(planToolNames).not.toContain('bash');
    });

    test('does NOT include terraform', () => {
      expect(planToolNames).not.toContain('terraform');
    });

    test('does NOT include kubectl', () => {
      expect(planToolNames).not.toContain('kubectl');
    });

    test('does NOT include helm', () => {
      expect(planToolNames).not.toContain('helm');
    });
  });

  // -----------------------------------------------------------------------
  // Build mode
  // -----------------------------------------------------------------------

  describe('build mode', () => {
    const buildToolNames = getToolsForMode('build').map(t => t.name);

    test('includes editing tools (edit_file, multi_edit, write_file, bash)', () => {
      expect(buildToolNames).toContain('edit_file');
      expect(buildToolNames).toContain('multi_edit');
      expect(buildToolNames).toContain('write_file');
      expect(buildToolNames).toContain('bash');
    });

    test('includes terraform, kubectl, helm (restricted by permissions not mode)', () => {
      expect(buildToolNames).toContain('terraform');
      expect(buildToolNames).toContain('kubectl');
      expect(buildToolNames).toContain('helm');
    });

    test('includes all plan mode tools as well', () => {
      const planToolNames = getToolsForMode('plan').map(t => t.name);
      for (const name of planToolNames) {
        expect(buildToolNames).toContain(name);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Deploy mode
  // -----------------------------------------------------------------------

  describe('deploy mode', () => {
    const deployTools = getToolsForMode('deploy');
    const deployToolNames = deployTools.map(t => t.name);

    test('includes all tools', () => {
      // Deploy mode should include every tool that exists across standard and devops
      const buildToolNames = getToolsForMode('build').map(t => t.name);
      for (const name of buildToolNames) {
        expect(deployToolNames).toContain(name);
      }
    });

    test('returns a non-empty array', () => {
      expect(deployTools.length).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// cycleMode
// ===========================================================================

describe('cycleMode', () => {
  test('plan cycles to build', () => {
    expect(cycleMode('plan')).toBe('build');
  });

  test('build cycles to deploy', () => {
    expect(cycleMode('build')).toBe('deploy');
  });

  test('deploy cycles back to plan', () => {
    expect(cycleMode('deploy')).toBe('plan');
  });
});

// ===========================================================================
// getModes
// ===========================================================================

describe('getModes', () => {
  test('returns ["plan", "build", "deploy"]', () => {
    expect(getModes()).toEqual(['plan', 'build', 'deploy']);
  });
});

// ===========================================================================
// createModeState
// ===========================================================================

describe('createModeState', () => {
  test('defaults to plan mode', () => {
    const state = createModeState();
    expect(state.current).toBe('plan');
  });

  test('can start in deploy mode', () => {
    const state = createModeState('deploy');
    expect(state.current).toBe('deploy');
  });

  test('can start in build mode', () => {
    const state = createModeState('build');
    expect(state.current).toBe('build');
  });

  test('initializes with empty permission state', () => {
    const state = createModeState();
    expect(state.permissionState.approvedTools.size).toBe(0);
    expect(state.permissionState.approvedActions.size).toBe(0);
  });
});

// ===========================================================================
// switchMode
// ===========================================================================

describe('switchMode', () => {
  test('resets permission state (approvedTools cleared)', () => {
    let state = createModeState('plan');
    // Simulate approving a tool in plan mode
    state.permissionState.approvedTools.add('read_file');
    state.permissionState.approvedActions.add('terraform:plan');
    expect(state.permissionState.approvedTools.size).toBe(1);
    expect(state.permissionState.approvedActions.size).toBe(1);

    // Switch to build mode
    state = switchMode(state, 'build');

    expect(state.current).toBe('build');
    expect(state.permissionState.approvedTools.size).toBe(0);
    expect(state.permissionState.approvedActions.size).toBe(0);
  });

  test('updates the current mode', () => {
    let state = createModeState('plan');
    state = switchMode(state, 'deploy');
    expect(state.current).toBe('deploy');
  });
});

// ===========================================================================
// isToolAllowedInMode
// ===========================================================================

describe('isToolAllowedInMode', () => {
  test('read_file is allowed in plan', () => {
    expect(isToolAllowedInMode('read_file', 'plan')).toBe(true);
  });

  test('edit_file is NOT allowed in plan', () => {
    expect(isToolAllowedInMode('edit_file', 'plan')).toBe(false);
  });

  test('edit_file is allowed in build', () => {
    expect(isToolAllowedInMode('edit_file', 'build')).toBe(true);
  });

  test('terraform is allowed in deploy', () => {
    expect(isToolAllowedInMode('terraform', 'deploy')).toBe(true);
  });

  test('terraform is allowed in build (restricted by permissions, not mode)', () => {
    expect(isToolAllowedInMode('terraform', 'build')).toBe(true);
  });

  test('glob is allowed in plan', () => {
    expect(isToolAllowedInMode('glob', 'plan')).toBe(true);
  });

  test('bash is NOT allowed in plan', () => {
    expect(isToolAllowedInMode('bash', 'plan')).toBe(false);
  });

  test('bash is allowed in build', () => {
    expect(isToolAllowedInMode('bash', 'build')).toBe(true);
  });

  test('write_file is NOT allowed in plan', () => {
    expect(isToolAllowedInMode('write_file', 'plan')).toBe(false);
  });

  test('write_file is allowed in build', () => {
    expect(isToolAllowedInMode('write_file', 'build')).toBe(true);
  });

  test('cloud_discover is allowed in plan', () => {
    expect(isToolAllowedInMode('cloud_discover', 'plan')).toBe(true);
  });

  test('cost_estimate is allowed in plan', () => {
    expect(isToolAllowedInMode('cost_estimate', 'plan')).toBe(true);
  });
});

// ===========================================================================
// getModeLabel
// ===========================================================================

describe('getModeLabel', () => {
  test('plan returns "Plan"', () => {
    expect(getModeLabel('plan')).toBe('Plan');
  });

  test('build returns "Build"', () => {
    expect(getModeLabel('build')).toBe('Build');
  });

  test('deploy returns "Deploy"', () => {
    expect(getModeLabel('deploy')).toBe('Deploy');
  });
});

// ===========================================================================
// getModeColor
// ===========================================================================

describe('getModeColor', () => {
  test('plan returns "blue"', () => {
    expect(getModeColor('plan')).toBe('blue');
  });

  test('build returns "yellow"', () => {
    expect(getModeColor('build')).toBe('yellow');
  });

  test('deploy returns "red"', () => {
    expect(getModeColor('deploy')).toBe('red');
  });
});

// ===========================================================================
// MODE_CONFIGS structure
// ===========================================================================

describe('MODE_CONFIGS', () => {
  test('has entries for all three modes', () => {
    expect(MODE_CONFIGS).toHaveProperty('plan');
    expect(MODE_CONFIGS).toHaveProperty('build');
    expect(MODE_CONFIGS).toHaveProperty('deploy');
  });

  test('each mode config has the correct name', () => {
    expect(MODE_CONFIGS.plan.name).toBe('plan');
    expect(MODE_CONFIGS.build.name).toBe('build');
    expect(MODE_CONFIGS.deploy.name).toBe('deploy');
  });

  test('each mode config has a non-empty systemPromptAddition', () => {
    for (const mode of getModes()) {
      expect(MODE_CONFIGS[mode].systemPromptAddition.length).toBeGreaterThan(0);
    }
  });

  test('each mode config has allowedToolNames as a Set', () => {
    for (const mode of getModes()) {
      expect(MODE_CONFIGS[mode].allowedToolNames).toBeInstanceOf(Set);
      expect(MODE_CONFIGS[mode].allowedToolNames.size).toBeGreaterThan(0);
    }
  });

  test('plan allowedToolNames is a subset of build allowedToolNames', () => {
    const planNames = MODE_CONFIGS.plan.allowedToolNames;
    const buildNames = MODE_CONFIGS.build.allowedToolNames;
    for (const name of planNames) {
      expect(buildNames.has(name)).toBe(true);
    }
  });
});
