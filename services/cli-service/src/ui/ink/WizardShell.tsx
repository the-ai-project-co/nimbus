/**
 * WizardShell Component
 *
 * Provides a visual shell for multi-step wizards with step progress bar,
 * navigation hints, and content area. This component renders:
 * - A visual step progress bar at the top showing all steps with the current highlighted
 * - Step title and description
 * - Content area (children)
 * - Footer with navigation hints
 */

import React from 'react';
import { Box, Text } from 'ink';

/** Metadata for a single wizard step displayed in the progress bar */
export interface WizardStepInfo {
  /** Unique step identifier */
  id: string;
  /** Human-readable step title */
  title: string;
  /** Optional longer description shown beneath the step title */
  description?: string;
}

/** Props accepted by the WizardShell component */
export interface WizardShellProps {
  /** All steps in the wizard, in order */
  steps: WizardStepInfo[];
  /** Zero-based index of the currently active step */
  currentStepIndex: number;
  /** Title displayed at the top of the wizard shell */
  title: string;
  /** Content rendered in the main area below the progress bar */
  children: React.ReactNode;
  /** Whether the user can navigate back to a previous step */
  canGoBack?: boolean;
}

/**
 * WizardShell renders a structured layout for multi-step wizard flows.
 *
 * Completed steps show a filled circle in green, the current step shows
 * a bullseye in cyan, and pending steps show an empty circle in gray.
 * Steps are connected by horizontal line segments.
 */
export function WizardShell({
  steps,
  currentStepIndex,
  title,
  children,
  canGoBack = false,
}: WizardShellProps) {
  const currentStep = steps[currentStepIndex];

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>

      {/* Step Progress Bar */}
      <Box marginBottom={1}>
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;

          let color: string = 'gray';
          let symbol = '\u25CB'; // empty circle
          if (isCompleted) {
            color = 'green';
            symbol = '\u25CF'; // filled circle
          } else if (isCurrent) {
            color = 'cyan';
            symbol = '\u25C9'; // circle with dot (bullseye)
          }

          return (
            <Box key={step.id}>
              <Text color={color}>
                {symbol} {step.title}
              </Text>
              {index < steps.length - 1 && (
                <Text dimColor> {'\u2500'} </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Current step info */}
      {currentStep && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold>
            Step {currentStepIndex + 1}/{steps.length}: {currentStep.title}
          </Text>
          {currentStep.description && (
            <Text dimColor>  {currentStep.description}</Text>
          )}
        </Box>
      )}

      {/* Content area */}
      <Box flexDirection="column" marginY={1}>
        {children}
      </Box>

      {/* Navigation footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {canGoBack ? '[←] Back  ' : ''}
          [→/Enter] Next  [Esc] Cancel
        </Text>
      </Box>
    </Box>
  );
}
