/**
 * StatusBar Component
 *
 * A single-line footer that shows the active agent mode, token usage with a
 * percentage bar, estimated cost, snapshot count, and elapsed processing time.
 *
 * Layout:
 *   [Plan] [Build] [Deploy] | Tokens: 45.2k/200k (22%) | Cost: $0.03 | Snapshots: 3 | 12s
 *
 * Token percentage colour:
 *   green  < 50%
 *   yellow 50-80%
 *   red    > 80%
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo, AgentMode } from './types';

/** Props accepted by the StatusBar component. */
export interface StatusBarProps {
  session: SessionInfo;
  /** Whether the agent is currently processing a request. */
  isProcessing?: boolean;
  /** Timestamp (Date.now()) when processing started. Null when idle. */
  processingStartTime?: number | null;
}

/** All modes in display order. */
const MODES: AgentMode[] = ['plan', 'build', 'deploy'];

/**
 * Format a token count into a human-readable string (e.g. 45200 -> "45.2k").
 */
function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * Pick the colour for the token percentage indicator.
 */
function tokenColor(pct: number): string {
  if (pct > 80) {
    return 'red';
  }
  if (pct >= 50) {
    return 'yellow';
  }
  return 'green';
}

/**
 * A single mode badge. The active mode is rendered with inverse styling.
 */
function ModeBadge({ mode, active }: { mode: AgentMode; active: boolean }) {
  const label = ` ${mode.charAt(0).toUpperCase() + mode.slice(1)} `;

  if (active) {
    return (
      <Text bold inverse>
        {label}
      </Text>
    );
  }

  return <Text dimColor>{label}</Text>;
}

/**
 * StatusBar renders the bottom status line of the TUI.
 */
export function StatusBar({
  session,
  isProcessing = false,
  processingStartTime = null,
}: StatusBarProps) {
  const pct =
    session.maxTokens > 0 ? Math.round((session.tokenCount / session.maxTokens) * 100) : 0;
  const pctColor = tokenColor(pct);
  const costStr =
    session.costUSD < 0.01 && session.costUSD > 0
      ? `$${session.costUSD.toFixed(4)}`
      : `$${session.costUSD.toFixed(2)}`;

  // Elapsed time counter
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing && processingStartTime) {
      // Immediately calculate current elapsed
      setElapsedSeconds(Math.floor((Date.now() - processingStartTime) / 1000));

      intervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - processingStartTime) / 1000));
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      setElapsedSeconds(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isProcessing, processingStartTime]);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      {/* Mode badges */}
      <Box>
        {MODES.map(m => (
          <ModeBadge key={m} mode={m} active={m === session.mode} />
        ))}
      </Box>

      {/* Metrics + keyboard hints */}
      <Box>
        <Text dimColor>Tokens: </Text>
        <Text color={pctColor}>
          {formatTokens(session.tokenCount)}/{formatTokens(session.maxTokens)} ({pct}%)
        </Text>
        <Text dimColor> | Cost: </Text>
        <Text>{costStr}</Text>
        <Text dimColor> | Snapshots: </Text>
        <Text>{String(session.snapshotCount)}</Text>
        {isProcessing && elapsedSeconds > 0 && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan">{elapsedSeconds}s</Text>
          </>
        )}
        <Text dimColor> | Tab</Text>
        <Text dimColor>:mode </Text>
        <Text dimColor>Esc</Text>
        <Text dimColor>:cancel </Text>
        <Text dimColor>^C</Text>
        <Text dimColor>:exit</Text>
      </Box>
    </Box>
  );
}
