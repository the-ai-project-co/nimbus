/**
 * Interactive Wizard Framework
 *
 * Provides a step-based wizard system for complex CLI workflows
 */

import type {
  WizardStep,
  StepResult,
  WizardEvent,
  WizardEventHandler,
} from './types';
import { ui } from './ui';

export interface WizardConfig<TContext> {
  title: string;
  description?: string;
  steps: WizardStep<TContext>[];
  initialContext: TContext;
  onEvent?: WizardEventHandler;
}

export interface WizardResult<TContext> {
  success: boolean;
  context: TContext;
  completedSteps: string[];
  error?: Error;
}

/**
 * Interactive Wizard for guiding users through multi-step processes
 */
export class Wizard<TContext extends Record<string, any>> {
  private config: WizardConfig<TContext>;
  private context: TContext;
  private completedSteps: string[] = [];
  private cancelled: boolean = false;

  constructor(config: WizardConfig<TContext>) {
    this.config = config;
    this.context = { ...config.initialContext };
  }

  /**
   * Run the wizard
   */
  async run(): Promise<WizardResult<TContext>> {
    this.emit({ type: 'wizard:start' });

    try {
      // Display header
      ui.header(this.config.title, this.config.description);

      // Run each step
      for (const step of this.config.steps) {
        if (this.cancelled) {
          break;
        }

        // Check step condition
        if (step.condition && !step.condition(this.context)) {
          continue;
        }

        // Execute step
        const result = await this.runStep(step);

        if (!result.success) {
          if (step.canSkip) {
            ui.warning(`Skipping step: ${step.title}`);
            continue;
          }

          throw new Error(result.error || `Step "${step.title}" failed`);
        }

        // Merge step data into context
        if (result.data) {
          this.context = { ...this.context, ...result.data };
        }

        this.completedSteps.push(step.id);

        // Handle step navigation
        if (result.skipRemaining) {
          break;
        }

        if (result.nextStep) {
          // Jump to specific step (not implemented in this version)
          // Could be extended to support step jumping
        }
      }

      if (this.cancelled) {
        this.emit({ type: 'wizard:cancel' });
        return {
          success: false,
          context: this.context,
          completedSteps: this.completedSteps,
          error: new Error('Wizard cancelled by user'),
        };
      }

      this.emit({ type: 'wizard:complete', context: this.context });

      return {
        success: true,
        context: this.context,
        completedSteps: this.completedSteps,
      };
    } catch (error: any) {
      this.emit({ type: 'wizard:error', error });

      return {
        success: false,
        context: this.context,
        completedSteps: this.completedSteps,
        error,
      };
    }
  }

  /**
   * Run a single step
   */
  private async runStep(step: WizardStep<TContext>): Promise<StepResult> {
    this.emit({ type: 'step:start', stepId: step.id });

    // Display step header
    ui.section(step.title);
    if (step.description) {
      ui.print(ui.dim(`  ${step.description}`));
      ui.newLine();
    }

    try {
      const result = await step.execute(this.context);

      if (result.success) {
        this.emit({ type: 'step:complete', stepId: step.id, result });
      } else {
        this.emit({
          type: 'step:error',
          stepId: step.id,
          error: new Error(result.error || 'Step failed'),
        });
      }

      return result;
    } catch (error: any) {
      this.emit({ type: 'step:error', stepId: step.id, error });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancel the wizard
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Get current context
   */
  getContext(): TContext {
    return { ...this.context };
  }

  /**
   * Update context manually
   */
  updateContext(update: Partial<TContext>): void {
    this.context = { ...this.context, ...update };
  }

  /**
   * Emit an event
   */
  private emit(event: WizardEvent): void {
    this.config.onEvent?.(event);
  }
}

/**
 * Create a wizard with the given configuration
 */
export function createWizard<TContext extends Record<string, any>>(
  config: WizardConfig<TContext>
): Wizard<TContext> {
  return new Wizard(config);
}

/**
 * Step builder helpers
 */
export const stepBuilders = {
  /**
   * Create a simple step
   */
  simple<TContext>(
    id: string,
    title: string,
    execute: (context: TContext) => Promise<StepResult>
  ): WizardStep<TContext> {
    return { id, title, execute };
  },

  /**
   * Create a step with description
   */
  withDescription<TContext>(
    id: string,
    title: string,
    description: string,
    execute: (context: TContext) => Promise<StepResult>
  ): WizardStep<TContext> {
    return { id, title, description, execute };
  },

  /**
   * Create a conditional step
   */
  conditional<TContext>(
    id: string,
    title: string,
    condition: (context: TContext) => boolean,
    execute: (context: TContext) => Promise<StepResult>
  ): WizardStep<TContext> {
    return { id, title, condition, execute };
  },

  /**
   * Create a skippable step
   */
  skippable<TContext>(
    id: string,
    title: string,
    execute: (context: TContext) => Promise<StepResult>
  ): WizardStep<TContext> {
    return { id, title, canSkip: true, execute };
  },
};
