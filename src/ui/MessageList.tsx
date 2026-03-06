/**
 * MessageList Component
 *
 * Renders the scrollable conversation history. User messages get a cyan "You:"
 * prefix, assistant messages show "Agent ({mode}):" in green, and system
 * messages are rendered in dim italic text. Code blocks are wrapped in a
 * bordered Box with syntax highlighting.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { UIMessage, AgentMode } from './types';

/** Props accepted by the MessageList component. */
export interface MessageListProps {
  messages: UIMessage[];
  mode: AgentMode;
  /** Maximum number of messages to display. Defaults to dynamic based on terminal rows. */
  maxVisible?: number;
  /** Number of messages to scroll back from the bottom (C1). */
  scrollOffset?: number;
  /** Filter messages to those containing this substring (M1). */
  searchQuery?: string;
  /** C1: Terminal column width for separator sizing. */
  columns?: number;
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

/** Public re-export for pre-computation in consumers (PERF-4b). */
export type ContentSegmentPublic = ContentSegment;

/** Raw (uncached) parse implementation. */
function _parseContentRaw(raw: string): ContentSegment[] {
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
 * Module-level LRU-ish cache for parsed content segments.
 * Hard cap at 200 entries with FIFO eviction to bound memory usage during streaming.
 * Exported for testing.
 */
export const _parseContentCache: Map<string, ContentSegment[]> = new Map();
const _PARSE_CACHE_MAX = 200;

function parseContent(raw: string): ContentSegment[] {
  const cached = _parseContentCache.get(raw);
  if (cached !== undefined) return cached;

  const result = _parseContentRaw(raw);

  if (_parseContentCache.size >= _PARSE_CACHE_MAX) {
    // FIFO eviction: delete the oldest entry
    const firstKey = _parseContentCache.keys().next().value;
    if (firstKey !== undefined) _parseContentCache.delete(firstKey);
  }
  _parseContentCache.set(raw, result);
  return result;
}

/** Exported for testing only. */
export function _parseContentForTesting(raw: string): ContentSegment[] {
  return parseContent(raw);
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

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
  'case', 'esac', 'in', 'function', 'return', 'exit', 'echo', 'export',
  'source', 'local', 'readonly', 'declare', 'unset', 'shift', 'break',
  'continue', 'trap', 'set', 'unset', 'true', 'false',
]);

const DOCKERFILE_INSTRUCTIONS = new Set([
  'FROM', 'RUN', 'COPY', 'ADD', 'ENV', 'ARG', 'EXPOSE', 'CMD',
  'ENTRYPOINT', 'WORKDIR', 'LABEL', 'USER', 'VOLUME', 'ONBUILD',
  'HEALTHCHECK', 'STOPSIGNAL', 'SHELL',
]);

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'DISTINCT',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'DATABASE',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT',
  'CONSTRAINT', 'CASCADE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION',
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer',
  'on', 'and', 'or', 'not', 'in', 'is', 'null', 'as', 'distinct',
  'order', 'by', 'group', 'having', 'limit', 'offset',
  'insert', 'into', 'values', 'update', 'set', 'delete',
  'create', 'drop', 'alter', 'table', 'index', 'view', 'database',
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
  if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh') {
    return BASH_KEYWORDS;
  }
  if (lang === 'sql') {
    return SQL_KEYWORDS;
  }
  // yaml, json, dockerfile use custom tokenizers — return empty set
  if (lang === 'yaml' || lang === 'yml' || lang === 'json' || lang === 'dockerfile' || lang === 'docker') {
    return new Set();
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

/** Tokenize a YAML line. Keys are cyan, values green, anchors magenta, --- gray. */
function tokenizeYamlLine(line: string): Token[] {
  const tokens: Token[] = [];
  const trimmed = line.trim();

  // Document separator
  if (trimmed === '---' || trimmed === '...') {
    return [{ type: 'comment', text: line }];
  }
  // Comments
  if (trimmed.startsWith('#')) {
    return [{ type: 'comment', text: line }];
  }
  // Anchors and aliases
  if (trimmed.startsWith('&') || trimmed.startsWith('*')) {
    return [{ type: 'type', text: line }];
  }
  // Key: value pattern
  const keyMatch = line.match(/^(\s*)([\w\-./]+)(\s*:\s*)(.*)/);
  if (keyMatch) {
    const [, indent, key, colon, value] = keyMatch;
    if (indent) tokens.push({ type: 'plain', text: indent });
    tokens.push({ type: 'type', text: key });
    tokens.push({ type: 'plain', text: colon });
    if (value) {
      if (value.startsWith('"') || value.startsWith("'")) {
        tokens.push({ type: 'string', text: value });
      } else if (/^\d/.test(value) || value === 'true' || value === 'false' || value === 'null') {
        tokens.push({ type: 'number', text: value });
      } else {
        tokens.push({ type: 'plain', text: value });
      }
    }
    return tokens;
  }
  // List items
  if (trimmed.startsWith('-')) {
    const dashIdx = line.indexOf('-');
    tokens.push({ type: 'plain', text: line.slice(0, dashIdx + 1) });
    const rest = line.slice(dashIdx + 1);
    if (rest.trim()) tokens.push({ type: 'string', text: rest });
    return tokens;
  }
  return [{ type: 'plain', text: line }];
}

/** Tokenize a JSON line. Keys cyan, string values green, numbers/booleans yellow/magenta. */
function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // String — could be key or value
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, line.length);
      const str = line.slice(i, j);
      // Check if it's a key (followed by optional space and colon)
      const afterStr = line.slice(j).trimStart();
      if (afterStr.startsWith(':')) {
        tokens.push({ type: 'type', text: str });
      } else {
        tokens.push({ type: 'string', text: str });
      }
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9\-]/.test(line[i]) && (i === 0 || /[\s,\[{:]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.\-eE+]/.test(line[j])) j++;
      tokens.push({ type: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }
    // Keywords: true, false, null
    if (/[a-z]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-z]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (word === 'true' || word === 'false' || word === 'null') {
        tokens.push({ type: 'type', text: word });
      } else {
        tokens.push({ type: 'plain', text: word });
      }
      i = j;
      continue;
    }
    tokens.push({ type: 'plain', text: line[i] });
    i++;
  }
  return tokens;
}

/** Tokenize a Dockerfile line. Instructions are magenta. */
function tokenizeDockerfileLine(line: string): Token[] {
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) {
    return [{ type: 'comment', text: line }];
  }
  const instrMatch = trimmed.match(/^([A-Z]+)(\s+.*)?$/);
  if (instrMatch && DOCKERFILE_INSTRUCTIONS.has(instrMatch[1])) {
    const tokens: Token[] = [];
    const leadingSpaces = line.length - line.trimStart().length;
    if (leadingSpaces > 0) tokens.push({ type: 'plain', text: line.slice(0, leadingSpaces) });
    tokens.push({ type: 'keyword', text: instrMatch[1] });
    if (instrMatch[2]) tokens.push({ type: 'plain', text: instrMatch[2] });
    return tokens;
  }
  return [{ type: 'plain', text: line }];
}

/** Tokenize a bash line with variable references and flags. */
function tokenizeBashLine(line: string, keywords: Set<string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // Comments
    if (line[i] === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      tokens.push({ type: 'comment', text: line.slice(i) });
      return tokens;
    }
    // Variable references $VAR or ${VAR}
    if (line[i] === '$') {
      let j = i + 1;
      if (line[j] === '{') {
        j++;
        while (j < line.length && line[j] !== '}') j++;
        j = Math.min(j + 1, line.length);
      } else {
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      }
      tokens.push({ type: 'number', text: line.slice(i, j) });
      i = j;
      continue;
    }
    // Strings
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, line.length);
      tokens.push({ type: 'string', text: line.slice(i, j) });
      i = j;
      continue;
    }
    // Flags (words starting with -)
    if (line[i] === '-' && i > 0 && /\s/.test(line[i - 1])) {
      let j = i;
      while (j < line.length && !/\s/.test(line[j])) j++;
      tokens.push({ type: 'comment', text: line.slice(i, j) });
      i = j;
      continue;
    }
    // Words / keywords
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ type: 'keyword', text: word });
      } else {
        tokens.push({ type: 'plain', text: word });
      }
      i = j;
      continue;
    }
    tokens.push({ type: 'plain', text: line[i] });
    i++;
  }
  return tokens;
}

/**
 * Tokenize a single line of code into typed tokens for syntax highlighting.
 */
function tokenizeLine(line: string, keywords: Set<string>, types: Set<string>, language?: string): Token[] {
  // Language-specific fast paths
  if (language) {
    const lang = language.toLowerCase();
    if (lang === 'yaml' || lang === 'yml') return tokenizeYamlLine(line);
    if (lang === 'json') return tokenizeJsonLine(line);
    if (lang === 'dockerfile' || lang === 'docker') return tokenizeDockerfileLine(line);
    if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh') return tokenizeBashLine(line, keywords);
  }
  // Generic tokenizer below
  /* falls through */
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

  // useMemo avoids re-tokenizing all lines on every render (PERF-3c).
  // Invalidated only when content or language changes.
  const tokenizedLines = useMemo(
    () => lines.map(line => tokenizeLine(line, keywords, types, language)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, language]
  );

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={0}>
      {language && (
        <Text dimColor italic>
          {language}
        </Text>
      )}
      {tokenizedLines.map((tokens, lineIdx) => (
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
      ))}
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
          {'  - '}
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
 * H2: Highlight occurrences of `query` within `text` in yellow/bold.
 * Returns a React node with matching portions highlighted.
 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text.toLowerCase().includes(query.toLowerCase())) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase() ? (
          <Text key={i} color="yellow" bold>{p}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        )
      )}
    </>
  );
}

/**
 * M6: Parse a subagent tag from message content.
 * Returns the subagent name if the content starts with "[subagent:<name>]",
 * otherwise returns null.
 */
function parseSubagentTag(content: string): string | null {
  const match = content.match(/^\[subagent:(\w+)\]/);
  if (match) return match[1];
  return null;
}

/**
 * M6: Strip the subagent tag prefix from content for clean rendering.
 */
function stripSubagentTag(content: string): string {
  return content.replace(/^\[subagent:\w+\]\s*/, '');
}

/**
 * Render a single message row with role label and body.
 */
function MessageRow({ message, mode, searchQuery }: { message: UIMessage; mode: AgentMode; searchQuery?: string }) {
  if (message.role === 'system') {
    return (
      <Box marginBottom={1}>
        <Text dimColor italic wrap="wrap">
          {searchQuery ? highlightText(message.content, searchQuery) : message.content}
        </Text>
      </Box>
    );
  }

  const isUser = message.role === 'user';

  // M6: Detect subagent messages — assistant messages whose content starts with [subagent:<name>]
  const subagentName = !isUser ? parseSubagentTag(message.content) : null;
  const displayContent = subagentName ? stripSubagentTag(message.content) : message.content;

  const label = isUser
    ? 'You: '
    : subagentName
      ? `[@${subagentName}]: `
      : `Agent (${mode}): `;
  const labelColor = isUser ? 'cyan' : subagentName ? 'magenta' : 'green';
  const time = message.timestamp.toLocaleTimeString();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={labelColor}>
          {label}
        </Text>
        {subagentName && (
          <Text dimColor italic>{`subagent `}</Text>
        )}
        <Text dimColor>{time}</Text>
      </Box>
      <Box marginLeft={2}>
        {searchQuery
          ? <Text wrap="wrap">{highlightText(displayContent, searchQuery)}</Text>
          : <MessageBody content={displayContent} />
        }
      </Box>
    </Box>
  );
}

/** Props for HistoricalMessages. */
interface HistoricalMessagesProps {
  messages: UIMessage[];
  mode: AgentMode;
  searchQuery?: string;
}

/**
 * Renders all-but-the-last visible messages with React.memo to prevent
 * re-rendering historical messages during streaming of the latest message.
 * The custom comparator returns true (skip re-render) when the messages array
 * reference and length are both unchanged and mode hasn't changed.
 */
const HistoricalMessages = React.memo(
  function HistoricalMessages({ messages, mode, searchQuery }: HistoricalMessagesProps) {
    return (
      <>
        {messages.map((msg, idx) => {
          // M3: Insert a dim turn boundary separator after an assistant message
          // that is immediately followed by a user message (new conversation turn).
          const nextMsg = messages[idx + 1];
          const showSeparator =
            msg.role === 'assistant' &&
            nextMsg !== undefined &&
            nextMsg.role === 'user';
          return (
            <React.Fragment key={msg.id}>
              <MessageRow message={msg} mode={mode} searchQuery={searchQuery} />
              {showSeparator && (
                <Box marginBottom={1}>
                  <Text dimColor>{'─'.repeat(40)}</Text>
                </Box>
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  },
  (prev, next) =>
    prev.messages === next.messages &&
    prev.messages.length === next.messages.length &&
    prev.mode === next.mode &&
    prev.searchQuery === next.searchQuery
);

/** Copy text to clipboard using platform-native CLI tools. */
function copyToClipboard(text: string): void {
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const { platform } = process;
    if (platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    } else if (platform === 'linux') {
      try {
        execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      } catch {
        execSync('xdg-open', { stdio: 'ignore' }); // fallback: at least don't crash
      }
    } else if (platform === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    }
  } catch {
    // Clipboard unavailable — silently ignore
  }
}

/** Exported alias for testing (H1). */
export const _copyToClipboard = copyToClipboard;

/**
 * MessageList displays the most recent messages that fit the display limit.
 * Older messages are trimmed from the top so the view always shows the latest
 * conversation turns.
 *
 * PERF-3a: Splits visible messages into HistoricalMessages (memoised) +
 * the last message rendered inline, so streaming tokens only cause the last
 * message to re-render.
 */
export function MessageList({ messages, mode, maxVisible, scrollOffset = 0, searchQuery, columns }: MessageListProps) {
  // C2: Dynamic default — show 2.5x the terminal row height, minimum 50
  const effectiveMaxVisible = maxVisible ?? Math.max(50, Math.floor((process.stdout.rows ?? 40) * 2.5));
  const truncated = messages.length > effectiveMaxVisible;
  const visible = useMemo(
    () => truncated ? messages.slice(messages.length - effectiveMaxVisible) : messages,
    [messages, truncated, effectiveMaxVisible]
  );

  // M1: Filter messages by search query when set
  const filteredVisible = searchQuery
    ? visible.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : visible;

  // C1: Apply scroll offset — trim from the bottom so the user can read history
  const scrolledVisible = scrollOffset > 0
    ? filteredVisible.slice(0, Math.max(0, filteredVisible.length - scrollOffset))
    : filteredVisible;

  // DevOps-first welcome splash when no messages yet
  if (scrolledVisible.length === 0) {
    if (searchQuery) {
      return (
        <Box paddingX={1} paddingY={1}>
          <Text dimColor>No messages match &quot;{searchQuery}&quot;</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">What would you like to do?</Text>
        <Text> </Text>
        <Text dimColor>Infrastructure:</Text>
        <Text dimColor>  run terraform plan and show me what will change</Text>
        <Text dimColor>  check for pod restarts in the production namespace</Text>
        <Text dimColor>  upgrade the nginx helm release to the latest chart</Text>
        <Text dimColor>  show me infrastructure drift in this workspace</Text>
        <Text> </Text>
        <Text dimColor>Incident response:</Text>
        <Text dimColor>  high CPU on api-service pods — investigate and suggest fixes</Text>
        <Text dimColor>  the staging deployment is failing — show me the logs</Text>
        <Text> </Text>
        <Text dimColor>Generation:</Text>
        <Text dimColor>  generate terraform for an RDS PostgreSQL instance in us-east-1</Text>
        <Text dimColor>  create k8s manifests for a 3-replica nginx deployment</Text>
        <Text> </Text>
        <Text dimColor>Press ? for keyboard shortcuts  |  /help for commands  |  /init to set up context</Text>
      </Box>
    );
  }

  const historical = scrolledVisible.slice(0, -1);
  const last = scrolledVisible[scrolledVisible.length - 1];

  return (
    <Box flexDirection="column" paddingX={1}>
      {truncated && !searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor italic>
            ↑ {messages.length - effectiveMaxVisible} earlier messages — /compact to summarize or /clear to reset
          </Text>
        </Box>
      )}
      {searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor italic>
            Search: "{searchQuery}" — showing {filteredVisible.length} of {visible.length} messages
          </Text>
        </Box>
      )}
      {historical.length > 0 && (
        <HistoricalMessages messages={historical} mode={mode} searchQuery={searchQuery} />
      )}
      <MessageRow key={last.id} message={last} mode={mode} searchQuery={searchQuery} />
    </Box>
  );
}
