#!/usr/bin/env bash
set -e

# Demo 4: Full Journey
# End-to-end workflow demonstrating the complete nimbus lifecycle:
# init -> generate -> validate -> plan -> apply -> verify
# This demo walks through every major phase of infrastructure management.

DEMO_DIR=$(mktemp -d -t nimbus-demo-full-XXXXXX)
trap 'rm -rf "$DEMO_DIR"' EXIT

echo "=== Demo 4: Full Journey ==="
echo ""

# ---------------------------------------------------------------
# Phase 1: Environment Setup
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 1: Environment Setup"
echo "============================================"
echo ""

# Step 1: Verify prerequisites with nimbus doctor
echo "--- Step 1: Running environment diagnostics ---"
nimbus doctor
echo ""

# Step 2: Check nimbus version
echo "--- Step 2: Checking nimbus version ---"
nimbus version
echo ""

# Step 3: Initialize workspace with full-stack template
echo "--- Step 3: Initializing workspace with full-stack template ---"
cd "$DEMO_DIR"
nimbus init \
  --non-interactive \
  --name full-journey-demo \
  --provider aws \
  --template full-stack \
  --scan-depth quick
echo ""

# ---------------------------------------------------------------
# Phase 2: Generate Infrastructure
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 2: Generate Infrastructure"
echo "============================================"
echo ""

# Step 4: Generate Terraform configuration for VPC and compute
echo "--- Step 4: Generating Terraform configuration ---"
nimbus generate terraform \
  --provider aws \
  --template full-stack \
  --name full-journey-demo \
  --region us-east-1 \
  --output "$DEMO_DIR/terraform"
echo ""

# Step 5: Generate Kubernetes manifests for the application
echo "--- Step 5: Generating Kubernetes manifests ---"
nimbus generate k8s \
  --name app-service \
  --type deployment \
  --image app:latest \
  --replicas 3 \
  --port 8080 \
  --namespace production \
  --output "$DEMO_DIR/k8s"
echo ""

# Step 6: Generate Helm chart for packaging
echo "--- Step 6: Generating Helm chart ---"
nimbus generate helm \
  --name full-journey-demo \
  --environment production \
  --output "$DEMO_DIR/helm"
echo ""

# Step 7: List all generated files
echo "--- Step 7: Listing all generated files ---"
find "$DEMO_DIR" -type f -name '*.tf' -o -name '*.yaml' -o -name '*.yml' | sort
echo ""

# ---------------------------------------------------------------
# Phase 3: Validate
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 3: Validate"
echo "============================================"
echo ""

# Step 8: Validate Terraform configuration
echo "--- Step 8: Validating Terraform configuration ---"
nimbus tf validate --directory "$DEMO_DIR/terraform"
echo ""

# Step 9: Analyze for best practices and security
echo "--- Step 9: Analyzing for best practices ---"
nimbus analyze --directory "$DEMO_DIR/terraform"
echo ""

# Step 10: Estimate costs before applying
echo "--- Step 10: Estimating infrastructure costs ---"
nimbus cost estimate --directory "$DEMO_DIR/terraform"
echo ""

# ---------------------------------------------------------------
# Phase 4: Plan
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 4: Plan"
echo "============================================"
echo ""

# Step 11: Preview Terraform changes
echo "--- Step 11: Previewing Terraform changes ---"
nimbus preview terraform --directory "$DEMO_DIR/terraform" --format table
echo ""

# Step 12: Run Terraform plan
echo "--- Step 12: Running Terraform plan ---"
nimbus tf plan --directory "$DEMO_DIR/terraform" \
  --var "project_name=full-journey-demo" \
  --var "aws_region=us-east-1"
echo ""

# Step 13: Preview Kubernetes changes
echo "--- Step 13: Previewing Kubernetes changes ---"
nimbus preview k8s --directory "$DEMO_DIR/k8s" --namespace production
echo ""

# ---------------------------------------------------------------
# Phase 5: Apply
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 5: Apply"
echo "============================================"
echo ""

# Step 14: Apply Terraform configuration
echo "--- Step 14: Applying Terraform configuration ---"
nimbus apply terraform \
  --directory "$DEMO_DIR/terraform" \
  --var "project_name=full-journey-demo" \
  --auto-approve
echo ""

# Step 15: Apply Kubernetes manifests
echo "--- Step 15: Applying Kubernetes manifests ---"
nimbus apply k8s \
  --directory "$DEMO_DIR/k8s" \
  --namespace production \
  --auto-approve
echo ""

# ---------------------------------------------------------------
# Phase 6: Verify
# ---------------------------------------------------------------
echo "============================================"
echo "Phase 6: Verify"
echo "============================================"
echo ""

# Step 16: Check Terraform state
echo "--- Step 16: Checking Terraform state ---"
nimbus tf show --directory "$DEMO_DIR/terraform"
echo ""

# Step 17: Verify Kubernetes deployment
echo "--- Step 17: Verifying Kubernetes deployments ---"
nimbus k8s get deployments --namespace production
echo ""

# Step 18: Check pod health
echo "--- Step 18: Checking pod health ---"
nimbus k8s get pods --namespace production
echo ""

# Step 19: Run drift detection to confirm state matches reality
echo "--- Step 19: Running drift detection ---"
nimbus drift detect --directory "$DEMO_DIR/terraform"
echo ""

# Step 20: View command history for this session
echo "--- Step 20: Viewing command history ---"
nimbus history
echo ""

echo "=== Demo 4 Complete ==="
echo "Full lifecycle demonstrated: init -> generate -> validate -> plan -> apply -> verify"
echo ""
echo "To clean up infrastructure:"
echo "  nimbus tf destroy --directory $DEMO_DIR/terraform --auto-approve"
echo "  nimbus k8s delete -f $DEMO_DIR/k8s --namespace production"
