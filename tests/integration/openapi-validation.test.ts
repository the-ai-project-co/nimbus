import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';

const OPENAPI_DIR = path.join(__dirname, '../../docs/openapi');

const EXPECTED_FILES = [
  'core-engine.yaml',
  'state-service.yaml',
  'aws-tools.yaml',
  'gcp-tools.yaml',
  'azure-tools.yaml',
];

describe('OpenAPI Specification Validation', () => {
  test('OpenAPI directory should exist', () => {
    expect(fs.existsSync(OPENAPI_DIR)).toBe(true);
  });

  for (const file of EXPECTED_FILES) {
    describe(file, () => {
      const filePath = path.join(OPENAPI_DIR, file);

      test('should exist', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      test('should be valid YAML', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = YAML.parse(content);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      });

      test('should have openapi version field', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = YAML.parse(content);
        expect(spec.openapi).toBeDefined();
        expect(spec.openapi).toMatch(/^3\./);
      });

      test('should have info with title and version', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = YAML.parse(content);
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBeDefined();
        expect(typeof spec.info.title).toBe('string');
        expect(spec.info.version).toBeDefined();
      });

      test('should have at least one path', () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const spec = YAML.parse(content);
        expect(spec.paths).toBeDefined();
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
      });
    });
  }
});
