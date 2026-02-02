/**
 * Terraform API Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer, type ServerInstances } from '../../../../services/aws-tools-service/src/server';

const TEST_PORT = 13009;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server: ServerInstances;

describe('Terraform API Routes', () => {
  beforeAll(async () => {
    server = await startServer(TEST_PORT);
  });

  afterAll(() => {
    server.stop();
  });

  describe('GET /api/aws/terraform/supported-types', () => {
    it('returns list of supported AWS types', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/supported-types`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.types).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);

      // Check some expected types
      expect(data.data.types).toContain('AWS::EC2::Instance');
      expect(data.data.types).toContain('AWS::S3::Bucket');
      expect(data.data.types).toContain('AWS::Lambda::Function');
    });
  });

  describe('POST /api/aws/terraform/generate', () => {
    it('returns error when sessionId is missing', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('sessionId');
    });

    it('returns error when session not found', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'non-existent-session' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/aws/terraform/generate-direct', () => {
    it('generates Terraform from provided resources', async () => {
      const resources = [
        {
          id: 'i-1234567890abcdef0',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          name: 'test-instance',
          tags: { Environment: 'test' },
          properties: {
            imageId: 'ami-12345678',
            instanceType: 't2.micro',
          },
        },
        {
          id: 'my-test-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          name: 'my-test-bucket',
          tags: { Environment: 'test' },
          properties: {},
        },
      ];

      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Check response structure
      expect(data.data.terraformSessionId).toBeDefined();
      expect(data.data.summary).toBeDefined();
      expect(data.data.files).toBeDefined();
      expect(data.data.imports).toBeInstanceOf(Array);
      expect(data.data.importScript).toBeDefined();

      // Check files were generated
      expect(Object.keys(data.data.files)).toContain('providers.tf');
      expect(Object.keys(data.data.files)).toContain('ec2.tf');
      expect(Object.keys(data.data.files)).toContain('s3.tf');

      // Check summary
      expect(data.data.summary.mappedResources).toBe(2);
      expect(data.data.summary.unmappedResources).toBe(0);
    });

    it('returns error when resources array is empty', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: [] }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('resources');
    });

    it('returns error when resource is missing required fields', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resources: [{ id: 'test' }], // Missing type and region
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('handles unsupported resource types gracefully', async () => {
      const resources = [
        {
          id: 'test-resource',
          type: 'AWS::Unknown::Resource',
          region: 'us-east-1',
          properties: {},
        },
      ];

      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.unmappedResources.length).toBe(1);
      expect(data.data.summary.unmappedResources).toBe(1);
    });

    it('respects custom options', async () => {
      const resources = [
        {
          id: 'i-1234567890abcdef0',
          type: 'AWS::EC2::Instance',
          region: 'us-west-2',
          properties: {
            imageId: 'ami-12345678',
            instanceType: 't2.micro',
          },
        },
      ];

      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resources,
          options: {
            generateImportBlocks: false,
            organizeByService: false,
            terraformVersion: '1.6.0',
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // When organizeByService is false, should have main.tf instead of ec2.tf
      expect(Object.keys(data.data.files)).toContain('main.tf');
      expect(Object.keys(data.data.files)).not.toContain('ec2.tf');
    });
  });

  describe('Terraform session endpoints', () => {
    let terraformSessionId: string;

    beforeAll(async () => {
      // Generate a terraform session first
      const resources = [
        {
          id: 'i-test123',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          properties: { imageId: 'ami-test', instanceType: 't2.micro' },
        },
      ];

      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources }),
      });

      const data = await response.json();
      terraformSessionId = data.data.terraformSessionId;
    });

    it('GET /api/aws/terraform/:sessionId/files - lists generated files', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/${terraformSessionId}/files`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.files).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);
    });

    it('GET /api/aws/terraform/:sessionId/file/:filename - gets specific file', async () => {
      const response = await fetch(
        `${BASE_URL}/api/aws/terraform/${terraformSessionId}/file/providers.tf`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.filename).toBe('providers.tf');
      expect(data.data.content).toContain('terraform');
      expect(data.data.content).toContain('provider');
    });

    it('GET /api/aws/terraform/:sessionId/file/:filename - returns 404 for unknown file', async () => {
      const response = await fetch(
        `${BASE_URL}/api/aws/terraform/${terraformSessionId}/file/nonexistent.tf`
      );
      expect(response.status).toBe(404);
    });

    it('GET /api/aws/terraform/:sessionId/download - downloads all files', async () => {
      const response = await fetch(
        `${BASE_URL}/api/aws/terraform/${terraformSessionId}/download`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.terraformSessionId).toBe(terraformSessionId);
      expect(data.data.files).toBeDefined();
      expect(data.data.summary).toBeDefined();
      expect(data.data.importScript).toBeDefined();
    });

    it('GET /api/aws/terraform/:sessionId/import-script - gets import script', async () => {
      const response = await fetch(
        `${BASE_URL}/api/aws/terraform/${terraformSessionId}/import-script`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.script).toContain('#!/bin/bash');
      expect(data.data.script).toContain('terraform import');
    });

    it('returns 404 for non-existent session', async () => {
      const response = await fetch(
        `${BASE_URL}/api/aws/terraform/non-existent-session/files`
      );
      expect(response.status).toBe(404);
    });
  });
});
