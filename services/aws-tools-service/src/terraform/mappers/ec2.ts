/**
 * EC2 Resource Mappers
 *
 * Maps EC2 resources to Terraform configuration
 */

import type { DiscoveredResource } from '../../discovery/types';
import type {
  MappingContext,
  TerraformResource,
  TerraformOutput,
  TerraformValue,
} from '../types';
import { BaseResourceMapper } from './base';

/**
 * EC2 Instance Mapper
 */
export class EC2InstanceMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::Instance';
  readonly terraformType = 'aws_instance';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Required attributes
    if (props.imageId) {
      attributes.ami = props.imageId as string;
    }

    if (props.instanceType) {
      attributes.instance_type = props.instanceType as string;
    }

    // Optional attributes
    if (props.keyName) {
      attributes.key_name = props.keyName as string;
    }

    if (props.subnetId) {
      const ref = this.getResourceRef(
        `arn:aws:ec2:${resource.region}:${context.config.defaultRegion}:subnet/${props.subnetId}`,
        context
      );
      attributes.subnet_id = ref || (props.subnetId as string);
    }

    // Security groups
    if (props.securityGroups && Array.isArray(props.securityGroups)) {
      const sgIds = (props.securityGroups as Array<{ groupId?: string }>)
        .map(sg => sg.groupId)
        .filter((id): id is string => !!id);
      if (sgIds.length > 0) {
        attributes.vpc_security_group_ids = sgIds;
      }
    }

    // IAM instance profile
    if (props.iamInstanceProfile && typeof props.iamInstanceProfile === 'object') {
      const profile = props.iamInstanceProfile as { arn?: string };
      if (profile.arn) {
        // Extract profile name from ARN
        const match = profile.arn.match(/instance-profile\/(.+)$/);
        if (match) {
          attributes.iam_instance_profile = match[1];
        }
      }
    }

    // EBS optimization
    if (props.ebsOptimized !== undefined) {
      attributes.ebs_optimized = props.ebsOptimized as boolean;
    }

    // Monitoring
    if (props.monitoring === 'enabled') {
      attributes.monitoring = true;
    }

    // Metadata options (IMDSv2)
    if (props.metadataOptions && typeof props.metadataOptions === 'object') {
      const meta = props.metadataOptions as Record<string, unknown>;
      attributes.metadata_options = this.createBlock({
        http_endpoint: meta.httpEndpoint as string || 'enabled',
        http_tokens: meta.httpTokens as string || 'optional',
        http_put_response_hop_limit: meta.httpPutResponseHopLimit as number || 1,
      });
    }

    // Root block device
    if (props.blockDeviceMappings && Array.isArray(props.blockDeviceMappings)) {
      const rootDevice = (props.blockDeviceMappings as Array<Record<string, unknown>>).find(
        bdm => bdm.deviceName === '/dev/xvda' || bdm.deviceName === '/dev/sda1'
      );
      if (rootDevice && rootDevice.volumeId) {
        // Note: Root block device is typically managed separately
        // We'll add a lifecycle ignore for it
      }
    }

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      lifecycle: {
        ignoreChanges: ['ami', 'user_data'], // Common fields that change
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_id`,
        value: `aws_instance.${name}.id`,
        description: `ID of EC2 instance ${resource.name || resource.id}`,
      },
      {
        name: `${name}_private_ip`,
        value: `aws_instance.${name}.private_ip`,
        description: `Private IP of EC2 instance ${resource.name || resource.id}`,
      },
    ];
  }
}

/**
 * EBS Volume Mapper
 */
export class EBSVolumeMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::Volume';
  readonly terraformType = 'aws_ebs_volume';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Required
    if (props.availabilityZone) {
      attributes.availability_zone = props.availabilityZone as string;
    }

    // Size and type
    if (props.size) {
      attributes.size = props.size as number;
    }

    if (props.volumeType) {
      attributes.type = props.volumeType as string;
    }

    // IOPS (for io1, io2, gp3)
    if (props.iops) {
      attributes.iops = props.iops as number;
    }

    // Throughput (for gp3)
    if (props.throughput) {
      attributes.throughput = props.throughput as number;
    }

    // Encryption
    if (props.encrypted) {
      attributes.encrypted = props.encrypted as boolean;
    }

    if (props.kmsKeyId) {
      attributes.kms_key_id = props.kmsKeyId as string;
    }

    // Snapshot
    if (props.snapshotId) {
      attributes.snapshot_id = props.snapshotId as string;
    }

    // Multi-attach
    if (props.multiAttachEnabled) {
      attributes.multi_attach_enabled = props.multiAttachEnabled as boolean;
    }

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Security Group Mapper
 */
export class SecurityGroupMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::SecurityGroup';
  readonly terraformType = 'aws_security_group';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Name and description
    if (props.groupName) {
      attributes.name = props.groupName as string;
    }

    if (props.description) {
      attributes.description = props.description as string;
    }

    // VPC
    if (props.vpcId) {
      attributes.vpc_id = props.vpcId as string;
    }

    // Ingress rules
    if (props.ingressRules && Array.isArray(props.ingressRules)) {
      const ingressBlocks: TerraformValue[] = [];

      for (const rule of props.ingressRules as Array<Record<string, unknown>>) {
        const ingressAttrs: Record<string, TerraformValue> = {
          from_port: (rule.fromPort as number) || 0,
          to_port: (rule.toPort as number) || 0,
          protocol: (rule.ipProtocol as string) || '-1',
        };

        // CIDR blocks
        if (rule.ipRanges && Array.isArray(rule.ipRanges)) {
          const cidrs = (rule.ipRanges as Array<{ cidrIp?: string }>)
            .map(r => r.cidrIp)
            .filter((c): c is string => !!c);
          if (cidrs.length > 0) {
            ingressAttrs.cidr_blocks = cidrs;
          }
        }

        // IPv6 CIDR blocks
        if (rule.ipv6Ranges && Array.isArray(rule.ipv6Ranges)) {
          const cidrs = (rule.ipv6Ranges as Array<{ cidrIpv6?: string }>)
            .map(r => r.cidrIpv6)
            .filter((c): c is string => !!c);
          if (cidrs.length > 0) {
            ingressAttrs.ipv6_cidr_blocks = cidrs;
          }
        }

        // Security group references
        if (rule.securityGroups && Array.isArray(rule.securityGroups)) {
          const sgs = (rule.securityGroups as Array<{ groupId?: string }>)
            .map(sg => sg.groupId)
            .filter((id): id is string => !!id);
          if (sgs.length > 0) {
            ingressAttrs.security_groups = sgs;
          }
        }

        // Description
        if (rule.ipRanges && Array.isArray(rule.ipRanges)) {
          const desc = (rule.ipRanges as Array<{ description?: string }>)
            .find(r => r.description)?.description;
          if (desc) {
            ingressAttrs.description = desc;
          }
        }

        ingressBlocks.push(this.createBlock(ingressAttrs));
      }

      if (ingressBlocks.length > 0) {
        attributes.ingress = ingressBlocks;
      }
    }

    // Egress rules
    if (props.egressRules && Array.isArray(props.egressRules)) {
      const egressBlocks: TerraformValue[] = [];

      for (const rule of props.egressRules as Array<Record<string, unknown>>) {
        const egressAttrs: Record<string, TerraformValue> = {
          from_port: (rule.fromPort as number) || 0,
          to_port: (rule.toPort as number) || 0,
          protocol: (rule.ipProtocol as string) || '-1',
        };

        // CIDR blocks
        if (rule.ipRanges && Array.isArray(rule.ipRanges)) {
          const cidrs = (rule.ipRanges as Array<{ cidrIp?: string }>)
            .map(r => r.cidrIp)
            .filter((c): c is string => !!c);
          if (cidrs.length > 0) {
            egressAttrs.cidr_blocks = cidrs;
          }
        }

        // IPv6 CIDR blocks
        if (rule.ipv6Ranges && Array.isArray(rule.ipv6Ranges)) {
          const cidrs = (rule.ipv6Ranges as Array<{ cidrIpv6?: string }>)
            .map(r => r.cidrIpv6)
            .filter((c): c is string => !!c);
          if (cidrs.length > 0) {
            egressAttrs.ipv6_cidr_blocks = cidrs;
          }
        }

        egressBlocks.push(this.createBlock(egressAttrs));
      }

      if (egressBlocks.length > 0) {
        attributes.egress = egressBlocks;
      }
    }

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      lifecycle: {
        // Security group rules often change
        createBeforeDestroy: true,
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Launch Template Mapper
 */
export class LaunchTemplateMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::LaunchTemplate';
  readonly terraformType = 'aws_launch_template';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    if (props.launchTemplateName) {
      attributes.name = props.launchTemplateName as string;
    }

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Key Pair Mapper
 */
export class KeyPairMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::KeyPair';
  readonly terraformType = 'aws_key_pair';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    if (props.keyName) {
      attributes.key_name = props.keyName as string;
    }

    // Note: public_key cannot be retrieved from AWS, needs to be provided
    // We'll create a variable for it
    const varName = context.addVariable({
      name: `key_pair_${name}_public_key`,
      type: 'string',
      description: `Public key for key pair ${props.keyName || name}`,
      sensitive: false,
    });
    attributes.public_key = this.createReference(`var.${varName}`);

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.keyName as string) || resource.id;
  }
}

/**
 * Get all EC2 mappers
 */
export function getEC2Mappers(): BaseResourceMapper[] {
  return [
    new EC2InstanceMapper(),
    new EBSVolumeMapper(),
    new SecurityGroupMapper(),
    new LaunchTemplateMapper(),
    new KeyPairMapper(),
  ];
}
