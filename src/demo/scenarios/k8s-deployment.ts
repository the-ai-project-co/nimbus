/**
 * Kubernetes Deployment Demo Scenario
 *
 * Demonstrates deploying an application to Kubernetes
 */

import type { DemoScenario } from '../types';

export const k8sDeploymentScenario: DemoScenario = {
  id: 'k8s-deployment',
  name: 'Deploy to Kubernetes',
  description: 'Learn how to generate and deploy Kubernetes manifests',
  category: 'kubernetes',
  duration: 10,
  prerequisites: [
    'kubectl configured with cluster access',
    'Nimbus CLI installed',
  ],
  tags: ['kubernetes', 'k8s', 'deployment', 'manifests'],
  steps: [
    {
      id: 'check-cluster',
      title: 'Verify Cluster Connection',
      description: 'Check that kubectl can connect to your cluster',
      command: 'nimbus k8s get nodes',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
NAME                 STATUS   ROLES           AGE   VERSION
node-1               Ready    control-plane   30d   v1.28.0
node-2               Ready    <none>          30d   v1.28.0
node-3               Ready    <none>          30d   v1.28.0
      `.trim(),
    },
    {
      id: 'generate-manifests',
      title: 'Generate Kubernetes Manifests',
      description: 'Use Nimbus to generate deployment manifests for an nginx application',
      command: 'nimbus generate k8s --type deployment --image nginx:latest --replicas 3 --port 80 --output ./k8s-demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Generating Kubernetes manifests...

Created files:
  k8s-demo/
  ├── deployment.yaml    # Deployment with 3 replicas
  ├── service.yaml       # ClusterIP service on port 80
  └── kustomization.yaml # Kustomize configuration

Configuration:
  Image:    nginx:latest
  Replicas: 3
  Port:     80
  Service:  ClusterIP

Generated successfully!
      `.trim(),
    },
    {
      id: 'review-deployment',
      title: 'Review Deployment Manifest',
      description: 'Examine the generated deployment configuration',
      command: 'nimbus explain k8s k8s-demo/deployment.yaml',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
File: k8s-demo/deployment.yaml

This Kubernetes Deployment defines:

1. Metadata
   - Name: nginx
   - Labels: app=nginx

2. Pod Spec
   - Replicas: 3
   - Container: nginx:latest
   - Port: 80 (HTTP)

3. Resource Limits
   - CPU: 100m request, 500m limit
   - Memory: 128Mi request, 256Mi limit

4. Health Checks
   - Liveness probe: HTTP GET /
   - Readiness probe: HTTP GET /

5. Update Strategy
   - RollingUpdate
   - maxUnavailable: 1
   - maxSurge: 1

This is a production-ready deployment with proper
resource management and health monitoring.
      `.trim(),
    },
    {
      id: 'preview-apply',
      title: 'Preview Apply (Dry Run)',
      description: 'See what would be created without actually applying',
      command: 'nimbus apply k8s --path ./k8s-demo --dry-run',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Dry Run - Kubernetes Apply

Resources to create:
  ✓ deployment/nginx (3 replicas)
  ✓ service/nginx (ClusterIP:80)

Resource Summary:
  Deployments: 1
  Services:    1
  ConfigMaps:  0
  Secrets:     0

No changes will be applied (dry run mode)
      `.trim(),
    },
    {
      id: 'apply-manifests',
      title: 'Apply to Cluster',
      description: 'Deploy the application to your Kubernetes cluster',
      command: 'nimbus apply k8s --path ./k8s-demo --namespace demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Applying Kubernetes manifests...

namespace/demo created
deployment.apps/nginx created
service/nginx created

Waiting for deployment to be ready...
  Replicas: 3/3 ready
  Conditions: Available, Progressing

Deployment successful!

To access the application:
  kubectl port-forward svc/nginx 8080:80 -n demo
  Then visit: http://localhost:8080
      `.trim(),
    },
    {
      id: 'check-status',
      title: 'Check Deployment Status',
      description: 'Verify the deployment is running correctly',
      command: 'nimbus k8s get pods --namespace demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
NAME                     READY   STATUS    RESTARTS   AGE
nginx-5d4f8b7c9d-abc12   1/1     Running   0          30s
nginx-5d4f8b7c9d-def34   1/1     Running   0          30s
nginx-5d4f8b7c9d-ghi56   1/1     Running   0          30s
      `.trim(),
    },
    {
      id: 'scale-deployment',
      title: 'Scale the Deployment',
      description: 'Increase replicas to handle more traffic',
      command: 'nimbus k8s scale deployment/nginx --replicas=5 --namespace demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
deployment.apps/nginx scaled

Scaling deployment from 3 to 5 replicas...

Current status:
  Ready: 5/5 replicas

Scaling complete!
      `.trim(),
    },
    {
      id: 'cleanup',
      title: 'Clean Up Resources',
      description: 'Remove the demo deployment (optional)',
      command: 'nimbus k8s delete --path ./k8s-demo --namespace demo',
      showOutput: true,
      waitForInput: false,
      mockResponse: `
Deleting Kubernetes resources...

deployment.apps/nginx deleted
service/nginx deleted
namespace/demo deleted

Cleanup complete!
      `.trim(),
    },
  ],
};
