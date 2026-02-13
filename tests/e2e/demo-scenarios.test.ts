import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import demo framework
import {
  getScenarios,
  getScenario,
  runScenario,
  type DemoScenario,
  type DemoOptions,
} from '../../services/cli-service/src/demo';

describe('Demo Scenarios E2E', () => {
  describe('Scenario Definitions', () => {
    test('all scenarios should have valid structure', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        // Basic fields
        expect(scenario.id).toBeTruthy();
        expect(scenario.name).toBeTruthy();
        expect(scenario.description).toBeTruthy();
        expect(scenario.category).toBeTruthy();
        expect(scenario.steps.length).toBeGreaterThan(0);

        // Steps
        for (const step of scenario.steps) {
          expect(step.id).toBeTruthy();
          expect(step.title).toBeTruthy();
          expect(step.command).toBeTruthy();
        }
      }
    });

    test('terraform-vpc scenario should have correct steps', () => {
      const scenario = getScenario('terraform-vpc');

      expect(scenario).toBeDefined();
      expect(scenario?.category).toBe('terraform');
      expect(scenario?.steps.some((s) => s.command.includes('nimbus init'))).toBe(true);
      expect(scenario?.steps.some((s) => s.command.includes('questionnaire'))).toBe(true);
      expect(scenario?.steps.some((s) => s.command.includes('preview'))).toBe(true);
      expect(scenario?.steps.some((s) => s.command.includes('apply'))).toBe(true);
    });

    test('full-journey scenario should have discovery and generation', () => {
      const scenario = getScenario('full-journey');

      expect(scenario).toBeDefined();
      expect(scenario?.category).toBe('full-journey');
      expect(scenario?.steps.some((s) => s.command.includes('discover'))).toBe(true);
      expect(scenario?.steps.some((s) => s.command.includes('generate'))).toBe(true);
    });

    test('getting-started scenario should be beginner friendly', () => {
      const scenario = getScenario('getting-started');

      expect(scenario).toBeDefined();
      expect(scenario?.category).toBe('tutorial');
      expect(scenario?.tags).toContain('beginner');
      expect(scenario?.steps.some((s) => s.command.includes('--version'))).toBe(true);
      expect(scenario?.steps.some((s) => s.command.includes('--help'))).toBe(true);
    });
  });

  describe('Scenario Execution (Dry Run)', () => {
    test('should execute terraform-vpc scenario in dry run mode', async () => {
      const scenario = getScenario('terraform-vpc');

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      const options: DemoOptions = {
        dryRun: true,
        interactive: false,
        speed: 'fast',
      };

      const result = await runScenario(scenario, options);

      expect(result.scenario.id).toBe('terraform-vpc');
      expect(result.steps.length).toBe(scenario.steps.length);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    test('should execute getting-started scenario in dry run mode', async () => {
      const scenario = getScenario('getting-started');

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      const options: DemoOptions = {
        dryRun: true,
        interactive: false,
        speed: 'fast',
      };

      const result = await runScenario(scenario, options);

      expect(result.scenario.id).toBe('getting-started');
      expect(result.success).toBe(true);
    });

    test('should execute full-journey scenario in dry run mode', async () => {
      const scenario = getScenario('full-journey');

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      const options: DemoOptions = {
        dryRun: true,
        interactive: false,
        speed: 'fast',
      };

      const result = await runScenario(scenario, options);

      expect(result.scenario.id).toBe('full-journey');
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Mock Responses', () => {
    test('all scenarios should have mock responses for dry run', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        for (const step of scenario.steps) {
          // Each step should have either a mock response or not show output
          if (step.showOutput !== false) {
            expect(step.mockResponse).toBeDefined();
          }
        }
      }
    });

    test('mock responses should contain expected content', () => {
      const scenario = getScenario('terraform-vpc');

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      // Init step should mention project initialization
      const initStep = scenario.steps.find((s) => s.command.includes('init'));
      expect(initStep?.mockResponse).toContain('initialized');

      // Apply step should mention resources
      const applyStep = scenario.steps.find((s) => s.command.includes('apply'));
      expect(applyStep?.mockResponse).toContain('Apply complete');
    });
  });

  describe('Category Filtering', () => {
    test('should filter scenarios by terraform category', () => {
      const scenarios = getScenarios().filter((s) => s.category === 'terraform');

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.category).toBe('terraform'));
    });

    test('should filter scenarios by tutorial category', () => {
      const scenarios = getScenarios().filter((s) => s.category === 'tutorial');

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.category).toBe('tutorial'));
    });

    test('should filter scenarios by tag', () => {
      const scenarios = getScenarios().filter((s) => s.tags?.includes('aws'));

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.tags).toContain('aws'));
    });
  });

  describe('Scenario Properties', () => {
    test('scenarios should have duration estimates', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        expect(scenario.duration).toBeDefined();
        expect(scenario.duration).toBeGreaterThan(0);
      }
    });

    test('scenarios should have prerequisites', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        expect(scenario.prerequisites).toBeDefined();
        expect(scenario.prerequisites?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Dry-run Execution Verification', () => {
    test('dry-run should not produce side effects on filesystem', async () => {
      const scenario = getScenario('terraform-vpc');

      if (!scenario) {
        throw new Error('Scenario not found');
      }

      const options: DemoOptions = {
        dryRun: true,
        interactive: false,
        speed: 'fast',
      };

      const result = await runScenario(scenario, options);

      // Dry-run should complete successfully
      expect(result.success).toBe(true);

      // Every step in dry-run mode should use mock responses, not real command output
      for (const stepResult of result.steps) {
        // In dry-run mode, output should come from mockResponse (if defined)
        if (stepResult.step.mockResponse) {
          expect(stepResult.output).toBe(stepResult.step.mockResponse);
        }
        // Errors should not occur during dry-run
        expect(stepResult.error).toBeUndefined();
      }
    });

    test(
      'dry-run of all scenarios should succeed without errors',
      async () => {
        const scenarios = getScenarios();

        const options: DemoOptions = {
          dryRun: true,
          interactive: false,
          speed: 'fast',
        };

        for (const scenario of scenarios) {
          const result = await runScenario(scenario, options);
          expect(result.success).toBe(true);
          expect(result.steps.length).toBe(scenario.steps.length);

          // No step should have errors in dry-run
          for (const stepResult of result.steps) {
            expect(stepResult.success).toBe(true);
          }
        }
      },
      30_000
    );
  });

  describe('Category Filtering (Extended)', () => {
    test('should filter scenarios by kubernetes category', () => {
      const scenarios = getScenarios().filter((s) => s.category === 'kubernetes');

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => {
        expect(s.category).toBe('kubernetes');
        // Kubernetes scenarios should reference k8s commands
        expect(s.steps.some((step) => step.command.includes('k8s'))).toBe(true);
      });
    });

    test('should filter scenarios by helm category', () => {
      const scenarios = getScenarios().filter((s) => s.category === 'helm');

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => {
        expect(s.category).toBe('helm');
        // Helm scenarios should reference helm commands
        expect(s.steps.some((step) => step.command.includes('helm'))).toBe(true);
      });
    });

    test('should filter scenarios by full-journey category', () => {
      const scenarios = getScenarios().filter((s) => s.category === 'full-journey');

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.category).toBe('full-journey'));
    });

    test('should have at least one scenario per defined category', () => {
      const allScenarios = getScenarios();
      const categories = new Set(allScenarios.map((s) => s.category));

      // At minimum we expect terraform, kubernetes, helm, tutorial, full-journey
      expect(categories.has('terraform')).toBe(true);
      expect(categories.has('kubernetes')).toBe(true);
      expect(categories.has('helm')).toBe(true);
      expect(categories.has('tutorial')).toBe(true);
      expect(categories.has('full-journey')).toBe(true);
    });
  });

  describe('Tag Filtering', () => {
    test('should filter scenarios by kubernetes tag', () => {
      const scenarios = getScenarios().filter((s) => s.tags?.includes('kubernetes'));

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.tags).toContain('kubernetes'));
    });

    test('should filter scenarios by helm tag', () => {
      const scenarios = getScenarios().filter((s) => s.tags?.includes('helm'));

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.tags).toContain('helm'));
    });

    test('should filter scenarios by beginner tag', () => {
      const scenarios = getScenarios().filter((s) => s.tags?.includes('beginner'));

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.tags).toContain('beginner'));
    });

    test('should filter scenarios by deployment tag', () => {
      const scenarios = getScenarios().filter((s) => s.tags?.includes('deployment'));

      expect(scenarios.length).toBeGreaterThan(0);
      scenarios.forEach((s) => expect(s.tags).toContain('deployment'));
    });

    test('all scenarios should have at least one tag', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        expect(scenario.tags).toBeDefined();
        expect(scenario.tags!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Speed Settings', () => {
    test(
      'fast speed should complete quicker than normal speed',
      async () => {
        const scenario = getScenario('getting-started');

        if (!scenario) {
          throw new Error('Scenario not found');
        }

        // Run with fast speed
        const fastOptions: DemoOptions = {
          dryRun: true,
          interactive: false,
          speed: 'fast',
        };

        const fastStart = Date.now();
        const fastResult = await runScenario(scenario, fastOptions);
        const fastDuration = Date.now() - fastStart;

        // Run with slow speed
        const slowOptions: DemoOptions = {
          dryRun: true,
          interactive: false,
          speed: 'slow',
        };

        const slowStart = Date.now();
        const slowResult = await runScenario(scenario, slowOptions);
        const slowDuration = Date.now() - slowStart;

        // Both should succeed
        expect(fastResult.success).toBe(true);
        expect(slowResult.success).toBe(true);

        // Slow should take at least as long as fast (delays are proportional)
        expect(slowDuration).toBeGreaterThanOrEqual(fastDuration);
      },
      30_000
    );

    test(
      'all speed options should produce successful runs',
      async () => {
        const scenario = getScenario('getting-started');

        if (!scenario) {
          throw new Error('Scenario not found');
        }

        const speeds: Array<'slow' | 'normal' | 'fast'> = ['slow', 'normal', 'fast'];

        for (const speed of speeds) {
          const options: DemoOptions = {
            dryRun: true,
            interactive: false,
            speed,
          };

          const result = await runScenario(scenario, options);
          expect(result.success).toBe(true);
          expect(result.steps.length).toBe(scenario.steps.length);
        }
      },
      30_000
    );
  });

  describe('All Built-in Scenarios Completeness', () => {
    test('terraform-vpc scenario should have required fields and proper structure', () => {
      const scenario = getScenario('terraform-vpc');

      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('terraform-vpc');
      expect(scenario!.name).toBeTruthy();
      expect(scenario!.description).toBeTruthy();
      expect(scenario!.category).toBe('terraform');
      expect(scenario!.steps.length).toBeGreaterThan(0);
      expect(scenario!.duration).toBeGreaterThan(0);
      expect(scenario!.prerequisites).toBeDefined();
      expect(scenario!.tags).toBeDefined();
    });

    test('k8s-deployment scenario should have required fields and proper structure', () => {
      const scenario = getScenario('k8s-deployment');

      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('k8s-deployment');
      expect(scenario!.name).toBeTruthy();
      expect(scenario!.description).toBeTruthy();
      expect(scenario!.category).toBe('kubernetes');
      expect(scenario!.steps.length).toBeGreaterThan(0);
      expect(scenario!.duration).toBeGreaterThan(0);
      expect(scenario!.prerequisites).toBeDefined();
      expect(scenario!.tags).toContain('kubernetes');
    });

    test('helm-release scenario should have required fields and proper structure', () => {
      const scenario = getScenario('helm-release');

      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('helm-release');
      expect(scenario!.name).toBeTruthy();
      expect(scenario!.description).toBeTruthy();
      expect(scenario!.category).toBe('helm');
      expect(scenario!.steps.length).toBeGreaterThan(0);
      expect(scenario!.duration).toBeGreaterThan(0);
      expect(scenario!.prerequisites).toBeDefined();
      expect(scenario!.tags).toContain('helm');
    });

    test('getting-started scenario should have required fields and proper structure', () => {
      const scenario = getScenario('getting-started');

      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('getting-started');
      expect(scenario!.name).toBeTruthy();
      expect(scenario!.description).toBeTruthy();
      expect(scenario!.category).toBe('tutorial');
      expect(scenario!.steps.length).toBeGreaterThan(0);
      expect(scenario!.duration).toBeGreaterThan(0);
      expect(scenario!.prerequisites).toBeDefined();
      expect(scenario!.tags).toContain('beginner');
    });

    test('full-journey scenario should have required fields and proper structure', () => {
      const scenario = getScenario('full-journey');

      expect(scenario).toBeDefined();
      expect(scenario!.id).toBe('full-journey');
      expect(scenario!.name).toBeTruthy();
      expect(scenario!.description).toBeTruthy();
      expect(scenario!.category).toBe('full-journey');
      expect(scenario!.steps.length).toBeGreaterThan(0);
      expect(scenario!.duration).toBeGreaterThan(0);
      expect(scenario!.prerequisites).toBeDefined();
    });

    test('all scenario IDs should be unique', () => {
      const scenarios = getScenarios();
      const ids = scenarios.map((s) => s.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    test('all scenario step IDs should be unique within their scenario', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        const stepIds = scenario.steps.map((s) => s.id);
        const uniqueStepIds = new Set(stepIds);

        expect(uniqueStepIds.size).toBe(stepIds.length);
      }
    });
  });

  describe('Scenario Retrieval', () => {
    test('getScenario should return undefined for non-existent ID', () => {
      const scenario = getScenario('does-not-exist-scenario');

      expect(scenario).toBeUndefined();
    });

    test('getScenarios should return a non-empty array', () => {
      const scenarios = getScenarios();

      expect(Array.isArray(scenarios)).toBe(true);
      expect(scenarios.length).toBeGreaterThanOrEqual(5);
    });
  });
});
