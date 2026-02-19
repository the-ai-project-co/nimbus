import { describe, test, expect, mock } from 'bun:test';

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { GCPTerraformGenerator, createGCPTerraformGenerator } from '../../terraform/generator';
import type { TerraformGeneratorConfig } from '../../terraform/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseConfig(overrides: Partial<TerraformGeneratorConfig> = {}): TerraformGeneratorConfig {
  return {
    outputDir: '/tmp/terraform-test',
    defaultProject: 'test-project',
    defaultRegion: 'us-central1',
    generateImportBlocks: true,
    generateImportScript: true,
    organizeByService: true,
    terraformVersion: '1.5.0',
    googleProviderVersion: '~> 5.0',
    ...overrides,
  };
}

function makeComputeResource(overrides: Partial<any> = {}): any {
  return {
    id: 'instance-1',
    selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-project/zones/us-central1-a/instances/my-vm',
    type: 'google_compute_instance',
    gcpType: 'compute.googleapis.com/Instance',
    service: 'Compute',
    region: 'us-central1',
    name: 'my-vm',
    labels: { env: 'prod' },
    properties: {
      machineType: 'e2-medium',
      zone: 'us-central1-a',
      disks: [{ sourceImage: 'debian-cloud/debian-11' }],
      networkInterfaces: [{ network: 'default', subnetwork: 'default' }],
      tags: ['http-server'],
    },
    relationships: [],
    status: 'RUNNING',
    ...overrides,
  };
}

function makeStorageResource(overrides: Partial<any> = {}): any {
  return {
    id: 'bucket-1',
    selfLink: 'bucket-1',
    type: 'google_storage_bucket',
    gcpType: 'storage.googleapis.com/Bucket',
    service: 'Storage',
    region: 'US',
    name: 'my-bucket',
    labels: {},
    properties: {
      location: 'US',
      storageClass: 'STANDARD',
      versioning: true,
    },
    relationships: [],
    status: '',
    ...overrides,
  };
}

function makeGKEResource(overrides: Partial<any> = {}): any {
  return {
    id: 'cluster-1',
    selfLink: 'https://container.googleapis.com/projects/test-project/locations/us-central1/clusters/my-cluster',
    type: 'google_container_cluster',
    gcpType: 'container.googleapis.com/Cluster',
    service: 'GKE',
    region: 'us-central1',
    name: 'my-cluster',
    labels: {},
    properties: {
      location: 'us-central1',
      network: 'default',
      subnetwork: 'default',
      initialClusterVersion: '1.28.0',
    },
    relationships: [],
    status: 'RUNNING',
    ...overrides,
  };
}

function makeServiceAccountResource(overrides: Partial<any> = {}): any {
  return {
    id: 'sa-1',
    selfLink: 'projects/test-project/serviceAccounts/sa@test-project.iam.gserviceaccount.com',
    type: 'google_service_account',
    gcpType: 'iam.googleapis.com/ServiceAccount',
    service: 'IAM',
    region: 'global',
    name: 'my-sa',
    labels: {},
    properties: {
      email: 'sa@test-project.iam.gserviceaccount.com',
      uniqueId: 'unique-123',
      displayName: 'My Service Account',
      description: 'SA for CI',
    },
    relationships: [],
    status: '',
    ...overrides,
  };
}

function makeNetworkResource(overrides: Partial<any> = {}): any {
  return {
    id: 'network-1',
    selfLink: 'https://compute.googleapis.com/compute/v1/projects/test-project/global/networks/my-vpc',
    type: 'google_compute_network',
    gcpType: 'compute.googleapis.com/Network',
    service: 'VPC',
    region: 'global',
    name: 'my-vpc',
    labels: {},
    properties: {
      autoCreateSubnetworks: false,
      routingConfig: { routingMode: 'GLOBAL' },
    },
    relationships: [],
    status: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GCPTerraformGenerator', () => {
  describe('createGCPTerraformGenerator factory', () => {
    test('should create a GCPTerraformGenerator instance', () => {
      const generator = createGCPTerraformGenerator(makeBaseConfig());
      expect(generator).toBeDefined();
      expect(generator).toBeInstanceOf(GCPTerraformGenerator);
    });
  });

  describe('generate — providers.tf', () => {
    test('should always include a providers.tf file', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([]);

      expect(result.files.has('providers.tf')).toBe(true);
    });

    test('providers.tf should contain required_version and google provider block', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([]);

      const content = result.files.get('providers.tf')!;
      expect(content).toContain('terraform {');
      expect(content).toContain('required_version');
      expect(content).toContain('1.5.0');
      expect(content).toContain('provider "google"');
      expect(content).toContain('~> 5.0');
    });
  });

  describe('generate — variables.tf', () => {
    test('should include variables.tf with project and region', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeComputeResource()]);

      expect(result.files.has('variables.tf')).toBe(true);
      const content = result.files.get('variables.tf')!;
      expect(content).toContain('variable "project"');
      expect(content).toContain('variable "region"');
    });

    test('should embed default project in variables', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ defaultProject: 'my-proj' }));
      const result = generator.generate([makeComputeResource()]);

      const content = result.files.get('variables.tf')!;
      expect(content).toContain('my-proj');
    });
  });

  describe('generate — compute instance mapping', () => {
    test('should generate a compute.tf file for Compute resources', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeComputeResource()]);

      // When organizeByService is true, file is named after service
      const hasComputeFile = result.files.has('compute.tf');
      expect(hasComputeFile).toBe(true);
    });

    test('should map compute instance machine_type and zone', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeComputeResource()]);

      const content = result.files.get('compute.tf')!;
      expect(content).toContain('google_compute_instance');
      expect(content).toContain('machine_type');
      expect(content).toContain('e2-medium');
      expect(content).toContain('us-central1-a');
    });

    test('should generate output for compute instance self_link', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeComputeResource()]);

      expect(result.outputs.some(o => o.name.includes('self_link'))).toBe(true);
    });
  });

  describe('generate — storage bucket mapping', () => {
    test('should generate a storage.tf file for Storage resources', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeStorageResource()]);

      expect(result.files.has('storage.tf')).toBe(true);
    });

    test('should map bucket location and storage_class', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeStorageResource()]);

      const content = result.files.get('storage.tf')!;
      expect(content).toContain('google_storage_bucket');
      expect(content).toContain('location');
      expect(content).toContain('STANDARD');
    });

    test('should include bucket URL output', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeStorageResource()]);

      expect(result.outputs.some(o => o.name.includes('url'))).toBe(true);
    });
  });

  describe('generate — GKE cluster mapping', () => {
    test('should generate a gke.tf or container.tf file for GKE resources', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeGKEResource()]);

      // The service file name depends on getServiceForTerraformType — check any tf file contains the cluster
      const hasClusters = [...result.files.values()].some(content =>
        content.includes('google_container_cluster')
      );
      expect(hasClusters).toBe(true);
    });

    test('should include sensitive endpoint output for GKE cluster', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeGKEResource()]);

      const endpointOutput = result.outputs.find(o => o.name.includes('endpoint'));
      expect(endpointOutput).toBeDefined();
      expect(endpointOutput!.sensitive).toBe(true);
    });
  });

  describe('generate — import blocks', () => {
    test('should generate import.tf when generateImportBlocks is true', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ generateImportBlocks: true }));
      const result = generator.generate([makeComputeResource()]);

      expect(result.files.has('import.tf')).toBe(true);
      const content = result.files.get('import.tf')!;
      expect(content).toContain('import {');
    });

    test('should not generate import.tf when generateImportBlocks is false', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ generateImportBlocks: false }));
      const result = generator.generate([makeComputeResource()]);

      expect(result.files.has('import.tf')).toBe(false);
    });

    test('should include correct import ID for compute instance', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeComputeResource()]);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].id).toContain('instances/my-vm');
    });

    test('should include correct import ID for storage bucket', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const result = generator.generate([makeStorageResource()]);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].id).toBe('my-bucket');
    });
  });

  describe('generate — import script', () => {
    test('should generate import script when generateImportScript is true', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ generateImportScript: true }));
      const result = generator.generate([makeComputeResource()]);

      expect(result.importScript).toContain('#!/bin/bash');
      expect(result.importScript).toContain('terraform import');
    });

    test('should produce empty import script when generateImportScript is false', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ generateImportScript: false }));
      const result = generator.generate([makeComputeResource()]);

      expect(result.importScript).toBe('');
    });
  });

  describe('generate — summary', () => {
    test('should report correct counts in summary', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const resources = [makeComputeResource(), makeStorageResource(), makeGKEResource()];
      const result = generator.generate(resources);

      expect(result.summary.totalResources).toBe(3);
      expect(result.summary.mappedResources).toBe(3);
      expect(result.summary.unmappedResources).toBe(0);
    });

    test('should track unmapped resources correctly', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const unknownResource = makeComputeResource({
        type: 'unknown_resource_type',
        gcpType: 'unknown.googleapis.com/Thing',
      });
      const result = generator.generate([unknownResource]);

      expect(result.summary.unmappedResources).toBe(1);
      expect(result.unmappedResources).toHaveLength(1);
    });

    test('should group resources by service in summary', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig());
      const resources = [makeComputeResource(), makeStorageResource()];
      const result = generator.generate(resources);

      expect(result.summary.resourcesByService).toBeDefined();
      expect(typeof result.summary.resourcesByService).toBe('object');
    });
  });

  describe('generate — multi-resource organization', () => {
    test('should organize resources into separate files by service', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ organizeByService: true }));
      const resources = [makeComputeResource(), makeStorageResource()];
      const result = generator.generate(resources);

      // There should be separate tf files for each service
      const tfFiles = [...result.files.keys()].filter(k => k.endsWith('.tf') && k !== 'providers.tf' && k !== 'variables.tf' && k !== 'import.tf');
      expect(tfFiles.length).toBeGreaterThanOrEqual(2);
    });

    test('should produce single main.tf when organizeByService is false', () => {
      const generator = new GCPTerraformGenerator(makeBaseConfig({ organizeByService: false }));
      const resources = [makeComputeResource(), makeStorageResource()];
      const result = generator.generate(resources);

      expect(result.files.has('main.tf')).toBe(true);
    });
  });
});
