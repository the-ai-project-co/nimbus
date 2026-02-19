/**
 * Questionnaire Component
 *
 * A step-by-step wizard that walks the user through a series of
 * questions. Supports text, select, multiselect, number, and confirm
 * input types with validation and keyboard navigation.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

/** Describes a single step in the questionnaire wizard. */
interface QuestionnaireStep {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'number' | 'confirm';
  options?: { label: string; value: string }[];
  default?: unknown;
  validation?: (value: unknown) => string | null;
}

interface QuestionnaireProps {
  steps: QuestionnaireStep[];
  onComplete: (answers: Record<string, unknown>) => void;
  onCancel?: () => void;
}

export function Questionnaire({ steps, onComplete, onCancel }: QuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const step = steps[currentStep];
  const totalSteps = steps.length;

  const submitAnswer = useCallback(
    (value: unknown) => {
      if (step.validation) {
        const error = step.validation(value);
        if (error) {
          setValidationError(error);
          return;
        }
      }

      const nextAnswers = { ...answers, [step.id]: value };
      setAnswers(nextAnswers);
      setValidationError(null);
      setInputValue('');
      setSelectedIndex(0);
      setSelectedIndices(new Set());

      if (currentStep + 1 >= totalSteps) {
        onComplete(nextAnswers);
      } else {
        setCurrentStep(currentStep + 1);
      }
    },
    [step, answers, currentStep, totalSteps, onComplete],
  );

  useInput(
    (input, key) => {
      // Escape cancels the wizard
      if (key.escape) {
        onCancel?.();
        return;
      }

      if (!step) return;

      switch (step.type) {
        case 'text':
        case 'number': {
          if (key.return) {
            const raw = inputValue || (step.default != null ? String(step.default) : '');
            const value = step.type === 'number' ? Number(raw) : raw;
            submitAnswer(value);
          } else if (key.backspace || key.delete) {
            setInputValue((prev) => prev.slice(0, -1));
            setValidationError(null);
          } else if (input && !key.ctrl && !key.meta) {
            if (step.type === 'number' && !/^[\d.\-]$/.test(input)) break;
            setInputValue((prev) => prev + input);
            setValidationError(null);
          }
          break;
        }

        case 'select': {
          const opts = step.options ?? [];
          if (key.upArrow) {
            setSelectedIndex((prev) => (prev - 1 + opts.length) % opts.length);
          } else if (key.downArrow) {
            setSelectedIndex((prev) => (prev + 1) % opts.length);
          } else if (key.return) {
            submitAnswer(opts[selectedIndex]?.value);
          }
          break;
        }

        case 'multiselect': {
          const opts = step.options ?? [];
          if (key.upArrow) {
            setSelectedIndex((prev) => (prev - 1 + opts.length) % opts.length);
          } else if (key.downArrow) {
            setSelectedIndex((prev) => (prev + 1) % opts.length);
          } else if (input === ' ') {
            setSelectedIndices((prev) => {
              const next = new Set(prev);
              if (next.has(selectedIndex)) {
                next.delete(selectedIndex);
              } else {
                next.add(selectedIndex);
              }
              return next;
            });
          } else if (key.return) {
            const values = opts
              .filter((_, i) => selectedIndices.has(i))
              .map((o) => o.value);
            submitAnswer(values);
          }
          break;
        }

        case 'confirm': {
          if (input === 'y' || input === 'Y') {
            submitAnswer(true);
          } else if (input === 'n' || input === 'N') {
            submitAnswer(false);
          }
          break;
        }
      }
    },
    { isActive: currentStep < totalSteps },
  );

  if (!step) {
    return (
      <Box>
        <Text dimColor>Questionnaire complete.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Nimbus Wizard
        </Text>
        <Text dimColor>
          {' '}
          [{currentStep + 1}/{totalSteps}]
        </Text>
      </Box>

      {/* Question */}
      <Box marginBottom={1}>
        <Text bold>{step.question}</Text>
      </Box>

      {/* Input area */}
      {(step.type === 'text' || step.type === 'number') && (
        <Box>
          <Text color="green">{'> '}</Text>
          <Text>{inputValue}</Text>
          <Text dimColor>_</Text>
          {step.default != null && !inputValue && (
            <Text dimColor> (default: {String(step.default)})</Text>
          )}
        </Box>
      )}

      {step.type === 'select' && (
        <Box flexDirection="column">
          {(step.options ?? []).map((opt, i) => (
            <Box key={opt.value}>
              <Text color={i === selectedIndex ? 'cyan' : undefined}>
                {i === selectedIndex ? '> ' : '  '}
                {opt.label}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
          </Box>
        </Box>
      )}

      {step.type === 'multiselect' && (
        <Box flexDirection="column">
          {(step.options ?? []).map((opt, i) => (
            <Box key={opt.value}>
              <Text color={i === selectedIndex ? 'cyan' : undefined}>
                {i === selectedIndex ? '> ' : '  '}
                {selectedIndices.has(i) ? '[x] ' : '[ ] '}
                {opt.label}
              </Text>
            </Box>
          ))}
          <Box marginTop={1}>
            <Text dimColor>Use arrows to move, Space to toggle, Enter to confirm</Text>
          </Box>
        </Box>
      )}

      {step.type === 'confirm' && (
        <Box>
          <Text dimColor>Press </Text>
          <Text bold>y</Text>
          <Text dimColor> for yes, </Text>
          <Text bold>n</Text>
          <Text dimColor> for no</Text>
        </Box>
      )}

      {/* Validation error */}
      {validationError && (
        <Box marginTop={1}>
          <Text color="red">Error: {validationError}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Press Esc to cancel</Text>
      </Box>
    </Box>
  );
}
