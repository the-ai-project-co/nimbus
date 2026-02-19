import { test, expect } from '@playwright/test';

const SERVICES = [
  { name: 'Core Engine', port: 3001 },
  { name: 'LLM Service', port: 3002 },
  { name: 'Generator Service', port: 3003 },
  { name: 'State Service', port: 3004 },
  { name: 'Terraform Tools', port: 3005 },
  { name: 'K8s Tools', port: 3006 },
  { name: 'Helm Tools', port: 3007 },
  { name: 'Git Tools', port: 3008 },
  { name: 'GitHub Tools', port: 3009 },
  { name: 'AWS Tools', port: 3010 },
  { name: 'FS Tools', port: 3011 },
  { name: 'GCP Tools', port: 3015 },
  { name: 'Azure Tools', port: 3016 },
];

for (const service of SERVICES) {
  test(`${service.name} health check on port ${service.port}`, async ({ request }) => {
    const response = await request.get(`http://localhost:${service.port}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });
}

// Swagger endpoint tests for services that expose it
const SWAGGER_SERVICES = [
  { name: 'LLM Service', port: 3002 },
  { name: 'State Service', port: 3004 },
  { name: 'Git Tools', port: 3008 },
  { name: 'FS Tools', port: 3011 },
  { name: 'Terraform Tools', port: 3005 },
  { name: 'K8s Tools', port: 3006 },
  { name: 'Helm Tools', port: 3007 },
  { name: 'GitHub Tools', port: 3009 },
];

for (const service of SWAGGER_SERVICES) {
  test(`${service.name} swagger endpoint on port ${service.port}`, async ({ request }) => {
    const response = await request.get(`http://localhost:${service.port}/swagger`);
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain('swagger-ui');
  });
}

// Response time assertions
for (const service of SERVICES) {
  test(`${service.name} responds within 5 seconds on port ${service.port}`, async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`http://localhost:${service.port}/health`);
    const elapsed = Date.now() - start;
    expect(response.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(5000);
  });
}

// Health response structure validation
for (const service of SERVICES) {
  test(`${service.name} health response has expected structure on port ${service.port}`, async ({ request }) => {
    const response = await request.get(`http://localhost:${service.port}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    // Verify service field exists if present
    if (body.service) {
      expect(typeof body.service).toBe('string');
      expect(body.service.length).toBeGreaterThan(0);
    }
    // Verify uptime or timestamp if present
    if (body.uptime !== undefined) {
      expect(typeof body.uptime).toBe('number');
    }
  });
}
