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

// Mock service accounts data
const mockServiceAccounts = [
  {
    name: 'projects/test-project/serviceAccounts/sa-1@test-project.iam.gserviceaccount.com',
    email: 'sa-1@test-project.iam.gserviceaccount.com',
    uniqueId: '123456789',
    displayName: 'Service Account One',
    description: 'First service account',
    disabled: false,
    projectId: 'test-project',
    oauth2ClientId: 'client-id-1',
  },
  {
    name: 'projects/test-project/serviceAccounts/sa-2@test-project.iam.gserviceaccount.com',
    email: 'sa-2@test-project.iam.gserviceaccount.com',
    uniqueId: '987654321',
    displayName: 'Service Account Two',
    description: '',
    disabled: true,
    projectId: 'test-project',
    oauth2ClientId: 'client-id-2',
  },
];

const mockRoles = [
  {
    name: 'projects/test-project/roles/customRole',
    title: 'Custom Role',
    description: 'A custom project role',
    stage: 'GA',
    deleted: false,
    includedPermissions: ['compute.instances.list', 'storage.buckets.list'],
    etag: 'BwX',
  },
  {
    name: 'roles/viewer',
    title: 'Viewer',
    description: 'Read access to all resources',
    stage: 'GA',
    deleted: false,
    includedPermissions: [],
    etag: 'ABC',
  },
];

// Async generator helper
async function* asyncIterableFrom<T>(arr: T[]) {
  for (const item of arr) {
    yield item;
  }
}

// Mock @google-cloud/iam before importing the module under test
mock.module('@google-cloud/iam', () => ({
  IAMClient: class {
    listServiceAccountsAsync(request: { name: string }) {
      if (request.name.includes('error-project')) {
        throw new Error('IAM API error: permission denied');
      }
      if (request.name.includes('empty-project')) {
        return asyncIterableFrom([]);
      }
      return asyncIterableFrom(mockServiceAccounts);
    }

    listRolesAsync(request: any) {
      if (request?.parent?.includes('error-project')) {
        throw new Error('IAM roles API error');
      }
      return asyncIterableFrom(mockRoles);
    }
  },
}));

import { IAMOperations } from '../../gcp/iam';

describe('IAMOperations', () => {
  describe('listServiceAccounts', () => {
    test('should return a list of service accounts for a valid project', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listServiceAccounts('test-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.serviceAccounts).toHaveLength(2);
    });

    test('should map service account fields correctly', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listServiceAccounts('test-project');

      expect(result.success).toBe(true);
      const sa = result.data.serviceAccounts[0];
      expect(sa.email).toBe('sa-1@test-project.iam.gserviceaccount.com');
      expect(sa.displayName).toBe('Service Account One');
      expect(sa.disabled).toBe(false);
      expect(sa.projectId).toBe('test-project');
      expect(sa.uniqueId).toBe('123456789');
    });

    test('should correctly report disabled service accounts', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listServiceAccounts('test-project');

      expect(result.success).toBe(true);
      const disabledSa = result.data.serviceAccounts[1];
      expect(disabledSa.disabled).toBe(true);
      expect(disabledSa.email).toBe('sa-2@test-project.iam.gserviceaccount.com');
    });

    test('should return empty list for project with no service accounts', async () => {
      const iam = new IAMOperations({ projectId: 'empty-project' });
      const result = await iam.listServiceAccounts('empty-project');

      expect(result.success).toBe(true);
      expect(result.data.serviceAccounts).toHaveLength(0);
    });

    test('should return error when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const iam = new IAMOperations({ projectId: '' });
      const result = await iam.listServiceAccounts('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project');

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });

    test('should return error on API failure', async () => {
      const iam = new IAMOperations({ projectId: 'error-project' });
      // Mock throws synchronously in listServiceAccountsAsync;
      // wrap in try-catch happens in the method body
      const result = await iam.listServiceAccounts('error-project');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('listRoles', () => {
    test('should return a list of roles for a project', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listRoles('test-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.roles).toHaveLength(2);
    });

    test('should map role fields correctly', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listRoles('test-project');

      expect(result.success).toBe(true);
      const role = result.data.roles[0];
      expect(role.name).toBe('projects/test-project/roles/customRole');
      expect(role.title).toBe('Custom Role');
      expect(role.deleted).toBe(false);
      expect(role.includedPermissions).toHaveLength(2);
    });

    test('should list predefined roles when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const iam = new IAMOperations({ projectId: '' });
      const result = await iam.listRoles();

      expect(result.success).toBe(true);
      expect(result.data.roles).toHaveLength(2);

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });

    test('should use instance projectId when no argument provided', async () => {
      const iam = new IAMOperations({ projectId: 'test-project' });
      const result = await iam.listRoles();

      expect(result.success).toBe(true);
      expect(result.data.roles).toHaveLength(2);
    });

    test('should return error on API failure for roles', async () => {
      const iam = new IAMOperations({ projectId: 'error-project' });
      const result = await iam.listRoles('error-project');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('constructor', () => {
    test('should instantiate with projectId config', () => {
      const iam = new IAMOperations({ projectId: 'my-project' });
      expect(iam).toBeDefined();
    });

    test('should instantiate without config', () => {
      const iam = new IAMOperations();
      expect(iam).toBeDefined();
    });

    test('should read projectId from GCLOUD_PROJECT env var', () => {
      process.env.GCLOUD_PROJECT = 'gcloud-project';
      const iam = new IAMOperations();
      expect(iam).toBeDefined();
      delete process.env.GCLOUD_PROJECT;
    });
  });
});
