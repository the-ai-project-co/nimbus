/**
 * DeployPreview Component
 *
 * Renders a resource-change table before a deploy action is applied. Each
 * change is prefixed with a symbol indicating the action:
 *
 *   +  create   (green)
 *   ~  modify   (yellow)
 *   -  destroy  (red)
 *   -/+ replace (magenta)
 *
 * Below the table the component shows optional cost impact, blast radius, and
 * affected services. Keyboard shortcuts let the user approve, reject, or
 * request the full plan output.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { DeployPreviewData, DeployChange } from './types';

/** Possible decisions from the deploy preview prompt. */
export type DeployDecision = 'approve' | 'reject' | 'show_plan';

/** Props accepted by the DeployPreview component. */
export interface DeployPreviewProps {
  preview: DeployPreviewData;
  onDecide: (decision: DeployDecision) => void;
}

/** Map change action to a prefix character and colour. */
const ACTION_DISPLAY: Record<DeployChange['action'], { prefix: string; color: string }> = {
  create:  { prefix: '+', color: 'green' },
  modify:  { prefix: '~', color: 'yellow' },
  destroy: { prefix: '-', color: 'red' },
  replace: { prefix: '-/+', color: 'magenta' },
};

/**
 * Compute summary counts for the banner line.
 */
function summaryCounts(changes: DeployChange[]): { add: number; change: number; destroy: number } {
  let add = 0;
  let change = 0;
  let destroy = 0;
  for (const c of changes) {
    switch (c.action) {
      case 'create':
        add++;
        break;
      case 'modify':
      case 'replace':
        change++;
        break;
      case 'destroy':
        destroy++;
        break;
    }
  }
  return { add, change, destroy };
}

/**
 * A single row in the change table.
 */
function ChangeRow({ change }: { change: DeployChange }) {
  const display = ACTION_DISPLAY[change.action];
  return (
    <Box>
      <Text color={display.color} bold>
        {display.prefix.padEnd(4)}
      </Text>
      <Text>{change.resourceType}</Text>
      <Text dimColor>.</Text>
      <Text bold>{change.resourceName}</Text>
      {change.details && <Text dimColor> ({change.details})</Text>}
    </Box>
  );
}

/**
 * DeployPreview renders the full preview modal with a change table and
 * action key legend.
 */
export function DeployPreview({ preview, onDecide }: DeployPreviewProps) {
  useInput((input) => {
    switch (input) {
      case 'a':
        onDecide('approve');
        break;
      case 'r':
        onDecide('reject');
        break;
      case 'p':
        onDecide('show_plan');
        break;
    }
  });

  const counts = summaryCounts(preview.changes);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      paddingY={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          Deploy Preview
        </Text>
        <Text dimColor> ({preview.tool})</Text>
      </Box>

      {/* Summary counts */}
      <Box marginBottom={1}>
        <Text color="green">+{counts.add} to add</Text>
        <Text>  </Text>
        <Text color="yellow">~{counts.change} to change</Text>
        <Text>  </Text>
        <Text color="red">-{counts.destroy} to destroy</Text>
      </Box>

      {/* Change table */}
      <Box flexDirection="column" marginBottom={1}>
        {preview.changes.map((change, idx) => (
          <ChangeRow key={idx} change={change} />
        ))}
        {preview.changes.length === 0 && (
          <Text dimColor>No resource changes detected.</Text>
        )}
      </Box>

      {/* Cost impact */}
      {preview.costImpact && (
        <Box>
          <Text dimColor>Cost impact: </Text>
          <Text>{preview.costImpact}</Text>
        </Box>
      )}

      {/* Blast radius */}
      {preview.blastRadius && (
        <Box>
          <Text dimColor>Blast radius: </Text>
          <Text color="yellow">{preview.blastRadius}</Text>
        </Box>
      )}

      {/* Affected services */}
      {preview.affectedServices && preview.affectedServices.length > 0 && (
        <Box>
          <Text dimColor>Affected services: </Text>
          <Text>{preview.affectedServices.join(', ')}</Text>
        </Box>
      )}

      {/* Action keys */}
      <Box marginTop={1}>
        <Text color="green" bold>[a]</Text>
        <Text> Approve  </Text>
        <Text color="red" bold>[r]</Text>
        <Text> Reject  </Text>
        <Text color="cyan" bold>[p]</Text>
        <Text> Show full plan</Text>
      </Box>
    </Box>
  );
}
