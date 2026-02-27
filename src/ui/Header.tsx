/**
 * Header Component
 *
 * Displays the Nimbus banner at the top of the TUI: version string, active
 * model, session ID, and a color-coded mode indicator (plan / build / deploy).
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SessionInfo, AgentMode } from './types';
import { VERSION } from '../version';

/** Props accepted by the Header component. */
export interface HeaderProps {
  session: SessionInfo;
}

/** Map each mode to its display colour. */
const MODE_COLORS: Record<AgentMode, string> = {
  plan: 'blue',
  build: 'yellow',
  deploy: 'red',
};

/**
 * Truncate a session ID to a short prefix for display purposes.
 */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Header renders a single-line banner containing the CLI version, the model
 * name, the abbreviated session ID, and a colour-coded mode badge.
 */
export function Header({ session }: HeaderProps) {
  const modeColor = MODE_COLORS[session.mode];

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      {/* Left: branding + version */}
      <Box>
        <Text bold color="cyan">
          nimbus
        </Text>
        <Text dimColor> v{VERSION}</Text>
        <Text dimColor> {' \u2014 '}</Text>
        <Text>{session.model}</Text>
        <Text dimColor> {' \u2014 '}</Text>
        <Text dimColor>session: {shortId(session.id)}</Text>
      </Box>

      {/* Right: mode badge */}
      <Box>
        <Text color={modeColor} bold inverse>
          {' '}
          {session.mode.toUpperCase()}{' '}
        </Text>
      </Box>
    </Box>
  );
}
