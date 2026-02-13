# Demo 4: Full Journey

## Overview

This demo walks through the entire nimbus lifecycle from start to finish. It covers every major phase of infrastructure management: environment setup, code generation, validation, planning, applying, and post-deployment verification. This is the comprehensive demo suitable for presentations, onboarding sessions, or end-to-end testing.

## Prerequisites

- nimbus CLI installed and available on `$PATH`
- Terraform installed (version 1.0+)
- `kubectl` installed and configured with a valid kubeconfig
- Helm installed (version 3+)
- AWS credentials configured with permissions to create VPC, EKS, RDS, and ElastiCache resources
- A running Kubernetes cluster (for the K8s apply steps)
- All nimbus backend services running (Terraform Tools Service, Kubernetes Tools Service, etc.)
- Sufficient AWS budget -- the full-stack template provisions real cloud resources if applied without `--dry-run`

## Steps

### Phase 1: Environment Setup
1. **Run environment diagnostics** -- `nimbus doctor` checks all required tools and services.
2. **Check nimbus version** -- Confirms the CLI version.
3. **Initialize workspace** -- Creates a workspace with the `full-stack` template (VPC + EKS + RDS + Redis).

### Phase 2: Generate Infrastructure
4. **Generate Terraform configuration** -- Produces a full-stack AWS Terraform configuration.
5. **Generate Kubernetes manifests** -- Creates deployment manifests for the application with 3 replicas.
6. **Generate Helm chart** -- Packages the application as a Helm chart for production.
7. **List all generated files** -- Displays every `.tf`, `.yaml`, and `.yml` file that was created.

### Phase 3: Validate
8. **Validate Terraform** -- Checks the HCL syntax and configuration validity.
9. **Analyze best practices** -- Scans for security issues and operational best practices.
10. **Estimate costs** -- Produces a cost estimate for the planned infrastructure.

### Phase 4: Plan
11. **Preview Terraform changes** -- Human-readable summary of resources to be created.
12. **Run Terraform plan** -- Full execution plan with exact resource details.
13. **Preview Kubernetes changes** -- Summary of K8s resources to be applied.

### Phase 5: Apply
14. **Apply Terraform** -- Provisions the cloud infrastructure (VPC, EKS, RDS, ElastiCache).
15. **Apply Kubernetes manifests** -- Deploys the application to the cluster.

### Phase 6: Verify
16. **Check Terraform state** -- Confirms the infrastructure state matches the configuration.
17. **Verify Kubernetes deployments** -- Lists deployments in the production namespace.
18. **Check pod health** -- Confirms all pods are running.
19. **Run drift detection** -- Verifies no configuration drift has occurred.
20. **View command history** -- Displays the full session history of commands executed.

## Expected Output

```
=== Demo 4: Full Journey ===

============================================
Phase 1: Environment Setup
============================================
  nimbus doctor: all checks passed
  nimbus version: X.Y.Z
  Workspace initialized: full-journey-demo

============================================
Phase 2: Generate Infrastructure
============================================
  Terraform files generated: main.tf, variables.tf, outputs.tf
  K8s manifests generated: deployment.yaml, service.yaml
  Helm chart generated: Chart.yaml, values.yaml, templates/

============================================
Phase 3: Validate
============================================
  Terraform validation: passed
  Best practices analysis: no critical issues
  Estimated monthly cost: $X.XX

============================================
Phase 4: Plan
============================================
  Terraform plan: N resources to add
  K8s preview: deployment + service to create

============================================
Phase 5: Apply
============================================
  Terraform apply: N resources created
  K8s apply: deployment and service created

============================================
Phase 6: Verify
============================================
  Terraform state: N resources managed
  Deployments: app-service (3/3 ready)
  Pods: 3 running, 0 pending
  Drift detection: no drift detected

=== Demo 4 Complete ===
```

## Cleanup

This demo creates real cloud resources in the Apply phase. To tear everything down:

```bash
# Destroy Terraform-managed infrastructure
nimbus tf destroy --directory <demo-dir>/terraform --auto-approve

# Delete Kubernetes resources
nimbus k8s delete -f <demo-dir>/k8s --namespace production

# Optionally delete the namespace
kubectl delete namespace production
```

The temporary directory containing generated files is automatically cleaned up when the script exits.

**Important:** If the script is interrupted during Phase 5 (Apply), partial infrastructure may remain. Run `nimbus tf destroy` and `nimbus k8s delete` manually to ensure all resources are removed.
