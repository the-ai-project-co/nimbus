/**
 * Service Discovery (stub)
 *
 * Previously held URLs for 18 microservices. Nimbus is now a standalone binary —
 * all services run in-process. These constants are kept for legacy import
 * compatibility only. No HTTP services listen on these ports.
 */

function getEnvOrDefault(key: string, defaultVal: string): string {
  return process.env[key] ?? defaultVal;
}

export const ServiceURLs = {
  CLI: getEnvOrDefault('CLI_SERVICE_URL', 'http://localhost:3000'),
  CORE_ENGINE: getEnvOrDefault('CORE_ENGINE_SERVICE_URL', 'http://localhost:3001'),
  LLM: getEnvOrDefault('LLM_SERVICE_URL', 'http://localhost:3002'),
  GENERATOR: getEnvOrDefault('GENERATOR_SERVICE_URL', 'http://localhost:3003'),
  GIT_TOOLS: getEnvOrDefault('GIT_TOOLS_SERVICE_URL', 'http://localhost:3004'),
  FS_TOOLS: getEnvOrDefault('FS_TOOLS_SERVICE_URL', 'http://localhost:3005'),
  TERRAFORM_TOOLS: getEnvOrDefault('TERRAFORM_TOOLS_SERVICE_URL', 'http://localhost:3006'),
  K8S_TOOLS: getEnvOrDefault('K8S_TOOLS_SERVICE_URL', 'http://localhost:3007'),
  HELM_TOOLS: getEnvOrDefault('HELM_TOOLS_SERVICE_URL', 'http://localhost:3008'),
  AWS_TOOLS: getEnvOrDefault('AWS_TOOLS_SERVICE_URL', 'http://localhost:3009'),
  GITHUB_TOOLS: getEnvOrDefault('GITHUB_TOOLS_SERVICE_URL', 'http://localhost:3010'),
  STATE: getEnvOrDefault('STATE_SERVICE_URL', 'http://localhost:3011'),
  AUTH: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3012'),
  TEAM: getEnvOrDefault('TEAM_SERVICE_URL', 'http://localhost:3013'),
  BILLING: getEnvOrDefault('BILLING_SERVICE_URL', 'http://localhost:3014'),
  AUDIT: getEnvOrDefault('AUDIT_SERVICE_URL', 'http://localhost:3015'),
  GCP_TOOLS: getEnvOrDefault('GCP_TOOLS_URL', 'http://localhost:3016'),
  AZURE_TOOLS: getEnvOrDefault('AZURE_TOOLS_URL', 'http://localhost:3017'),
} as const;

export const WebSocketURLs = {
  CORE_ENGINE: getEnvOrDefault('CORE_ENGINE_WS_URL', 'ws://localhost:3101'),
  LLM: getEnvOrDefault('LLM_WS_URL', 'ws://localhost:3102'),
  GENERATOR: getEnvOrDefault('GENERATOR_WS_URL', 'ws://localhost:3103'),
} as const;
