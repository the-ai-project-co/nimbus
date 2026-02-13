import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FrameworkScanner } from '../../../src/scanners/framework-scanner';

describe('FrameworkScanner', () => {
  let scanner: FrameworkScanner;
  let testDir: string;

  beforeEach(() => {
    scanner = new FrameworkScanner();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('scan', () => {
    test('should detect React from package.json', async () => {
      const packageJson = {
        dependencies: {
          react: '^18.0.0',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks).toContainEqual(
        expect.objectContaining({ name: 'react' })
      );
    });

    test('should detect Next.js from package.json', async () => {
      const packageJson = {
        dependencies: {
          next: '^14.0.0',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks).toContainEqual(
        expect.objectContaining({ name: 'next.js' })
      );
    });

    test('should detect Express from package.json', async () => {
      const packageJson = {
        dependencies: {
          express: '^4.18.0',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks).toContainEqual(
        expect.objectContaining({ name: 'express' })
      );
    });

    test('should detect Django from requirements.txt', async () => {
      fs.writeFileSync(
        path.join(testDir, 'requirements.txt'),
        'Django==4.0.0\ndjango-rest-framework==3.14.0'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks).toContainEqual(
        expect.objectContaining({ name: 'django' })
      );
    });

    test('should detect FastAPI from requirements.txt', async () => {
      fs.writeFileSync(
        path.join(testDir, 'requirements.txt'),
        'fastapi==0.100.0\nuvicorn==0.23.0'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks).toContainEqual(
        expect.objectContaining({ name: 'fastapi' })
      );
    });

    test('should detect multiple frameworks', async () => {
      const packageJson = {
        dependencies: {
          react: '^18.0.0',
          next: '^14.0.0',
          express: '^4.18.0',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.frameworks.length).toBeGreaterThanOrEqual(2);
    });

    test('should return not detected for empty directory', async () => {
      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(false);
      expect(result.details.frameworks).toEqual([]);
    });

    test('should extract version from package.json dependencies', async () => {
      const packageJson = {
        dependencies: {
          react: '18.2.0',
        },
      };
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson)
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      const reactFramework = result.details.frameworks.find(
        (f: any) => f.name === 'react'
      );
      expect(reactFramework).toBeDefined();
      expect(reactFramework?.version).toBe('18.2.0');
    });
  });
});
