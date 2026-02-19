/**
 * PRList Component
 *
 * Renders a list of pull requests with colored state badges,
 * author info, and optional selection via keyboard navigation.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/** Describes a single pull request. */
interface PullRequest {
  number: number;
  title: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  createdAt: string;
}

interface PRListProps {
  prs: PullRequest[];
  onSelect?: (pr: PullRequest) => void;
}

function StateBadge({ state }: { state: PullRequest['state'] }) {
  const colorMap: Record<PullRequest['state'], string> = {
    open: 'green',
    merged: 'magenta',
    closed: 'red',
  };

  return (
    <Text color={colorMap[state]} bold>
      [{state.toUpperCase()}]
    </Text>
  );
}

export function PRList({ prs, onSelect }: PRListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isInteractive = typeof onSelect === 'function';

  useInput(
    (input, key) => {
      if (!isInteractive) return;

      if (key.upArrow) {
        setSelectedIndex((prev) => (prev - 1 + prs.length) % prs.length);
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % prs.length);
      } else if (key.return) {
        const pr = prs[selectedIndex];
        if (pr) onSelect!(pr);
      }
    },
    { isActive: isInteractive && prs.length > 0 },
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Pull Requests
        </Text>
        <Text dimColor> ({prs.length})</Text>
      </Box>

      {prs.length === 0 && (
        <Box>
          <Text dimColor>No pull requests to display.</Text>
        </Box>
      )}

      {prs.map((pr, idx) => (
        <Box key={pr.number}>
          {isInteractive && (
            <Text color={idx === selectedIndex ? 'cyan' : undefined}>
              {idx === selectedIndex ? '> ' : '  '}
            </Text>
          )}
          <Text color="cyan">#{pr.number}</Text>
          <Text> </Text>
          <Text bold>{pr.title}</Text>
          <Text> </Text>
          <StateBadge state={pr.state} />
          <Text> </Text>
          <Text dimColor>by {pr.author}</Text>
          <Text> </Text>
          <Text dimColor>{pr.createdAt}</Text>
        </Box>
      ))}

      {isInteractive && prs.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
        </Box>
      )}
    </Box>
  );
}
