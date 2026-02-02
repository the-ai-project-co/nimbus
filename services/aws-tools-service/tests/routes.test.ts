import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('AWS Tools Service Routes', () => {
  let server: any;
  const PORT = 3109; // Different port to avoid conflicts

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('aws-tools-service');
  });

  // EC2 Route Tests

  test('POST /api/aws/ec2/instances/start returns error without instanceIds', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('instanceIds');
  });

  test('POST /api/aws/ec2/instances/stop returns error without instanceIds', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('instanceIds');
  });

  test('POST /api/aws/ec2/instances/reboot returns error without instanceIds', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/reboot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('instanceIds');
  });

  test('POST /api/aws/ec2/instances/terminate returns error without instanceIds', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('instanceIds');
  });

  test('POST /api/aws/ec2/instances/run returns error without imageId', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceType: 't2.micro' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('imageId');
  });

  test('POST /api/aws/ec2/instances/run returns error without instanceType', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/ec2/instances/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: 'ami-12345' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('instanceType');
  });

  // S3 Route Tests

  test('GET /api/aws/s3/objects returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/objects`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  test('GET /api/aws/s3/object returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object?key=test.txt`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  test('GET /api/aws/s3/object returns error without key', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object?bucket=my-bucket`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('key');
  });

  test('POST /api/aws/s3/object returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test.txt', body: 'content' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  test('POST /api/aws/s3/object returns error without key', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: 'my-bucket', body: 'content' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('key');
  });

  test('POST /api/aws/s3/object returns error without body', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: 'my-bucket', key: 'test.txt' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('body');
  });

  test('POST /api/aws/s3/bucket returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/bucket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  test('DELETE /api/aws/s3/object returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object?key=test.txt`, {
      method: 'DELETE',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  test('DELETE /api/aws/s3/object returns error without key', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/object?bucket=my-bucket`, {
      method: 'DELETE',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('key');
  });

  test('DELETE /api/aws/s3/bucket returns error without bucket', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/s3/bucket`, {
      method: 'DELETE',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('bucket');
  });

  // IAM Route Tests

  test('GET /api/aws/iam/user returns error without userName', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/iam/user`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('userName');
  });

  test('POST /api/aws/iam/user returns error without userName', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/iam/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('userName');
  });

  test('DELETE /api/aws/iam/user returns error without userName', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/iam/user`, {
      method: 'DELETE',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('userName');
  });

  test('GET /api/aws/iam/role returns error without roleName', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/iam/role`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('roleName');
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/aws/unknown`);
    expect(response.status).toBe(404);
  });
});
