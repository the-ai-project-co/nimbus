/**
 * Compute Engine Scanner
 *
 * Discovers GCP Compute Engine instances, disks, and firewalls
 */

import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

const computeLib = require('@google-cloud/compute');

/**
 * Compute Engine Scanner
 */
export class ComputeScanner extends BaseScanner {
  readonly serviceName = 'Compute';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const [instances, disks, firewalls] = await Promise.all([
      this.scanInstances(context),
      this.scanDisks(context),
      this.scanFirewalls(context),
    ]);

    resources.push(...instances, ...disks, ...firewalls);

    logger.debug(`Compute scanner found ${resources.length} resources`, {
      region: context.region,
      instances: instances.length,
      disks: disks.length,
      firewalls: firewalls.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'compute.googleapis.com/Instance',
      'compute.googleapis.com/Disk',
      'compute.googleapis.com/Firewall',
    ];
  }

  private async scanInstances(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const instancesClient = new computeLib.InstancesClient();
      const aggListRequest = instancesClient.aggregatedListAsync({
        project: context.projectId,
      });

      for await (const [zone, scopedList] of aggListRequest) {
        const zoneName = zone.replace('zones/', '');
        const zoneRegion = zoneName.substring(0, zoneName.lastIndexOf('-'));

        if (zoneRegion !== context.region) continue;

        if (scopedList.instances) {
          for (const instance of scopedList.instances) {
            if (!instance.id || !instance.name) continue;

            const relationships: ResourceRelationship[] = [];

            // Network relationships
            if (instance.networkInterfaces) {
              for (const ni of instance.networkInterfaces) {
                if (ni.network) {
                  relationships.push({
                    type: 'references',
                    targetSelfLink: ni.network,
                    targetType: 'google_compute_network',
                  });
                }
                if (ni.subnetwork) {
                  relationships.push({
                    type: 'references',
                    targetSelfLink: ni.subnetwork,
                    targetType: 'google_compute_subnetwork',
                  });
                }
              }
            }

            resources.push(this.createResource({
              id: String(instance.id),
              selfLink: instance.selfLink || this.buildSelfLink({
                project: context.projectId,
                zone: zoneName,
                type: 'instances',
                resource: instance.name,
              }),
              gcpType: 'compute.googleapis.com/Instance',
              region: context.region,
              name: instance.name,
              labels: this.labelsToRecord(instance.labels),
              properties: {
                machineType: instance.machineType?.split('/').pop(),
                zone: zoneName,
                status: instance.status,
                networkInterfaces: instance.networkInterfaces?.map((ni: any) => ({
                  network: ni.network?.split('/').pop(),
                  subnetwork: ni.subnetwork?.split('/').pop(),
                  networkIP: ni.networkIP,
                })),
                disks: instance.disks?.map((d: any) => ({
                  source: d.source,
                  boot: d.boot,
                  autoDelete: d.autoDelete,
                  type: d.type,
                })),
                serviceAccounts: instance.serviceAccounts?.map((sa: any) => ({
                  email: sa.email,
                  scopes: sa.scopes,
                })),
                tags: instance.tags?.items || [],
                metadata: instance.metadata?.items?.reduce((acc: Record<string, string>, item: any) => {
                  acc[item.key] = item.value;
                  return acc;
                }, {}),
                canIpForward: instance.canIpForward,
                scheduling: instance.scheduling ? {
                  preemptible: instance.scheduling.preemptible,
                  automaticRestart: instance.scheduling.automaticRestart,
                  onHostMaintenance: instance.scheduling.onHostMaintenance,
                } : null,
              },
              relationships,
              createdAt: instance.creationTimestamp ? new Date(instance.creationTimestamp) : undefined,
              status: instance.status,
            }));
          }
        }
      }
    } catch (error: any) {
      this.recordError('listInstances', error.message, context.region, error.code);
    }

    return resources;
  }

  private async scanDisks(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const disksClient = new computeLib.DisksClient();
      const aggListRequest = disksClient.aggregatedListAsync({
        project: context.projectId,
      });

      for await (const [zone, scopedList] of aggListRequest) {
        const zoneName = zone.replace('zones/', '');
        const zoneRegion = zoneName.substring(0, zoneName.lastIndexOf('-'));

        if (zoneRegion !== context.region) continue;

        if (scopedList.disks) {
          for (const disk of scopedList.disks) {
            if (!disk.id || !disk.name) continue;

            resources.push(this.createResource({
              id: String(disk.id),
              selfLink: disk.selfLink || '',
              gcpType: 'compute.googleapis.com/Disk',
              region: context.region,
              name: disk.name,
              labels: this.labelsToRecord(disk.labels),
              properties: {
                zone: zoneName,
                sizeGb: disk.sizeGb,
                type: disk.type?.split('/').pop(),
                status: disk.status,
                sourceImage: disk.sourceImage,
                sourceSnapshot: disk.sourceSnapshot,
                users: disk.users || [],
                physicalBlockSizeBytes: disk.physicalBlockSizeBytes,
                provisionedIops: disk.provisionedIops,
              },
              createdAt: disk.creationTimestamp ? new Date(disk.creationTimestamp) : undefined,
              status: disk.status,
            }));
          }
        }
      }
    } catch (error: any) {
      this.recordError('listDisks', error.message, context.region, error.code);
    }

    return resources;
  }

  private async scanFirewalls(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    // Firewalls are global resources, only scan once (in first region)
    try {
      const firewallsClient = new computeLib.FirewallsClient();
      const [firewalls] = await firewallsClient.list({
        project: context.projectId,
      });

      for (const firewall of firewalls || []) {
        if (!firewall.id || !firewall.name) continue;

        const relationships: ResourceRelationship[] = [];
        if (firewall.network) {
          relationships.push({
            type: 'references',
            targetSelfLink: firewall.network,
            targetType: 'google_compute_network',
          });
        }

        resources.push(this.createResource({
          id: String(firewall.id),
          selfLink: firewall.selfLink || '',
          gcpType: 'compute.googleapis.com/Firewall',
          region: 'global',
          name: firewall.name,
          labels: {},
          properties: {
            network: firewall.network?.split('/').pop(),
            direction: firewall.direction,
            priority: firewall.priority,
            sourceRanges: firewall.sourceRanges || [],
            destinationRanges: firewall.destinationRanges || [],
            sourceTags: firewall.sourceTags || [],
            targetTags: firewall.targetTags || [],
            sourceServiceAccounts: firewall.sourceServiceAccounts || [],
            targetServiceAccounts: firewall.targetServiceAccounts || [],
            allowed: (firewall.allowed || []).map((a: any) => ({
              ipProtocol: a.IPProtocol,
              ports: a.ports || [],
            })),
            denied: (firewall.denied || []).map((d: any) => ({
              ipProtocol: d.IPProtocol,
              ports: d.ports || [],
            })),
            disabled: firewall.disabled,
            logConfig: firewall.logConfig || null,
          },
          relationships,
          createdAt: firewall.creationTimestamp ? new Date(firewall.creationTimestamp) : undefined,
        }));
      }
    } catch (error: any) {
      this.recordError('listFirewalls', error.message, context.region, error.code);
    }

    return resources;
  }
}
