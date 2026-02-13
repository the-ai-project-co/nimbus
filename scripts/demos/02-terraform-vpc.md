# Demo 2: Terraform VPC

## Overview

This demo generates a complete AWS VPC Terraform configuration using nimbus, then validates the generated code, previews the planned infrastructure changes, and runs a Terraform plan. It demonstrates the infrastructure-as-code generation and validation workflow without creating any real cloud resources.

## Prerequisites

- nimbus CLI installed and available on `$PATH`
- Terraform installed (for `tf validate` and `tf plan` steps)
- AWS credentials configured (for the `tf plan` step; not needed for generation and validation alone)
- Terraform Tools Service running (or nimbus in standalone mode)

## Steps

1. **Initialize workspace with VPC template** -- Creates a temporary directory and runs `nimbus init` with the `vpc` template, which scaffolds a VPC Terraform module with subnets, NAT gateway, and security groups.
2. **Generate Terraform VPC configuration** -- Uses `nimbus generate terraform` to produce a complete VPC configuration targeting AWS in `us-east-1`.
3. **List generated files** -- Displays the Terraform files that were created (`main.tf`, `variables.tf`, `outputs.tf`, etc.).
4. **Validate Terraform configuration** -- Runs `nimbus tf validate` to check the generated HCL for syntax errors and configuration issues.
5. **Preview infrastructure changes** -- Uses `nimbus preview terraform` to display a human-readable summary of what resources would be created.
6. **Run Terraform plan** -- Executes `nimbus tf plan` to produce a full Terraform execution plan showing the exact resources that would be provisioned.
7. **Analyze for best practices** -- Runs `nimbus analyze` to check the configuration against security and operational best practices.

## Expected Output

```
=== Demo 2: Terraform VPC ===

--- Step 1: Initializing workspace with VPC template ---
  Nimbus workspace initialized!
  Project: vpc-demo

--- Step 2: Generating Terraform VPC configuration ---
  Generated: main.tf, variables.tf, outputs.tf

--- Step 3: Listing generated Terraform files ---
  main.tf
  variables.tf
  outputs.tf
  terraform.tfvars.example

--- Step 4: Validating Terraform configuration ---
  Terraform configuration is valid.

--- Step 5: Previewing infrastructure changes ---
  Resources to create:
    + aws_vpc
    + aws_subnet (x6)
    + aws_nat_gateway
    + aws_internet_gateway
    ...

--- Step 6: Running Terraform plan ---
  Plan: N to add, 0 to change, 0 to destroy.

--- Step 7: Analyzing configuration for best practices ---
  Best practices check: passed
  Security: no issues found

=== Demo 2 Complete ===
```

## Cleanup

No cleanup is required. The script uses a temporary directory that is automatically removed when the script exits. No real infrastructure is created because only `plan` (not `apply`) is executed.
