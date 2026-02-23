/**
 * PermissionPrompt Component
 *
 * Modal-style overlay that asks the user to approve or reject a tool
 * invocation before it executes. Displays the tool name, its input
 * parameters, and a risk-level indicator.
 *
 * Keyboard shortcuts:
 *   a  - Approve this invocation
 *   r  - Reject this invocation
 *   A  - Approve all invocations for this tool
 *   s  - Approve for the remainder of this session
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

/** The four possible decisions the user can make. */
export type PermissionDecision = 'approve' | 'reject' | 'approve_all' | 'session';

/** Risk level categorisation for a tool invocation. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Props accepted by the PermissionPrompt component. */
export interface PermissionPromptProps {
  /** Name of the tool requesting permission. */
  toolName: string;
  /** The parameters that will be passed to the tool. */
  toolInput: Record<string, unknown>;
  /** Risk assessment for this invocation. */
  riskLevel: RiskLevel;
  /** Called with the user's decision. */
  onDecide: (decision: PermissionDecision) => void;
}

/** Map risk levels to display colours. */
const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
  critical: 'magenta',
};

/**
 * Format tool input into a list of truncated key=value lines.
 */
function formatInput(input: Record<string, unknown>, maxEntries = 6): string[] {
  return Object.entries(input).slice(0, maxEntries).map(([key, value]) => {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const truncated = str.length > 80 ? str.slice(0, 77) + '...' : str;
    return `${key}: ${truncated}`;
  });
}

/**
 * PermissionPrompt renders a bordered box with tool information and waits for
 * a single keypress to determine the user's decision.
 */
export function PermissionPrompt({ toolName, toolInput, riskLevel, onDecide }: PermissionPromptProps) {
  useInput((input) => {
    switch (input) {
      case 'a':
        onDecide('approve');
        break;
      case 'r':
        onDecide('reject');
        break;
      case 'A':
        onDecide('approve_all');
        break;
      case 's':
        onDecide('session');
        break;
    }
  });

  const inputLines = formatInput(toolInput);
  const riskColor = RISK_COLORS[riskLevel];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={riskColor}
      paddingX={1}
      paddingY={1}
    >
      {/* Title bar */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Permission Required
        </Text>
      </Box>

      {/* Tool name */}
      <Box>
        <Text dimColor>Tool: </Text>
        <Text bold>{toolName}</Text>
      </Box>

      {/* Risk level */}
      <Box marginBottom={1}>
        <Text dimColor>Risk: </Text>
        <Text bold color={riskColor}>
          {riskLevel.toUpperCase()}
        </Text>
      </Box>

      {/* Parameters */}
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Parameters:</Text>
        {inputLines.map((line, idx) => (
          <Text key={idx}>  {line}</Text>
        ))}
      </Box>

      {/* Action keys */}
      <Box>
        <Text color="green" bold>[a]</Text>
        <Text> Approve  </Text>
        <Text color="red" bold>[r]</Text>
        <Text> Reject  </Text>
        <Text color="cyan" bold>[A]</Text>
        <Text> Approve all  </Text>
        <Text color="blue" bold>[s]</Text>
        <Text> Session</Text>
      </Box>
    </Box>
  );
}
