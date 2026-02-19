/**
 * GKE Scanner
 *
 * Discovers GKE clusters and node pools
 */

import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

const container = require('@google-cloud/container');

/**
 * GKE Scanner
 */
export class GKEScanner extends BaseScanner {
  readonly serviceName = 'GKE';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    try {
      const clusterManagerClient = new container.ClusterManagerClient();
      const parent = `projects/${context.projectId}/locations/${context.region}`;

      const [response] = await clusterManagerClient.listClusters({ parent });

      for (const cluster of response.clusters || []) {
        if (!cluster.name) continue;

        const selfLink = cluster.selfLink || `https://container.googleapis.com/v1/projects/${context.projectId}/locations/${context.region}/clusters/${cluster.name}`;

        const relationships: ResourceRelationship[] = [];

        // Network relationship
        if (cluster.network) {
          relationships.push({
            type: 'references',
            targetSelfLink: `https://www.googleapis.com/compute/v1/projects/${context.projectId}/global/networks/${cluster.network}`,
            targetType: 'google_compute_network',
          });
        }

        // Subnetwork relationship
        if (cluster.subnetwork) {
          relationships.push({
            type: 'references',
            targetSelfLink: `https://www.googleapis.com/compute/v1/projects/${context.projectId}/regions/${context.region}/subnetworks/${cluster.subnetwork}`,
            targetType: 'google_compute_subnetwork',
          });
        }

        resources.push(this.createResource({
          id: cluster.name,
          selfLink,
          gcpType: 'container.googleapis.com/Cluster',
          region: cluster.location || context.region,
          name: cluster.name,
          labels: this.labelsToRecord(cluster.resourceLabels),
          properties: {
            location: cluster.location,
            status: cluster.status,
            currentMasterVersion: cluster.currentMasterVersion,
            currentNodeVersion: cluster.currentNodeVersion,
            currentNodeCount: cluster.currentNodeCount,
            endpoint: cluster.endpoint,
            network: cluster.network,
            subnetwork: cluster.subnetwork,
            clusterIpv4Cidr: cluster.clusterIpv4Cidr,
            servicesIpv4Cidr: cluster.servicesIpv4Cidr,
            initialClusterVersion: cluster.initialClusterVersion,
            loggingService: cluster.loggingService,
            monitoringService: cluster.monitoringService,
            nodeConfig: cluster.nodeConfig ? {
              machineType: cluster.nodeConfig.machineType,
              diskSizeGb: cluster.nodeConfig.diskSizeGb,
              diskType: cluster.nodeConfig.diskType,
              imageType: cluster.nodeConfig.imageType,
              oauthScopes: cluster.nodeConfig.oauthScopes,
              serviceAccount: cluster.nodeConfig.serviceAccount,
            } : null,
            addonsConfig: cluster.addonsConfig || {},
            networkPolicy: cluster.networkPolicy || {},
            ipAllocationPolicy: cluster.ipAllocationPolicy || {},
            privateClusterConfig: cluster.privateClusterConfig || null,
            workloadIdentityConfig: cluster.workloadIdentityConfig || null,
            releaseChannel: cluster.releaseChannel || null,
          },
          relationships,
          createdAt: cluster.createTime ? new Date(cluster.createTime) : undefined,
          status: cluster.status,
        }));

        // Scan node pools
        for (const pool of cluster.nodePools || []) {
          if (!pool.name) continue;

          const poolSelfLink = `${selfLink}/nodePools/${pool.name}`;

          resources.push(this.createResource({
            id: `${cluster.name}/${pool.name}`,
            selfLink: poolSelfLink,
            gcpType: 'container.googleapis.com/NodePool',
            region: cluster.location || context.region,
            name: pool.name,
            labels: {},
            properties: {
              clusterName: cluster.name,
              status: pool.status,
              initialNodeCount: pool.initialNodeCount,
              version: pool.version,
              autoscaling: pool.autoscaling ? {
                enabled: pool.autoscaling.enabled,
                minNodeCount: pool.autoscaling.minNodeCount,
                maxNodeCount: pool.autoscaling.maxNodeCount,
              } : null,
              config: pool.config ? {
                machineType: pool.config.machineType,
                diskSizeGb: pool.config.diskSizeGb,
                diskType: pool.config.diskType,
                imageType: pool.config.imageType,
                preemptible: pool.config.preemptible,
                oauthScopes: pool.config.oauthScopes,
                serviceAccount: pool.config.serviceAccount,
              } : null,
              management: pool.management || {},
              upgradeSettings: pool.upgradeSettings || {},
              locations: pool.locations || [],
            },
            relationships: [{
              type: 'contains',
              targetSelfLink: selfLink,
              targetType: 'google_container_cluster',
            }],
            status: pool.status,
          }));
        }
      }

      logger.debug(`GKE scanner found ${resources.length} resources`, {
        region: context.region,
      });
    } catch (error: any) {
      this.recordError('listClusters', error.message, context.region, error.code);
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'container.googleapis.com/Cluster',
      'container.googleapis.com/NodePool',
    ];
  }
}
