/**
 * Full Journey Demo Scenario
 *
 * End-to-end demo from discovery to deployment
 */

import type { DemoScenario } from '../types';

export const fullJourneyScenario: DemoScenario = {
  id: 'full-journey',
  name: 'Full Infrastructure Journey',
  description: 'Complete workflow: Discovery → Generation → Preview → Deploy',
  category: 'full-journey',
  duration: 15,
  prerequisites: [
    'AWS CLI configured with credentials',
    'Terraform installed (v1.0+)',
    'kubectl configured (for K8s steps)',
    'Nimbus CLI installed',
  ],
  tags: ['full-demo', 'aws', 'terraform', 'kubernetes'],
  steps: [
    {
      id: 'init',
      title: 'Initialize Nimbus Project',
      description: 'Set up Nimbus in the current project',
      command: 'nimbus init',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Nimbus Initialization

Scanning project...

Detected:
  ✓ Languages: TypeScript, Python
  ✓ Frameworks: Next.js, FastAPI
  ✓ Package Managers: npm, pip
  ✓ IaC: Terraform
  ✓ CI/CD: GitHub Actions
  ✓ Cloud: AWS

Created .nimbus/project.yaml

Project initialized successfully!
      `.trim(),
    },
    {
      id: 'discover-aws',
      title: 'Discover AWS Resources',
      description: 'Scan your AWS account for existing infrastructure',
      command: 'nimbus aws discover --regions us-east-1',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
AWS Discovery

Scanning AWS account...
Region: us-east-1

Discovery Summary:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EC2 Instances:    3
  VPCs:             2
  S3 Buckets:       5
  RDS Instances:    1
  Lambda Functions: 8
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Resources discovered and saved to .nimbus/inventory.yaml
      `.trim(),
    },
    {
      id: 'generate-terraform',
      title: 'Generate Terraform from Inventory',
      description: 'Create Terraform code from discovered resources',
      command: 'nimbus generate terraform --from-inventory',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Generate Terraform

Generating from .nimbus/inventory.yaml...

Generated files:
  ● terraform/main.tf
  ● terraform/vpc.tf
  ● terraform/ec2.tf
  ● terraform/rds.tf
  ● terraform/s3.tf
  ● terraform/variables.tf
  ● terraform/outputs.tf

Output directory: ./terraform

Generation complete!
Run 'nimbus preview terraform' to see the plan.
      `.trim(),
    },
    {
      id: 'preview',
      title: 'Preview Infrastructure Changes',
      description: 'Review what will be created/modified',
      command: 'nimbus preview terraform ./terraform',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Preview Terraform Changes

Directory: ./terraform

Creating execution plan...
Plan created

Plan Summary:

  + 12 to add
  ~ 0 to change
  - 0 to destroy

Resources to be created:
  + aws_vpc.main
  + aws_subnet.private[0-2]
  + aws_subnet.public[0-2]
  + aws_security_group.main
  + aws_instance.app
  + aws_db_instance.main
  + aws_s3_bucket.assets

  Safety Check Summary:

    🟡 [MEDIUM]  This operation will modify infrastructure

All safety checks passed
      `.trim(),
    },
    {
      id: 'apply',
      title: 'Apply Infrastructure',
      description: 'Deploy the infrastructure with safety approval',
      command: 'nimbus apply terraform ./terraform',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Terraform Apply

Creating execution plan...
Plan created

╔══════════════════════════════════════════════════════════╗
║               APPROVAL REQUIRED                          ║
╠══════════════════════════════════════════════════════════╣
║  Operation: terraform apply                              ║
╚══════════════════════════════════════════════════════════╝

  Identified Risks:
    🟡 [MEDIUM]  This operation will modify infrastructure

Do you want to proceed? Yes

Applying changes...

Apply complete! Resources: 12 added, 0 changed, 0 destroyed.
      `.trim(),
    },
    {
      id: 'generate-k8s',
      title: 'Generate Kubernetes Manifests',
      description: 'Create K8s deployment for the application',
      command: 'nimbus questionnaire kubernetes',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Kubernetes Configuration Wizard

Step 1/4: Application Info
  Name: my-app
  Image: my-registry/my-app:latest

Step 2/4: Deployment Settings
  Replicas: 3
  Port: 8080

Step 3/4: Resource Limits
  CPU Request: 100m
  Memory Request: 128Mi

Step 4/4: Service Configuration
  Type: ClusterIP
  Port: 80

Generated files:
  ● k8s/deployment.yaml
  ● k8s/service.yaml

Output directory: ./k8s
      `.trim(),
    },
    {
      id: 'deploy-k8s',
      title: 'Deploy to Kubernetes',
      description: 'Apply K8s manifests to the cluster',
      command: 'nimbus apply k8s ./k8s',
      showOutput: true,
      waitForInput: false,
      mockResponse: `
Kubernetes Apply

Manifests: ./k8s
Namespace: default

Found 2 manifest file(s)

Resources to apply:
  - Deployment/my-app
  - Service/my-app

Apply 2 resource(s)? Yes

Applying manifests...
Apply complete!

Created:
  + Deployment/my-app
  + Service/my-app
      `.trim(),
    },
  ],
};
