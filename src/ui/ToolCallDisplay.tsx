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

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { parseTerraformPlanOutput } from '../agent/deploy-preview';
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

/** Long-running tools that get a context hint about expected duration. */
const LONG_RUNNING_TOOLS = new Set([
  'terraform', 'terraform_plan_analyze', 'deploy_preview', 'drift_detect',
  'helm', 'k8s_rbac', 'cfn', 'gitops',
]);

function StatusBadge({ status, startTime }: { status: UIToolCall['status']; startTime?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'running' || !startTime) return;
    const initial = Math.floor((Date.now() - startTime) / 1000);
    setElapsed(initial);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status, startTime]);

  switch (status) {
    case 'pending':
      return <Text dimColor>[pending]</Text>;
    case 'running':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
          {startTime && elapsed > 0 ? ` ${elapsed}s` : ''}
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
  const action = String(input.action ?? input.command ?? input.subcommand ?? 'plan');

  // Gap 8: Show structured plan summary when output contains plan data
  const isPlan = action === 'plan' || (result?.output ?? '').includes('Plan:');
  const changes = isPlan && result && !result.isError
    ? parseTerraformPlanOutput(result.output)
    : [];

  const creates = changes.filter(c => c.action === 'create').length;
  const updates = changes.filter(c => c.action === 'update').length;
  const destroys = changes.filter(c => c.action === 'destroy').length;
  const replaces = changes.filter(c => c.action === 'replace').length;

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>terraform </Text>
        <Text bold>{action}</Text>
      </Text>

      {/* Gap 8: Structured plan summary panel */}
      {isPlan && changes.length > 0 && result && !result.isError && (
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text bold>Plan Summary</Text>
          <Box>
            {creates > 0 && <Text color="green">+{creates} create  </Text>}
            {updates > 0 && <Text color="yellow">~{updates} change  </Text>}
            {destroys > 0 && <Text color="red">-{destroys} destroy  </Text>}
            {replaces > 0 && <Text color="magenta">±{replaces} replace  </Text>}
            {creates === 0 && updates === 0 && destroys === 0 && replaces === 0 && (
              <Text dimColor>No changes</Text>
            )}
          </Box>
          {changes.slice(0, 10).map((c, i) => {
            const icon = c.action === 'create' ? '+' : c.action === 'destroy' ? '-' : c.action === 'replace' ? '±' : '~';
            const color = c.action === 'create' ? 'green' : c.action === 'destroy' ? 'red' : c.action === 'replace' ? 'magenta' : 'yellow';
            return (
              <Text key={i} color={color}>
                {icon} {c.resource}
              </Text>
            );
          })}
          {changes.length > 10 && <Text dimColor>... and {changes.length - 10} more</Text>}
        </Box>
      )}

      {/* H1: Fallback raw line coloring — show up to 200 lines with indicator for truncation */}
      {!(isPlan && changes.length > 0) && result && !result.isError && (
        <Box flexDirection="column" marginTop={1}>
          {(() => {
            const lines = result.output.split('\n');
            const MAX_LINES = 200;
            const displayLines = lines.slice(0, MAX_LINES);
            return (
              <>
                {displayLines.map((line, i) => {
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
                {lines.length > MAX_LINES && (
                  <Text dimColor>... {lines.length - MAX_LINES} more lines (full output saved to tool history)</Text>
                )}
              </>
            );
          })()}
        </Box>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
    </Box>
  );
}

/** G12: Kubectl output renderer with status colorization */
function KubectlBody({
  input,
  result,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
}) {
  const action = String(input.action ?? input.command ?? 'get');

  const colorizeKubectlLine = (line: string, i: number): React.ReactNode => {
    // Status coloring for kubectl get output
    if (/\bRunning\b/.test(line)) {
      return <Text key={i} color="green">{line}</Text>;
    }
    if (/\b(Pending|ContainerCreating|Init:|PodInitializing)\b/.test(line)) {
      return <Text key={i} color="yellow">{line}</Text>;
    }
    if (/\b(CrashLoopBackOff|Error|Failed|OOMKilled|ImagePullBackOff|ErrImagePull)\b/.test(line)) {
      return <Text key={i} color="red">{line}</Text>;
    }
    if (/\bCompleted\b/.test(line)) {
      return <Text key={i} color="green" dimColor>{line}</Text>;
    }
    if (/\bTerminating\b/.test(line)) {
      return <Text key={i} color="yellow" dimColor>{line}</Text>;
    }
    return <Text key={i} dimColor>{line}</Text>;
  };

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>kubectl </Text>
        <Text bold>{action}</Text>
      </Text>
      {result && !result.isError && (
        <Box flexDirection="column" marginTop={1}>
          {/* M1: Increased from 40 to 80 lines for better kubectl output visibility */}
          {result.output.split('\n').slice(0, 80).map((line, i) => colorizeKubectlLine(line, i))}
        </Box>
      )}
      {result && result.isError && <Text color="red">{result.output}</Text>}
    </Box>
  );
}

/** M2: Docker build progress renderer */
function DockerBuildBody({
  input,
  result,
  streamingOutput,
}: {
  input: Record<string, unknown>;
  result?: UIToolCall['result'];
  streamingOutput?: string;
}) {
  const action = String(input.action ?? '');
  if (action !== 'build') {
    // Non-build actions: show raw output
    if (result && !result.isError) {
      return (
        <Box flexDirection="column" marginTop={1}>
          {result.output.split('\n').slice(0, 20).map((line, i) => (
            <Text key={i} dimColor>{line}</Text>
          ))}
        </Box>
      );
    }
    if (result?.isError) return <Text color="red">{result.output}</Text>;
    return null;
  }

  // Parse step progress from streaming output or result
  const outputText = streamingOutput || result?.output || '';
  const stepMatch = outputText.match(/Step\s+(\d+)\/(\d+)/gi);
  const lastStep = stepMatch ? stepMatch[stepMatch.length - 1] : null;
  const totalSteps = lastStep ? parseInt(lastStep.match(/\/(\d+)/)![1]) : 0;
  const currentStep = lastStep ? parseInt(lastStep.match(/Step\s+(\d+)/i)![1]) : 0;
  const succeeded = outputText.includes('Successfully built') || outputText.includes('Successfully tagged');
  const failed = result?.isError || false;

  return (
    <Box flexDirection="column" marginTop={1}>
      {totalSteps > 0 && (
        <Box>
          <Text color={succeeded ? 'green' : failed ? 'red' : 'cyan'}>
            {succeeded ? '[ok] ' : failed ? '[xx] ' : '[..] '}
            [{currentStep}/{totalSteps} steps]
          </Text>
        </Box>
      )}
      {outputText.split('\n').filter(l => l.trim()).slice(-5).map((line, i) => {
        const isStep = /^Step\s+\d+\/\d+/i.test(line.trim());
        const isSuccess = /Successfully/i.test(line);
        const isError = /error/i.test(line);
        return (
          <Text key={i} color={isSuccess ? 'green' : isError ? 'red' : isStep ? 'cyan' : undefined} dimColor={!isStep && !isSuccess && !isError}>
            {line}
          </Text>
        );
      })}
      {result?.isError && <Text color="red">{result.output}</Text>}
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
  const isLongRunning = LONG_RUNNING_TOOLS.has(toolCall.name.toLowerCase());

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
    if (name === 'kubectl' || name === 'k8s') {
      return <KubectlBody {...props} />;
    }
    if (name === 'docker') {
      return <DockerBuildBody input={toolCall.input} result={toolCall.result} streamingOutput={toolCall.streamingOutput} />;
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
        <StatusBadge status={toolCall.status} startTime={toolCall.startTime} />
        <Text bold> {toolCall.name}</Text>
        <Text dimColor>{durationLabel}</Text>
        {/* M4: Highlight duration prominently when operation took > 5 seconds */}
        {toolCall.status === 'completed' && toolCall.duration != null && toolCall.duration > 5000 && (
          <Text dimColor> [{(toolCall.duration / 1000).toFixed(1)}s]</Text>
        )}
        {toolCall.status === 'running' && toolCall.name === 'logs' && (
          <Text color="cyan"> ● LIVE</Text>
        )}
      </Box>

      {/* Long-running hint */}
      {toolCall.status === 'running' && isLongRunning && (
        <Text dimColor italic>
          This may take several minutes for large infrastructure changes.
        </Text>
      )}

      {/* Streaming output — shown while tool is running */}
      {toolCall.status === 'running' && toolCall.streamingOutput && toolCall.streamingOutput.trim() && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Box>
            <Text color="green" bold>[LIVE] </Text>
            <Text>{'─'.repeat(34)}</Text>
          </Box>
          {(() => {
            const allLines = toolCall.streamingOutput!.split('\n');
            const isTerraformOrKubectl = toolCall.name === 'terraform' || toolCall.name === 'kubectl' || toolCall.name === 'logs';
            // M1: Increased streaming window — 60 lines for terraform/kubectl/logs, 40 for others
            const windowSize = isTerraformOrKubectl ? 60 : 40;
            const visibleLines = allLines.slice(-windowSize);
            // Pad to minimum 4 lines so the live area is always visible
            while (visibleLines.length < 4) visibleLines.push('');
            const hiddenCount = Math.max(0, allLines.length - windowSize);
            return (
              <>
                {hiddenCount > 0 && (
                  <Text dimColor>... {hiddenCount} earlier lines</Text>
                )}
                {visibleLines.map((line, i) => {
                  // M2: Color terraform/kubectl streaming output lines
                  let lineColor: string | undefined;
                  if (line.match(/^\s*\+/) || line.includes('will be created') || line.includes(' created')) lineColor = 'green';
                  else if (line.match(/^\s*-/) || line.includes('will be destroyed') || line.includes(' destroyed')) lineColor = 'red';
                  else if (line.match(/^\s*~/) || line.includes('will be updated') || line.includes(' modified')) lineColor = 'yellow';
                  return <Text key={i} color={lineColor ?? 'gray'} dimColor={!lineColor}>{line}</Text>;
                })}
              </>
            );
          })()}
        </Box>
      )}

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
