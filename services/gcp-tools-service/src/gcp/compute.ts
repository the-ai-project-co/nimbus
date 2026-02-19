/**
 * GCP Compute Engine Operations
 *
 * Provides operations for managing GCP Compute Engine instances
 */

import { logger } from '@nimbus/shared-utils';

const compute = require('@google-cloud/compute');

export interface ComputeConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Compute Engine operations using Google Cloud SDK
 */
export class ComputeOperations {
  private projectId: string;

  constructor(config: ComputeConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List Compute Engine instances
   */
  async listInstances(options: { project?: string; zone?: string } = {}): Promise<OperationResult> {
    try {
      const project = options.project || this.projectId;
      if (!project) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const instancesClient = new compute.InstancesClient();
      const instances: any[] = [];

      if (options.zone) {
        const [response] = await instancesClient.list({
          project,
          zone: options.zone,
        });
        for (const instance of response || []) {
          instances.push(this.mapInstance(instance, options.zone));
        }
      } else {
        const aggListRequest = instancesClient.aggregatedListAsync({
          project,
        });
        for await (const [zone, scopedList] of aggListRequest) {
          if (scopedList.instances) {
            const zoneName = zone.replace('zones/', '');
            for (const instance of scopedList.instances) {
              instances.push(this.mapInstance(instance, zoneName));
            }
          }
        }
      }

      return {
        success: true,
        data: { instances },
      };
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

      const instancesClient = new compute.InstancesClient();
      const [operation] = await instancesClient.start({
        project: effectiveProject,
        zone,
        instance,
      });

      const operationsClient = new compute.ZoneOperationsClient();
      await operationsClient.wait({
        operation: operation.name,
        project: effectiveProject,
        zone,
      });

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

      const instancesClient = new compute.InstancesClient();
      const [operation] = await instancesClient.stop({
        project: effectiveProject,
        zone,
        instance,
      });

      const operationsClient = new compute.ZoneOperationsClient();
      await operationsClient.wait({
        operation: operation.name,
        project: effectiveProject,
        zone,
      });

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
  private mapInstance(instance: any, zone: string): Record<string, unknown> {
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
}
