/**
 * GitStatus Component
 *
 * Displays a git status overview including the current branch,
 * ahead/behind counts, and categorized file lists (staged,
 * modified, deleted, untracked) with appropriate coloring.
 */

import React from 'react';
import { Box, Text } from 'ink';

/** Structured git status data for rendering. */
interface GitStatusData {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
}

interface GitStatusProps {
  status: GitStatusData;
}

interface FileListSectionProps {
  title: string;
  files: string[];
  color: string;
  prefix: string;
}

function FileListSection({ title, files, color, prefix }: FileListSectionProps) {
  if (files.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{title} ({files.length})</Text>
      {files.map((file, i) => (
        <Box key={file + i} marginLeft={2}>
          <Text color={color}>
            {prefix} {file}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function GitStatus({ status }: GitStatusProps) {
  const totalChanges =
    status.staged.length +
    status.modified.length +
    status.deleted.length +
    status.untracked.length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Git Status
        </Text>
      </Box>

      {/* Branch info */}
      <Box>
        <Text dimColor>On branch </Text>
        <Text bold color="green">
          {status.branch}
        </Text>
      </Box>

      {/* Ahead/behind */}
      {(status.ahead > 0 || status.behind > 0) && (
        <Box>
          {status.ahead > 0 && (
            <Text color="green">{'\u2191'}{status.ahead}</Text>
          )}
          {status.ahead > 0 && status.behind > 0 && <Text> </Text>}
          {status.behind > 0 && (
            <Text color="red">{'\u2193'}{status.behind}</Text>
          )}
          <Text dimColor> commits</Text>
        </Box>
      )}

      {/* File sections */}
      <FileListSection
        title="Staged"
        files={status.staged}
        color="green"
        prefix="+"
      />
      <FileListSection
        title="Modified"
        files={status.modified}
        color="yellow"
        prefix="~"
      />
      <FileListSection
        title="Deleted"
        files={status.deleted}
        color="red"
        prefix="-"
      />
      {status.untracked.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Untracked ({status.untracked.length})</Text>
          {status.untracked.map((file, i) => (
            <Box key={file + i} marginLeft={2}>
              <Text dimColor>? {file}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Clean state */}
      {totalChanges === 0 && (
        <Box marginTop={1}>
          <Text dimColor>Working tree clean.</Text>
        </Box>
      )}

      {/* Summary */}
      {totalChanges > 0 && (
        <Box marginTop={1}>
          <Text dimColor>{totalChanges} file(s) changed</Text>
        </Box>
      )}
    </Box>
  );
}
