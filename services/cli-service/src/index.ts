import { logger } from '@nimbus/shared-utils';

const PORT = parseInt(process.env.PORT || '3000');
const WS_PORT = parseInt(process.env.WS_PORT || '3100');

async function main() {
  const args = process.argv.slice(2);

  // Check if running as CLI or as server
  if (args.length > 0 && args[0] !== '--server') {
    // Lazy-load telemetry (non-blocking)
    const { trackCommand, trackError, shutdown: shutdownTelemetry } = await import('./telemetry');

    // Track command usage (opt-in telemetry)
    trackCommand(args[0], args.slice(1));

    // Lazy-load server/command dispatcher
    const { runCommand } = await import('./server');

    // CLI mode: run command directly
    try {
      await runCommand(args);
      await shutdownTelemetry();
    } catch (error: any) {
      trackError(args[0], error.message || 'unknown');
      await shutdownTelemetry();
      logger.error('Command failed', error);
      process.exit(1);
    }
  } else {
    // Server mode: start HTTP/WS server (lazy-load everything)
    try {
      const { startServer } = await import('./server');
      await startServer(PORT, WS_PORT);
      logger.info(`CLI Service started on port ${PORT} (WS: ${WS_PORT})`);
    } catch (error) {
      logger.error('Failed to start CLI Service', error);
      process.exit(1);
    }
  }
}

main();

process.on('beforeExit', async () => {
  try {
    const { shutdown: shutdownTelemetry } = await import('./telemetry');
    await shutdownTelemetry();
  } catch {
    // Ignore errors during shutdown
  }
});
