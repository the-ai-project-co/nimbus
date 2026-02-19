/**
 * GCP GKE (Google Kubernetes Engine) Operations
 *
 * Provides operations for managing GKE clusters
 */

import { logger } from '@nimbus/shared-utils';

const container = require('@google-cloud/container');

export interface GKEConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * GKE operations using Google Cloud SDK
 */
export class GKEOperations {
  private projectId: string;

  constructor(config: GKEConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List GKE clusters
   */
  async listClusters(project?: string, location?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const clusterManagerClient = new container.ClusterManagerClient();
      const parent = location
        ? `projects/${effectiveProject}/locations/${location}`
        : `projects/${effectiveProject}/locations/-`;

      const [response] = await clusterManagerClient.listClusters({
        parent,
      });

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
        nodeConfig: cluster.nodeConfig ? {
          machineType: cluster.nodeConfig.machineType,
          diskSizeGb: cluster.nodeConfig.diskSizeGb,
          diskType: cluster.nodeConfig.diskType,
          imageType: cluster.nodeConfig.imageType,
          oauthScopes: cluster.nodeConfig.oauthScopes,
          serviceAccount: cluster.nodeConfig.serviceAccount,
        } : null,
        nodePools: (cluster.nodePools || []).map((pool: any) => ({
          name: pool.name,
          status: pool.status,
          initialNodeCount: pool.initialNodeCount,
          autoscaling: pool.autoscaling ? {
            enabled: pool.autoscaling.enabled,
            minNodeCount: pool.autoscaling.minNodeCount,
            maxNodeCount: pool.autoscaling.maxNodeCount,
          } : null,
          config: pool.config ? {
            machineType: pool.config.machineType,
            diskSizeGb: pool.config.diskSizeGb,
            diskType: pool.config.diskType,
          } : null,
        })),
        addonsConfig: cluster.addonsConfig || {},
        masterAuth: cluster.masterAuth ? {
          clusterCaCertificate: cluster.masterAuth.clusterCaCertificate ? '[REDACTED]' : null,
        } : null,
        loggingService: cluster.loggingService,
        monitoringService: cluster.monitoringService,
        ipAllocationPolicy: cluster.ipAllocationPolicy || {},
        networkPolicy: cluster.networkPolicy || {},
        privateClusterConfig: cluster.privateClusterConfig || null,
      }));

      return {
        success: true,
        data: { clusters },
      };
    } catch (error: any) {
      logger.error('Failed to list GKE clusters', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get details of a specific GKE cluster
   */
  async describeCluster(project: string, location: string, cluster: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified.' };
      }

      const clusterManagerClient = new container.ClusterManagerClient();
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
            statusMessage: response.statusMessage,
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
              config: pool.config ? {
                machineType: pool.config.machineType,
                diskSizeGb: pool.config.diskSizeGb,
                diskType: pool.config.diskType,
                imageType: pool.config.imageType,
              } : null,
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
}
