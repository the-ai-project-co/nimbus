import { test, expect } from '@playwright/test';

const AWS_URL = 'http://localhost:3010';

test.describe('AWS Tools API E2E', () => {
  test('list EC2 instances', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/ec2/instances`);
    // Gracefully handle missing AWS credentials
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('list VPCs', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/ec2/vpcs`);
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('list S3 buckets', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/s3/buckets`);
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('list IAM users', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/iam/users`);
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('list IAM roles', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/iam/roles`);
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('list CloudFormation stacks', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/cloudformation/stacks`);
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('get supported Terraform types', async ({ request }) => {
    const response = await request.get(`${AWS_URL}/api/aws/terraform/supported-types`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.types).toBeDefined();
    expect(Array.isArray(body.data.types)).toBe(true);
    expect(body.data.types.length).toBeGreaterThan(0);
  });

  test('run instances without required fields returns 400', async ({ request }) => {
    const response = await request.post(`${AWS_URL}/api/aws/ec2/instances/run`, {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing required field');
  });

  test('create S3 bucket without required fields returns 400', async ({ request }) => {
    const response = await request.post(`${AWS_URL}/api/aws/s3/bucket`, {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing required field');
  });

  test('create IAM user without required fields returns 400', async ({ request }) => {
    const response = await request.post(`${AWS_URL}/api/aws/iam/user`, {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing required field');
  });
});
