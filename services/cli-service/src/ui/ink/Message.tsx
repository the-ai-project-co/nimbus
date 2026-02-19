/**
 * Message Component
 *
 * Renders a single chat message with role-based coloring,
 * timestamp display, and syntax highlighting for code blocks.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';

/**
 * Apply syntax highlighting to fenced code blocks in message content.
 */
export function highlightCodeBlocks(content: string): string {
  return content.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_match, lang: string | undefined, code: string) => {
      try {
        const highlighted = highlight(code.trimEnd(), { language: lang || 'auto', ignoreIllegals: true });
        return `\n${highlighted}\n`;
      } catch {
        return `\n${code.trimEnd()}\n`;
      }
    }
  );
}

interface MessageProps {
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  };
}

export function MessageDisplay({ message }: MessageProps) {
  const roleColor =
    message.role === 'user'
      ? 'green'
      : message.role === 'assistant'
        ? 'cyan'
        : 'yellow';

  const roleLabel =
    message.role === 'user'
      ? 'You'
      : message.role === 'assistant'
        ? 'Nimbus'
        : 'System';

  const displayContent = message.role === 'assistant'
    ? highlightCodeBlocks(message.content)
    : message.content;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={roleColor}>
          {roleLabel}
        </Text>
        <Text dimColor> {message.timestamp.toLocaleTimeString()}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{displayContent}</Text>
      </Box>
    </Box>
  );
}
