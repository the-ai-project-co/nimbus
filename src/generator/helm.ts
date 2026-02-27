/**
 * Helm Chart Generator
 *
 * Generates complete Helm charts from configuration
 */

import * as yaml from 'js-yaml';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ==========================================
// Types
// ==========================================

export interface HelmChartConfig {
  name: string;
  version?: string;
  appVersion?: string;
  description?: string;
  type?: 'application' | 'library';
  keywords?: string[];
  home?: string;
  sources?: string[];
  maintainers?: { name: string; email?: string; url?: string }[];
  dependencies?: HelmDependency[];

  // Values configuration
  values: HelmValues;
}

interface HelmDependency {
  name: string;
  version: string;
  repository: string;
  condition?: string;
  alias?: string;
}

interface HelmValues {
  replicaCount?: number;
  image: {
    repository: string;
    tag?: string;
    pullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
  };
  imagePullSecrets?: { name: string }[];
  nameOverride?: string;
  fullnameOverride?: string;
  serviceAccount?: {
    create?: boolean;
    annotations?: Record<string, string>;
    name?: string;
  };
  podAnnotations?: Record<string, string>;
  podSecurityContext?: Record<string, any>;
  securityContext?: Record<string, any>;
  service?: {
    type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    port?: number;
  };
  ingress?: {
    enabled?: boolean;
    className?: string;
    annotations?: Record<string, string>;
    hosts?: { host: string; paths: { path: string; pathType: string }[] }[];
    tls?: { secretName: string; hosts: string[] }[];
  };
  resources?: {
    limits?: { cpu?: string; memory?: string };
    requests?: { cpu?: string; memory?: string };
  };
  autoscaling?: {
    enabled?: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPUUtilizationPercentage?: number;
    targetMemoryUtilizationPercentage?: number;
  };
  nodeSelector?: Record<string, string>;
  tolerations?: any[];
  affinity?: any;
  env?: { name: string; value: string }[];
  envFrom?: any[];
  volumes?: any[];
  volumeMounts?: any[];
  livenessProbe?: any;
  readinessProbe?: any;
  extraContainers?: any[];
  initContainers?: any[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

// ==========================================
// Generator Class
// ==========================================

export class HelmGenerator {
  private config: HelmChartConfig;

  constructor(config: HelmChartConfig) {
    const defaultValues: HelmValues = {
      replicaCount: 1,
      image: {
        tag: 'latest',
        pullPolicy: 'IfNotPresent',
        ...config.values.image,
      },
      serviceAccount: {
        create: true,
        ...config.values.serviceAccount,
      },
      service: {
        type: 'ClusterIP',
        port: 80,
        ...config.values.service,
      },
      ingress: {
        enabled: false,
        ...config.values.ingress,
      },
      autoscaling: {
        enabled: false,
        minReplicas: 1,
        maxReplicas: 100,
        targetCPUUtilizationPercentage: 80,
        ...config.values.autoscaling,
      },
    };

    // Merge remaining config.values fields (env, volumes, etc.)
    const {
      image: _img,
      serviceAccount: _sa,
      service: _svc,
      ingress: _ing,
      autoscaling: _as,
      ...restValues
    } = config.values;

    this.config = {
      version: '0.1.0',
      appVersion: '1.0.0',
      type: 'application',
      ...config,
      values: {
        ...defaultValues,
        ...restValues,
      },
    };
  }

  /**
   * Generate all chart files
   */
  generate(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Chart.yaml
    files.push({
      path: 'Chart.yaml',
      content: this.generateChartYaml(),
    });

    // values.yaml
    files.push({
      path: 'values.yaml',
      content: this.generateValuesYaml(),
    });

    // .helmignore
    files.push({
      path: '.helmignore',
      content: this.generateHelmignore(),
    });

    // templates/_helpers.tpl
    files.push({
      path: 'templates/_helpers.tpl',
      content: this.generateHelpers(),
    });

    // templates/deployment.yaml
    files.push({
      path: 'templates/deployment.yaml',
      content: this.generateDeployment(),
    });

    // templates/service.yaml
    files.push({
      path: 'templates/service.yaml',
      content: this.generateService(),
    });

    // templates/serviceaccount.yaml
    if (this.config.values.serviceAccount?.create) {
      files.push({
        path: 'templates/serviceaccount.yaml',
        content: this.generateServiceAccount(),
      });
    }

    // templates/ingress.yaml
    files.push({
      path: 'templates/ingress.yaml',
      content: this.generateIngress(),
    });

    // templates/hpa.yaml
    files.push({
      path: 'templates/hpa.yaml',
      content: this.generateHPA(),
    });

    // templates/NOTES.txt
    files.push({
      path: 'templates/NOTES.txt',
      content: this.generateNotes(),
    });

    return files;
  }

  /**
   * Write chart files to disk
   */
  writeToFiles(outputDir: string): string[] {
    const files = this.generate();
    const writtenFiles: string[] = [];

    const chartDir = path.join(outputDir, this.config.name);

    for (const file of files) {
      const fullPath = path.join(chartDir, file.path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, file.content);
      writtenFiles.push(fullPath);
    }

    return writtenFiles;
  }

  // ==========================================
  // Private Generator Methods
  // ==========================================

  private generateChartYaml(): string {
    const chart: any = {
      apiVersion: 'v2',
      name: this.config.name,
      description: this.config.description || `A Helm chart for ${this.config.name}`,
      type: this.config.type,
      version: this.config.version,
      appVersion: this.config.appVersion,
    };

    if (this.config.keywords && this.config.keywords.length > 0) {
      chart.keywords = this.config.keywords;
    }

    if (this.config.home) {
      chart.home = this.config.home;
    }

    if (this.config.sources && this.config.sources.length > 0) {
      chart.sources = this.config.sources;
    }

    if (this.config.maintainers && this.config.maintainers.length > 0) {
      chart.maintainers = this.config.maintainers;
    }

    if (this.config.dependencies && this.config.dependencies.length > 0) {
      chart.dependencies = this.config.dependencies;
    }

    return yaml.dump(chart);
  }

  private generateValuesYaml(): string {
    return yaml.dump(this.config.values, { lineWidth: -1 });
  }

  private generateHelmignore(): string {
    return `# Patterns to ignore when building packages.
# This supports shell glob matching, relative path matching, and
# negation (prefixed with !). Only one pattern per line.
.DS_Store
# Common VCS dirs
.git/
.gitignore
.bzr/
.bzrignore
.hg/
.hgignore
.svn/
# Common backup files
*.swp
*.bak
*.tmp
*.orig
*~
# Various IDEs
.project
.idea/
*.tmproj
.vscode/
`;
  }

  private generateHelpers(): string {
    const name = this.config.name;
    return `{{/*
Expand the name of the chart.
*/}}
{{- define "${name}.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "${name}.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "${name}.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "${name}.labels" -}}
helm.sh/chart: {{ include "${name}.chart" . }}
{{ include "${name}.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "${name}.selectorLabels" -}}
app.kubernetes.io/name: {{ include "${name}.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "${name}.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "${name}.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
`;
  }

  private generateDeployment(): string {
    const name = this.config.name;
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "${name}.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      {{- with .Values.initContainers }}
      initContainers:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          {{- with .Values.env }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.envFrom }}
          envFrom:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          {{- with .Values.volumeMounts }}
          volumeMounts:
            {{- toYaml . | nindent 12 }}
          {{- end }}
        {{- with .Values.extraContainers }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      {{- with .Values.volumes }}
      volumes:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
`;
  }

  private generateService(): string {
    const name = this.config.name;
    return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}
`;
  }

  private generateServiceAccount(): string {
    const name = this.config.name;
    return `{{- if .Values.serviceAccount.create -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "${name}.serviceAccountName" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
  {{- with .Values.serviceAccount.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
`;
  }

  private generateIngress(): string {
    const name = this.config.name;
    return `{{- if .Values.ingress.enabled -}}
{{- $fullName := include "${name}.fullname" . -}}
{{- $svcPort := .Values.service.port -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ $fullName }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ $fullName }}
                port:
                  number: {{ $svcPort }}
          {{- end }}
    {{- end }}
{{- end }}
`;
  }

  private generateHPA(): string {
    const name = this.config.name;
    return `{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "${name}.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
`;
  }

  private generateNotes(): string {
    const name = this.config.name;
    return `1. Get the application URL by running these commands:
{{- if .Values.ingress.enabled }}
{{- range $host := .Values.ingress.hosts }}
  {{- range .paths }}
  http{{ if $.Values.ingress.tls }}s{{ end }}://{{ $host.host }}{{ .path }}
  {{- end }}
{{- end }}
{{- else if contains "NodePort" .Values.service.type }}
  export NODE_PORT=$(kubectl get --namespace {{ .Release.Namespace }} -o jsonpath="{.spec.ports[0].nodePort}" services {{ include "${name}.fullname" . }})
  export NODE_IP=$(kubectl get nodes --namespace {{ .Release.Namespace }} -o jsonpath="{.items[0].status.addresses[0].address}")
  echo http://$NODE_IP:$NODE_PORT
{{- else if contains "LoadBalancer" .Values.service.type }}
     NOTE: It may take a few minutes for the LoadBalancer IP to be available.
           You can watch the status of by running 'kubectl get --namespace {{ .Release.Namespace }} svc -w {{ include "${name}.fullname" . }}'
  export SERVICE_IP=$(kubectl get svc --namespace {{ .Release.Namespace }} {{ include "${name}.fullname" . }} --template "{{"{{ range (index .status.loadBalancer.ingress 0) }}{{.}}{{ end }}"}}")
  echo http://$SERVICE_IP:{{ .Values.service.port }}
{{- else if contains "ClusterIP" .Values.service.type }}
  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} -l "app.kubernetes.io/name={{ include "${name}.name" . }},app.kubernetes.io/instance={{ .Release.Name }}" -o jsonpath="{.items[0].metadata.name}")
  export CONTAINER_PORT=$(kubectl get pod --namespace {{ .Release.Namespace }} $POD_NAME -o jsonpath="{.spec.containers[0].ports[0].containerPort}")
  echo "Visit http://127.0.0.1:8080 to use your application"
  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 8080:$CONTAINER_PORT
{{- end }}
`;
  }
}

/**
 * Factory function for creating a Helm generator
 */
export function createHelmGenerator(config: HelmChartConfig): HelmGenerator {
  return new HelmGenerator(config);
}
