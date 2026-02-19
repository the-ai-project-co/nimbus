/**
 * Table Component
 *
 * Renders a formatted data table with auto-calculated column widths,
 * bold cyan headers, and a dash separator line.
 */

import React from 'react';
import { Box, Text } from 'ink';

/** Describes a single column in the table. */
interface TableColumn {
  key: string;
  header: string;
  width?: number;
}

interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  title?: string;
  showRowNumbers?: boolean;
}

/**
 * Compute the display width for each column. If a column specifies an
 * explicit width it is used as-is; otherwise the width is the maximum
 * of the header length and the longest cell value in that column.
 */
function computeWidths(
  columns: TableColumn[],
  data: Record<string, unknown>[],
): number[] {
  return columns.map((col) => {
    if (col.width) return col.width;
    const headerLen = col.header.length;
    const maxDataLen = data.reduce((max, row) => {
      const val = String(row[col.key] ?? '');
      return Math.max(max, val.length);
    }, 0);
    return Math.max(headerLen, maxDataLen);
  });
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

export function Table({ columns, data, title, showRowNumbers }: TableProps) {
  const widths = computeWidths(columns, data);
  const rowNumWidth = showRowNumbers ? String(data.length).length + 2 : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Optional title */}
      {title && (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {title}
          </Text>
        </Box>
      )}

      {/* Header row */}
      <Box>
        {showRowNumbers && (
          <Text bold color="cyan">
            {pad('#', rowNumWidth)}
          </Text>
        )}
        {columns.map((col, i) => (
          <Box key={col.key} marginRight={2}>
            <Text bold color="cyan">
              {pad(col.header, widths[i])}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Separator */}
      <Box>
        {showRowNumbers && <Text dimColor>{'-'.repeat(rowNumWidth)}</Text>}
        {columns.map((col, i) => (
          <Box key={col.key} marginRight={2}>
            <Text dimColor>{'-'.repeat(widths[i])}</Text>
          </Box>
        ))}
      </Box>

      {/* Data rows */}
      {data.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {showRowNumbers && (
            <Text dimColor>{pad(String(rowIdx + 1), rowNumWidth)}</Text>
          )}
          {columns.map((col, i) => (
            <Box key={col.key} marginRight={2}>
              <Text>{pad(String(row[col.key] ?? ''), widths[i])}</Text>
            </Box>
          ))}
        </Box>
      ))}

      {/* Empty state */}
      {data.length === 0 && (
        <Box>
          <Text dimColor>No data to display.</Text>
        </Box>
      )}
    </Box>
  );
}
