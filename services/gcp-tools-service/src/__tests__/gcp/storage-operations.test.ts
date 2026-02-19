import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock shared-utils logger first
mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Create a reusable mock bucket factory
const makeMockBucket = (name: string) => ({
  name,
  metadata: {
    selfLink: `https://storage.googleapis.com/storage/v1/b/${name}`,
    location: 'US',
    storageClass: 'STANDARD',
    timeCreated: '2024-01-01T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    versioning: { enabled: true },
    labels: { env: 'production' },
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
    lifecycle: { rule: [] },
    encryption: null,
    retentionPolicy: null,
  },
});

const makeMockFile = (name: string, bucket: string) => ({
  name,
  metadata: {
    selfLink: `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${name}`,
    bucket,
    size: '1024',
    contentType: 'text/plain',
    timeCreated: '2024-01-01T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    storageClass: 'STANDARD',
    md5Hash: 'abc123==',
    crc32c: 'def456==',
    metadata: {},
  },
});

// Mock @google-cloud/storage before importing the module under test
mock.module('@google-cloud/storage', () => ({
  Storage: class {
    private _shouldFail: boolean;

    constructor({ projectId }: { projectId?: string } = {}) {
      this._shouldFail = projectId === 'fail-project';
    }

    async getBuckets({ project }: { project: string }) {
      if (project === 'error-project') {
        throw new Error('Storage API error: permission denied');
      }
      return [[makeMockBucket('my-bucket-1'), makeMockBucket('my-bucket-2')]];
    }

    bucket(bucketName: string) {
      return {
        getFiles: async (opts: any = {}) => {
          if (bucketName === 'missing-bucket') {
            throw new Error('Bucket not found');
          }
          const files = [
            makeMockFile('file1.txt', bucketName),
            makeMockFile('folder/file2.json', bucketName),
          ];
          const filtered = opts.prefix
            ? files.filter((f: any) => f.name.startsWith(opts.prefix))
            : files;
          const limited = opts.maxResults
            ? filtered.slice(0, opts.maxResults)
            : filtered;
          return [limited];
        },
      };
    }
  },
}));

import { StorageOperations } from '../../gcp/storage';

describe('StorageOperations', () => {
  describe('listBuckets', () => {
    test('should return a list of buckets when project is provided', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listBuckets('test-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.buckets).toHaveLength(2);
      expect(result.data.buckets[0].name).toBe('my-bucket-1');
      expect(result.data.buckets[1].name).toBe('my-bucket-2');
    });

    test('should map bucket metadata fields correctly', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listBuckets('test-project');

      expect(result.success).toBe(true);
      const bucket = result.data.buckets[0];
      expect(bucket.location).toBe('US');
      expect(bucket.storageClass).toBe('STANDARD');
      expect(bucket.versioning).toBe(true);
      expect(bucket.iamConfiguration.uniformBucketLevelAccess).toBe(true);
      expect(bucket.labels).toEqual({ env: 'production' });
    });

    test('should return error when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const storage = new StorageOperations({ projectId: '' });
      const result = await storage.listBuckets();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project');

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });

    test('should return error on storage API failure', async () => {
      const storage = new StorageOperations({ projectId: 'error-project' });
      const result = await storage.listBuckets('error-project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permission denied');
    });

    test('should use instance projectId when no argument provided', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listBuckets();

      expect(result.success).toBe(true);
      expect(result.data.buckets).toHaveLength(2);
    });
  });

  describe('listObjects', () => {
    test('should return a list of objects in a bucket', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('my-bucket');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.objects).toHaveLength(2);
      expect(result.data.objects[0].name).toBe('file1.txt');
      expect(result.data.bucket).toBe('my-bucket');
    });

    test('should filter objects by prefix', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('my-bucket', { prefix: 'folder/' });

      expect(result.success).toBe(true);
      expect(result.data.objects).toHaveLength(1);
      expect(result.data.objects[0].name).toBe('folder/file2.json');
    });

    test('should respect maxResults option', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('my-bucket', { maxResults: 1 });

      expect(result.success).toBe(true);
      expect(result.data.objects).toHaveLength(1);
    });

    test('should map file metadata fields correctly', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('my-bucket');

      expect(result.success).toBe(true);
      const obj = result.data.objects[0];
      expect(obj.name).toBe('file1.txt');
      expect(obj.size).toBe('1024');
      expect(obj.contentType).toBe('text/plain');
      expect(obj.storageClass).toBe('STANDARD');
    });

    test('should return error when bucket name is empty', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter: bucket');
    });

    test('should return error when bucket does not exist', async () => {
      const storage = new StorageOperations({ projectId: 'test-project' });
      const result = await storage.listObjects('missing-bucket');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bucket not found');
    });
  });

  describe('constructor', () => {
    test('should instantiate with projectId config', () => {
      const storage = new StorageOperations({ projectId: 'my-project' });
      expect(storage).toBeDefined();
    });

    test('should instantiate without config', () => {
      const storage = new StorageOperations();
      expect(storage).toBeDefined();
    });

    test('should read projectId from GOOGLE_CLOUD_PROJECT env var', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
      const storage = new StorageOperations();
      expect(storage).toBeDefined();
      delete process.env.GOOGLE_CLOUD_PROJECT;
    });
  });
});
