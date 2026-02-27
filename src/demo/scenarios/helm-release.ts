/**
 * Helm Release Demo Scenario
 *
 * Demonstrates creating and deploying a Helm chart
 */

import type { DemoScenario } from '../types';

export const helmReleaseScenario: DemoScenario = {
  id: 'helm-release',
  name: 'Create and Deploy Helm Chart',
  description: 'Learn how to create and deploy Helm charts with Nimbus',
  category: 'helm',
  duration: 15,
  prerequisites: [
    'Helm 3.x installed',
    'kubectl configured with cluster access',
    'Nimbus CLI installed',
  ],
  tags: ['helm', 'charts', 'deployment', 'kubernetes'],
  steps: [
    {
      id: 'check-helm',
      title: 'Verify Helm Installation',
      description: 'Check that Helm is installed and configured',
      command: 'nimbus helm version',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Helm Version: v3.14.0
Kubernetes Version: v1.28.0
      `.trim(),
    },
    {
      id: 'generate-chart',
      title: 'Generate Helm Chart',
      description: 'Create a new Helm chart for a web application',
      command: 'nimbus generate helm --name my-webapp --type web --output ./charts',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Generating Helm chart...

Created chart: my-webapp

charts/my-webapp/
├── Chart.yaml           # Chart metadata
├── values.yaml          # Default values
├── templates/
│   ├── _helpers.tpl     # Template helpers
│   ├── deployment.yaml  # Deployment template
│   ├── service.yaml     # Service template
│   ├── ingress.yaml     # Ingress template
│   ├── configmap.yaml   # ConfigMap template
│   ├── hpa.yaml         # HPA template
│   └── NOTES.txt        # Post-install notes
└── .helmignore          # Files to ignore

Chart type: Web Application
Features:
  ✓ Deployment with health checks
  ✓ Service (ClusterIP/LoadBalancer)
  ✓ Ingress with TLS support
  ✓ ConfigMap for environment
  ✓ Horizontal Pod Autoscaler

Generated successfully!
      `.trim(),
    },
    {
      id: 'review-chart',
      title: 'Review Chart Configuration',
      description: 'Examine the generated Chart.yaml and values.yaml',
      command: 'nimbus explain helm charts/my-webapp',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Chart: my-webapp

Chart.yaml:
  name: my-webapp
  version: 0.1.0
  appVersion: "1.0.0"
  description: A Helm chart for a web application
  type: application

values.yaml (key configurations):

  replicaCount: 2

  image:
    repository: nginx
    tag: "latest"
    pullPolicy: IfNotPresent

  service:
    type: ClusterIP
    port: 80

  ingress:
    enabled: false
    className: "nginx"
    hosts:
      - host: my-webapp.local
        paths:
          - path: /
            pathType: Prefix

  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi

  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70

This chart follows Helm best practices with
configurable replicas, resources, and scaling.
      `.trim(),
    },
    {
      id: 'lint-chart',
      title: 'Lint the Chart',
      description: 'Validate the chart structure and templates',
      command: 'nimbus helm lint charts/my-webapp',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
==> Linting charts/my-webapp

[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed

Lint Summary:
  ✓ Chart.yaml valid
  ✓ values.yaml valid
  ✓ Templates compile correctly
  ✓ Required files present

Chart is ready for deployment!
      `.trim(),
    },
    {
      id: 'template-preview',
      title: 'Preview Rendered Templates',
      description: 'See what the chart will generate when installed',
      command:
        'nimbus helm template my-webapp charts/my-webapp --values charts/my-webapp/values.yaml | head -50',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
---
# Source: my-webapp/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-webapp-config
  labels:
    app.kubernetes.io/name: my-webapp
    app.kubernetes.io/instance: my-webapp
data:
  APP_ENV: "production"
---
# Source: my-webapp/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-webapp
  labels:
    app.kubernetes.io/name: my-webapp
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: my-webapp
---
# Source: my-webapp/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-webapp
  labels:
    app.kubernetes.io/name: my-webapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: my-webapp
  template:
    ...
      `.trim(),
    },
    {
      id: 'install-release',
      title: 'Install Helm Release (Dry Run)',
      description: 'Deploy the chart to Kubernetes (dry run mode)',
      command:
        'nimbus apply helm --release my-webapp --chart charts/my-webapp --namespace demo --dry-run',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Dry Run - Helm Install

Release: my-webapp
Namespace: demo
Chart: charts/my-webapp (0.1.0)

Resources to be created:
  ✓ ConfigMap/my-webapp-config
  ✓ Service/my-webapp
  ✓ Deployment/my-webapp
  ✓ HorizontalPodAutoscaler/my-webapp

Computed Values:
  replicaCount: 2
  image.repository: nginx
  image.tag: latest
  service.type: ClusterIP

No resources were created (dry run mode)

To install for real, remove --dry-run flag
      `.trim(),
    },
    {
      id: 'install-actual',
      title: 'Install Helm Release',
      description: 'Actually deploy the chart to the cluster',
      command:
        'nimbus apply helm --release my-webapp --chart charts/my-webapp --namespace demo --create-namespace',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Installing Helm release...

NAME: my-webapp
NAMESPACE: demo
STATUS: deployed
REVISION: 1

Resources:
  ✓ ConfigMap/my-webapp-config created
  ✓ Service/my-webapp created
  ✓ Deployment/my-webapp created
  ✓ HorizontalPodAutoscaler/my-webapp created

Waiting for deployment...
  Pods: 2/2 ready

NOTES:
  Thank you for installing my-webapp!

  To access the application:
    kubectl port-forward svc/my-webapp 8080:80 -n demo
    Then visit: http://localhost:8080

Installation complete!
      `.trim(),
    },
    {
      id: 'list-releases',
      title: 'List Helm Releases',
      description: 'View all deployed Helm releases',
      command: 'nimbus helm list --namespace demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
NAME       NAMESPACE  REVISION  STATUS    CHART            APP VERSION
my-webapp  demo       1         deployed  my-webapp-0.1.0  1.0.0
      `.trim(),
    },
    {
      id: 'upgrade-release',
      title: 'Upgrade Release',
      description: 'Upgrade the release with new values',
      command:
        'nimbus helm upgrade my-webapp charts/my-webapp --namespace demo --set replicaCount=3',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
Upgrading Helm release...

Release "my-webapp" has been upgraded.
REVISION: 2

Changes:
  - replicaCount: 2 -> 3

Waiting for rollout...
  Deployment updated: 3/3 replicas ready

Upgrade complete!
      `.trim(),
    },
    {
      id: 'history',
      title: 'View Release History',
      description: 'See the revision history of the release',
      command: 'nimbus helm history my-webapp --namespace demo',
      showOutput: true,
      waitForInput: true,
      mockResponse: `
REVISION  STATUS      DESCRIPTION
1         superseded  Install complete
2         deployed    Upgrade complete
      `.trim(),
    },
    {
      id: 'cleanup',
      title: 'Uninstall Release',
      description: 'Remove the Helm release (optional)',
      command: 'nimbus helm uninstall my-webapp --namespace demo',
      showOutput: true,
      waitForInput: false,
      mockResponse: `
Uninstalling release...

release "my-webapp" uninstalled

All resources removed:
  - ConfigMap/my-webapp-config
  - Service/my-webapp
  - Deployment/my-webapp
  - HorizontalPodAutoscaler/my-webapp

Cleanup complete!
      `.trim(),
    },
  ],
};
