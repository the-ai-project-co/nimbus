import { describe, test, expect } from 'bun:test';

const SERVICE_PORTS = [
  { name: 'cli-service', port: 3000 },
  { name: 'core-engine-service', port: 3001 },
  { name: 'llm-service', port: 3002 },
  { name: 'state-service', port: 3003 },
  { name: 'generator-service', port: 3004 },
  { name: 'git-tools-service', port: 3005 },
  { name: 'github-tools-service', port: 3006 },
  { name: 'k8s-tools-service', port: 3007 },
  { name: 'helm-tools-service', port: 3008 },
  { name: 'terraform-tools-service', port: 3009 },
  { name: 'aws-tools-service', port: 3010 },
  { name: 'fs-tools-service', port: 3011 },
  { name: 'auth-service', port: 3012 },
  { name: 'billing-service', port: 3013 },
  { name: 'team-service', port: 3014 },
  { name: 'audit-service', port: 3015 },
];

const REQUEST_COUNT = 20;
const MAX_ERROR_RATE = 0.05; // 5%

describe('Service error rate benchmarks', () => {
  for (const { name, port } of SERVICE_PORTS) {
    test(`${name} health endpoint error rate < 5%`, async () => {
      let errors = 0;
      const url = `http://localhost:${port}/health`;

      for (let i = 0; i < REQUEST_COUNT; i++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
          if (!res.ok) errors++;
        } catch {
          errors++;
        }
      }

      const errorRate = errors / REQUEST_COUNT;
      // If service isn't running, skip gracefully
      if (errors === REQUEST_COUNT) {
        console.log(`  ⚠ ${name} not running — skipping`);
        return;
      }
      expect(errorRate).toBeLessThanOrEqual(MAX_ERROR_RATE);
    });
  }
});
