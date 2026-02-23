/**
 * MessageList Component
 *
 * Renders the scrollable conversation history. User messages get a cyan "You:"
 * prefix, assistant messages show "Agent ({mode}):" in green, and system
 * messages are rendered in dim italic text. Code blocks are wrapped in a
 * bordered Box for visual separation.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { UIMessage, AgentMode } from './types';

/** Props accepted by the MessageList component. */
export interface MessageListProps {
  messages: UIMessage[];
  mode: AgentMode;
  /** Maximum number of messages to display. Defaults to 50. */
  maxVisible?: number;
}

/**
 * Split message content into text segments and fenced code blocks so each
 * can be rendered with appropriate styling.
 */
interface ContentSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

function parseContent(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(raw)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: raw.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'code',
      content: match[2].trimEnd(),
      language: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  // Trailing text after the last code block (or entire string if no blocks)
  if (lastIndex < raw.length) {
    segments.push({ type: 'text', content: raw.slice(lastIndex) });
  }

  return segments;
}

/**
 * Render a single code block inside a dim bordered Box.
 */
function CodeBlock({ content, language }: { content: string; language?: string }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      marginY={0}
    >
      {language && (
        <Text dimColor italic>
          {language}
        </Text>
      )}
      <Text>{content}</Text>
    </Box>
  );
}

/**
 * Render the segments of a single message body (interleaving text and code).
 */
function MessageBody({ content }: { content: string }) {
  const segments = parseContent(content);
  return (
    <Box flexDirection="column">
      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return <CodeBlock key={idx} content={seg.content} language={seg.language} />;
        }
        return (
          <Text key={idx} wrap="wrap">
            {seg.content}
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * Render a single message row with role label and body.
 */
function MessageRow({ message, mode }: { message: UIMessage; mode: AgentMode }) {
  if (message.role === 'system') {
    return (
      <Box marginBottom={1}>
        <Text dimColor italic wrap="wrap">
          {message.content}
        </Text>
      </Box>
    );
  }

  const isUser = message.role === 'user';
  const label = isUser ? 'You: ' : `Agent (${mode}): `;
  const labelColor = isUser ? 'cyan' : 'green';
  const time = message.timestamp.toLocaleTimeString();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={labelColor}>
          {label}
        </Text>
        <Text dimColor>{time}</Text>
      </Box>
      <Box marginLeft={2}>
        <MessageBody content={message.content} />
      </Box>
    </Box>
  );
}

/**
 * MessageList displays the most recent messages that fit the display limit.
 * Older messages are trimmed from the top so the view always shows the latest
 * conversation turns.
 */
export function MessageList({ messages, mode, maxVisible = 50 }: MessageListProps) {
  const visible = messages.length > maxVisible
    ? messages.slice(messages.length - maxVisible)
    : messages;

  if (visible.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No messages yet. Type below to get started.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map((msg) => (
        <MessageRow key={msg.id} message={msg} mode={mode} />
      ))}
    </Box>
  );
}
