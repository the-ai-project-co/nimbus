/**
 * nimbus web -- Start the API server and open the Web UI
 *
 * Convenience command that:
 *   1. Starts `nimbus serve` on the configured port
 *   2. Opens the astron-landing Web UI in the default browser
 *
 * Usage:
 *   nimbus web                     # serve on 4200, open http://localhost:6001/nimbus
 *   nimbus web --port 8080         # custom serve port
 *   nimbus web --ui-url https://app.example.com/nimbus   # custom Web UI URL
 */

import { serveCommand } from './serve';

export interface WebOptions {
  /** Port for nimbus serve (default: 4200). */
  port?: number;
  /** Hostname for nimbus serve (default: 'localhost'). */
  host?: string;
  /** HTTP Basic Auth credentials. */
  auth?: string;
  /** URL of the Web UI (default: http://localhost:6001/nimbus). */
  uiUrl?: string;
}

/**
 * Open a URL in the default browser (cross-platform).
 */
async function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const cmd = platform === 'darwin'
    ? ['open', url]
    : platform === 'win32'
      ? ['cmd', '/c', 'start', url]
      : ['xdg-open', url];

  const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  await proc.exited;
}

/**
 * Run the web command: start serve and open browser.
 */
export async function webCommand(options: WebOptions): Promise<void> {
  const port = options.port ?? 4200;
  const uiUrl = options.uiUrl ?? 'http://localhost:6001/nimbus';

  console.log(`Starting Nimbus API server on port ${port}...`);
  console.log(`Opening Web UI at ${uiUrl}\n`);

  // Open browser after a short delay to let the server start
  setTimeout(() => {
    openBrowser(uiUrl).catch(() => {
      console.log(`Could not open browser. Please visit: ${uiUrl}`);
    });
  }, 1500);

  // Start the server (this blocks)
  await serveCommand({
    port,
    host: options.host,
    auth: options.auth,
  });
}
