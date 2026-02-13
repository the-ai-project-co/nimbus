/**
 * Resume Command
 * Resume a task from its last checkpoint
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../wizard/ui';
import { CoreEngineClient } from '../clients/core-engine-client';

export interface ResumeOptions {
  taskId?: string;
}

export async function resumeCommand(taskIdOrOptions: string | ResumeOptions = {}): Promise<void> {
  const taskId = typeof taskIdOrOptions === 'string'
    ? taskIdOrOptions
    : taskIdOrOptions.taskId;

  if (!taskId) {
    ui.error('Task ID is required. Usage: nimbus resume <task-id>');
    process.exit(1);
  }

  ui.header('Resume Task');
  ui.info(`Task ID: ${taskId}`);
  ui.newLine();

  const client = new CoreEngineClient();

  const available = await client.isAvailable();
  if (!available) {
    ui.error('Core Engine service is not available.');
    process.exit(1);
  }

  ui.startSpinner({ message: 'Resuming task from checkpoint...' });

  try {
    const result = await client.resumeTask(taskId);

    if (result.success) {
      ui.stopSpinnerSuccess('Task resumed and completed successfully');
      ui.newLine();
      if (result.data) {
        const executionResults = result.data.executionResults || [];
        ui.print(`Steps completed: ${executionResults.length}`);
      }
    } else {
      ui.stopSpinnerFail('Resume failed');
      ui.error(result.error || 'Unknown error');
      process.exit(1);
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Resume failed');
    ui.error(error.message || 'Failed to resume task');
    process.exit(1);
  }
}
