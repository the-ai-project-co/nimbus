/**
 * GCP Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Merged from services/gcp-tools-service/src/gcp/compute.ts, iam.ts, storage.ts, gke.ts, vpc.ts
 * Uses lazy imports for GCP SDK to keep binary size small.
 */

import { logger } from '../utils';

// ==========================================
// Shared Types
// ==========================================

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GcpConfig {
  projectId?: string;
}

/**
 * Unified GCP Operations class merging Compute, Storage, GKE, IAM, and VPC operations.
 * All GCP SDK imports are lazy to minimize binary size.
 */
export class GcpOperations {
  private projectId: string;

  constructor(config: GcpConfig = {}) {
    this.projectId =
      config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  // ==========================================
  // Compute Engine Operations
  // ==========================================

  /**
   * List Compute Engine instances
   */
  async listInstances(options: { project?: string; zone?: string } = {}): Promise<OperationResult> {
    try {
      const project = options.project || this.projectId;
      if (!project) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      // Pre-check: verify credentials are available
      try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/compute.readonly'],
        });
        await auth.getClient();
      } catch (authErr: any) {
        return { success: false, error: authErr.message || 'GCP credentials not available' };
      }

      const { InstancesClient } = await import('@google-cloud/compute');
      const instancesClient = new InstancesClient();
      const instances: any[] = [];

      if (options.zone) {
        const [response] = await instancesClient.list({ project, zone: options.zone });
        for (const instance of response || []) {
          instances.push(this.mapComputeInstance(instance, options.zone));
        }
      } else {
        const aggListRequest = instancesClient.aggregatedListAsync({ project });
        for await (const [zone, scopedList] of aggListRequest) {
          if (scopedList.instances) {
            const zoneName = zone.replace('zones/', '');
            for (const instance of scopedList.instances) {
              instances.push(this.mapComputeInstance(instance, zoneName));
            }
          }
        }
      }

      return { success: true, data: { instances } };
    } catch (error: any) {
      logger.error('Failed to list compute instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start a Compute Engine instance
   */
  async startInstance(project: string, zone: string, instance: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified.' };
      }

      const { InstancesClient, ZoneOperationsClient } = await import('@google-cloud/compute');
      const instancesClient = new InstancesClient();
      const [operation] = await instancesClient.start({
        project: effectiveProject,
        zone,
        instance,
      });

      const operationsClient = new ZoneOperationsClient();
      await operationsClient.wait({ operation: operation.name, project: effectiveProject, zone });

      return {
        success: true,
        data: { message: `Instance ${instance} started successfully in zone ${zone}` },
      };
    } catch (error: any) {
      logger.error('Failed to start instance', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a Compute Engine instance
   */
  async stopInstance(project: string, zone: string, instance: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified.' };
      }

      const { InstancesClient, ZoneOperationsClient } = await import('@google-cloud/compute');
      const instancesClient = new InstancesClient();
      const [operation] = await instancesClient.stop({ project: effectiveProject, zone, instance });

      const operationsClient = new ZoneOperationsClient();
      await operationsClient.wait({ operation: operation.name, project: effectiveProject, zone });

      return {
        success: true,
        data: { message: `Instance ${instance} stopped successfully in zone ${zone}` },
      };
    } catch (error: any) {
      logger.error('Failed to stop instance', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Map raw instance data to a clean object
   */
  private mapComputeInstance(instance: any, zone: string): Record<string, unknown> {
    return {
      id: instance.id,
      name: instance.name,
      selfLink: instance.selfLink,
      status: instance.status,
      zone,
      machineType: instance.machineType?.split('/').pop(),
      networkInterfaces: instance.networkInterfaces?.map((ni: any) => ({
        network: ni.network?.split('/').pop(),
        subnetwork: ni.subnetwork?.split('/').pop(),
        networkIP: ni.networkIP,
        accessConfigs: ni.accessConfigs?.map((ac: any) => ({
          name: ac.name,
          natIP: ac.natIP,
          type: ac.type,
        })),
      })),
      disks: instance.disks?.map((d: any) => ({
        source: d.source?.split('/').pop(),
        boot: d.boot,
        autoDelete: d.autoDelete,
        type: d.type,
        diskSizeGb: d.diskSizeGb,
      })),
      labels: instance.labels || {},
      tags: instance.tags?.items || [],
      creationTimestamp: instance.creationTimestamp,
      serviceAccounts: instance.serviceAccounts?.map((sa: any) => ({
        email: sa.email,
        scopes: sa.scopes,
      })),
      metadata: instance.metadata?.items?.reduce((acc: Record<string, string>, item: any) => {
        acc[item.key] = item.value;
        return acc;
      }, {}),
    };
  }

  // ==========================================
  // Cloud Storage Operations
  // ==========================================

  /**
   * List Cloud Storage buckets
   */
  async listBuckets(project?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage({ projectId: effectiveProject });

      const [buckets] = await storage.getBuckets({ project: effectiveProject });

      const mappedBuckets = buckets.map((bucket: any) => ({
        name: bucket.name,
        selfLink: bucket.metadata?.selfLink,
        location: bucket.metadata?.location,
        storageClass: bucket.metadata?.storageClass,
        timeCreated: bucket.metadata?.timeCreated,
        updated: bucket.metadata?.updated,
        versioning: bucket.metadata?.versioning?.enabled || false,
        labels: bucket.metadata?.labels || {},
        iamConfiguration: {
          uniformBucketLevelAccess:
            bucket.metadata?.iamConfiguration?.uniformBucketLevelAccess?.enabled || false,
        },
        lifecycle: bucket.metadata?.lifecycle?.rule || [],
        encryption: bucket.metadata?.encryption || null,
        retentionPolicy: bucket.metadata?.retentionPolicy || null,
      }));

      return { success: true, data: { buckets: mappedBuckets } };
    } catch (error: any) {
      logger.error('Failed to list buckets', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List objects in a Cloud Storage bucket
   */
  async listObjects(
    bucket: string,
    options: { prefix?: string; maxResults?: number } = {}
  ): Promise<OperationResult> {
    try {
      if (!bucket) {
        return { success: false, error: 'Missing required parameter: bucket' };
      }

      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage({ projectId: this.projectId || undefined });

      const queryOptions: any = {};
      if (options.prefix) {
        queryOptions.prefix = options.prefix;
      }
      if (options.maxResults) {
        queryOptions.maxResults = options.maxResults;
      }

      const [files] = await storage.bucket(bucket).getFiles(queryOptions);

      const objects = files.map((file: any) => ({
        name: file.name,
        selfLink: file.metadata?.selfLink,
        bucket: file.metadata?.bucket,
        size: file.metadata?.size,
        contentType: file.metadata?.contentType,
        timeCreated: file.metadata?.timeCreated,
        updated: file.metadata?.updated,
        storageClass: file.metadata?.storageClass,
        md5Hash: file.metadata?.md5Hash,
        metadata: file.metadata?.metadata || {},
      }));

      return { success: true, data: { objects, bucket } };
    } catch (error: any) {
      logger.error('Failed to list objects', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // GKE (Google Kubernetes Engine) Operations
  // ==========================================

  /**
   * List GKE clusters
   */
  async listClusters(project?: string, location?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      const { ClusterManagerClient } = await import('@google-cloud/container');
      const clusterManagerClient = new ClusterManagerClient();
      const parent = location
        ? `projects/${effectiveProject}/locations/${location}`
        : `projects/${effectiveProject}/locations/-`;

      const [response] = await clusterManagerClient.listClusters({ parent });

      const clusters = (response.clusters || []).map((cluster: any) => ({
        name: cluster.name,
        selfLink: cluster.selfLink,
        location: cluster.location,
        zone: cluster.zone,
        status: cluster.status,
        statusMessage: cluster.statusMessage,
        currentMasterVersion: cluster.currentMasterVersion,
        currentNodeVersion: cluster.currentNodeVersion,
        currentNodeCount: cluster.currentNodeCount,
        endpoint: cluster.endpoint,
        initialClusterVersion: cluster.initialClusterVersion,
        createTime: cluster.createTime,
        network: cluster.network,
        subnetwork: cluster.subnetwork,
        clusterIpv4Cidr: cluster.clusterIpv4Cidr,
        servicesIpv4Cidr: cluster.servicesIpv4Cidr,
        labels: cluster.resourceLabels || {},
        nodePools: (cluster.nodePools || []).map((pool: any) => ({
          name: pool.name,
          status: pool.status,
          initialNodeCount: pool.initialNodeCount,
          autoscaling: pool.autoscaling
            ? {
                enabled: pool.autoscaling.enabled,
                minNodeCount: pool.autoscaling.minNodeCount,
                maxNodeCount: pool.autoscaling.maxNodeCount,
              }
            : null,
          config: pool.config
            ? {
                machineType: pool.config.machineType,
                diskSizeGb: pool.config.diskSizeGb,
                diskType: pool.config.diskType,
              }
            : null,
        })),
      }));

      return { success: true, data: { clusters } };
    } catch (error: any) {
      logger.error('Failed to list GKE clusters', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get details of a specific GKE cluster
   */
  async describeCluster(
    project: string,
    location: string,
    cluster: string
  ): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified.' };
      }

      const { ClusterManagerClient } = await import('@google-cloud/container');
      const clusterManagerClient = new ClusterManagerClient();
      const name = `projects/${effectiveProject}/locations/${location}/clusters/${cluster}`;

      const [response] = await clusterManagerClient.getCluster({ name });

      return {
        success: true,
        data: {
          cluster: {
            name: response.name,
            selfLink: response.selfLink,
            location: response.location,
            zone: response.zone,
            status: response.status,
            currentMasterVersion: response.currentMasterVersion,
            currentNodeVersion: response.currentNodeVersion,
            currentNodeCount: response.currentNodeCount,
            endpoint: response.endpoint,
            network: response.network,
            subnetwork: response.subnetwork,
            clusterIpv4Cidr: response.clusterIpv4Cidr,
            servicesIpv4Cidr: response.servicesIpv4Cidr,
            labels: response.resourceLabels || {},
            createTime: response.createTime,
            nodePools: (response.nodePools || []).map((pool: any) => ({
              name: pool.name,
              status: pool.status,
              initialNodeCount: pool.initialNodeCount,
              autoscaling: pool.autoscaling,
              config: pool.config
                ? {
                    machineType: pool.config.machineType,
                    diskSizeGb: pool.config.diskSizeGb,
                    diskType: pool.config.diskType,
                    imageType: pool.config.imageType,
                  }
                : null,
              version: pool.version,
            })),
          },
        },
      };
    } catch (error: any) {
      logger.error('Failed to describe GKE cluster', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // IAM Operations
  // ==========================================

  /**
   * List IAM service accounts for a project
   */
  async listServiceAccounts(project?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      const iamMod = await import('@google-cloud/iam');
      const iamClient = new (iamMod as any).IAMClient();
      const request = { name: `projects/${effectiveProject}` };

      const serviceAccounts: any[] = [];
      const iterable = iamClient.listServiceAccountsAsync(request);

      for await (const account of iterable) {
        serviceAccounts.push({
          name: account.name,
          email: account.email,
          uniqueId: account.uniqueId,
          displayName: account.displayName,
          description: account.description,
          disabled: account.disabled || false,
          projectId: account.projectId,
          oauth2ClientId: account.oauth2ClientId,
        });
      }

      return { success: true, data: { serviceAccounts } };
    } catch (error: any) {
      logger.error('Failed to list service accounts', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List IAM roles
   */
  async listRoles(project?: string): Promise<OperationResult> {
    try {
      const iamMod = await import('@google-cloud/iam');
      const iamClient = new (iamMod as any).IAMClient();
      const roles: any[] = [];

      if (project || this.projectId) {
        const effectiveProject = project || this.projectId;
        const request = { parent: `projects/${effectiveProject}`, view: 'BASIC' };
        const iterable = iamClient.listRolesAsync(request);
        for await (const role of iterable) {
          roles.push({
            name: role.name,
            title: role.title,
            description: role.description,
            stage: role.stage,
            deleted: role.deleted || false,
            includedPermissions: role.includedPermissions || [],
            etag: role.etag,
          });
        }
      } else {
        const request = { view: 'BASIC' };
        const iterable = iamClient.listRolesAsync(request);
        for await (const role of iterable) {
          roles.push({
            name: role.name,
            title: role.title,
            description: role.description,
            stage: role.stage,
            deleted: role.deleted || false,
          });
        }
      }

      return { success: true, data: { roles } };
    } catch (error: any) {
      logger.error('Failed to list roles', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // VPC Operations
  // ==========================================

  /**
   * List VPC networks
   */
  async listNetworks(project?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      const { NetworksClient } = await import('@google-cloud/compute');
      const networksClient = new NetworksClient();
      const [networks] = await networksClient.list({ project: effectiveProject });

      const mappedNetworks = (networks || []).map((network: any) => ({
        id: network.id,
        name: network.name,
        selfLink: network.selfLink,
        description: network.description,
        autoCreateSubnetworks: network.autoCreateSubnetworks,
        routingConfig: network.routingConfig
          ? {
              routingMode: network.routingConfig.routingMode,
            }
          : null,
        subnetworks: network.subnetworks || [],
        peerings: (network.peerings || []).map((peering: any) => ({
          name: peering.name,
          network: peering.network,
          state: peering.state,
          autoCreateRoutes: peering.autoCreateRoutes,
          exportCustomRoutes: peering.exportCustomRoutes,
          importCustomRoutes: peering.importCustomRoutes,
        })),
        mtu: network.mtu,
        creationTimestamp: network.creationTimestamp,
      }));

      return { success: true, data: { networks: mappedNetworks } };
    } catch (error: any) {
      logger.error('Failed to list VPC networks', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List VPC subnetworks
   */
  async listSubnets(project?: string, region?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return {
          success: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.',
        };
      }

      const { SubnetworksClient } = await import('@google-cloud/compute');
      const subnetworksClient = new SubnetworksClient();
      const subnets: any[] = [];

      if (region) {
        const [response] = await subnetworksClient.list({ project: effectiveProject, region });
        for (const subnet of response || []) {
          subnets.push(this.mapSubnet(subnet));
        }
      } else {
        const aggListRequest = subnetworksClient.aggregatedListAsync({ project: effectiveProject });
        for await (const [_regionKey, scopedList] of aggListRequest) {
          if (scopedList.subnetworks) {
            for (const subnet of scopedList.subnetworks) {
              subnets.push(this.mapSubnet(subnet));
            }
          }
        }
      }

      return { success: true, data: { subnets } };
    } catch (error: any) {
      logger.error('Failed to list subnets', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Map a subnet to a clean object
   */
  private mapSubnet(subnet: any): Record<string, unknown> {
    return {
      id: subnet.id,
      name: subnet.name,
      selfLink: subnet.selfLink,
      description: subnet.description,
      network: subnet.network?.split('/').pop(),
      region: subnet.region?.split('/').pop(),
      ipCidrRange: subnet.ipCidrRange,
      gatewayAddress: subnet.gatewayAddress,
      privateIpGoogleAccess: subnet.privateIpGoogleAccess,
      purpose: subnet.purpose,
      role: subnet.role,
      state: subnet.state,
      logConfig: subnet.logConfig || null,
      secondaryIpRanges: (subnet.secondaryIpRanges || []).map((range: any) => ({
        rangeName: range.rangeName,
        ipCidrRange: range.ipCidrRange,
      })),
      stackType: subnet.stackType,
      creationTimestamp: subnet.creationTimestamp,
    };
  }
}
