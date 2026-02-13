import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CICDScanner } from '../../../src/scanners/cicd-scanner';

describe('CICDScanner', () => {
  let scanner: CICDScanner;
  let testDir: string;

  beforeEach(() => {
    scanner = new CICDScanner();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('scan', () => {
    test('should detect GitHub Actions from .github/workflows', async () => {
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        'name: CI\non: push\njobs:\n  build:'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'github-actions' })
      );
    });

    test('should detect multiple GitHub Actions workflows', async () => {
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI');
      fs.writeFileSync(path.join(workflowsDir, 'deploy.yml'), 'name: Deploy');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      const githubActions = result.details.cicd.find(
        (c: any) => c.platform === 'github-actions'
      );
      expect(githubActions?.workflows.length).toBe(2);
    });

    test('should detect GitLab CI from .gitlab-ci.yml', async () => {
      fs.writeFileSync(
        path.join(testDir, '.gitlab-ci.yml'),
        'stages:\n  - build\n  - test'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'gitlab-ci' })
      );
    });

    test('should detect Jenkins from Jenkinsfile', async () => {
      fs.writeFileSync(
        path.join(testDir, 'Jenkinsfile'),
        'pipeline {\n  agent any\n  stages {}'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'jenkins' })
      );
    });

    test('should detect CircleCI from .circleci/config.yml', async () => {
      const circleDir = path.join(testDir, '.circleci');
      fs.mkdirSync(circleDir);
      fs.writeFileSync(
        path.join(circleDir, 'config.yml'),
        'version: 2.1\njobs:\n  build:'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'circleci' })
      );
    });

    test('should detect Azure Pipelines from azure-pipelines.yml', async () => {
      fs.writeFileSync(
        path.join(testDir, 'azure-pipelines.yml'),
        'trigger:\n  - main\npool:\n  vmImage: ubuntu-latest'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'azure-pipelines' })
      );
    });

    test('should detect Travis CI from .travis.yml', async () => {
      fs.writeFileSync(
        path.join(testDir, '.travis.yml'),
        'language: node_js\nnode_js:\n  - "18"'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd).toContainEqual(
        expect.objectContaining({ platform: 'travis-ci' })
      );
    });

    test('should return not detected for no CI/CD files', async () => {
      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(false);
      expect(result.details.cicd).toEqual([]);
    });

    test('should detect multiple CI systems', async () => {
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI');
      fs.writeFileSync(path.join(testDir, '.gitlab-ci.yml'), 'stages:');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.cicd.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getPrimaryCICDPlatform', () => {
    test('should return primary CI/CD platform', async () => {
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI');

      const platform = await scanner.getPrimaryCICDPlatform(testDir);

      expect(platform).toBe('github-actions');
    });

    test('should return null when no CI/CD detected', async () => {
      const platform = await scanner.getPrimaryCICDPlatform(testDir);

      expect(platform).toBeNull();
    });
  });

  describe('getCICDFiles', () => {
    test('should return all CI/CD workflow files', async () => {
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI');
      fs.writeFileSync(path.join(workflowsDir, 'deploy.yml'), 'name: Deploy');

      const files = await scanner.getCICDFiles(testDir);

      expect(files.length).toBe(2);
      expect(files).toContain('.github/workflows/ci.yml');
      expect(files).toContain('.github/workflows/deploy.yml');
    });
  });
});
