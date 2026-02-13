# Demo 1: Hello World

## Overview

This demo verifies that the nimbus CLI is properly installed and functional. It walks through the most basic operations: checking the version, running diagnostics, initializing a workspace, and listing configuration. This is the recommended starting point for anyone new to nimbus.

## Prerequisites

- nimbus CLI installed and available on `$PATH`
- No cloud credentials required
- No Kubernetes cluster required
- No Terraform installation required

## Steps

1. **Check nimbus version** -- Runs `nimbus version` to confirm the CLI is installed and prints the current version number.
2. **Run nimbus doctor** -- Executes environment diagnostics to check for available tools (terraform, kubectl, helm, git) and service connectivity.
3. **Initialize a workspace** -- Creates a temporary directory and runs `nimbus init` in non-interactive mode with the `minimal` template. This generates the `.nimbus/` directory containing `project.yaml` and `config.yaml`.
4. **Verify workspace files** -- Lists the contents of the `.nimbus/` directory to confirm initialization succeeded.
5. **List configuration** -- Runs `nimbus config list` to display the workspace configuration that was generated.
6. **Display help** -- Runs `nimbus help` to show all available commands and their descriptions.

## Expected Output

```
=== Demo 1: Hello World ===

--- Step 1: Checking nimbus version ---
nimbus version X.Y.Z

--- Step 2: Running nimbus doctor ---
  Terraform:  [installed/not found]
  kubectl:    [installed/not found]
  helm:       [installed/not found]
  git:        [installed]
  ...

--- Step 3: Initializing a nimbus workspace ---
  Scanning project (quick mode)...
  Nimbus workspace initialized!
  Project:  hello-world-demo
  ...

--- Step 4: Verifying workspace files ---
  config.yaml
  project.yaml
  .gitkeep

--- Step 5: Listing workspace configuration ---
  workspace.name: hello-world-demo
  ...

--- Step 6: Displaying nimbus help ---
  Usage: nimbus <command> [options]
  Commands:
    init, chat, generate, plan, apply, ...

=== Demo 1 Complete ===
```

## Cleanup

No cleanup is required. The script uses a temporary directory that is automatically removed when the script exits (via a `trap` on `EXIT`).
