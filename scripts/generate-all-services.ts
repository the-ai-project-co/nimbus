#!/usr/bin/env bun

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  services,
  generatePackageJson,
  generateEnvExample,
  generateIndex,
  generateServer,
  generateHealthRoute,
  generateTsConfig,
  generateTestFile,
} from './create-service.ts';

async function generateService(serviceName: string) {
  const config = services.find(s => s.name === serviceName);
  if (!config) {
    console.error(`Service ${serviceName} not found`);
    return;
  }

  const serviceDir = join(process.cwd(), 'services', serviceName);
  const srcDir = join(serviceDir, 'src');
  const routesDir = join(srcDir, 'routes');
  const testsDir = join(serviceDir, 'tests');

  // Create directories
  await mkdir(srcDir, { recursive: true });
  await mkdir(routesDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });

  // Generate files
  await writeFile(join(serviceDir, 'package.json'), generatePackageJson(config));
  await writeFile(join(serviceDir, 'tsconfig.json'), generateTsConfig());
  await writeFile(join(serviceDir, '.env.example'), generateEnvExample(config));
  await writeFile(join(srcDir, 'index.ts'), generateIndex(config));
  await writeFile(join(srcDir, 'server.ts'), generateServer(config));
  await writeFile(join(routesDir, 'health.ts'), generateHealthRoute(config));
  await writeFile(join(testsDir, 'health.test.ts'), generateTestFile(config));

  console.log(`✓ Generated ${config.displayName}`);
}

async function main() {
  console.log('Generating all Nimbus services...\n');

  // Skip state-service as it's already created
  const servicesToGenerate = services
    .filter(s => s.name !== 'state-service')
    .map(s => s.name);

  for (const serviceName of servicesToGenerate) {
    await generateService(serviceName);
  }

  console.log('\n✓ All services generated successfully!');
}

main().catch(console.error);
