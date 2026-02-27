/**
 * ToolCallDisplay Component
 *
 * Renders one or more tool invocations inline with the conversation. Each tool
 * call is shown in a bordered box with a header containing the tool name and
 * status indicator. While a tool is running the box shows a Spinner; on
 * completion or failure it shows a condensed result summary.
 *
 * Specialised renderers exist for common tools:
 *   - read_file: filename + optional line range
 *   - edit_file: unified diff with context lines, red/green colouring
 *   - bash: command + expandable/collapsible output
 *   - terraform: resource table
 *
 * All other tools fall through to a generic key/value display.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { UIToolCall } from './types';

/** Props accepted by the ToolCallDisplay component. */
export interface ToolCallDisplayProps {
  toolCalls: UIToolCall[];
  /** Whether tool call detail is expanded. Defaults to true. */
  expanded?: boolean;
}

/** Maximum number of output lines shown for bash tool results. */
const MAX_BASH_OUTPUT_LINES = 50;
/** Lines shown in collapsed view. */
const COLLAPSED_LINES = 20;

/* ---------------------------------------------------------------------------
 * Status badge
 * -------------------------------------------------------------------------*/

function StatusBadge({ status }: { status: UIToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Text dimColor>[pending]</Text>;
    case 'running':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case 'completed':
      return <Text color="green">[done]</Text>;
    case 'failed':
      return <Text color="red">[failed]</Text>;
  }
}

/* ---------------------------------------------------------------------------
 * Per-tool body renderers
 * -------------------------------------------------------------------------*/

function ReadFileBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const filePath = String(input.file_path ?? input.path ?? '');
  const startLine = input.start_line as number | undefined;
  const endLine = input.end_line as number | undefined;
  const rangeLabel =
    startLine != null
      ? endLine != null
        ? ` (lines ${startLine}-${endLine})`
        : ` (from line ${startLine})`
      : '';

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>file: </Text>
        <Text color="cyan">{filePath}</Text>
        <Text dimColor>{rangeLabel}</Text>
      </Text>
      {result && !result.isError && (
        <Text dimColor>{result.output.split('\n').length} lines read</Text>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
    </Box>
  );
}

/**
 * Compute a minimal unified diff between old and new text with context lines.
 */
function computeDiff(oldStr: string, newStr: string): React.ReactNode[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const elements: React.ReactNode[] = [];

  // Find common prefix
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix (from the end, but not overlapping with prefix)
  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // Context: show up to 2 lines before the diff
  const contextStart = Math.max(0, prefixLen - 2);
  for (let i = contextStart; i < prefixLen; i++) {
    elements.push(
      <Text key={`ctx-pre-${i}`} dimColor>
        {' '}
        {oldLines[i]}
      </Text>
    );
  }

  // Removed lines (from old)
  const oldDiffEnd = oldLines.length - suffixLen;
  for (let i = prefixLen; i < oldDiffEnd; i++) {
    elements.push(
      <Text key={`rm-${i}`} color="red">
        - {oldLines[i]}
      </Text>
    );
  }

  // Added lines (from new)
  const newDiffEnd = newLines.length - suffixLen;
  for (let i = prefixLen; i < newDiffEnd; i++) {
    elements.push(
      <Text key={`add-${i}`} color="green">
        + {newLines[i]}
      </Text>
    );
  }

  // Context: show up to 2 lines after the diff
  const contextEnd = Math.min(oldLines.length, oldDiffEnd + 2);
  for (let i = oldDiffEnd; i < contextEnd; i++) {
    elements.push(
      <Text key={`ctx-post-${i}`} dimColor>
        {' '}
        {oldLines[i]}
      </Text>
    );
  }

  return elements;
}

function EditFileBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const filePath = String(input.file_path ?? input.path ?? '');
  const oldStr = String(input.old_string ?? '');
  const newStr = String(input.new_string ?? '');
  const replaceAll = input.replace_all === true;

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>file: </Text>
        <Text color="cyan">{filePath}</Text>
        {replaceAll && <Text dimColor> (replace all)</Text>}
      </Text>
      {oldStr && (
        <Box flexDirection="column" marginTop={1}>
          {computeDiff(oldStr, newStr)}
        </Box>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
    </Box>
  );
}

function BashBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const command = String(input.command ?? '');
  const [expanded, setExpanded] = useState(false);

  useInput((_input, key) => {
    if (_input === 'e' && !key.ctrl && !key.meta) {
      setExpanded(prev => !prev);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>$ </Text>
        <Text bold>{command}</Text>
      </Text>
      {result && (
        <Box flexDirection="column" marginTop={1}>
          {(() => {
            const lines = result.output.split('\n');
            const showLimit = expanded ? MAX_BASH_OUTPUT_LINES : COLLAPSED_LINES;
            const truncated = lines.length > showLimit;
            const visible = truncated ? lines.slice(0, showLimit) : lines;
            return (
              <>
                {visible.map((line, i) => (
                  <Text
                    key={i}
                    color={result.isError ? 'red' : undefined}
                    dimColor={!result.isError}
                  >
                    {line}
                  </Text>
                ))}
                {truncated && (
                  <Text dimColor italic>
                    ... {lines.length - showLimit} more lines{' '}
                    {expanded ? "(press 'e' to collapse)" : "(press 'e' to expand)"}
                  </Text>
                )}
                {!truncated && lines.length > COLLAPSED_LINES && expanded && (
                  <Text dimColor italic>
                    (press 'e' to collapse)
                  </Text>
                )}
              </>
            );
          })()}
        </Box>
      )}
    </Box>
  );
}

function TerraformBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const subcommand = String(input.command ?? input.subcommand ?? 'plan');

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>terraform </Text>
        <Text bold>{subcommand}</Text>
      </Text>
      {result && !result.isError && (
        <Box flexDirection="column" marginTop={1}>
          {result.output.split('\n').map((line, i) => {
            let color: string | undefined;
            if (line.startsWith('+') || line.includes('will be created')) {
              color = 'green';
            } else if (line.startsWith('-') || line.includes('will be destroyed')) {
              color = 'red';
            } else if (line.startsWith('~') || line.includes('will be updated')) {
              color = 'yellow';
            }
            return (
              <Text key={i} color={color} dimColor={!color}>
                {line}
              </Text>
            );
          })}
        </Box>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
    </Box>
  );
}

function GenericBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const entries = Object.entries(input).slice(0, 6);
  const omitted = Object.keys(input).length - entries.length;
  return (
    <Box flexDirection="column">
      {entries.map(([key, value]) => {
        const str = String(value);
        const truncated = str.length > 120;
        return (
          <Text key={key}>
            <Text dimColor>{key}: </Text>
            <Text>{truncated ? `${str.slice(0, 120)}...` : str}</Text>
          </Text>
        );
      })}
      {omitted > 0 && (
        <Text dimColor italic>
          ... {omitted} more fields
        </Text>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
      {result && !result.isError && (
        <Text dimColor>
          {result.output.length > 120 ? `${result.output.slice(0, 120)}...` : result.output}
        </Text>
      )}
    </Box>
  );
}

/* ---------------------------------------------------------------------------
 * Single tool call box
 * -------------------------------------------------------------------------*/

function ToolCallBox({ toolCall, expanded }: { toolCall: UIToolCall; expanded: boolean }) {
  const durationLabel = toolCall.duration != null ? ` (${toolCall.duration}ms)` : '';

  // Choose specialised body renderer based on tool name
  const renderBody = () => {
    if (!expanded && toolCall.status === 'completed') {
      return (
        <Text dimColor>
          {toolCall.result
            ? toolCall.result.isError
              ? toolCall.result.output.slice(0, 80)
              : 'completed'
            : 'completed'}
        </Text>
      );
    }

    const name = toolCall.name.toLowerCase();
    const props = { input: toolCall.input, result: toolCall.result };

    if (name === 'read_file' || name === 'read') {
      return <ReadFileBody {...props} />;
    }
    if (name === 'edit_file' || name === 'edit') {
      return <EditFileBody {...props} />;
    }
    if (name === 'bash' || name === 'execute' || name === 'run_command') {
      return <BashBody {...props} />;
    }
    if (name.startsWith('terraform') || name === 'tf_plan' || name === 'tf_apply') {
      return <TerraformBody {...props} />;
    }
    return <GenericBody {...props} />;
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={toolCall.status === 'failed' ? 'red' : 'gray'}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header */}
      <Box>
        <StatusBadge status={toolCall.status} />
        <Text bold> {toolCall.name}</Text>
        <Text dimColor>{durationLabel}</Text>
      </Box>

      {/* Body */}
      <Box marginTop={1}>{renderBody()}</Box>
    </Box>
  );
}

/* ---------------------------------------------------------------------------
 * Public component
 * -------------------------------------------------------------------------*/

/**
 * ToolCallDisplay renders a list of tool invocations. When `expanded` is
 * false, completed calls are collapsed to a single summary line.
 */
export function ToolCallDisplay({ toolCalls, expanded = true }: ToolCallDisplayProps) {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {toolCalls.map(tc => (
        <ToolCallBox key={tc.id} toolCall={tc} expanded={expanded} />
      ))}
    </Box>
  );
}
