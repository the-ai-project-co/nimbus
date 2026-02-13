#!/usr/bin/env bash
set -e

# Demo 3: Kubernetes Operations
# Generate Kubernetes manifests using nimbus and apply them to a namespace.
# Demonstrates the full K8s workflow: generate, preview, apply, verify.

DEMO_DIR=$(mktemp -d -t nimbus-demo-k8s-XXXXXX)
DEMO_NAMESPACE="nimbus-demo"
trap 'rm -rf "$DEMO_DIR"' EXIT

echo "=== Demo 3: Kubernetes Operations ==="
echo ""

# Step 1: Initialize a nimbus workspace
echo "--- Step 1: Initializing nimbus workspace ---"
cd "$DEMO_DIR"
nimbus init --non-interactive --name k8s-demo
echo ""

# Step 2: Generate Kubernetes manifests for a web application
echo "--- Step 2: Generating Kubernetes manifests ---"
nimbus generate k8s \
  --name nginx-demo \
  --type deployment \
  --image nginx:latest \
  --replicas 2 \
  --port 80 \
  --namespace "$DEMO_NAMESPACE" \
  --output "$DEMO_DIR/k8s"
echo ""

# Step 3: List the generated manifest files
echo "--- Step 3: Listing generated manifests ---"
ls -la "$DEMO_DIR/k8s/"
echo ""

# Step 4: Preview the Kubernetes changes before applying
echo "--- Step 4: Previewing Kubernetes changes ---"
nimbus preview k8s --directory "$DEMO_DIR/k8s" --namespace "$DEMO_NAMESPACE"
echo ""

# Step 5: Apply the manifests to the cluster (dry-run first)
echo "--- Step 5: Applying manifests (dry-run) ---"
nimbus k8s apply "$DEMO_DIR/k8s" \
  --namespace "$DEMO_NAMESPACE" \
  --dry-run
echo ""

# Step 6: Apply the manifests to the cluster
echo "--- Step 6: Applying manifests to cluster ---"
nimbus apply k8s \
  --directory "$DEMO_DIR/k8s" \
  --namespace "$DEMO_NAMESPACE" \
  --auto-approve
echo ""

# Step 7: Verify the deployment
echo "--- Step 7: Verifying deployment ---"
nimbus k8s get deployments --namespace "$DEMO_NAMESPACE"
echo ""

# Step 8: Check pod status
echo "--- Step 8: Checking pod status ---"
nimbus k8s get pods --namespace "$DEMO_NAMESPACE"
echo ""

# Step 9: Describe the deployment for details
echo "--- Step 9: Describing the deployment ---"
nimbus k8s describe deployment --name nginx-demo --namespace "$DEMO_NAMESPACE"
echo ""

echo "=== Demo 3 Complete ==="
echo "Kubernetes manifests were generated and applied to namespace: $DEMO_NAMESPACE"
echo ""
echo "To clean up, run:"
echo "  nimbus k8s delete -f $DEMO_DIR/k8s --namespace $DEMO_NAMESPACE"
