/**
 * TerminalPane Component (M1)
 *
 * Read-only tool output observation pane showing the last N lines from
 * completed tool calls. Rendered alongside MessageList in a side-by-side
 * layout when active. Toggle via /terminal slash command.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { UIToolCall } from './types';

export interface TerminalPaneProps {
  /** Tool calls to display output from. */
  toolCalls: UIToolCall[];
  /** Maximum number of output lines to show (default: 20). */
  maxLines?: number;
  /** Width percentage hint for layout (unused — parent controls width). */
  width?: number;
}

/**
 * A scrollable pane showing the last tool outputs as a rolling buffer.
 */
export function TerminalPane({ toolCalls, maxLines = 20 }: TerminalPaneProps) {
  // Collect lines from all tool calls (completed + running with streaming output)
  const outputLines: Array<{ text: string; isError: boolean; toolName: string; live?: boolean }> = [];

  for (const tc of toolCalls) {
    if (tc.status === 'running') {
      // Show live streaming output for in-progress tool calls (Gap 1)
      const liveOutput = tc.streamingOutput ?? '(waiting for output...)';
      const lines = liveOutput.split('\n').filter(l => l.length > 0);
      for (const line of lines) {
        outputLines.push({ text: line, isError: false, toolName: tc.name, live: true });
      }
      continue;
    }
    if (tc.status !== 'completed' && tc.status !== 'failed') continue;
    const output = tc.result?.output ?? '';
    const isError = tc.result?.isError ?? false;
    const lines = output.split('\n').filter(l => l.length > 0);
    for (const line of lines) {
      outputLines.push({ text: line, isError, toolName: tc.name });
    }
  }

  // Show only the last maxLines lines
  const visible = outputLines.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexGrow={1}
      overflow="hidden"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Terminal Output
        </Text>
        <Text dimColor> (read-only · /terminal to toggle)</Text>
      </Box>

      {visible.length === 0 ? (
        <Text dimColor italic>No tool output yet.</Text>
      ) : (
        visible.map((line, i) => (
          <Text
            key={i}
            color={line.isError ? 'red' : line.live ? 'cyan' : undefined}
            dimColor={!line.isError && !line.live}
            wrap="truncate"
          >
            {line.live ? '[>] ' : ''}{line.text}
          </Text>
        ))
      )}
    </Box>
  );
}
