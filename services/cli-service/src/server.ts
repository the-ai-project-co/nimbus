import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import {
  generateTerraformCommand,
  type GenerateTerraformOptions,
  awsDiscoverCommand,
  type AwsDiscoverOptions,
  awsTerraformCommand,
  type AwsTerraformOptions,
} from './commands';

export async function startServer(port: number, wsPort: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Health check endpoint
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // Generate Terraform API endpoint (for triggering from HTTP)
      if (path === '/api/generate/terraform' && method === 'POST') {
        try {
          const body = await req.json() as GenerateTerraformOptions;
          // Run in non-interactive mode for API calls
          body.nonInteractive = true;
          await generateTerraformCommand(body);
          return Response.json({ success: true, message: 'Generation started' });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // AWS Discover API endpoint
      if (path === '/api/aws/discover' && method === 'POST') {
        try {
          const body = await req.json() as AwsDiscoverOptions;
          body.nonInteractive = true;
          const result = await awsDiscoverCommand(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // AWS Terraform API endpoint
      if (path === '/api/aws/terraform' && method === 'POST') {
        try {
          const body = await req.json() as AwsTerraformOptions;
          body.nonInteractive = true;
          await awsTerraformCommand(body);
          return Response.json({ success: true, message: 'Generation started' });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`CLI Service HTTP server listening on port ${port}`);
  logger.info(`Available routes:`);
  logger.info(`  - GET  /health`);
  logger.info(`  - POST /api/generate/terraform`);
  logger.info(`  - POST /api/aws/discover`);
  logger.info(`  - POST /api/aws/terraform`);

  // TODO: WebSocket server setup
  logger.info(`CLI Service WebSocket server will listen on port ${wsPort}`);

  return server;
}

/**
 * Run CLI command directly (for `nimbus <command> <subcommand>`)
 */
export async function runCommand(args: string[]): Promise<void> {
  const command = args[0];
  const subcommand = args[1];

  // nimbus generate terraform
  if (command === 'generate' && subcommand === 'terraform') {
    const options: GenerateTerraformOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--output' && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--accept-all-improvements') {
        options.acceptAllImprovements = true;
      } else if (arg === '--reject-all-improvements') {
        options.rejectAllImprovements = true;
      } else if (arg === '--mock') {
        options.mock = true;
      }
    }

    await generateTerraformCommand(options);
    return;
  }

  // nimbus aws discover
  if (command === 'aws' && subcommand === 'discover') {
    const options: AwsDiscoverOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--exclude-services' && args[i + 1]) {
        options.excludeServices = args[++i].split(',');
      } else if (arg === '--output-format' && args[i + 1]) {
        options.outputFormat = args[++i] as 'json' | 'table' | 'summary';
      } else if (arg === '--output-file' && args[i + 1]) {
        options.outputFile = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      }
    }

    await awsDiscoverCommand(options);
    return;
  }

  // nimbus aws terraform
  if (command === 'aws' && subcommand === 'terraform') {
    const options: AwsTerraformOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--session-id' && args[i + 1]) {
        options.sessionId = args[++i];
      } else if (arg === '--resources-file' && args[i + 1]) {
        options.resourcesFile = args[++i];
      } else if (arg === '--output' && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--terraform-version' && args[i + 1]) {
        options.terraformVersion = args[++i];
      } else if (arg === '--organize-by-service') {
        options.organizeByService = true;
      } else if (arg === '--no-organize-by-service') {
        options.organizeByService = false;
      } else if (arg === '--import-blocks') {
        options.importBlocks = true;
      } else if (arg === '--no-import-blocks') {
        options.importBlocks = false;
      } else if (arg === '--import-script') {
        options.importScript = true;
      } else if (arg === '--no-import-script') {
        options.importScript = false;
      } else if (arg === '--starter-kit') {
        options.includeStarterKit = true;
      } else if (arg === '--no-starter-kit') {
        options.includeStarterKit = false;
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--skip-discovery') {
        options.skipDiscovery = true;
      }
    }

    await awsTerraformCommand(options);
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command} ${subcommand || ''}`);
  console.log('');
  console.log('Available commands:');
  console.log('  nimbus generate terraform  - Generate Terraform from AWS infrastructure (wizard)');
  console.log('  nimbus aws discover        - Discover AWS infrastructure resources');
  console.log('  nimbus aws terraform       - Generate Terraform from AWS resources');
  console.log('');
  console.log('Use --help with any command for more options');
  process.exit(1);
}
