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

const mockNetworks = [
  {
    id: '123456',
    name: 'default',
    selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-project/global/networks/default',
    description: 'Default network',
    autoCreateSubnetworks: true,
    routingConfig: { routingMode: 'REGIONAL' },
    subnetworks: [
      'https://compute.googleapis.com/compute/v1/projects/test-project/regions/us-central1/subnetworks/default',
    ],
    peerings: [],
    mtu: 1460,
    creationTimestamp: '2024-01-01T00:00:00Z',
  },
  {
    id: '789012',
    name: 'custom-vpc',
    selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-project/global/networks/custom-vpc',
    description: 'Custom VPC network',
    autoCreateSubnetworks: false,
    routingConfig: { routingMode: 'GLOBAL' },
    subnetworks: [],
    peerings: [
      {
        name: 'peer-to-other',
        network: 'https://compute.googleapis.com/compute/v1/projects/other-project/global/networks/default',
        state: 'ACTIVE',
        autoCreateRoutes: true,
        exportCustomRoutes: false,
        importCustomRoutes: false,
      },
    ],
    mtu: 1500,
    creationTimestamp: '2024-02-01T00:00:00Z',
  },
];

const mockSubnets = [
  {
    id: 'subnet-1',
    name: 'default',
    selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-project/regions/us-central1/subnetworks/default',
    description: '',
    network: 'https://compute.googleapis.com/compute/v1/projects/test-project/global/networks/default',
    region: 'https://compute.googleapis.com/compute/v1/projects/test-project/regions/us-central1',
    ipCidrRange: '10.128.0.0/20',
    gatewayAddress: '10.128.0.1',
    privateIpGoogleAccess: true,
    purpose: 'PRIVATE',
    role: null,
    state: 'READY',
    logConfig: null,
    secondaryIpRanges: [
      { rangeName: 'pods', ipCidrRange: '10.100.0.0/16' },
    ],
    stackType: 'IPV4_ONLY',
    creationTimestamp: '2024-01-01T00:00:00Z',
  },
];

// Async generator helper for aggregated list
async function* asyncAggregatedFrom(subnets: any[]) {
  yield ['regions/us-central1', { subnetworks: subnets }];
}

// Mock @google-cloud/compute before importing the module under test
mock.module('@google-cloud/compute', () => ({
  NetworksClient: class {
    async list({ project }: { project: string }) {
      if (project === 'error-project') {
        throw new Error('Compute API error: quota exceeded');
      }
      if (project === 'empty-project') {
        return [[]];
      }
      return [mockNetworks];
    }
  },
  SubnetworksClient: class {
    async list({ project, region }: { project: string; region: string }) {
      if (project === 'error-project') {
        throw new Error('Subnet API error');
      }
      return [mockSubnets];
    }

    aggregatedListAsync({ project }: { project: string }) {
      if (project === 'error-project') {
        throw new Error('Aggregated list error');
      }
      return asyncAggregatedFrom(mockSubnets);
    }
  },
}));

import { VPCOperations } from '../../gcp/vpc';

describe('VPCOperations', () => {
  describe('listNetworks', () => {
    test('should return a list of VPC networks', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listNetworks('test-project');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.networks).toHaveLength(2);
    });

    test('should map network fields correctly', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listNetworks('test-project');

      expect(result.success).toBe(true);
      const net = result.data.networks[0];
      expect(net.name).toBe('default');
      expect(net.autoCreateSubnetworks).toBe(true);
      expect(net.routingConfig?.routingMode).toBe('REGIONAL');
      expect(net.mtu).toBe(1460);
    });

    test('should include peering data for networks with peers', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listNetworks('test-project');

      expect(result.success).toBe(true);
      const customNet = result.data.networks[1];
      expect(customNet.name).toBe('custom-vpc');
      expect(customNet.peerings).toHaveLength(1);
      expect(customNet.peerings[0].name).toBe('peer-to-other');
      expect(customNet.peerings[0].state).toBe('ACTIVE');
    });

    test('should return empty networks list for empty project', async () => {
      const vpc = new VPCOperations({ projectId: 'empty-project' });
      const result = await vpc.listNetworks('empty-project');

      expect(result.success).toBe(true);
      expect(result.data.networks).toHaveLength(0);
    });

    test('should return error when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const vpc = new VPCOperations({ projectId: '' });
      const result = await vpc.listNetworks();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project');

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });

    test('should return error on API failure', async () => {
      const vpc = new VPCOperations({ projectId: 'error-project' });
      const result = await vpc.listNetworks('error-project');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Compute API error');
    });
  });

  describe('listSubnets', () => {
    test('should return subnets for a specific region', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listSubnets('test-project', 'us-central1');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.subnets).toHaveLength(1);
      expect(result.data.subnets[0].name).toBe('default');
    });

    test('should map subnet fields correctly', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listSubnets('test-project', 'us-central1');

      expect(result.success).toBe(true);
      const subnet = result.data.subnets[0];
      expect(subnet.ipCidrRange).toBe('10.128.0.0/20');
      expect(subnet.gatewayAddress).toBe('10.128.0.1');
      expect(subnet.privateIpGoogleAccess).toBe(true);
      expect(subnet.purpose).toBe('PRIVATE');
    });

    test('should parse network and region from self-links', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listSubnets('test-project', 'us-central1');

      expect(result.success).toBe(true);
      const subnet = result.data.subnets[0];
      // mapSubnet extracts the last path component
      expect(subnet.network).toBe('default');
      expect(subnet.region).toBe('us-central1');
    });

    test('should include secondary IP ranges', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listSubnets('test-project', 'us-central1');

      expect(result.success).toBe(true);
      const subnet = result.data.subnets[0];
      expect(subnet.secondaryIpRanges).toHaveLength(1);
      expect(subnet.secondaryIpRanges[0].rangeName).toBe('pods');
      expect(subnet.secondaryIpRanges[0].ipCidrRange).toBe('10.100.0.0/16');
    });

    test('should list subnets across all regions when no region specified', async () => {
      const vpc = new VPCOperations({ projectId: 'test-project' });
      const result = await vpc.listSubnets('test-project');

      expect(result.success).toBe(true);
      // Aggregated list returns subnets from all regions
      expect(result.data.subnets).toHaveLength(1);
    });

    test('should return error when no project is specified', async () => {
      const origProject = process.env.GOOGLE_CLOUD_PROJECT;
      const origGcloud = process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.GCLOUD_PROJECT;

      const vpc = new VPCOperations({ projectId: '' });
      const result = await vpc.listSubnets();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project');

      if (origProject) process.env.GOOGLE_CLOUD_PROJECT = origProject;
      if (origGcloud) process.env.GCLOUD_PROJECT = origGcloud;
    });
  });

  describe('constructor', () => {
    test('should instantiate with projectId config', () => {
      const vpc = new VPCOperations({ projectId: 'my-project' });
      expect(vpc).toBeDefined();
    });

    test('should instantiate without config', () => {
      const vpc = new VPCOperations();
      expect(vpc).toBeDefined();
    });
  });
});
