import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IaCScanner } from '../../../src/scanners/iac-scanner';

describe('IaCScanner', () => {
  let scanner: IaCScanner;
  let testDir: string;

  beforeEach(() => {
    scanner = new IaCScanner();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('scan', () => {
    test('should detect Terraform from .tf files', async () => {
      fs.writeFileSync(
        path.join(testDir, 'main.tf'),
        'resource "aws_instance" "example" {}'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.iac).toContainEqual(
        expect.objectContaining({ name: 'terraform' })
      );
    });

    test('should detect Terraform files in subdirectory', async () => {
      const infraDir = path.join(testDir, 'infra');
      fs.mkdirSync(infraDir);
      fs.writeFileSync(
        path.join(infraDir, 'main.tf'),
        'provider "aws" {}'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      const terraform = result.details.iac.find((t: any) => t.name === 'terraform');
      expect(terraform).toBeDefined();
      expect(terraform?.files?.some((f: string) => f.includes('main.tf'))).toBe(true);
    });

    test('should detect Pulumi from Pulumi.yaml', async () => {
      fs.writeFileSync(
        path.join(testDir, 'Pulumi.yaml'),
        'name: my-project\nruntime: nodejs'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.iac).toContainEqual(
        expect.objectContaining({ name: 'pulumi' })
      );
    });

    test('should detect CloudFormation from template files', async () => {
      fs.writeFileSync(
        path.join(testDir, 'template.yaml'),
        'AWSTemplateFormatVersion: "2010-09-09"\nResources:'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      // May detect as cloudformation or sam depending on content
      expect(result.details.iac.length).toBeGreaterThan(0);
    });

    test('should detect AWS CDK from cdk.json', async () => {
      fs.writeFileSync(
        path.join(testDir, 'cdk.json'),
        '{"app": "npx ts-node bin/app.ts"}'
      );

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.iac).toContainEqual(
        expect.objectContaining({ name: 'aws-cdk' })
      );
    });

    test('should detect multiple IaC tools', async () => {
      fs.writeFileSync(path.join(testDir, 'main.tf'), 'provider "aws" {}');
      fs.writeFileSync(path.join(testDir, 'Pulumi.yaml'), 'name: test\nruntime: nodejs');

      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(true);
      expect(result.details.iac.length).toBeGreaterThanOrEqual(2);
    });

    test('should return not detected for empty directory', async () => {
      const result = await scanner.scan(testDir);

      expect(result.detected).toBe(false);
      expect(result.details.iac).toEqual([]);
    });
  });

  describe('getTerraformFiles', () => {
    test('should return all Terraform files', async () => {
      fs.writeFileSync(path.join(testDir, 'main.tf'), 'provider "aws" {}');
      fs.writeFileSync(path.join(testDir, 'variables.tf'), 'variable "region" {}');
      fs.writeFileSync(path.join(testDir, 'terraform.tfvars'), 'region = "us-east-1"');

      const files = await scanner.getTerraformFiles(testDir);

      expect(files.length).toBe(3);
      expect(files).toContain('main.tf');
      expect(files).toContain('variables.tf');
      expect(files).toContain('terraform.tfvars');
    });

    test('should find Terraform files in subdirectories', async () => {
      const modulesDir = path.join(testDir, 'modules', 'vpc');
      fs.mkdirSync(modulesDir, { recursive: true });
      fs.writeFileSync(path.join(modulesDir, 'main.tf'), 'resource "aws_vpc" {}');

      const files = await scanner.getTerraformFiles(testDir);

      expect(files.some(f => f.includes('modules/vpc/main.tf'))).toBe(true);
    });
  });

  describe('getDockerFiles', () => {
    test('should return Dockerfile', async () => {
      fs.writeFileSync(path.join(testDir, 'Dockerfile'), 'FROM node:18');

      const files = await scanner.getDockerFiles(testDir);

      expect(files).toContain('Dockerfile');
    });

    test('should return docker-compose files', async () => {
      fs.writeFileSync(path.join(testDir, 'docker-compose.yaml'), 'version: "3"');

      const files = await scanner.getDockerFiles(testDir);

      expect(files).toContain('docker-compose.yaml');
    });

    test('should return Dockerfile variants', async () => {
      fs.writeFileSync(path.join(testDir, 'Dockerfile.dev'), 'FROM node:18');
      fs.writeFileSync(path.join(testDir, 'Dockerfile.prod'), 'FROM node:18-slim');

      const files = await scanner.getDockerFiles(testDir);

      expect(files).toContain('Dockerfile.dev');
      expect(files).toContain('Dockerfile.prod');
    });
  });

  describe('getKubernetesFiles', () => {
    test('should return Kubernetes manifests from k8s directory', async () => {
      const k8sDir = path.join(testDir, 'k8s');
      fs.mkdirSync(k8sDir);
      fs.writeFileSync(
        path.join(k8sDir, 'deployment.yaml'),
        'apiVersion: apps/v1\nkind: Deployment'
      );

      const files = await scanner.getKubernetesFiles(testDir);

      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.includes('deployment.yaml'))).toBe(true);
    });
  });
});
