/**
 * IssueList Component
 *
 * Renders a list of issues with colored state badges, labels,
 * assignees, and optional keyboard-driven selection.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/** Describes a single issue. */
interface Issue {
  number: number;
  title: string;
  labels: string[];
  assignees: string[];
  state: 'open' | 'closed';
}

interface IssueListProps {
  issues: Issue[];
  onSelect?: (issue: Issue) => void;
}

function IssueStateBadge({ state }: { state: Issue['state'] }) {
  const color = state === 'open' ? 'green' : 'red';
  return (
    <Text color={color} bold>
      [{state.toUpperCase()}]
    </Text>
  );
}

function Labels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <Text>
      {' '}
      {labels.map((label, i) => (
        <Text key={label + i} color="yellow">
          [{label}]
        </Text>
      ))}
    </Text>
  );
}

function Assignees({ assignees }: { assignees: string[] }) {
  if (assignees.length === 0) return null;
  return <Text dimColor> @{assignees.join(', @')}</Text>;
}

export function IssueList({ issues, onSelect }: IssueListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isInteractive = typeof onSelect === 'function';

  useInput(
    (input, key) => {
      if (!isInteractive) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => (prev - 1 + issues.length) % issues.length);
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % issues.length);
      } else if (key.return) {
        const issue = issues[selectedIndex];
        if (issue) onSelect!(issue);
      }
    },
    { isActive: isInteractive && issues.length > 0 },
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Issues
        </Text>
        <Text dimColor> ({issues.length})</Text>
      </Box>

      {issues.length === 0 && (
        <Box>
          <Text dimColor>No issues to display.</Text>
        </Box>
      )}

      {issues.map((issue, idx) => (
        <Box key={issue.number}>
          {isInteractive && (
            <Text color={idx === selectedIndex ? 'cyan' : undefined}>
              {idx === selectedIndex ? '> ' : '  '}
            </Text>
          )}
          <Text color="cyan">#{issue.number}</Text>
          <Text> </Text>
          <Text bold>{issue.title}</Text>
          <Text> </Text>
          <IssueStateBadge state={issue.state} />
          <Labels labels={issue.labels} />
          <Assignees assignees={issue.assignees} />
        </Box>
      ))}

      {isInteractive && issues.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
        </Box>
      )}
    </Box>
  );
}
