import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LanguageScanner } from '../../../src/scanners/language-scanner';

describe('LanguageScanner', () => {
  let scanner: LanguageScanner;
  let testDir: string;

  beforeEach(() => {
    scanner = new LanguageScanner();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('scan', () => {
    test('should detect TypeScript from tsconfig.json', async () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'typescript' })
      );
    });

    test('should detect JavaScript from package.json', async () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), '{"name": "test"}');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'javascript' })
      );
    });

    test('should detect Python from requirements.txt', async () => {
      fs.writeFileSync(path.join(testDir, 'requirements.txt'), 'flask==2.0.0');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'python' })
      );
    });

    test('should detect Python from pyproject.toml', async () => {
      fs.writeFileSync(path.join(testDir, 'pyproject.toml'), '[tool.poetry]');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'python' })
      );
    });

    test('should detect Go from go.mod', async () => {
      fs.writeFileSync(path.join(testDir, 'go.mod'), 'module example.com/test');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'go' })
      );
    });

    test('should detect Rust from Cargo.toml', async () => {
      fs.writeFileSync(path.join(testDir, 'Cargo.toml'), '[package]');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'rust' })
      );
    });

    test('should detect Java from pom.xml', async () => {
      fs.writeFileSync(path.join(testDir, 'pom.xml'), '<project></project>');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages).toContainEqual(
        expect.objectContaining({ name: 'java' })
      );
    });

    test('should detect multiple languages', async () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'requirements.txt'), 'flask');
      fs.writeFileSync(path.join(testDir, 'go.mod'), 'module test');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.languages.length).toBeGreaterThanOrEqual(3);
    });

    test('should have high confidence for explicit config files', async () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const result = await scanner.scan(testDir);

      expect(result.confidence).toBe('high');
    });
  });

  describe('detectLanguages', () => {
    test('should extract version from go.mod', async () => {
      fs.writeFileSync(path.join(testDir, 'go.mod'), 'module test\n\ngo 1.21');

      const languages = await scanner.detectLanguages(testDir);

      const goLang = languages.find(l => l.name === 'go');
      expect(goLang?.version).toBe('1.21');
    });

    test('should sort languages by confidence', async () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'main.py'), 'print("hello")');

      const languages = await scanner.detectLanguages(testDir);

      // TypeScript should be first (high confidence from config file)
      expect(languages[0].name).toBe('typescript');
    });
  });
});
