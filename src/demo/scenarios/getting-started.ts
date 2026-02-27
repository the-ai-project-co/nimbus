/**
 * Getting Started Tutorial
 *
 * Interactive tutorial for new Nimbus users
 */

import type { DemoScenario } from '../types';

export const gettingStartedScenario: DemoScenario = {
  id: 'getting-started',
  name: 'Getting Started with Nimbus',
  description: 'Learn the basics of Nimbus CLI in this interactive tutorial',
  category: 'tutorial',
  duration: 5,
  prerequisites: ['Nimbus CLI installed'],
  tags: ['tutorial', 'beginner', 'basics'],
  steps: [
    {
      id: 'check-version',
      title: 'Check Nimbus Version',
      description: "First, let's make sure Nimbus is installed correctly",
      command: 'nimbus --version',
      showOutput: true,
      waitForInput: true,
      mockResponse: 'nimbus version 1.0.0',
    },
    {
      id: 'help',
      title: 'View Available Commands',
      description: "Nimbus has many commands - let's see what's available",
      command: 'nimbus --help',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Nimbus CLI - AI-powered infrastructure assistant

USAGE:
  nimbus <command> [options]

COMMANDS:
  init          Initialize Nimbus in the current project
  chat          Start an interactive chat session
  generate      Generate infrastructure code
  apply         Apply infrastructure changes
  preview       Preview changes without applying
  aws           AWS CLI commands
  tf            Terraform commands
  k8s           Kubernetes commands
  helm          Helm commands

FLAGS:
  --version     Show version
  --help        Show help
      `.trim(),
    },
    {
      id: 'doctor',
      title: 'Run System Check',
      description: 'Check that all required tools are installed',
      command: 'nimbus doctor',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Nimbus Doctor

Checking system requirements...

  ✓ Node.js 18.0.0
  ✓ Bun 1.0.0
  ✓ Git 2.40.0
  ✓ Terraform 1.5.0
  ✓ kubectl 1.28.0
  ✓ Helm 3.12.0
  ✓ AWS CLI 2.13.0

All checks passed!
      `.trim(),
    },
    {
      id: 'init-demo',
      title: 'Initialize a Project',
      description: 'Set up Nimbus in any directory to get started',
      command: 'nimbus init --scan-depth quick',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Nimbus Initialization

Scanning project (quick mode)...

Project Summary:
  Type: unknown
  Languages: none detected

Created .nimbus/project.yaml
Created .nimbus/config.yaml

Project initialized!

Next steps:
  1. Run 'nimbus chat' to get AI assistance
  2. Run 'nimbus generate terraform' to create infrastructure
  3. Run 'nimbus aws discover' to scan your AWS account
      `.trim(),
    },
    {
      id: 'config-list',
      title: 'View Configuration',
      description: 'See your current Nimbus configuration',
      command: 'nimbus config list',
      showOutput: true,
      waitForInput: false,
      mockResponse: `
Nimbus Configuration

  Key                    Value
  ─────────────────────────────────────────
  llm.provider           anthropic
  llm.model              claude-3-sonnet
  safety.enabled         true
  safety.costThreshold   500
  output.format          table
  output.colors          true
      `.trim(),
    },
  ],
};
