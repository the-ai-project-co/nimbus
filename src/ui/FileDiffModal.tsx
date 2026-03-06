/**
 * FileDiffModal Component
 *
 * Shows a proposed file change as a unified diff and waits for the user
 * to approve or reject before the agent applies the change.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/** Decision returned by the file diff modal. */
export type FileDiffDecision = 'apply' | 'reject' | 'apply-all' | 'reject-all';

/**
 * G9: A batch of file diffs to review sequentially.
 *
 * Use `queueFileDiffBatch` to present multiple diffs one at a time through
 * the existing FileDiffModal, collecting per-file decisions.
 */
export interface FileDiffBatch {
  /** The diffs to review, in order. */
  files: Array<{ filePath: string; diff: string; toolName: string }>;
  /** Called when the user has decided on every file. */
  onComplete: (decisions: FileDiffDecision[]) => void;
}

/**
 * G9: Process a FileDiffBatch sequentially, presenting each diff via the
 * provided `showDiff` callback (which renders a `FileDiffRequest`).
 *
 * The caller supplies `showDiff` which wires into App state.  Each file is
 * presented in order; 'apply-all' or 'reject-all' short-circuits the rest.
 */
export function queueFileDiffBatch(
  batch: FileDiffBatch,
  showDiff: (req: FileDiffRequest) => void
): void {
  const decisions: FileDiffDecision[] = [];

  function processNext(index: number): void {
    if (index >= batch.files.length) {
      batch.onComplete(decisions);
      return;
    }

    const file = batch.files[index];
    showDiff({
      toolName: file.toolName,
      filePath: file.filePath,
      diff: file.diff,
      currentIndex: index + 1,
      totalCount: batch.files.length,
      onDecide: (decision) => {
        decisions.push(decision);
        if (decision === 'apply-all') {
          // Fill remaining with 'apply'
          for (let i = index + 1; i < batch.files.length; i++) {
            decisions.push('apply');
          }
          batch.onComplete(decisions);
        } else if (decision === 'reject-all') {
          // Fill remaining with 'reject'
          for (let i = index + 1; i < batch.files.length; i++) {
            decisions.push('reject');
          }
          batch.onComplete(decisions);
        } else {
          processNext(index + 1);
        }
      },
    });
  }

  processNext(0);
}

/** A pending file diff request. */
export interface FileDiffRequest {
  /** Tool that wants to modify the file. */
  toolName: string;
  /** Absolute or relative path of the file being changed. */
  filePath: string;
  /** Unified diff string (--- / +++ / @@ lines). */
  diff: string;
  /** 1-based index of this diff in the current batch (for progress display). */
  currentIndex?: number;
  /** Total number of diffs in the current batch (for progress display). */
  totalCount?: number;
  /** Callback invoked with the user's decision. */
  onDecide: (d: FileDiffDecision) => void;
}

/** Props for the FileDiffModal component. */
export interface FileDiffModalProps {
  request: FileDiffRequest;
}

const VISIBLE_LINES = 30;

/**
 * Modal overlay that displays a proposed file diff and collects user approval.
 *
 * Keyboard bindings:
 *   a — Apply this change
 *   r — Reject this change
 *   A — Apply this and all remaining changes (skip future prompts)
 *   R — Reject this and all remaining changes
 *   ↑/↓ — Scroll up/down one line
 *   PgUp/PgDn — Scroll up/down one page
 */
export function FileDiffModal({ request }: FileDiffModalProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const diffLines = request.diff.split('\n');
  const total = diffLines.length;
  const maxOffset = Math.max(0, total - VISIBLE_LINES);

  useInput((input, key) => {
    if (input === 'a') request.onDecide('apply');
    if (input === 'r') request.onDecide('reject');
    if (input === 'A') request.onDecide('apply-all');
    if (input === 'R') request.onDecide('reject-all');
    if (key.upArrow) setScrollOffset(o => Math.max(0, o - 1));
    if (key.downArrow) setScrollOffset(o => Math.min(maxOffset, o + 1));
    if (key.pageUp) setScrollOffset(o => Math.max(0, o - VISIBLE_LINES));
    if (key.pageDown) setScrollOffset(o => Math.min(maxOffset, o + VISIBLE_LINES));
  });

  const endLine = Math.min(scrollOffset + VISIBLE_LINES, total);
  const displayLines = diffLines.slice(scrollOffset, endLine);

  const progress =
    request.totalCount && request.currentIndex
      ? ` (${request.currentIndex}/${request.totalCount})`
      : '';

  const scrollIndicator = total > VISIBLE_LINES
    ? ` [${scrollOffset + 1}–${endLine} of ${total} lines]`
    : '';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {request.toolName}{progress}: {request.filePath}{scrollIndicator}
      </Text>
      <Box flexDirection="column" marginY={1}>
        {displayLines.map((line, i) => {
          let color: string | undefined;
          if (line.startsWith('+') && !line.startsWith('+++')) color = 'green';
          else if (line.startsWith('-') && !line.startsWith('---')) color = 'red';
          else if (line.startsWith('@@')) color = 'cyan';
          return (
            <Text key={i} color={color} dimColor={!color}>
              {line}
            </Text>
          );
        })}
      </Box>
      <Text dimColor>  [a] Apply   [r] Reject   [A] Apply all   [R] Reject all   [↑/↓] Scroll   [PgUp/PgDn] Page</Text>
    </Box>
  );
}
