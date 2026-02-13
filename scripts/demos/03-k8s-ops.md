# Demo 3: Kubernetes Operations

## Overview

This demo generates Kubernetes manifests for a web application using nimbus, applies them to a cluster namespace, and verifies the deployment. It covers the full Kubernetes workflow: manifest generation, dry-run validation, applying resources, and checking their status.

## Prerequisites

- nimbus CLI installed and available on `$PATH`
- A running Kubernetes cluster (minikube, kind, EKS, GKE, AKS, or similar)
- `kubectl` installed and configured with a valid kubeconfig
- Kubernetes Tools Service running (or nimbus in standalone mode)
- Sufficient cluster permissions to create namespaces, deployments, and services

## Steps

1. **Initialize nimbus workspace** -- Creates a temporary directory and initializes a nimbus workspace.
2. **Generate Kubernetes manifests** -- Uses `nimbus generate k8s` to create deployment and service manifests for an nginx web server with 2 replicas on port 80 in the `nimbus-demo` namespace.
3. **List generated manifests** -- Displays the YAML files that were created.
4. **Preview Kubernetes changes** -- Runs `nimbus preview k8s` to show what resources will be created or modified.
5. **Apply manifests (dry-run)** -- Executes a server-side dry-run to validate that the manifests would be accepted by the cluster API server without actually creating resources.
6. **Apply manifests to cluster** -- Runs `nimbus apply k8s` with `--auto-approve` to create the resources in the cluster.
7. **Verify deployment** -- Uses `nimbus k8s get deployments` to confirm the deployment exists and has the correct replica count.
8. **Check pod status** -- Runs `nimbus k8s get pods` to verify all pods are running and healthy.
9. **Describe deployment** -- Uses `nimbus k8s describe` to display detailed information about the deployment including events and conditions.

## Expected Output

```
=== Demo 3: Kubernetes Operations ===

--- Step 2: Generating Kubernetes manifests ---
  Generated: deployment.yaml, service.yaml

--- Step 5: Applying manifests (dry-run) ---
  deployment.apps/nginx-demo created (server dry run)
  service/nginx-demo created (server dry run)

--- Step 6: Applying manifests to cluster ---
  deployment.apps/nginx-demo created
  service/nginx-demo created

--- Step 7: Verifying deployment ---
  NAME         READY   UP-TO-DATE   AVAILABLE
  nginx-demo   2/2     2            2

--- Step 8: Checking pod status ---
  NAME                          READY   STATUS    RESTARTS
  nginx-demo-xxxxxxxxxx-xxxxx   1/1     Running   0
  nginx-demo-xxxxxxxxxx-xxxxx   1/1     Running   0

=== Demo 3 Complete ===
```

## Cleanup

The script prints cleanup instructions at the end. To remove the resources created by this demo:

```bash
# Delete all resources in the demo namespace
nimbus k8s delete -f <demo-dir>/k8s --namespace nimbus-demo

# Optionally delete the namespace itself
kubectl delete namespace nimbus-demo
```

The temporary directory containing the generated manifests is automatically cleaned up when the script exits.
