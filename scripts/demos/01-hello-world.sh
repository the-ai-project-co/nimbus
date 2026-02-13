#!/usr/bin/env bash
set -e

# Demo 1: Hello World
# Basic nimbus usage: initialize a project, run diagnostics, and check version.
# This is the simplest demo to verify that nimbus is installed and working.

DEMO_DIR=$(mktemp -d -t nimbus-demo-hello-XXXXXX)
trap 'rm -rf "$DEMO_DIR"' EXIT

echo "=== Demo 1: Hello World ==="
echo ""

# Step 1: Check nimbus version
echo "--- Step 1: Checking nimbus version ---"
nimbus version
echo ""

# Step 2: Run the doctor command to verify environment health
echo "--- Step 2: Running nimbus doctor ---"
nimbus doctor
echo ""

# Step 3: Initialize a new nimbus workspace in a temporary directory
echo "--- Step 3: Initializing a nimbus workspace ---"
cd "$DEMO_DIR"
nimbus init --non-interactive --name hello-world-demo --template minimal
echo ""

# Step 4: Verify workspace was created
echo "--- Step 4: Verifying workspace files ---"
ls -la "$DEMO_DIR/.nimbus/"
echo ""

# Step 5: Check configuration
echo "--- Step 5: Listing workspace configuration ---"
nimbus config list
echo ""

# Step 6: Display help to show available commands
echo "--- Step 6: Displaying nimbus help ---"
nimbus help
echo ""

echo "=== Demo 1 Complete ==="
echo "The nimbus CLI is installed and working correctly."
