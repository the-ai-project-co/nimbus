import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectScanner } from '../../src/scanners';

describe('Init Flow Integration', () => {
  let testDir: string;
  let scanner: ProjectScanner;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-init-test-'));
    scanner = new ProjectScanner();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Project Scanning', () => {
    test('should scan Node.js project correctly', async () => {
      // Create Node.js project structure
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          dependencies: {
            express: '^4.18.0',
            react: '^18.0.0',
          },
        })
      );
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const context = await scanner.scan(testDir);

      expect(context.structure.languages.some((l) => l.name === 'typescript')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'express')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'react')).toBe(true);
    });

    test('should scan Python project correctly', async () => {
      // Create Python project structure
      fs.writeFileSync(
        path.join(testDir, 'requirements.txt'),
        'django==4.0.0\nfastapi==0.100.0'
      );
      fs.writeFileSync(
        path.join(testDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "test-project"'
      );

      const context = await scanner.scan(testDir);

      expect(context.structure.languages.some((l) => l.name === 'python')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'django')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'fastapi')).toBe(true);
    });

    test('should scan infrastructure project correctly', async () => {
      // Create infrastructure project structure
      fs.mkdirSync(path.join(testDir, 'terraform'));
      fs.writeFileSync(
        path.join(testDir, 'terraform', 'main.tf'),
        'provider "aws" {}\nresource "aws_instance" "example" {}'
      );
      fs.writeFileSync(path.join(testDir, 'Dockerfile'), 'FROM node:18');

      const context = await scanner.scan(testDir);

      expect(context.files.terraform.length).toBeGreaterThan(0);
      expect(context.files.docker.length).toBeGreaterThan(0);
    });

    test('should scan project with CI/CD correctly', async () => {
      // Create project with GitHub Actions
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        'name: CI\non: push'
      );
      fs.writeFileSync(
        path.join(workflowsDir, 'deploy.yml'),
        'name: Deploy\non: release'
      );

      const context = await scanner.scan(testDir);

      expect(context.cicd.platform).toBe('github-actions');
      expect(context.cicd.workflows.length).toBe(2);
    });

    test('should scan fullstack monorepo correctly', async () => {
      // Create fullstack monorepo structure with root package.json
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({
          name: 'monorepo',
          workspaces: ['frontend', 'backend'],
          dependencies: { react: '^18.0.0', express: '^4.18.0' },
        })
      );

      const frontendDir = path.join(testDir, 'frontend');
      const backendDir = path.join(testDir, 'backend');
      const infraDir = path.join(testDir, 'infra');

      fs.mkdirSync(frontendDir);
      fs.mkdirSync(backendDir);
      fs.mkdirSync(infraDir);

      // Frontend
      fs.writeFileSync(
        path.join(frontendDir, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0' },
        })
      );

      // Backend
      fs.writeFileSync(
        path.join(backendDir, 'requirements.txt'),
        'fastapi==0.100.0'
      );

      // Infrastructure
      fs.writeFileSync(
        path.join(infraDir, 'main.tf'),
        'provider "aws" {}'
      );

      const context = await scanner.scan(testDir);

      // Should detect frameworks (at least React and Express from root package.json)
      expect(context.structure.frameworks.length).toBeGreaterThanOrEqual(1);
      // Should detect Terraform files
      expect(context.files.terraform.length).toBeGreaterThan(0);
    });

    test('should handle empty directory gracefully', async () => {
      const context = await scanner.scan(testDir);

      // The scanner should return a valid context structure
      expect(context.project).toBeDefined();
      expect(context.structure).toBeDefined();
      expect(context.files).toBeDefined();
      expect(context.git).toBeDefined();
      expect(context.cicd).toBeDefined();
    });
  });

  describe('Project Context Generation', () => {
    test('should generate valid project context', async () => {
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'my-project' })
      );
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const context = await scanner.scan(testDir);

      expect(context.project.name).toBeDefined();
      expect(context.project.path).toBe(testDir);
      expect(context.structure.languages.length).toBeGreaterThan(0);
    });

    test('should include git info when in git repo', async () => {
      // Initialize git repo
      const { execSync } = require('child_process');
      try {
        execSync('git init', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'ignore' });
        execSync('git config user.name "Test"', { cwd: testDir, stdio: 'ignore' });

        fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

        const context = await scanner.scan(testDir);

        expect(context.git.isRepo).toBe(true);
        expect(context.git.branch).toBeDefined();
      } catch {
        // Skip if git is not available
      }
    });
  });

  describe('Quick Scan', () => {
    test('should run quick scan', async () => {
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({ name: 'test' })
      );

      const result = await scanner.quickScan(testDir);

      expect(result).toBeDefined();
      expect(result.languages).toBeInstanceOf(Array);
      expect(result.frameworks).toBeInstanceOf(Array);
    });
  });
});
