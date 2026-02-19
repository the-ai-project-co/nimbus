/**
 * Chat Input Component
 *
 * Provides a text input field for the chat UI. Attempts to use
 * ink-text-input for a rich editing experience, and falls back
 * to a static text display if the package is not installed.
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';

interface ChatInputProps {
  onSubmit: (value: string) => void;
}

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = useState('');

  // Try to use ink-text-input for a proper editable input field.
  // If the optional dependency is not installed, render a basic fallback.
  try {
    const TextInput = require('ink-text-input').default;
    return (
      <Box>
        <Text bold color="green">
          {'> '}
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(val: string) => {
            onSubmit(val);
            setValue('');
          }}
        />
      </Box>
    );
  } catch {
    // Fallback: render a static prompt indicator. In practice, the user
    // would need ink-text-input installed for interactive input to work.
    return (
      <Box>
        <Text bold color="green">
          {'> '}
        </Text>
        <Text>{value}</Text>
        <Text dimColor>_</Text>
      </Box>
    );
  }
}
