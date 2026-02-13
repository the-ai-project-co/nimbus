import { describe, test, expect } from 'bun:test';
import {
  getScenarios,
  getScenario,
} from '../../../src/demo';
import { parseDemoOptions, listDemoScenarios } from '../../../src/commands/demo';

describe('Demo Framework', () => {
  describe('getScenarios', () => {
    test('should return all available scenarios', () => {
      const scenarios = getScenarios();

      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios).toBeInstanceOf(Array);
    });

    test('should include terraform-vpc scenario', () => {
      const scenarios = getScenarios();
      const terraformVpc = scenarios.find((s) => s.id === 'terraform-vpc');

      expect(terraformVpc).toBeDefined();
      expect(terraformVpc?.category).toBe('terraform');
    });

    test('should include full-journey scenario', () => {
      const scenarios = getScenarios();
      const fullJourney = scenarios.find((s) => s.id === 'full-journey');

      expect(fullJourney).toBeDefined();
      expect(fullJourney?.category).toBe('full-journey');
    });

    test('should include getting-started scenario', () => {
      const scenarios = getScenarios();
      const gettingStarted = scenarios.find((s) => s.id === 'getting-started');

      expect(gettingStarted).toBeDefined();
      expect(gettingStarted?.category).toBe('tutorial');
    });

    test('each scenario should have required fields', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        expect(scenario.id).toBeDefined();
        expect(scenario.name).toBeDefined();
        expect(scenario.description).toBeDefined();
        expect(scenario.category).toBeDefined();
        expect(scenario.steps).toBeInstanceOf(Array);
        expect(scenario.steps.length).toBeGreaterThan(0);
      }
    });

    test('each step should have required fields', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        for (const step of scenario.steps) {
          expect(step.id).toBeDefined();
          expect(step.title).toBeDefined();
          expect(step.command).toBeDefined();
        }
      }
    });
  });

  describe('getScenario', () => {
    test('should return scenario by id', () => {
      const scenario = getScenario('terraform-vpc');

      expect(scenario).toBeDefined();
      expect(scenario?.id).toBe('terraform-vpc');
    });

    test('should return undefined for non-existent scenario', () => {
      const scenario = getScenario('non-existent');

      expect(scenario).toBeUndefined();
    });
  });

  describe('parseDemoOptions', () => {
    test('should parse --list flag', () => {
      const options = parseDemoOptions(['--list']);

      expect(options.list).toBe(true);
    });

    test('should parse -l flag', () => {
      const options = parseDemoOptions(['-l']);

      expect(options.list).toBe(true);
    });

    test('should parse --interactive flag', () => {
      const options = parseDemoOptions(['--interactive']);

      expect(options.interactive).toBe(true);
    });

    test('should parse -i flag', () => {
      const options = parseDemoOptions(['-i']);

      expect(options.interactive).toBe(true);
    });

    test('should parse --dry-run flag', () => {
      const options = parseDemoOptions(['--dry-run']);

      expect(options.dryRun).toBe(true);
    });

    test('should parse --speed option', () => {
      const options = parseDemoOptions(['--speed', 'slow']);

      expect(options.speed).toBe('slow');
    });

    test('should parse --speed fast option', () => {
      const options = parseDemoOptions(['--speed', 'fast']);

      expect(options.speed).toBe('fast');
    });

    test('should parse --category option', () => {
      const options = parseDemoOptions(['--category', 'terraform']);

      expect(options.category).toBe('terraform');
    });

    test('should parse --tag option', () => {
      const options = parseDemoOptions(['--tag', 'aws']);

      expect(options.tag).toBe('aws');
    });

    test('should parse scenario name as positional argument', () => {
      const options = parseDemoOptions(['terraform-vpc']);

      expect(options.scenario).toBe('terraform-vpc');
    });

    test('should parse multiple options', () => {
      const options = parseDemoOptions([
        'terraform-vpc',
        '--interactive',
        '--speed',
        'slow',
        '--verbose',
      ]);

      expect(options.scenario).toBe('terraform-vpc');
      expect(options.interactive).toBe(true);
      expect(options.speed).toBe('slow');
      expect(options.verbose).toBe(true);
    });
  });

  describe('listDemoScenarios', () => {
    test('should return array of scenario IDs', () => {
      const ids = listDemoScenarios();

      expect(ids).toBeInstanceOf(Array);
      expect(ids).toContain('terraform-vpc');
      expect(ids).toContain('full-journey');
      expect(ids).toContain('getting-started');
    });

    test('should return a non-empty array', () => {
      const ids = listDemoScenarios();

      expect(ids.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Additional parseDemoOptions tests
  // ==========================================

  describe('parseDemoOptions - shorthand flags', () => {
    test('should parse -n shorthand for dry-run', () => {
      const options = parseDemoOptions(['-n']);

      expect(options.dryRun).toBe(true);
    });

    test('should parse -v shorthand for verbose', () => {
      const options = parseDemoOptions(['-v']);

      expect(options.verbose).toBe(true);
    });

    test('should parse -s shorthand for speed', () => {
      const options = parseDemoOptions(['-s', 'slow']);

      expect(options.speed).toBe('slow');
    });

    test('should parse -c shorthand for category', () => {
      const options = parseDemoOptions(['-c', 'kubernetes']);

      expect(options.category).toBe('kubernetes');
    });

    test('should parse -t shorthand for tag', () => {
      const options = parseDemoOptions(['-t', 'beginner']);

      expect(options.tag).toBe('beginner');
    });
  });

  describe('parseDemoOptions - speed values', () => {
    test('should parse speed slow', () => {
      const options = parseDemoOptions(['--speed', 'slow']);

      expect(options.speed).toBe('slow');
    });

    test('should parse speed normal', () => {
      const options = parseDemoOptions(['--speed', 'normal']);

      expect(options.speed).toBe('normal');
    });

    test('should parse speed fast', () => {
      const options = parseDemoOptions(['--speed', 'fast']);

      expect(options.speed).toBe('fast');
    });

    test('should ignore invalid speed value', () => {
      const options = parseDemoOptions(['--speed', 'turbo']);

      // Invalid speed values are not assigned because the parser
      // only accepts slow/normal/fast
      expect(options.speed).toBeUndefined();
    });
  });

  describe('parseDemoOptions - category and tag filtering', () => {
    test('should parse --category terraform', () => {
      const options = parseDemoOptions(['--category', 'terraform']);

      expect(options.category).toBe('terraform');
    });

    test('should parse --category kubernetes', () => {
      const options = parseDemoOptions(['--category', 'kubernetes']);

      expect(options.category).toBe('kubernetes');
    });

    test('should parse --tag with cloud provider', () => {
      const options = parseDemoOptions(['--tag', 'gcp']);

      expect(options.tag).toBe('gcp');
    });

    test('should parse --category with --tag together', () => {
      const options = parseDemoOptions(['--category', 'terraform', '--tag', 'aws']);

      expect(options.category).toBe('terraform');
      expect(options.tag).toBe('aws');
    });

    test('should parse --list with --category', () => {
      const options = parseDemoOptions(['--list', '--category', 'helm']);

      expect(options.list).toBe(true);
      expect(options.category).toBe('helm');
    });
  });

  describe('parseDemoOptions - combined dry-run and verbose', () => {
    test('should parse --dry-run with --verbose', () => {
      const options = parseDemoOptions(['--dry-run', '--verbose']);

      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(true);
    });

    test('should parse scenario with --dry-run', () => {
      const options = parseDemoOptions(['getting-started', '--dry-run']);

      expect(options.scenario).toBe('getting-started');
      expect(options.dryRun).toBe(true);
    });

    test('should return empty options for empty args', () => {
      const options = parseDemoOptions([]);

      expect(options.scenario).toBeUndefined();
      expect(options.list).toBeUndefined();
      expect(options.dryRun).toBeUndefined();
      expect(options.verbose).toBeUndefined();
      expect(options.speed).toBeUndefined();
      expect(options.category).toBeUndefined();
      expect(options.tag).toBeUndefined();
    });
  });
});
