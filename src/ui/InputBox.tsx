/**
 * InputBox Component
 *
 * A single-line text input area with a "> " prompt character. Uses
 * ink-text-input for editing and submits on Enter. The parent component
 * receives the submitted text via the `onSubmit` callback.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

/** Props accepted by the InputBox component. */
export interface InputBoxProps {
  /** Called when the user presses Enter with non-empty input. */
  onSubmit: (text: string) => void;
  /** Called when the user presses Escape to abort the current operation. */
  onAbort?: () => void;
  /** Placeholder text shown when the input is empty. */
  placeholder?: string;
  /** Whether the input is disabled (e.g. while the agent is processing). */
  disabled?: boolean;
}

/**
 * InputBox renders a ">" prompt followed by an editable text field.
 * Pressing Enter submits the value and clears the field. Pressing Escape
 * fires the optional onAbort callback.
 */
export function InputBox({ onSubmit, onAbort, placeholder, disabled = false }: InputBoxProps) {
  const [value, setValue] = useState('') as [string, React.Dispatch<React.SetStateAction<string>>];

  const handleSubmit = useCallback(
    (submitted: string) => {
      const trimmed = submitted.trim();
      if (trimmed.length === 0) return;
      onSubmit(trimmed);
      setValue('');
    },
    [onSubmit],
  );

  // Handle Escape for abort
  useInput(
    (_input, key) => {
      if (key.escape && onAbort) {
        onAbort();
      }
    },
    { isActive: !disabled },
  );

  if (disabled) {
    return (
      <Box paddingX={1}>
        <Text dimColor>{'> '}</Text>
        <Text dimColor italic>
          {placeholder ?? 'waiting...'}
        </Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text bold color="green">
        {'> '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder ?? 'Type a message...'}
      />
    </Box>
  );
}
