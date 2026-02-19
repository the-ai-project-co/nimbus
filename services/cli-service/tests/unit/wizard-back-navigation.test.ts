import { describe, test, expect } from 'bun:test';
import { Wizard, createWizard } from '../../src/wizard/wizard';
import type { WizardStep, StepResult } from '../../src/wizard/types';

describe('Wizard back navigation', () => {
  function makeStep(id: string, data: Record<string, unknown> = {}): WizardStep<any> {
    return {
      id,
      title: `Step ${id}`,
      execute: async () => ({ success: true, data }),
    };
  }

  test('goBack returns false when there is no history', () => {
    const wizard = createWizard({
      title: 'Test',
      steps: [
        makeStep('a', { name: 'Alice' }),
        makeStep('b', { age: 30 }),
        makeStep('c', { role: 'admin' }),
      ],
      initialContext: {},
    });

    // Before running, there is no history to go back to
    expect(wizard.canGoBack()).toBe(false);
    expect(wizard.goBack()).toBe(false);
  });

  test('wizard class has goBack, canGoBack, and getCurrentStepIndex methods', () => {
    const wizard = createWizard({
      title: 'Test',
      steps: [makeStep('a')],
      initialContext: {},
    });

    expect(typeof wizard.goBack).toBe('function');
    expect(typeof wizard.canGoBack).toBe('function');
    expect(typeof wizard.getCurrentStepIndex).toBe('function');
  });

  test('getCurrentStepIndex returns 0 before run', () => {
    const wizard = createWizard({
      title: 'Test',
      steps: [makeStep('a'), makeStep('b')],
      initialContext: {},
    });

    expect(wizard.getCurrentStepIndex()).toBe(0);
  });

  test('wizard source includes stepHistory and contextSnapshots', async () => {
    const source = await Bun.file(
      new URL('../../src/wizard/wizard.ts', import.meta.url).pathname
    ).text();

    expect(source).toContain('stepHistory');
    expect(source).toContain('contextSnapshots');
    expect(source).toContain('goBack');
    expect(source).toContain('canGoBack');
    expect(source).toContain('getCurrentStepIndex');
  });

  test('wizard run method uses while loop for step iteration', async () => {
    const source = await Bun.file(
      new URL('../../src/wizard/wizard.ts', import.meta.url).pathname
    ).text();

    // Should use while loop, not for-of
    expect(source).toContain('while (this.currentStepIndex < steps.length)');
    // Should save context snapshots before each step
    expect(source).toContain('this.contextSnapshots.set(this.currentStepIndex');
    // Should track step history
    expect(source).toContain('this.stepHistory.push(this.currentStepIndex)');
  });

  test('WizardShell component exists with step progress bar', async () => {
    const source = await Bun.file(
      new URL('../../src/ui/ink/WizardShell.tsx', import.meta.url).pathname
    ).text();

    expect(source).toContain('WizardShell');
    expect(source).toContain('steps');
    expect(source).toContain('currentStepIndex');
    expect(source).toContain('canGoBack');
    // Should render step indicators
    expect(source).toContain('Back');
    expect(source).toContain('Next');
    // Should show step count
    expect(source).toContain('Step');
    // Should use Unicode circle symbols for progress (stored as escape sequences in source)
    expect(source).toContain('\\u25CB'); // empty circle
    expect(source).toContain('\\u25CF'); // filled circle
    expect(source).toContain('\\u25C9'); // bullseye
  });

  test('WizardShell is exported from ink index', async () => {
    const source = await Bun.file(
      new URL('../../src/ui/ink/index.tsx', import.meta.url).pathname
    ).text();

    expect(source).toContain('WizardShell');
  });

  test('generate-terraform uses step progress display', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/generate-terraform.ts', import.meta.url).pathname
    ).text();

    // Should display step progress in TTY mode
    expect(source).toContain('Progress');
    expect(source).toContain('step:start');
    // Should check for TTY before rendering progress bar
    expect(source).toContain('process.stdout.isTTY');
    // Should use Unicode symbols for step indicators (stored as escape sequences in source)
    expect(source).toContain('\\u2713'); // checkmark for completed
    expect(source).toContain('\\u25CF'); // filled circle for current
    expect(source).toContain('\\u25CB'); // empty circle for pending
  });

  test('goBack restores context snapshot after wizard completes steps', async () => {
    const events: string[] = [];
    const wizard = createWizard({
      title: 'Context Restore Test',
      steps: [
        makeStep('a', { name: 'Alice' }),
        makeStep('b', { age: 30 }),
      ],
      initialContext: { initial: true },
      onEvent: (event) => {
        events.push(event.type);
      },
    });

    // Run the wizard (steps auto-execute and complete)
    const result = await wizard.run();

    expect(result.success).toBe(true);
    expect(result.completedSteps).toContain('a');
    expect(result.completedSteps).toContain('b');

    // After the wizard completes, canGoBack should be true since steps were tracked
    expect(wizard.canGoBack()).toBe(true);

    // Going back should restore context from step 'b'
    expect(wizard.goBack()).toBe(true);
    const ctx = wizard.getContext();
    // Context should be restored to the snapshot taken before step 'b' ran
    // which means it should have 'name' from step 'a' but NOT 'age' from step 'b'
    expect(ctx.name).toBe('Alice');
    expect(ctx.age).toBeUndefined();
  });
});
