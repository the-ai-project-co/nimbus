/**
 * Resume Command
 * Resume a Nimbus session by ID (or last session if omitted).
 * Looks up sessions from SQLite, then launches chat with that session.
 */

import { ui } from '../wizard/ui';
import { SessionManager } from '../sessions/manager';

export interface ResumeOptions {
  taskId?: string;
}

export async function resumeCommand(taskIdOrOptions: string | ResumeOptions = {}): Promise<void> {
  const taskId = typeof taskIdOrOptions === 'string' ? taskIdOrOptions : taskIdOrOptions.taskId;

  ui.header('Resume Session');

  const sessionManager = SessionManager.getInstance();

  // If no taskId given, try to resume the most recent session
  if (!taskId) {
    const sessions = sessionManager.list();
    if (sessions.length === 0) {
      ui.error('No sessions found. Start a new session with "nimbus chat".');
      process.exit(1);
    }
    const lastSession = sessions[0];
    ui.info(`Resuming last session: ${lastSession.id.slice(0, 8)}`);
    const { chatCommand } = await import('./chat');
    await chatCommand({ continue: true });
    return;
  }

  // Look up specific session by ID (or prefix)
  const sessions = sessionManager.list();
  const found = sessions.find((s: { id: string }) => s.id === taskId || s.id.startsWith(taskId));

  if (!found) {
    ui.error(`Session not found. Use "nimbus sessions" to list available sessions.`);
    process.exit(1);
  }

  ui.info(`Resuming session: ${found.id.slice(0, 8)}`);
  const { chatCommand } = await import('./chat');
  await chatCommand({ continue: true });
}
