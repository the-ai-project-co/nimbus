/**
 * StatusBar Component
 *
 * A single-line footer that shows the active agent mode, token usage with a
 * percentage bar, estimated cost, snapshot count, and elapsed processing time.
 *
 * Layout:
 *   [Plan] [Build] [Deploy] | Tokens: 45.2k/200k (22%) | Cost: $0.03 | Snapshots: 3 (undo) | tf:default | k8s:prod-cluster | delta:+$1.20 | 12s
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
  /** Number of lines in the current input (Gap 9 — multi-line indicator). */
  inputLineCount?: number;
  /** C1: Show scroll hint when the user has scrolled away from the bottom. */
  showScrollHint?: boolean;
  /** H1: Toast message shown after copying a code block to clipboard. */
  copyToast?: string;
  /** Show "Esc to stop" hint when a log stream is active. */
  showStreamingHint?: boolean;
  /** H5: Mode change toast — shown for 2 seconds after Tab cycle. */
  modeToast?: string;
  /** M1: Active search query (shows "Search: N results" when set). */
  searchQuery?: string;
  /** M1: Number of messages matching the current search. */
  searchResultCount?: number;
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
 * Determine if an environment name is production-like (G1).
 */
function isProdEnvironment(name: string): boolean {
  return /prod|production|live/i.test(name);
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
  inputLineCount = 1,
  showScrollHint = false,
  copyToast = '',
  showStreamingHint = false,
  modeToast,
  searchQuery,
  searchResultCount,
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

  // Snapshot display: show undo hint when snapshots exist (G19)
  const snapshotDisplay = session.snapshotCount > 0
    ? `${session.snapshotCount} (↶ undo)`
    : String(session.snapshotCount);

  // Infra context colors (G1)
  const tfColor = session.terraformWorkspace && isProdEnvironment(session.terraformWorkspace)
    ? 'yellow'
    : 'green';
  const k8sColor = session.kubectlContext && isProdEnvironment(session.kubectlContext)
    ? 'yellow'
    : 'green';

  // L5: Build a compact visual progress bar for context budget
  const BAR_WIDTH = 8;
  const filledBars = Math.round((pct / 100) * BAR_WIDTH);
  const progressBar = '█'.repeat(filledBars) + '░'.repeat(BAR_WIDTH - filledBars);

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
        <Text dimColor>Ctx: </Text>
        <Text color={pctColor}>{progressBar}</Text>
        <Text dimColor> </Text>
        <Text color={pctColor}>
          {formatTokens(session.tokenCount)}/{formatTokens(session.maxTokens)} ({pct}%)
        </Text>
        <Text dimColor> | Cost: </Text>
        <Text>{costStr}</Text>
        <Text dimColor> | Snapshots: </Text>
        <Text>{snapshotDisplay}</Text>
        {/* G1: Terraform workspace display */}
        {session.terraformWorkspace && (
          <>
            <Text dimColor> | </Text>
            <Text color={tfColor}>tf:{session.terraformWorkspace}</Text>
          </>
        )}
        {/* G1: kubectl context display */}
        {session.kubectlContext && (
          <>
            <Text dimColor> | </Text>
            <Text color={k8sColor}>k8s:{session.kubectlContext}</Text>
          </>
        )}
        {/* G15: Infra cost delta display */}
        {session.infraCostDelta && (
          <>
            <Text dimColor> | </Text>
            <Text color="green">delta:{session.infraCostDelta}</Text>
          </>
        )}
        {isProcessing && elapsedSeconds > 0 && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan">{elapsedSeconds}s</Text>
          </>
        )}
        {inputLineCount > 1 && !isProcessing && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan">{inputLineCount} lines</Text>
          </>
        )}
        <Text dimColor> | Tab</Text>
        <Text dimColor>:mode </Text>
        <Text dimColor>Esc</Text>
        <Text dimColor>:cancel </Text>
        <Text dimColor>^C</Text>
        <Text dimColor>:exit</Text>
        {/* C3: Discoverability hints when idle */}
        {!isProcessing && inputLineCount <= 1 && (
          <>
            <Text dimColor> | </Text>
            <Text dimColor>F1:help  /tree  /terminal</Text>
            <Text dimColor>  </Text>
            <Text dimColor>? help</Text>
          </>
        )}
        {/* C1: Scroll hint when user has scrolled away from bottom */}
        {showScrollHint && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan">↑↓ scroll | G bottom</Text>
          </>
        )}
        {/* H1: Streaming tool indicator — show "Esc to stop" when a log stream is active */}
        {showStreamingHint && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan">Esc:stop stream</Text>
          </>
        )}
        {/* H1: Copy toast message after copying a code block */}
        {copyToast && (
          <>
            <Text dimColor> | </Text>
            <Text color="green">{copyToast}</Text>
          </>
        )}
        {/* H5: Mode change toast */}
        {modeToast && (
          <>
            <Text dimColor> | </Text>
            <Text color="cyan" italic>{modeToast}</Text>
          </>
        )}
        {/* M1: Search result count */}
        {searchQuery && searchResultCount !== undefined && (
          <>
            <Text dimColor> | </Text>
            <Text color="yellow">Search: "{searchQuery}" — {searchResultCount} results</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
