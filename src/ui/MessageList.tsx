/**
 * MessageList Component
 *
 * Renders the scrollable conversation history. User messages get a cyan "You:"
 * prefix, assistant messages show "Agent ({mode}):" in green, and system
 * messages are rendered in dim italic text. Code blocks are wrapped in a
 * bordered Box with syntax highlighting.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { UIMessage, AgentMode } from './types';

/** Props accepted by the MessageList component. */
export interface MessageListProps {
  messages: UIMessage[];
  mode: AgentMode;
  /** Maximum number of messages to display. Defaults to 500. */
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

/* ---------------------------------------------------------------------------
 * Syntax highlighting
 * -------------------------------------------------------------------------*/

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'type' | 'plain';

interface Token {
  type: TokenType;
  text: string;
}

const TOKEN_COLORS: Record<TokenType, string | undefined> = {
  keyword: 'magenta',
  string: 'green',
  comment: 'gray',
  number: 'yellow',
  type: 'cyan',
  plain: undefined,
};

const JS_TS_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'of',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'true',
  'false',
  'null',
  'undefined',
]);

const PYTHON_KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'False',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'None',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'True',
  'try',
  'while',
  'with',
  'yield',
]);

const GO_KEYWORDS = new Set([
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var',
  'true',
  'false',
  'nil',
]);

const HCL_KEYWORDS = new Set([
  'resource',
  'data',
  'variable',
  'output',
  'module',
  'provider',
  'terraform',
  'locals',
  'for_each',
  'count',
  'depends_on',
  'lifecycle',
  'dynamic',
  'true',
  'false',
  'null',
]);

const JS_TS_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'any',
  'void',
  'never',
  'unknown',
  'Array',
  'Promise',
  'Record',
  'Partial',
  'Required',
  'Map',
  'Set',
  'Error',
  'Date',
  'RegExp',
  'Buffer',
]);

function getKeywords(language?: string): Set<string> {
  if (!language) {
    return JS_TS_KEYWORDS;
  }
  const lang = language.toLowerCase();
  if (lang === 'python' || lang === 'py') {
    return PYTHON_KEYWORDS;
  }
  if (lang === 'go' || lang === 'golang') {
    return GO_KEYWORDS;
  }
  if (lang === 'hcl' || lang === 'terraform' || lang === 'tf') {
    return HCL_KEYWORDS;
  }
  return JS_TS_KEYWORDS;
}

function getTypes(language?: string): Set<string> {
  if (!language) {
    return JS_TS_TYPES;
  }
  const lang = language.toLowerCase();
  if (
    lang === 'typescript' ||
    lang === 'ts' ||
    lang === 'javascript' ||
    lang === 'js' ||
    lang === 'tsx' ||
    lang === 'jsx'
  ) {
    return JS_TS_TYPES;
  }
  return new Set();
}

/**
 * Tokenize a single line of code into typed tokens for syntax highlighting.
 */
function tokenizeLine(line: string, keywords: Set<string>, types: Set<string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Single-line comments: // or #
    if (
      (line[i] === '/' && line[i + 1] === '/') ||
      (line[i] === '#' && i === line.trimStart().length - line.length + line.indexOf('#'))
    ) {
      if (line[i] === '/' && line[i + 1] === '/') {
        tokens.push({ type: 'comment', text: line.slice(i) });
        return tokens;
      }
      if (line[i] === '#') {
        tokens.push({ type: 'comment', text: line.slice(i) });
        return tokens;
      }
    }

    // Strings: "...", '...', `...`
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') {
          j++;
        } // skip escaped char
        j++;
      }
      j = Math.min(j + 1, line.length);
      tokens.push({ type: 'string', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s(,=+\-*/<>[\]{};:]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9._xXa-fA-Fn]/.test(line[j])) {
        j++;
      }
      tokens.push({ type: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Words (identifiers/keywords)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) {
        j++;
      }
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ type: 'keyword', text: word });
      } else if (types.has(word)) {
        tokens.push({ type: 'type', text: word });
      } else {
        tokens.push({ type: 'plain', text: word });
      }
      i = j;
      continue;
    }

    // Other characters (operators, punctuation, whitespace)
    tokens.push({ type: 'plain', text: line[i] });
    i++;
  }

  return tokens;
}

/**
 * Render a single code block inside a dim bordered Box with syntax highlighting.
 */
function CodeBlock({ content, language }: { content: string; language?: string }) {
  const keywords = getKeywords(language);
  const types = getTypes(language);
  const lines = content.split('\n');

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
      {language && (
        <Text dimColor italic>
          {language}
        </Text>
      )}
      {lines.map((line, lineIdx) => {
        const tokens = tokenizeLine(line, keywords, types);
        return (
          <Text key={lineIdx}>
            {tokens.map((token, tokenIdx) => {
              const color = TOKEN_COLORS[token.type];
              if (color) {
                return (
                  <Text key={tokenIdx} color={color}>
                    {token.text}
                  </Text>
                );
              }
              return <Text key={tokenIdx}>{token.text}</Text>;
            })}
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * Render a plain text segment with basic markdown formatting:
 * - **bold**, *italic*, `inline code`
 * - # headings (h1-h3)
 * - - bullet lists
 */
function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      elements.push(
        <Text key={i} bold color={level === 1 ? 'yellow' : level === 2 ? 'cyan' : 'white'}>
          {headingMatch[2]}
        </Text>
      );
      continue;
    }

    // Bullet list items
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      elements.push(
        <Text key={i} wrap="wrap">
          {bulletMatch[1]}
          {'  \u2022 '}
          {renderInlineMarkdown(bulletMatch[2])}
        </Text>
      );
      continue;
    }

    // Numbered list items
    const numMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numMatch) {
      elements.push(
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      );
      continue;
    }

    // Regular line with inline formatting
    elements.push(
      <Text key={i} wrap="wrap">
        {renderInlineMarkdown(line)}
      </Text>
    );
  }

  return <>{elements}</>;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`
 * Returns a flat array of React nodes.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // Split on inline formatting patterns
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <Text key={key++} bold>
          {match[2]}
        </Text>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <Text key={key++} italic>
          {match[3]}
        </Text>
      );
    } else if (match[4]) {
      // `inline code`
      parts.push(
        <Text key={key++} color="yellow">
          {match[4]}
        </Text>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
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
          <Box key={idx} flexDirection="column">
            <FormattedText text={seg.content} />
          </Box>
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
export function MessageList({ messages, mode, maxVisible = 500 }: MessageListProps) {
  const truncated = messages.length > maxVisible;
  const visible = truncated ? messages.slice(messages.length - maxVisible) : messages;

  if (visible.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No messages yet. Type below to get started.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {truncated && (
        <Box marginBottom={1}>
          <Text dimColor italic>
            ({messages.length - maxVisible} earlier messages hidden — use /compact to summarize or
            /clear to reset)
          </Text>
        </Box>
      )}
      {visible.map(msg => (
        <MessageRow key={msg.id} message={msg} mode={mode} />
      ))}
    </Box>
  );
}
