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

// ---------------------------------------------------------------------------
// Azure SDK Mocks
// ---------------------------------------------------------------------------

const mockVMs = [
  {
    id: '/subscriptions/sub-123/resourceGroups/rg-1/providers/Microsoft.Compute/virtualMachines/vm-1',
    name: 'vm-1',
    location: 'eastus',
    type: 'Microsoft.Compute/virtualMachines',
    hardwareProfile: { vmSize: 'Standard_D2s_v3' },
    storageProfile: { osDisk: { osType: 'Linux' } },
    provisioningState: 'Succeeded',
    vmId: 'vm-uuid-1',
    tags: { env: 'prod' },
    networkProfile: { networkInterfaces: [{ id: '/subscriptions/sub-123/nic/nic-1', primary: true }] },
    availabilitySet: null,
    zones: ['1'],
  },
  {
    id: '/subscriptions/sub-123/resourceGroups/rg-2/providers/Microsoft.Compute/virtualMachines/vm-2',
    name: 'vm-2',
    location: 'westus2',
    type: 'Microsoft.Compute/virtualMachines',
    hardwareProfile: { vmSize: 'Standard_B2s' },
    storageProfile: { osDisk: { osType: 'Windows' } },
    provisioningState: 'Succeeded',
    vmId: 'vm-uuid-2',
    tags: {},
    networkProfile: { networkInterfaces: [] },
    availabilitySet: null,
    zones: [],
  },
];

async function* asyncIterableFrom<T>(items: T[]) {
  for (const item of items) {
    yield item;
  }
}

// Mock DefaultAzureCredential
mock.module('@azure/identity', () => ({
  DefaultAzureCredential: class {
    async getToken(_scope: string) {
      return { token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 };
    }
  },
}));

// Mock ComputeManagementClient
mock.module('@azure/arm-compute', () => ({
  ComputeManagementClient: class {
    constructor(_credential: any, subscriptionId: string) {
      this._subscriptionId = subscriptionId;
    }

    get virtualMachines() {
      const subId = (this as any)._subscriptionId;

      return {
        list: (resourceGroup: string) => {
          if (resourceGroup === 'error-rg') {
            throw new Error('Azure API error: resource group not found');
          }
          return asyncIterableFrom(mockVMs.filter(vm => vm.id.includes(resourceGroup)));
        },
        listAll: () => {
          if (subId === 'error-sub') {
            throw new Error('Azure API error: subscription not found');
          }
          return asyncIterableFrom(mockVMs);
        },
        beginStart: async (_rg: string, vmName: string) => {
          if (vmName === 'not-found-vm') {
            throw new Error('VM not found');
          }
          return { pollUntilDone: async () => ({}) };
        },
        beginDeallocate: async (_rg: string, vmName: string) => {
          if (vmName === 'locked-vm') {
            throw new Error('Cannot deallocate: VM is locked');
          }
          return { pollUntilDone: async () => ({}) };
        },
      };
    }
  },
}));

import { ComputeOperations } from '../../azure/compute';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Azure ComputeOperations (VM)', () => {
  describe('listVMs', () => {
    test('should return all VMs when no resource group specified', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.listVMs('sub-123');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.vms).toHaveLength(2);
      expect(result.data.count).toBe(2);
    });

    test('should filter VMs by resource group', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.listVMs('sub-123', 'rg-1');

      expect(result.success).toBe(true);
      expect(result.data.vms).toHaveLength(1);
      expect(result.data.vms[0].name).toBe('vm-1');
    });

    test('should map VM fields correctly', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.listVMs('sub-123');

      expect(result.success).toBe(true);
      const vm = result.data.vms[0];
      expect(vm.name).toBe('vm-1');
      expect(vm.location).toBe('eastus');
      expect(vm.vmSize).toBe('Standard_D2s_v3');
      expect(vm.osType).toBe('Linux');
      expect(vm.provisioningState).toBe('Succeeded');
      expect(vm.tags).toEqual({ env: 'prod' });
      expect(vm.zones).toEqual(['1']);
    });

    test('should map network interfaces', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.listVMs('sub-123');

      expect(result.success).toBe(true);
      const vm = result.data.vms[0];
      expect(vm.networkInterfaces).toHaveLength(1);
      expect(vm.networkInterfaces[0].primary).toBe(true);
    });

    test('should return error when no subscription ID is provided', async () => {
      const origSub = process.env.AZURE_SUBSCRIPTION_ID;
      delete process.env.AZURE_SUBSCRIPTION_ID;

      const compute = new ComputeOperations({ subscriptionId: '' });
      const result = await compute.listVMs('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription ID');

      if (origSub) process.env.AZURE_SUBSCRIPTION_ID = origSub;
    });

    test('should return error on API failure', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.listVMs('sub-123', 'error-rg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should use AZURE_SUBSCRIPTION_ID env var as fallback', async () => {
      process.env.AZURE_SUBSCRIPTION_ID = 'sub-from-env';
      const compute = new ComputeOperations();
      expect(compute).toBeDefined();
      delete process.env.AZURE_SUBSCRIPTION_ID;
    });
  });

  describe('startVM', () => {
    test('should start a VM successfully', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.startVM('sub-123', 'rg-1', 'vm-1');

      expect(result.success).toBe(true);
      expect(result.data.vmName).toBe('vm-1');
      expect(result.data.resourceGroup).toBe('rg-1');
      expect(result.data.action).toBe('start');
      expect(result.data.status).toBe('succeeded');
    });

    test('should return error when VM not found during start', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.startVM('sub-123', 'rg-1', 'not-found-vm');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should return error when subscription ID is empty', async () => {
      const origSub = process.env.AZURE_SUBSCRIPTION_ID;
      delete process.env.AZURE_SUBSCRIPTION_ID;

      const compute = new ComputeOperations({ subscriptionId: '' });
      const result = await compute.startVM('', 'rg-1', 'vm-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription ID');

      if (origSub) process.env.AZURE_SUBSCRIPTION_ID = origSub;
    });
  });

  describe('stopVM', () => {
    test('should stop (deallocate) a VM successfully', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.stopVM('sub-123', 'rg-1', 'vm-1');

      expect(result.success).toBe(true);
      expect(result.data.vmName).toBe('vm-1');
      expect(result.data.action).toBe('stop');
      expect(result.data.status).toBe('succeeded');
    });

    test('should return error when VM is locked and cannot be deallocated', async () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      const result = await compute.stopVM('sub-123', 'rg-1', 'locked-vm');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error when subscription ID is empty', async () => {
      const origSub = process.env.AZURE_SUBSCRIPTION_ID;
      delete process.env.AZURE_SUBSCRIPTION_ID;

      const compute = new ComputeOperations({ subscriptionId: '' });
      const result = await compute.stopVM('', 'rg-1', 'vm-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No subscription ID');

      if (origSub) process.env.AZURE_SUBSCRIPTION_ID = origSub;
    });
  });

  describe('constructor', () => {
    test('should instantiate with subscriptionId config', () => {
      const compute = new ComputeOperations({ subscriptionId: 'sub-123' });
      expect(compute).toBeDefined();
    });

    test('should instantiate without config', () => {
      const compute = new ComputeOperations();
      expect(compute).toBeDefined();
    });
  });
});
