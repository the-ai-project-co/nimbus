/**
 * Confirmation Component
 *
 * A Yes/No confirmation prompt for Ink-based terminal UI.
 * Uses arrow keys or y/n keys to toggle, Enter to confirm.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmationProps {
  message: string;
  onConfirm: (confirmed: boolean) => void;
  onCancel?: () => void;
  defaultValue?: boolean;
}

export function Confirmation({ message, onConfirm, onCancel, defaultValue = true }: ConfirmationProps) {
  const [selected, setSelected] = useState<boolean>(defaultValue);

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      setSelected(true);
      onConfirm(true);
    } else if (input === 'n' || input === 'N') {
      setSelected(false);
      if (onCancel) {
        onCancel();
      } else {
        onConfirm(false);
      }
    } else if (key.leftArrow || key.rightArrow) {
      setSelected((prev) => !prev);
    } else if (key.return) {
      if (selected) {
        onConfirm(true);
      } else if (onCancel) {
        onCancel();
      } else {
        onConfirm(false);
      }
    }
  });

  return (
    <Box>
      <Text color="yellow">? </Text>
      <Text bold>{message} </Text>
      <Box>
        {selected ? (
          <>
            <Text color="cyan" bold underline>Yes</Text>
            <Text> / </Text>
            <Text dimColor>No</Text>
          </>
        ) : (
          <>
            <Text dimColor>Yes</Text>
            <Text> / </Text>
            <Text color="cyan" bold underline>No</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
