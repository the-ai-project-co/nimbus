import { getEnv } from '@nimbus/shared-utils';

/**
 * Service Discovery
 * Provides URLs for all microservices based on environment
 */

export const ServiceURLs = {
  CLI: getEnv('CLI_SERVICE_URL', 'http://localhost:3000'),
  CORE_ENGINE: getEnv('CORE_ENGINE_SERVICE_URL', 'http://localhost:3001'),
  LLM: getEnv('LLM_SERVICE_URL', 'http://localhost:3002'),
  GENERATOR: getEnv('GENERATOR_SERVICE_URL', 'http://localhost:3003'),
  GIT_TOOLS: getEnv('GIT_TOOLS_SERVICE_URL', 'http://localhost:3004'),
  FS_TOOLS: getEnv('FS_TOOLS_SERVICE_URL', 'http://localhost:3005'),
  TERRAFORM_TOOLS: getEnv('TERRAFORM_TOOLS_SERVICE_URL', 'http://localhost:3006'),
  K8S_TOOLS: getEnv('K8S_TOOLS_SERVICE_URL', 'http://localhost:3007'),
  HELM_TOOLS: getEnv('HELM_TOOLS_SERVICE_URL', 'http://localhost:3008'),
  AWS_TOOLS: getEnv('AWS_TOOLS_SERVICE_URL', 'http://localhost:3009'),
  GITHUB_TOOLS: getEnv('GITHUB_TOOLS_SERVICE_URL', 'http://localhost:3010'),
  STATE: getEnv('STATE_SERVICE_URL', 'http://localhost:3011'),
  AUTH: getEnv('AUTH_SERVICE_URL', 'http://localhost:3012'),
  TEAM: getEnv('TEAM_SERVICE_URL', 'http://localhost:3013'),
  BILLING: getEnv('BILLING_SERVICE_URL', 'http://localhost:3014'),
  AUDIT: getEnv('AUDIT_SERVICE_URL', 'http://localhost:3015'),
} as const;

export const WebSocketURLs = {
  CORE_ENGINE: getEnv('CORE_ENGINE_WS_URL', 'ws://localhost:3101'),
  LLM: getEnv('LLM_WS_URL', 'ws://localhost:3102'),
  GENERATOR: getEnv('GENERATOR_WS_URL', 'ws://localhost:3103'),
} as const;
