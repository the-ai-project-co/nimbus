/**
 * Ink Chat UI Entry Point
 *
 * Provides an optional rich terminal UI for the Nimbus chat command.
 * This module is loaded dynamically only when --ui=ink is passed,
 * so it will not break the CLI if ink/react are not installed.
 */

import React from 'react';
import { render } from 'ink';
import { Chat } from './Chat';

export interface InkChatOptions {
  model?: string;
  systemPrompt?: string;
  showTokenCount?: boolean;
}

export async function startInkChat(options: InkChatOptions): Promise<void> {
  const { waitUntilExit } = render(
    <Chat
      model={options.model}
      systemPrompt={options.systemPrompt}
      showTokenCount={options.showTokenCount}
    />
  );

  await waitUntilExit();
}

// Re-export all Ink UI components
export { Questionnaire } from './Questionnaire';
export { Table } from './Table';
export { Tree } from './Tree';
export { Diff } from './Diff';
export { PRList } from './PRList';
export { IssueList } from './IssueList';
export { GitStatus } from './GitStatus';
export { Confirmation } from './Confirmation';
export { Progress } from './Progress';
export { WizardShell } from './WizardShell';
export type { WizardStepInfo, WizardShellProps } from './WizardShell';
