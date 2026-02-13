/**
 * Demo Framework Types
 *
 * Type definitions for the demo scenarios framework
 */

/**
 * A single step in a demo scenario
 */
export interface DemoStep {
  /** Unique identifier for this step */
  id: string;
  /** Title shown before executing */
  title: string;
  /** Description of what this step does */
  description?: string;
  /** Command to execute */
  command: string;
  /** Whether to wait for user input before proceeding */
  waitForInput?: boolean;
  /** Expected output pattern (regex) */
  expectedOutput?: string;
  /** Time to wait after step (ms) */
  delay?: number;
  /** Whether to show command output */
  showOutput?: boolean;
  /** Mock response for demo mode (when not actually executing) */
  mockResponse?: string;
}

/**
 * A demo scenario containing multiple steps
 */
export interface DemoScenario {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: 'terraform' | 'kubernetes' | 'helm' | 'aws' | 'full-journey' | 'tutorial';
  /** Ordered list of steps */
  steps: DemoStep[];
  /** Prerequisites (e.g., "aws cli installed") */
  prerequisites?: string[];
  /** Estimated duration in minutes */
  duration?: number;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Demo runner options
 */
export interface DemoOptions {
  /** Scenario ID to run */
  scenario?: string;
  /** List available scenarios */
  list?: boolean;
  /** Interactive mode (prompt for each step) */
  interactive?: boolean;
  /** Speed: slow, normal, fast */
  speed?: 'slow' | 'normal' | 'fast';
  /** Dry run - don't execute commands */
  dryRun?: boolean;
  /** Show all output (verbose) */
  verbose?: boolean;
}

/**
 * Step execution result
 */
export interface StepResult {
  step: DemoStep;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

/**
 * Scenario execution result
 */
export interface ScenarioResult {
  scenario: DemoScenario;
  steps: StepResult[];
  success: boolean;
  totalDuration: number;
  startedAt: Date;
  completedAt: Date;
}
