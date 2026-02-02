/**
 * Type definitions for the Interactive Wizard Framework
 */

// Wizard step types
export interface WizardStep<TContext = any> {
  id: string;
  title: string;
  description?: string;
  execute: (context: TContext) => Promise<StepResult>;
  canSkip?: boolean;
  condition?: (context: TContext) => boolean;
}

export interface StepResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  nextStep?: string; // Override default next step
  skipRemaining?: boolean;
}

// Selection types
export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectConfig {
  message: string;
  options: SelectOption[];
  defaultValue?: string;
  allowMultiple?: boolean;
  required?: boolean;
  maxSelections?: number;
}

export interface ConfirmConfig {
  message: string;
  defaultValue?: boolean;
}

export interface InputConfig {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | true;
  transform?: (value: string) => string;
}

// Progress display types
export interface ProgressConfig {
  message: string;
  total?: number;
  showPercentage?: boolean;
  showETA?: boolean;
}

export interface SpinnerConfig {
  message: string;
  successMessage?: string;
  failMessage?: string;
}

// Output types
export interface TableColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  formatter?: (value: unknown) => string;
}

export interface TableConfig {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  title?: string;
  showRowNumbers?: boolean;
}

// Box types for styled output
export type BoxStyle = 'single' | 'double' | 'rounded' | 'heavy';

export interface BoxConfig {
  content: string | string[];
  title?: string;
  style?: BoxStyle;
  padding?: number;
  width?: number;
  borderColor?: string;
  titleColor?: string;
}

// Diff display types
export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  content: string;
  lineNumber?: number;
}

export interface DiffConfig {
  original: string;
  modified: string;
  title?: string;
  contextLines?: number;
}

// Wizard context for terraform generation
export interface TerraformWizardContext {
  // Provider selection
  provider?: 'aws' | 'gcp' | 'azure';

  // AWS configuration
  awsProfile?: string;
  awsRegions?: string[];
  awsAccountId?: string;
  awsAccountAlias?: string;

  // Discovery options
  servicesToScan?: string[];
  excludeServices?: string[];

  // Generation options
  outputPath?: string;
  includeImports?: boolean;
  importMethod?: 'blocks' | 'script' | 'both';

  // Improvements
  enabledCategories?: string[];
  autoApplyLowRisk?: boolean;
  explanationLevel?: 'simple' | 'detailed';

  // Starter kit
  includeReadme?: boolean;
  includeGitignore?: boolean;
  includeMakefile?: boolean;
  includeGithubActions?: boolean;

  // State
  discoverySessionId?: string;
  inventory?: any;
  generatedFiles?: any[];
  improvements?: any;

  // Preferences
  savePreferences?: boolean;
  organizationPolicy?: string;
}

// Wizard events
export type WizardEvent =
  | { type: 'step:start'; stepId: string }
  | { type: 'step:complete'; stepId: string; result: StepResult }
  | { type: 'step:error'; stepId: string; error: Error }
  | { type: 'wizard:start' }
  | { type: 'wizard:complete'; context: any }
  | { type: 'wizard:cancel' }
  | { type: 'wizard:error'; error: Error };

export type WizardEventHandler = (event: WizardEvent) => void;
