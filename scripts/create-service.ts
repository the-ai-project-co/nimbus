#!/usr/bin/env bun

/**
 * Service Generator Script
 * Creates a new service with boilerplate code
 */

interface ServiceConfig {
  name: string;
  displayName: string;
  port: number;
  wsPort?: number;
  hasWebSocket: boolean;
}

const services: ServiceConfig[] = [
  { name: 'cli-service', displayName: 'CLI Service', port: 3000, wsPort: 3100, hasWebSocket: true },
  { name: 'core-engine-service', displayName: 'Core Engine Service', port: 3001, wsPort: 3101, hasWebSocket: true },
  { name: 'llm-service', displayName: 'LLM Service', port: 3002, wsPort: 3102, hasWebSocket: true },
  { name: 'generator-service', displayName: 'Generator Service', port: 3003, wsPort: 3103, hasWebSocket: true },
  { name: 'git-tools-service', displayName: 'Git Tools Service', port: 3004, hasWebSocket: false },
  { name: 'fs-tools-service', displayName: 'File System Tools Service', port: 3005, hasWebSocket: false },
  { name: 'terraform-tools-service', displayName: 'Terraform Tools Service', port: 3006, hasWebSocket: false },
  { name: 'k8s-tools-service', displayName: 'Kubernetes Tools Service', port: 3007, hasWebSocket: false },
  { name: 'helm-tools-service', displayName: 'Helm Tools Service', port: 3008, hasWebSocket: false },
  { name: 'aws-tools-service', displayName: 'AWS Tools Service', port: 3009, hasWebSocket: false },
  { name: 'github-tools-service', displayName: 'GitHub Tools Service', port: 3010, hasWebSocket: false },
  { name: 'state-service', displayName: 'State Service', port: 3011, hasWebSocket: false },
];

function generatePackageJson(config: ServiceConfig): string {
  return JSON.stringify({
    name: `@nimbus/${config.name}`,
    version: '0.1.0',
    type: 'module',
    description: `${config.displayName} for Nimbus`,
    main: 'src/index.ts',
    ...(config.name === 'cli-service' && {
      bin: {
        nimbus: './src/index.ts'
      }
    }),
    scripts: {
      dev: 'bun --watch src/index.ts',
      start: 'bun src/index.ts',
      test: 'bun test',
      'test:watch': 'bun test --watch',
      lint: "echo 'Lint not configured yet'",
      'type-check': 'tsc --noEmit',
      build: 'bun build src/index.ts --outdir=dist --target=bun',
    },
    dependencies: {
      '@nimbus/shared-types': 'workspace:*',
      '@nimbus/shared-utils': 'workspace:*',
      '@nimbus/shared-clients': 'workspace:*',
    },
    devDependencies: {
      '@types/bun': 'latest',
      typescript: '^5.3.3',
    },
  }, null, 2);
}

function generateEnvExample(config: ServiceConfig): string {
  const lines = [
    `# ${config.displayName} Configuration`,
    `PORT=${config.port}`,
  ];

  if (config.hasWebSocket) {
    lines.push(`WS_PORT=${config.wsPort}`);
  }

  lines.push('LOG_LEVEL=info');
  lines.push('');
  lines.push('# Service Discovery');
  lines.push('STATE_SERVICE_URL=http://localhost:3011');
  lines.push('LLM_SERVICE_URL=http://localhost:3002');
  lines.push('CORE_ENGINE_SERVICE_URL=http://localhost:3001');

  return lines.join('\n');
}

function generateIndex(config: ServiceConfig): string {
  const wsPortLine = config.hasWebSocket ? `, ${config.wsPort}` : '';
  return `import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '${config.port}');
${config.hasWebSocket ? `const WS_PORT = parseInt(process.env.WS_PORT || '${config.wsPort}');` : ''}

async function main() {
  try {
    await startServer(PORT${config.hasWebSocket ? ', WS_PORT' : ''});
    logger.info(\`${config.displayName} started on port \${PORT}${config.hasWebSocket ? ' (WS: ${WS_PORT})' : ''}\`);
  } catch (error) {
    logger.error('Failed to start ${config.displayName}', error);
    process.exit(1);
  }
}

main();
`;
}

function generateServer(config: ServiceConfig): string {
  return `import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';

export async function startServer(port: number${config.hasWebSocket ? ', wsPort: number' : ''}) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Health check endpoint
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // TODO: Add your routes here

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(\`${config.displayName} HTTP server listening on port \${port}\`);

  ${config.hasWebSocket ? `
  // TODO: WebSocket server setup
  logger.info(\`${config.displayName} WebSocket server will listen on port \${wsPort}\`);
  ` : ''}

  return server;
}
`;
}

function generateHealthRoute(config: ServiceConfig): string {
  return `export function healthHandler() {
  return {
    status: 'healthy',
    service: '${config.name}',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}
`;
}

function generateTsConfig(): string {
  return JSON.stringify({
    extends: '../../tsconfig.json',
    compilerOptions: {
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', 'tests'],
  }, null, 2);
}

function generateTestFile(config: ServiceConfig): string {
  return `import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('${config.displayName}', () => {
  let server: any;
  const PORT = ${config.port};

  beforeAll(async () => {
    server = await startServer(PORT${config.hasWebSocket ? `, ${config.wsPort}` : ''});
  });

  afterAll(() => {
    server.stop();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(\`http://localhost:\${PORT}/health\`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('${config.name}');
  });
});
`;
}

console.log('Service Generator - Generates boilerplate for Nimbus services');
console.log('');
console.log('Available services:');
services.forEach((s, i) => {
  console.log(`${i + 1}. ${s.displayName} (${s.name}) - Port ${s.port}`);
});

export { services, generatePackageJson, generateEnvExample, generateIndex, generateServer, generateHealthRoute, generateTsConfig, generateTestFile };
