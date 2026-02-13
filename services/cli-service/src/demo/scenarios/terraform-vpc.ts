/**
 * Terraform VPC Demo Scenario
 *
 * Demonstrates creating a VPC with Terraform
 */

import type { DemoScenario } from '../types';

export const terraformVpcScenario: DemoScenario = {
  id: 'terraform-vpc',
  name: 'Create AWS VPC with Terraform',
  description: 'Deploy a complete VPC infrastructure using Nimbus and Terraform',
  category: 'terraform',
  duration: 10,
  prerequisites: [
    'AWS CLI configured with credentials',
    'Terraform installed (v1.0+)',
    'Nimbus CLI installed',
  ],
  tags: ['terraform', 'aws', 'vpc', 'networking'],
  steps: [
    {
      id: 'init-project',
      title: 'Initialize Nimbus Project',
      description: 'Scan the current directory and set up Nimbus configuration',
      command: 'nimbus init',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Nimbus Initialization

Scanning project...

Project Summary:
  Type: infrastructure
  Languages: HCL
  IaC Tools: Terraform
  Cloud: AWS

Created .nimbus/project.yaml
Created .nimbus/config.yaml

Project initialized successfully!
      `.trim(),
    },
    {
      id: 'start-questionnaire',
      title: 'Start Terraform Questionnaire',
      description: 'Use the interactive wizard to configure VPC settings',
      command: 'nimbus questionnaire terraform',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Terraform Configuration Wizard

Starting local questionnaire...

Step 1/3: Provider Configuration
  Provider: aws
  Region: us-east-1

Step 2/3: Component Selection
  Components: vpc

Step 3/3: VPC Configuration
  CIDR Block: 10.0.0.0/16
  Availability Zones: 3

Questionnaire completed!
Generating code...

Generated files:
  ● main.tf
  ● variables.tf
  ● outputs.tf

Output directory: ./terraform
      `.trim(),
    },
    {
      id: 'preview-plan',
      title: 'Preview Terraform Plan',
      description: 'See what changes will be made before applying',
      command: 'nimbus preview terraform ./terraform',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Preview Terraform Changes

Directory: ./terraform

Creating execution plan...
Plan created

Plan Summary:

  + 6 to add
  ~ 0 to change
  - 0 to destroy

  Safety Check Summary:

    🟡 [MEDIUM]  This operation will modify infrastructure

All safety checks passed
      `.trim(),
    },
    {
      id: 'apply-terraform',
      title: 'Apply Terraform Configuration',
      description: 'Deploy the VPC infrastructure with safety approval',
      command: 'nimbus apply terraform ./terraform',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Terraform Apply

Directory: ./terraform

Creating execution plan...
Plan created

Plan Summary:
  + 6 to add

╔══════════════════════════════════════════════════════════╗
║               APPROVAL REQUIRED                          ║
╠══════════════════════════════════════════════════════════╣
║  Operation: terraform apply                              ║
╚══════════════════════════════════════════════════════════╝

  Identified Risks:

    🟡 [MEDIUM]  This operation will modify infrastructure

Do you want to proceed with this operation? Yes

Operation approved

Applying changes...
Apply complete!

Apply complete! Resources: 6 added, 0 changed, 0 destroyed.

Outputs:
  vpc_id = "vpc-0abc123def456789"
  private_subnets = ["subnet-001", "subnet-002", "subnet-003"]
  public_subnets = ["subnet-101", "subnet-102", "subnet-103"]
      `.trim(),
    },
    {
      id: 'verify-vpc',
      title: 'Verify VPC Creation',
      description: 'List VPCs to confirm our new VPC was created',
      command: 'nimbus aws vpc list',
      showOutput: true,
      waitForInput: false,
      mockResponse: `
VPCs

Found 2 VPC(s)

VPC ID                Name           CIDR           State      Default
─────────────────────────────────────────────────────────────────────
vpc-default           default        172.31.0.0/16  available  Yes
vpc-0abc123def456789  my-project     10.0.0.0/16    available  No
      `.trim(),
    },
  ],
};
