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
 *   - edit_file: before/after diff with red/green colouring
 *   - bash: command + truncated output
 *   - terraform: resource table
 *
 * All other tools fall through to a generic key/value display.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { UIToolCall } from './types';

/** Props accepted by the ToolCallDisplay component. */
export interface ToolCallDisplayProps {
  toolCalls: UIToolCall[];
  /** Whether tool call detail is expanded. Defaults to true. */
  expanded?: boolean;
}

/** Maximum number of output lines shown for bash tool results. */
const MAX_BASH_OUTPUT_LINES = 20;

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

function ReadFileBody({ input, result }: { input: Record<string, unknown>; result?: UIToolCall['result'] }) {
  const filePath = String(input.file_path ?? input.path ?? '');
  const startLine = input.start_line as number | undefined;
  const endLine = input.end_line as number | undefined;
  const rangeLabel = startLine != null
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
        <Text dimColor>
          {result.output.split('\n').length} lines read
        </Text>
      )}
      {result && result.isError && (
        <Text color="red">{result.output}</Text>
      )}
    </Box>
  );
}

function EditFileBody({ input, result }: { input: Record<string, unknown>; result?: UIToolCall['result'] }) {
  const filePath = String(input.file_path ?? input.path ?? '');
  const oldStr = String(input.old_string ?? '');
  const newStr = String(input.new_string ?? '');

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>file: </Text>
        <Text color="cyan">{filePath}</Text>
      </Text>
      {oldStr && (
        <Box flexDirection="column" marginTop={1}>
          {oldStr.split('\n').map((line, i) => (
            <Text key={`r-${i}`} color="red">
              - {line}
            </Text>
          ))}
          {newStr.split('\n').map((line, i) => (
            <Text key={`a-${i}`} color="green">
              + {line}
            </Text>
          ))}
        </Box>
      )}
      {result && result.isError && (
        <Text color="red">{result.output}</Text>
      )}
    </Box>
  );
}

function BashBody({ input, result }: { input: Record<string, unknown>; result?: UIToolCall['result'] }) {
  const command = String(input.command ?? '');

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
            const truncated = lines.length > MAX_BASH_OUTPUT_LINES;
            const visible = truncated ? lines.slice(0, MAX_BASH_OUTPUT_LINES) : lines;
            return (
              <>
                {visible.map((line, i) => (
                  <Text key={i} color={result.isError ? 'red' : undefined} dimColor={!result.isError}>
                    {line}
                  </Text>
                ))}
                {truncated && (
                  <Text dimColor italic>
                    ... {lines.length - MAX_BASH_OUTPUT_LINES} more lines
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

function TerraformBody({ input, result }: { input: Record<string, unknown>; result?: UIToolCall['result'] }) {
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
            if (line.startsWith('+') || line.includes('will be created')) color = 'green';
            else if (line.startsWith('-') || line.includes('will be destroyed')) color = 'red';
            else if (line.startsWith('~') || line.includes('will be updated')) color = 'yellow';
            return (
              <Text key={i} color={color} dimColor={!color}>
                {line}
              </Text>
            );
          })}
        </Box>
      )}
      {result && result.isError && (
        <Text color="red">{result.output}</Text>
      )}
    </Box>
  );
}

function GenericBody({ input, result }: { input: Record<string, unknown>; result?: UIToolCall['result'] }) {
  const entries = Object.entries(input).slice(0, 6);
  return (
    <Box flexDirection="column">
      {entries.map(([key, value]) => (
        <Text key={key}>
          <Text dimColor>{key}: </Text>
          <Text>{String(value).slice(0, 120)}</Text>
        </Text>
      ))}
      {result && result.isError && (
        <Text color="red">{result.output}</Text>
      )}
      {result && !result.isError && (
        <Text dimColor>
          {result.output.length > 120 ? result.output.slice(0, 120) + '...' : result.output}
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

    if (name === 'read_file' || name === 'read') return <ReadFileBody {...props} />;
    if (name === 'edit_file' || name === 'edit') return <EditFileBody {...props} />;
    if (name === 'bash' || name === 'execute' || name === 'run_command') return <BashBody {...props} />;
    if (name.startsWith('terraform') || name === 'tf_plan' || name === 'tf_apply') return <TerraformBody {...props} />;
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
  if (toolCalls.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {toolCalls.map((tc) => (
        <ToolCallBox key={tc.id} toolCall={tc} expanded={expanded} />
      ))}
    </Box>
  );
}
