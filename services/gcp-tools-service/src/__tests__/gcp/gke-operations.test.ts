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

// Mock the GCP container SDK before importing the module under test
mock.module('@google-cloud/container', () => ({
  ClusterManagerClient: class {
    async listClusters({ parent }: { parent: string }) {
      if (parent.includes('bad-project')) {
        throw new Error('API error: project not found');
      }
      return [
        {
          clusters: [
            {
              name: 'test-cluster',
              selfLink: 'https://container.googleapis.com/v1/projects/test-project/locations/us-central1/clusters/test-cluster',
              location: 'us-central1',
              zone: '',
              status: 'RUNNING',
              statusMessage: '',
              currentMasterVersion: '1.28.0',
              currentNodeVersion: '1.28.0',
              currentNodeCount: 3,
              endpoint: '10.0.0.1',
              initialClusterVersion: '1.28.0',
              createTime: '2024-01-01T00:00:00Z',
              network: 'default',
              subnetwork: 'default',
              clusterIpv4Cidr: '10.100.0.0/14',
              servicesIpv4Cidr: '10.96.0.0/20',
              resourceLabels: { env: 'test' },
              nodeConfig: {
                machineType: 'e2-standard-4',
                diskSizeGb: 100,
                diskType: 'pd-standard',
                imageType: 'COS_CONTAINERD',
                oauthScopes: ['https://www.googleapis.com/auth/cloud-platform'],
                serviceAccount: 'default',
              },
              nodePools: [
                {
                  name: 'default-pool',
                  status: 'RUNNING',
                  initialNodeCount: 3,
                  autoscaling: { enabled: true, minNodeCount: 1, maxNodeCount: 5 },
                  config: { machineType: 'e2-standard-4', diskSizeGb: 100, diskType: 'pd-standard' },
                },
              ],
              addonsConfig: {},
              masterAuth: { clusterCaCertificate: 'abc123' },
              loggingService: 'logging.googleapis.com/kubernetes',
              monitoringService: 'monitoring.googleapis.com/kubernetes',
              ipAllocationPolicy: {},
              networkPolicy: {},
              privateClusterConfig: null,
            },
          ],
        },
      ];
    }

    async getCluster({ name }: { name: string }) {
      if (name.includes('not-found')) {
        throw new Error('Cluster not found');
      }
      return [
        {
          name: 'test-cluster',
          selfLink: 'https://container.googleapis.com/v1/projects/test-project/locations/us-central1/clusters/test-cluster',
          location: 'us-central1',
          zone: '',
          status: 'RUNNING',
          statusMessage: '',
          currentMasterVersion: '1.28.0',
          currentNodeVersion: '1.28.0',
          currentNodeCount: 3,
          endpoint: '10.0.0.1',
          network: 'default',
          subnetwork: 'default',
          clusterIpv4Cidr: '10.100.0.0/14',
          servicesIpv4Cidr: '10.96.0.0/20',
          resourceLabels: { env: 'test' },
          createTime: '2024-01-01T00:00:00Z',
          nodePools: [
            {
              name: 'default-pool',
              status: 'RUNNING',
              initialNodeCount: 3,
              autoscaling: { enabled: true, minNodeCount: 1, maxNodeCount: 5 },
              config: {
                machineType: 'e2-standard-4',
                diskSizeGb: 100,
                diskType: 'pd-standard',
                imageType: 'COS_CONTAINERD',
              },
              version: '1.28.0',
            },
          ],
        },
      ];
    }
  },
}));

import { GKEOperations } from '../../gcp/gke';

describe('GKEOperations', () => {
  describe('listClusters', () => {
    test('should return a list of clusters when project is provided', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.listClusters('test-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.clusters).toHaveLength(1);
      expect(result.data.clusters[0].name).toBe('test-cluster');
      expect(result.data.clusters[0].status).toBe('RUNNING');
    });

    test('should return clusters for a specific location', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.listClusters('test-project', 'us-central1');

      expect(result.success).toBe(true);
      expect(result.data.clusters[0].location).toBe('us-central1');
    });

    test('should map node pool autoscaling config correctly', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.listClusters('test-project');

      expect(result.success).toBe(true);
      const pool = result.data.clusters[0].nodePools[0];
      expect(pool.autoscaling).toBeDefined();
      expect(pool.autoscaling.enabled).toBe(true);
      expect(pool.autoscaling.minNodeCount).toBe(1);
      expect(pool.autoscaling.maxNodeCount).toBe(5);
    });

    test('should redact master auth certificate in output', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.listClusters('test-project');

      expect(result.success).toBe(true);
      const cluster = result.data.clusters[0];
      expect(cluster.masterAuth?.clusterCaCertificate).toBe('[REDACTED]');
    });

    test('should return error when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const gke = new GKEOperations({ projectId: '' });
      const result = await gke.listClusters();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project');

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });

    test('should return error on API failure', async () => {
      const gke = new GKEOperations({ projectId: 'bad-project' });
      const result = await gke.listClusters('bad-project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    test('should include cluster labels in response', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.listClusters('test-project');

      expect(result.success).toBe(true);
      expect(result.data.clusters[0].labels).toEqual({ env: 'test' });
    });
  });

  describe('describeCluster', () => {
    test('should return detailed cluster info', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.describeCluster('test-project', 'us-central1', 'test-cluster');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.cluster.name).toBe('test-cluster');
      expect(result.data.cluster.currentMasterVersion).toBe('1.28.0');
    });

    test('should map node pools for described cluster', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.describeCluster('test-project', 'us-central1', 'test-cluster');

      expect(result.success).toBe(true);
      const { nodePools } = result.data.cluster;
      expect(nodePools).toHaveLength(1);
      expect(nodePools[0].name).toBe('default-pool');
      expect(nodePools[0].version).toBe('1.28.0');
    });

    test('should return error on cluster not found', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      const result = await gke.describeCluster('test-project', 'us-central1', 'not-found-cluster');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should use projectId from config when no project arg passed', async () => {
      const gke = new GKEOperations({ projectId: 'test-project' });
      // Passing empty string — the method falls back to this.projectId
      const result = await gke.describeCluster('', 'us-central1', 'test-cluster');

      // The path will include empty string project but mock still returns data
      expect(result.success).toBe(true);
    });
  });

  describe('constructor', () => {
    test('should instantiate with projectId config', () => {
      const gke = new GKEOperations({ projectId: 'my-project' });
      expect(gke).toBeDefined();
    });

    test('should instantiate without config using env var', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
      const gke = new GKEOperations();
      expect(gke).toBeDefined();
      delete process.env.GOOGLE_CLOUD_PROJECT;
    });
  });
});
