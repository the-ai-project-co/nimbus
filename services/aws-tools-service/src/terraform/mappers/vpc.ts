/**
 * VPC Resource Mappers
 *
 * Maps VPC resources to Terraform configuration
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
 * VPC Mapper
 */
export class VPCMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::VPC';
  readonly terraformType = 'aws_vpc';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // CIDR block
    if (props.cidrBlock) {
      attributes.cidr_block = props.cidrBlock as string;
    }

    // Instance tenancy
    if (props.instanceTenancy && props.instanceTenancy !== 'default') {
      attributes.instance_tenancy = props.instanceTenancy as string;
    }

    // Enable DNS support and hostnames (defaults)
    attributes.enable_dns_support = true;
    attributes.enable_dns_hostnames = true;

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

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_id`,
        value: `aws_vpc.${name}.id`,
        description: `ID of VPC ${resource.name || resource.id}`,
      },
      {
        name: `${name}_cidr_block`,
        value: `aws_vpc.${name}.cidr_block`,
        description: `CIDR block of VPC ${resource.name || resource.id}`,
      },
    ];
  }
}

/**
 * Subnet Mapper
 */
export class SubnetMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::Subnet';
  readonly terraformType = 'aws_subnet';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // VPC ID
    if (props.vpcId) {
      const vpcRef = context.getResourceReference(
        `arn:aws:ec2:${resource.region}:${props.ownerId || ''}:vpc/${props.vpcId}`
      );
      attributes.vpc_id = vpcRef || (props.vpcId as string);
    }

    // CIDR block
    if (props.cidrBlock) {
      attributes.cidr_block = props.cidrBlock as string;
    }

    // Availability zone
    if (props.availabilityZone) {
      attributes.availability_zone = props.availabilityZone as string;
    }

    // Map public IP on launch
    if (props.mapPublicIpOnLaunch !== undefined) {
      attributes.map_public_ip_on_launch = props.mapPublicIpOnLaunch as boolean;
    }

    // Assign IPv6 address on creation
    if (props.assignIpv6AddressOnCreation !== undefined) {
      attributes.assign_ipv6_address_on_creation = props.assignIpv6AddressOnCreation as boolean;
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
 * Route Table Mapper
 */
export class RouteTableMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::RouteTable';
  readonly terraformType = 'aws_route_table';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // VPC ID
    if (props.vpcId) {
      attributes.vpc_id = props.vpcId as string;
    }

    // Routes
    if (props.routes && Array.isArray(props.routes)) {
      const routeBlocks: TerraformValue[] = [];

      for (const route of props.routes as Array<Record<string, unknown>>) {
        // Skip local routes
        if (route.gatewayId === 'local') continue;

        const routeAttrs: Record<string, TerraformValue> = {};

        // Destination
        if (route.destinationCidrBlock) {
          routeAttrs.cidr_block = route.destinationCidrBlock as string;
        }
        if (route.destinationIpv6CidrBlock) {
          routeAttrs.ipv6_cidr_block = route.destinationIpv6CidrBlock as string;
        }

        // Target
        if (route.gatewayId) {
          routeAttrs.gateway_id = route.gatewayId as string;
        }
        if (route.natGatewayId) {
          routeAttrs.nat_gateway_id = route.natGatewayId as string;
        }
        if (route.transitGatewayId) {
          routeAttrs.transit_gateway_id = route.transitGatewayId as string;
        }
        if (route.vpcPeeringConnectionId) {
          routeAttrs.vpc_peering_connection_id = route.vpcPeeringConnectionId as string;
        }
        if (route.networkInterfaceId) {
          routeAttrs.network_interface_id = route.networkInterfaceId as string;
        }

        if (Object.keys(routeAttrs).length > 1) { // Has destination and target
          routeBlocks.push(this.createBlock(routeAttrs));
        }
      }

      if (routeBlocks.length > 0) {
        attributes.route = routeBlocks;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Internet Gateway Mapper
 */
export class InternetGatewayMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::InternetGateway';
  readonly terraformType = 'aws_internet_gateway';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // VPC ID from attachments
    if (props.attachments && Array.isArray(props.attachments)) {
      const attachment = (props.attachments as Array<{ vpcId?: string }>)[0];
      if (attachment?.vpcId) {
        attributes.vpc_id = attachment.vpcId;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * NAT Gateway Mapper
 */
export class NatGatewayMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::NatGateway';
  readonly terraformType = 'aws_nat_gateway';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Subnet ID
    if (props.subnetId) {
      attributes.subnet_id = props.subnetId as string;
    }

    // Connectivity type
    if (props.connectivityType) {
      attributes.connectivity_type = props.connectivityType as string;
    }

    // Allocation ID (for public NAT)
    if (props.natGatewayAddresses && Array.isArray(props.natGatewayAddresses)) {
      const address = (props.natGatewayAddresses as Array<{ allocationId?: string }>)[0];
      if (address?.allocationId) {
        attributes.allocation_id = address.allocationId;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * VPC Endpoint Mapper
 */
export class VPCEndpointMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::VPCEndpoint';
  readonly terraformType = 'aws_vpc_endpoint';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // VPC ID
    if (props.vpcId) {
      attributes.vpc_id = props.vpcId as string;
    }

    // Service name
    if (props.serviceName) {
      attributes.service_name = props.serviceName as string;
    }

    // Endpoint type
    if (props.vpcEndpointType) {
      attributes.vpc_endpoint_type = props.vpcEndpointType as string;
    }

    // Route table IDs (for Gateway endpoints)
    if (props.routeTableIds && Array.isArray(props.routeTableIds)) {
      attributes.route_table_ids = props.routeTableIds as string[];
    }

    // Subnet IDs (for Interface endpoints)
    if (props.subnetIds && Array.isArray(props.subnetIds)) {
      attributes.subnet_ids = props.subnetIds as string[];
    }

    // Security group IDs (for Interface endpoints)
    if (props.securityGroups && Array.isArray(props.securityGroups)) {
      const sgIds = (props.securityGroups as Array<{ groupId?: string }>)
        .map(sg => sg.groupId)
        .filter((id): id is string => !!id);
      if (sgIds.length > 0) {
        attributes.security_group_ids = sgIds;
      }
    }

    // Private DNS enabled
    if (props.privateDnsEnabled !== undefined) {
      attributes.private_dns_enabled = props.privateDnsEnabled as boolean;
    }

    // Policy document
    if (props.policyDocument && typeof props.policyDocument === 'string') {
      attributes.policy = props.policyDocument;
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
 * Network ACL Mapper
 */
export class NetworkAclMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EC2::NetworkAcl';
  readonly terraformType = 'aws_network_acl';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // VPC ID
    if (props.vpcId) {
      attributes.vpc_id = props.vpcId as string;
    }

    // Subnet IDs
    if (props.associations && Array.isArray(props.associations)) {
      const subnetIds = (props.associations as Array<{ subnetId?: string }>)
        .map(a => a.subnetId)
        .filter((id): id is string => !!id);
      if (subnetIds.length > 0) {
        attributes.subnet_ids = subnetIds;
      }
    }

    // Ingress rules
    if (props.entries && Array.isArray(props.entries)) {
      const ingressBlocks: TerraformValue[] = [];
      const egressBlocks: TerraformValue[] = [];

      for (const entry of props.entries as Array<Record<string, unknown>>) {
        const ruleAttrs: Record<string, TerraformValue> = {
          rule_no: entry.ruleNumber as number,
          protocol: entry.protocol as string,
          action: entry.ruleAction as string,
        };

        if (entry.cidrBlock) {
          ruleAttrs.cidr_block = entry.cidrBlock as string;
        }
        if (entry.ipv6CidrBlock) {
          ruleAttrs.ipv6_cidr_block = entry.ipv6CidrBlock as string;
        }

        if (entry.portRange && typeof entry.portRange === 'object') {
          const portRange = entry.portRange as { From?: number; To?: number };
          ruleAttrs.from_port = portRange.From || 0;
          ruleAttrs.to_port = portRange.To || 0;
        }

        if (entry.egress) {
          egressBlocks.push(this.createBlock(ruleAttrs));
        } else {
          ingressBlocks.push(this.createBlock(ruleAttrs));
        }
      }

      if (ingressBlocks.length > 0) {
        attributes.ingress = ingressBlocks;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Get all VPC mappers
 */
export function getVPCMappers(): BaseResourceMapper[] {
  return [
    new VPCMapper(),
    new SubnetMapper(),
    new RouteTableMapper(),
    new InternetGatewayMapper(),
    new NatGatewayMapper(),
    new VPCEndpointMapper(),
    new NetworkAclMapper(),
  ];
}
