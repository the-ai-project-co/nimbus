#!/usr/bin/env bash
set -e

# Demo 2: Terraform VPC
# Generate a Terraform VPC configuration using nimbus, then validate,
# preview the planned changes, and run a terraform plan.

DEMO_DIR=$(mktemp -d -t nimbus-demo-tf-vpc-XXXXXX)
trap 'rm -rf "$DEMO_DIR"' EXIT

echo "=== Demo 2: Terraform VPC ==="
echo ""

# Step 1: Initialize a nimbus workspace with the VPC template
echo "--- Step 1: Initializing workspace with VPC template ---"
cd "$DEMO_DIR"
nimbus init --non-interactive --name vpc-demo --provider aws --template vpc
echo ""

# Step 2: Generate Terraform VPC configuration via the generate command
echo "--- Step 2: Generating Terraform VPC configuration ---"
nimbus generate terraform \
  --provider aws \
  --template vpc \
  --name vpc-demo \
  --region us-east-1 \
  --output "$DEMO_DIR/terraform"
echo ""

# Step 3: List generated files
echo "--- Step 3: Listing generated Terraform files ---"
ls -la "$DEMO_DIR/terraform/"
echo ""

# Step 4: Validate the generated Terraform configuration
echo "--- Step 4: Validating Terraform configuration ---"
nimbus tf validate --directory "$DEMO_DIR/terraform"
echo ""

# Step 5: Preview infrastructure changes without applying
echo "--- Step 5: Previewing infrastructure changes ---"
nimbus preview terraform --directory "$DEMO_DIR/terraform" --format table
echo ""

# Step 6: Run Terraform plan to see what would be created
echo "--- Step 6: Running Terraform plan ---"
nimbus tf plan --directory "$DEMO_DIR/terraform" \
  --var "project_name=vpc-demo" \
  --var "aws_region=us-east-1"
echo ""

# Step 7: Analyze the generated configuration for best practices
echo "--- Step 7: Analyzing configuration for best practices ---"
nimbus analyze --directory "$DEMO_DIR/terraform"
echo ""

echo "=== Demo 2 Complete ==="
echo "A Terraform VPC configuration was generated, validated, and planned."
echo "No real infrastructure was created (plan only)."
