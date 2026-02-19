/**
 * Loading Spinner Component
 *
 * Displays an animated spinner while waiting for LLM responses.
 * Falls back to a static character if ink-spinner is not installed.
 */

import React from 'react';
import { Box, Text } from 'ink';

interface SpinnerProps {
  text?: string;
}

export function LoadingSpinner({ text = 'Loading...' }: SpinnerProps) {
  // Try using ink-spinner for an animated dots spinner.
  // If the optional dependency is not installed, show a static indicator.
  try {
    const InkSpinner = require('ink-spinner').default;
    return (
      <Box>
        <Text color="cyan">
          <InkSpinner type="dots" />
        </Text>
        <Text> {text}</Text>
      </Box>
    );
  } catch {
    return (
      <Box>
        <Text color="cyan">...</Text>
        <Text> {text}</Text>
      </Box>
    );
  }
}
