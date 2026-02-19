import { describe, test, expect } from 'bun:test';
import { spawn } from 'child_process';
import { resolve } from 'path';

describe('Startup time benchmarks', () => {
  test('CLI --version completes in < 2000ms', async () => {
    const start = performance.now();

    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const proc = spawn('bun', ['run', 'services/cli-service/src/server.ts', '--version'], {
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      proc.stdout?.on('data', (d) => (stdout += d.toString()));
      proc.on('close', (code) => resolve({ code, stdout }));
      proc.on('error', reject);
    });

    const elapsed = performance.now() - start;
    console.log(`  CLI --version took ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });

  test('service module import completes in < 3000ms', async () => {
    const services = [
      'services/state-service/src/server.ts',
      'services/llm-service/src/server.ts',
      'services/generator-service/src/server.ts',
    ];

    for (const service of services) {
      const start = performance.now();
      try {
        // Use dynamic import to measure load time
        await import(resolve(process.cwd(), service));
      } catch {
        // Service may fail to start without deps — that's OK, we're measuring import time
      }
      const elapsed = performance.now() - start;
      console.log(`  ${service} import took ${elapsed.toFixed(0)}ms`);
      // Import should be fast even if service can't fully start
      expect(elapsed).toBeLessThan(3000);
    }
  });
});
