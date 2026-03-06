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

/** Prominent mode labels for visual distinction (Gap 11). */
const MODE_LABELS: Record<AgentMode, string> = {
  plan: '[P] PLAN',
  build: '[B] BUILD',
  deploy: '[D] DEPLOY',
};

/**
 * Truncate a session ID to a short prefix for display purposes.
 */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Determine if an environment name is production-like.
 */
function isProdEnvironment(name: string): boolean {
  return /prod|production|live/i.test(name);
}

/**
 * Header renders a single-line banner containing the CLI version, the model
 * name, the abbreviated session ID, and a colour-coded mode badge.
 */
export function Header({ session }: HeaderProps) {
  const modeColor = MODE_COLORS[session.mode];
  const modeLabel = MODE_LABELS[session.mode];
  // Gap 11: deploy mode gets a red border on the entire header for visual urgency
  const borderColor = session.mode === 'deploy' ? 'red' : 'cyan';

  const tfColor = session.terraformWorkspace && isProdEnvironment(session.terraformWorkspace)
    ? 'yellow'
    : 'green';
  const k8sColor = session.kubectlContext && isProdEnvironment(session.kubectlContext)
    ? 'yellow'
    : 'green';

  const isProd = isProdEnvironment(session.terraformWorkspace ?? '') || isProdEnvironment(session.kubectlContext ?? '');
  const showProdWarning = session.mode === 'deploy' && isProd;

  return (
    <Box flexDirection="column" width="100%">
      <Box
        borderStyle="round"
        borderColor={borderColor}
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
          <Text dimColor> {' -- '}</Text>
          <Text>{session.model}</Text>
          <Text dimColor> {' -- '}</Text>
          <Text dimColor>session: {shortId(session.id)}</Text>
        </Box>

        {/* Center: infra context badges */}
        <Box>
          {session.llmHealth === 'checking' && <Text color="yellow" dimColor> [~] </Text>}
          {session.llmHealth === 'ok' && <Text color="green"> [+] </Text>}
          {session.llmHealth === 'error' && <Text color="red"> [-] no LLM</Text>}
          {session.terraformWorkspace && (
            <>
              <Text> </Text>
              <Text color={tfColor} bold>tf:{session.terraformWorkspace}</Text>
              {isProdEnvironment(session.terraformWorkspace) && (
                <Text color="red" bold> [PROD]</Text>
              )}
            </>
          )}
          {session.kubectlContext && (
            <>
              <Text> </Text>
              <Text color={k8sColor} bold>k8s:{session.kubectlContext}</Text>
              {isProdEnvironment(session.kubectlContext) && (
                <Text color="red" bold> [PROD]</Text>
              )}
            </>
          )}
          {/* M2: Context switcher shortcut hint when context is active */}
          {(session.terraformWorkspace || session.kubectlContext) && (
            <Text dimColor> [/k8s-ctx | /tf-ws to switch]</Text>
          )}
        </Box>

        {/* Right: mode badge */}
        <Box>
          <Text color={modeColor} bold inverse>
            {' '}
            {modeLabel}{' '}
          </Text>
        </Box>
      </Box>
      {showProdWarning && (
        <Box paddingX={2}>
          <Text color="red" bold>!! DEPLOY MODE — targeting production environment !!</Text>
        </Box>
      )}
    </Box>
  );
}
