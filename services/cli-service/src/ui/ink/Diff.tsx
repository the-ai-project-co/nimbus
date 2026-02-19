/**
 * Diff Component
 *
 * Renders a simple unified diff view comparing original and modified
 * text. Added lines are shown in green with a + prefix, removed lines
 * in red with a - prefix, and unchanged context lines are dimmed.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface DiffProps {
  original: string;
  modified: string;
  title?: string;
  /** Number of unchanged context lines to show around changes. Defaults to 3. */
  context?: number;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
}

/**
 * Produces a simple line-by-line diff. This uses a basic longest-common-
 * subsequence approach to identify shared lines and marks additions and
 * removals accordingly.
 */
function computeDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  // Build LCS table
  const m = origLines.length;
  const n = modLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build the diff
  const lines: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      lines.unshift({ type: 'context', content: origLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      lines.unshift({ type: 'add', content: modLines[j - 1] });
      j--;
    } else {
      lines.unshift({ type: 'remove', content: origLines[i - 1] });
      i--;
    }
  }

  return lines;
}

/**
 * Filter diff lines to show only those within `contextSize` lines
 * of an actual change.
 */
function applyContext(lines: DiffLine[], contextSize: number): DiffLine[] {
  if (contextSize < 0) return lines;

  const changed = new Set<number>();
  lines.forEach((line, idx) => {
    if (line.type !== 'context') changed.add(idx);
  });

  const visible = new Set<number>();
  changed.forEach((idx) => {
    for (let c = idx - contextSize; c <= idx + contextSize; c++) {
      if (c >= 0 && c < lines.length) visible.add(c);
    }
  });

  return lines.filter((_, idx) => visible.has(idx));
}

export function Diff({ original, modified, title, context = 3 }: DiffProps) {
  const allLines = computeDiff(original, modified);
  const visibleLines = applyContext(allLines, context);

  const addCount = allLines.filter((l) => l.type === 'add').length;
  const removeCount = allLines.filter((l) => l.type === 'remove').length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      {title && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {title}
          </Text>
        </Box>
      )}

      {/* Summary */}
      <Box marginBottom={1}>
        <Text color="green">+{addCount}</Text>
        <Text> </Text>
        <Text color="red">-{removeCount}</Text>
        <Text dimColor> lines changed</Text>
      </Box>

      {/* Diff lines */}
      {visibleLines.length === 0 && (
        <Box>
          <Text dimColor>No differences found.</Text>
        </Box>
      )}
      {visibleLines.map((line, idx) => {
        switch (line.type) {
          case 'add':
            return (
              <Text key={idx} color="green">
                + {line.content}
              </Text>
            );
          case 'remove':
            return (
              <Text key={idx} color="red">
                - {line.content}
              </Text>
            );
          case 'context':
            return (
              <Text key={idx} dimColor>
                {'  '}{line.content}
              </Text>
            );
        }
      })}
    </Box>
  );
}
