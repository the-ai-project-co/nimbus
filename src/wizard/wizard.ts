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
  private stepHistory: number[] = [];
  private contextSnapshots: Map<number, TContext> = new Map();
  private currentStepIndex: number = 0;

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

      const steps = this.config.steps;
      this.currentStepIndex = 0;

      while (this.currentStepIndex < steps.length) {
        if (this.cancelled) {
          break;
        }

        const step = steps[this.currentStepIndex];

        // Check step condition
        if (step.condition && !step.condition(this.context)) {
          this.currentStepIndex++;
          continue;
        }

        // Save context snapshot before executing step (for back navigation)
        this.contextSnapshots.set(this.currentStepIndex, { ...this.context });

        // Execute step
        const result = await this.runStep(step);

        if (!result.success) {
          if (step.canSkip) {
            ui.warning(`Skipping step: ${step.title}`);
            this.currentStepIndex++;
            continue;
          }

          throw new Error(result.error || `Step "${step.title}" failed`);
        }

        // Merge step data into context
        if (result.data) {
          this.context = { ...this.context, ...result.data };
        }

        this.completedSteps.push(step.id);
        this.stepHistory.push(this.currentStepIndex);

        // Handle step navigation
        if (result.skipRemaining) {
          break;
        }

        if (result.nextStep) {
          // Jump to specific step by id
          const targetIdx = steps.findIndex(s => s.id === result.nextStep);
          if (targetIdx >= 0) {
            this.currentStepIndex = targetIdx;
            continue;
          }
        }

        this.currentStepIndex++;
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
   * Go back to the previous step, restoring its context snapshot.
   * Returns true if navigation succeeded, false if there is no previous step.
   */
  goBack(): boolean {
    if (this.stepHistory.length === 0) {
      return false;
    }

    const previousIndex = this.stepHistory.pop()!;

    // Restore context snapshot from before the previous step executed
    const snapshot = this.contextSnapshots.get(previousIndex);
    if (snapshot) {
      this.context = { ...snapshot };
    }

    // Remove the step from completed steps
    const step = this.config.steps[previousIndex];
    const completedIdx = this.completedSteps.lastIndexOf(step.id);
    if (completedIdx >= 0) {
      this.completedSteps.splice(completedIdx, 1);
    }

    this.currentStepIndex = previousIndex;
    return true;
  }

  /**
   * Check if back navigation is possible
   */
  canGoBack(): boolean {
    return this.stepHistory.length > 0;
  }

  /**
   * Get the current step index (zero-based)
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
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
