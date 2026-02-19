/**
 * Progress Component
 *
 * Renders a block-character progress bar with percentage
 * and optional item count for Ink-based terminal UI.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ProgressProps {
  value: number;
  total?: number;
  current?: number;
  label?: string;
  width?: number;
  showPercentage?: boolean;
}

export function Progress({
  value,
  total,
  current,
  label,
  width = 30,
  showPercentage = true,
}: ProgressProps) {
  const percent = Math.max(0, Math.min(100, value));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

  return (
    <Box>
      {label && (
        <Text bold>{label} </Text>
      )}
      <Text color="cyan">{bar}</Text>
      {showPercentage && (
        <Text> {Math.round(percent)}%</Text>
      )}
      {total !== undefined && current !== undefined && (
        <Text dimColor> ({current}/{total})</Text>
      )}
    </Box>
  );
}
