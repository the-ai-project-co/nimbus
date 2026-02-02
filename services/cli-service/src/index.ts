import { logger } from '@nimbus/shared-utils';
import { startServer, runCommand } from './server';

const PORT = parseInt(process.env.PORT || '3000');
const WS_PORT = parseInt(process.env.WS_PORT || '3100');

async function main() {
  const args = process.argv.slice(2);

  // Check if running as CLI or as server
  if (args.length > 0 && args[0] !== '--server') {
    // CLI mode: run command directly
    try {
      await runCommand(args);
    } catch (error: any) {
      logger.error('Command failed', error);
      process.exit(1);
    }
  } else {
    // Server mode: start HTTP/WS server
    try {
      await startServer(PORT, WS_PORT);
      logger.info(`CLI Service started on port ${PORT} (WS: ${WS_PORT})`);
    } catch (error) {
      logger.error('Failed to start CLI Service', error);
      process.exit(1);
    }
  }
}

main();
