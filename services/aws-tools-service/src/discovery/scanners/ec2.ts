/**
 * EC2 Scanner
 *
 * Discovers EC2 resources including instances, volumes, security groups,
 * launch templates, and related networking components
 */

import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVolumesCommand,
  DescribeSecurityGroupsCommand,
  DescribeLaunchTemplatesCommand,
  DescribeKeyPairsCommand,
  DescribeImagesCommand,
  type Instance,
  type Volume,
  type SecurityGroup,
  type LaunchTemplate,
  type KeyPairInfo,
  type Image,
} from '@aws-sdk/client-ec2';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * EC2 Scanner - discovers EC2 instances, volumes, security groups, and related resources
 */
export class EC2Scanner extends BaseScanner {
  readonly serviceName = 'EC2';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new EC2Client({
      region: context.region,
      credentials: context.credentials,
    });

    // Scan all EC2 resource types in parallel
    const [instances, volumes, securityGroups, launchTemplates, keyPairs] = await Promise.all([
      this.scanInstances(client, context),
      this.scanVolumes(client, context),
      this.scanSecurityGroups(client, context),
      this.scanLaunchTemplates(client, context),
      this.scanKeyPairs(client, context),
    ]);

    resources.push(...instances, ...volumes, ...securityGroups, ...launchTemplates, ...keyPairs);

    logger.debug(`EC2 scanner found ${resources.length} resources`, {
      region: context.region,
      instances: instances.length,
      volumes: volumes.length,
      securityGroups: securityGroups.length,
      launchTemplates: launchTemplates.length,
      keyPairs: keyPairs.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::EC2::Instance',
      'AWS::EC2::Volume',
      'AWS::EC2::SecurityGroup',
      'AWS::EC2::LaunchTemplate',
      'AWS::EC2::KeyPair',
    ];
  }

  /**
   * Scan EC2 instances
   */
  private async scanInstances(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeInstancesCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Reservations) {
          for (const reservation of response.Reservations) {
            if (reservation.Instances) {
              for (const instance of reservation.Instances) {
                const resource = this.mapInstance(instance, context);
                if (resource) {
                  resources.push(resource);
                }
              }
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeInstances', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan EBS volumes
   */
  private async scanVolumes(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeVolumesCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Volumes) {
          for (const volume of response.Volumes) {
            const resource = this.mapVolume(volume, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeVolumes', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan security groups
   */
  private async scanSecurityGroups(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeSecurityGroupsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.SecurityGroups) {
          for (const sg of response.SecurityGroups) {
            const resource = this.mapSecurityGroup(sg, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeSecurityGroups', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan launch templates
   */
  private async scanLaunchTemplates(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeLaunchTemplatesCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.LaunchTemplates) {
          for (const template of response.LaunchTemplates) {
            const resource = this.mapLaunchTemplate(template, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeLaunchTemplates', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan key pairs
   */
  private async scanKeyPairs(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const command = new DescribeKeyPairsCommand({});

      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.KeyPairs) {
        for (const keyPair of response.KeyPairs) {
          const resource = this.mapKeyPair(keyPair, context);
          if (resource) {
            resources.push(resource);
          }
        }
      }
    } catch (error: any) {
      this.recordError('DescribeKeyPairs', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Map an EC2 instance to a DiscoveredResource
   */
  private mapInstance(instance: Instance, context: ScannerContext): DiscoveredResource | null {
    if (!instance.InstanceId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (instance.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: instance.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet relationship
    if (instance.SubnetId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'subnet',
          resource: instance.SubnetId,
        }),
        targetType: 'aws_subnet',
      });
    }

    // Add security group relationships
    if (instance.SecurityGroups) {
      for (const sg of instance.SecurityGroups) {
        if (sg.GroupId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'security-group',
              resource: sg.GroupId,
            }),
            targetType: 'aws_security_group',
          });
        }
      }
    }

    // Add IAM role relationship
    if (instance.IamInstanceProfile?.Arn) {
      relationships.push({
        type: 'references',
        targetArn: instance.IamInstanceProfile.Arn,
        targetType: 'aws_iam_instance_profile',
      });
    }

    return this.createResource({
      id: instance.InstanceId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'instance',
        resource: instance.InstanceId,
      }),
      awsType: 'AWS::EC2::Instance',
      region: context.region,
      name: this.getNameFromTags(instance.Tags, instance.InstanceId),
      tags: this.tagsToRecord(instance.Tags),
      properties: {
        instanceType: instance.InstanceType,
        imageId: instance.ImageId,
        keyName: instance.KeyName,
        vpcId: instance.VpcId,
        subnetId: instance.SubnetId,
        privateIpAddress: instance.PrivateIpAddress,
        publicIpAddress: instance.PublicIpAddress,
        privateDnsName: instance.PrivateDnsName,
        publicDnsName: instance.PublicDnsName,
        state: instance.State?.Name,
        platform: instance.Platform,
        architecture: instance.Architecture,
        rootDeviceType: instance.RootDeviceType,
        virtualizationType: instance.VirtualizationType,
        ebsOptimized: instance.EbsOptimized,
        enaSupport: instance.EnaSupport,
        monitoring: instance.Monitoring?.State,
        securityGroups: instance.SecurityGroups?.map(sg => ({
          groupId: sg.GroupId,
          groupName: sg.GroupName,
        })),
        blockDeviceMappings: instance.BlockDeviceMappings?.map(bdm => ({
          deviceName: bdm.DeviceName,
          volumeId: bdm.Ebs?.VolumeId,
          deleteOnTermination: bdm.Ebs?.DeleteOnTermination,
        })),
        iamInstanceProfile: instance.IamInstanceProfile
          ? {
              arn: instance.IamInstanceProfile.Arn,
              id: instance.IamInstanceProfile.Id,
            }
          : undefined,
        metadataOptions: {
          httpEndpoint: instance.MetadataOptions?.HttpEndpoint,
          httpTokens: instance.MetadataOptions?.HttpTokens,
          httpPutResponseHopLimit: instance.MetadataOptions?.HttpPutResponseHopLimit,
        },
      },
      relationships,
      createdAt: instance.LaunchTime,
      status: instance.State?.Name,
    });
  }

  /**
   * Map an EBS volume to a DiscoveredResource
   */
  private mapVolume(volume: Volume, context: ScannerContext): DiscoveredResource | null {
    if (!volume.VolumeId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add attached instance relationships
    if (volume.Attachments) {
      for (const attachment of volume.Attachments) {
        if (attachment.InstanceId) {
          relationships.push({
            type: 'attached_to',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'instance',
              resource: attachment.InstanceId,
            }),
            targetType: 'aws_instance',
          });
        }
      }
    }

    // Add KMS key relationship
    if (volume.KmsKeyId) {
      relationships.push({
        type: 'references',
        targetArn: volume.KmsKeyId,
        targetType: 'aws_kms_key',
      });
    }

    return this.createResource({
      id: volume.VolumeId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'volume',
        resource: volume.VolumeId,
      }),
      awsType: 'AWS::EC2::Volume',
      region: context.region,
      name: this.getNameFromTags(volume.Tags, volume.VolumeId),
      tags: this.tagsToRecord(volume.Tags),
      properties: {
        volumeType: volume.VolumeType,
        size: volume.Size,
        iops: volume.Iops,
        throughput: volume.Throughput,
        encrypted: volume.Encrypted,
        kmsKeyId: volume.KmsKeyId,
        snapshotId: volume.SnapshotId,
        availabilityZone: volume.AvailabilityZone,
        multiAttachEnabled: volume.MultiAttachEnabled,
        attachments: volume.Attachments?.map(a => ({
          instanceId: a.InstanceId,
          device: a.Device,
          state: a.State,
          deleteOnTermination: a.DeleteOnTermination,
        })),
      },
      relationships,
      createdAt: volume.CreateTime,
      status: volume.State,
    });
  }

  /**
   * Map a security group to a DiscoveredResource
   */
  private mapSecurityGroup(sg: SecurityGroup, context: ScannerContext): DiscoveredResource | null {
    if (!sg.GroupId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (sg.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: sg.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add referenced security group relationships from rules
    const addSgReferences = (permissions: typeof sg.IpPermissions) => {
      if (!permissions) return;
      for (const perm of permissions) {
        if (perm.UserIdGroupPairs) {
          for (const pair of perm.UserIdGroupPairs) {
            if (pair.GroupId && pair.GroupId !== sg.GroupId) {
              relationships.push({
                type: 'references',
                targetArn: this.buildArn({
                  service: 'ec2',
                  region: context.region,
                  accountId: pair.UserId || context.accountId,
                  resourceType: 'security-group',
                  resource: pair.GroupId,
                }),
                targetType: 'aws_security_group',
              });
            }
          }
        }
      }
    };

    addSgReferences(sg.IpPermissions);
    addSgReferences(sg.IpPermissionsEgress);

    return this.createResource({
      id: sg.GroupId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: sg.OwnerId || context.accountId,
        resourceType: 'security-group',
        resource: sg.GroupId,
      }),
      awsType: 'AWS::EC2::SecurityGroup',
      region: context.region,
      name: sg.GroupName,
      tags: this.tagsToRecord(sg.Tags),
      properties: {
        groupName: sg.GroupName,
        description: sg.Description,
        vpcId: sg.VpcId,
        ownerId: sg.OwnerId,
        ingressRules: sg.IpPermissions?.map(perm => ({
          ipProtocol: perm.IpProtocol,
          fromPort: perm.FromPort,
          toPort: perm.ToPort,
          ipRanges: perm.IpRanges?.map(r => ({
            cidrIp: r.CidrIp,
            description: r.Description,
          })),
          ipv6Ranges: perm.Ipv6Ranges?.map(r => ({
            cidrIpv6: r.CidrIpv6,
            description: r.Description,
          })),
          prefixListIds: perm.PrefixListIds?.map(p => p.PrefixListId),
          securityGroups: perm.UserIdGroupPairs?.map(p => ({
            groupId: p.GroupId,
            groupName: p.GroupName,
            userId: p.UserId,
          })),
        })),
        egressRules: sg.IpPermissionsEgress?.map(perm => ({
          ipProtocol: perm.IpProtocol,
          fromPort: perm.FromPort,
          toPort: perm.ToPort,
          ipRanges: perm.IpRanges?.map(r => ({
            cidrIp: r.CidrIp,
            description: r.Description,
          })),
          ipv6Ranges: perm.Ipv6Ranges?.map(r => ({
            cidrIpv6: r.CidrIpv6,
            description: r.Description,
          })),
          prefixListIds: perm.PrefixListIds?.map(p => p.PrefixListId),
          securityGroups: perm.UserIdGroupPairs?.map(p => ({
            groupId: p.GroupId,
            groupName: p.GroupName,
            userId: p.UserId,
          })),
        })),
      },
      relationships,
    });
  }

  /**
   * Map a launch template to a DiscoveredResource
   */
  private mapLaunchTemplate(
    template: LaunchTemplate,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!template.LaunchTemplateId) return null;

    return this.createResource({
      id: template.LaunchTemplateId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'launch-template',
        resource: template.LaunchTemplateId,
      }),
      awsType: 'AWS::EC2::LaunchTemplate',
      region: context.region,
      name: template.LaunchTemplateName,
      tags: this.tagsToRecord(template.Tags),
      properties: {
        launchTemplateName: template.LaunchTemplateName,
        defaultVersionNumber: template.DefaultVersionNumber,
        latestVersionNumber: template.LatestVersionNumber,
        createdBy: template.CreatedBy,
      },
      relationships: [],
      createdAt: template.CreateTime,
    });
  }

  /**
   * Map a key pair to a DiscoveredResource
   */
  private mapKeyPair(keyPair: KeyPairInfo, context: ScannerContext): DiscoveredResource | null {
    if (!keyPair.KeyPairId) return null;

    return this.createResource({
      id: keyPair.KeyPairId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'key-pair',
        resource: keyPair.KeyPairId,
      }),
      awsType: 'AWS::EC2::KeyPair',
      region: context.region,
      name: keyPair.KeyName,
      tags: this.tagsToRecord(keyPair.Tags),
      properties: {
        keyName: keyPair.KeyName,
        keyType: keyPair.KeyType,
        keyFingerprint: keyPair.KeyFingerprint,
        publicKey: keyPair.PublicKey,
      },
      relationships: [],
      createdAt: keyPair.CreateTime,
    });
  }
}
