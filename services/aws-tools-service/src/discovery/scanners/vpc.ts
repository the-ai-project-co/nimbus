/**
 * VPC Scanner
 *
 * Discovers VPC resources including VPCs, subnets, route tables,
 * internet gateways, NAT gateways, VPN gateways, and network ACLs
 */

import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeRouteTablesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeVpnGatewaysCommand,
  DescribeNetworkAclsCommand,
  DescribeVpcEndpointsCommand,
  type Vpc,
  type Subnet,
  type RouteTable,
  type InternetGateway,
  type NatGateway,
  type VpnGateway,
  type NetworkAcl,
  type VpcEndpoint,
} from '@aws-sdk/client-ec2';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * VPC Scanner - discovers VPCs, subnets, route tables, gateways, and related resources
 */
export class VPCScanner extends BaseScanner {
  readonly serviceName = 'VPC';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new EC2Client({
      region: context.region,
      credentials: context.credentials,
    });

    // Scan all VPC resource types in parallel
    const [vpcs, subnets, routeTables, igws, natGateways, vpnGateways, nacls, vpcEndpoints] =
      await Promise.all([
        this.scanVPCs(client, context),
        this.scanSubnets(client, context),
        this.scanRouteTables(client, context),
        this.scanInternetGateways(client, context),
        this.scanNatGateways(client, context),
        this.scanVpnGateways(client, context),
        this.scanNetworkAcls(client, context),
        this.scanVpcEndpoints(client, context),
      ]);

    resources.push(
      ...vpcs,
      ...subnets,
      ...routeTables,
      ...igws,
      ...natGateways,
      ...vpnGateways,
      ...nacls,
      ...vpcEndpoints
    );

    logger.debug(`VPC scanner found ${resources.length} resources`, {
      region: context.region,
      vpcs: vpcs.length,
      subnets: subnets.length,
      routeTables: routeTables.length,
      igws: igws.length,
      natGateways: natGateways.length,
      vpnGateways: vpnGateways.length,
      nacls: nacls.length,
      vpcEndpoints: vpcEndpoints.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::EC2::VPC',
      'AWS::EC2::Subnet',
      'AWS::EC2::RouteTable',
      'AWS::EC2::InternetGateway',
      'AWS::EC2::NatGateway',
      'AWS::EC2::VPNGateway',
      'AWS::EC2::NetworkAcl',
      'AWS::EC2::VPCEndpoint',
    ];
  }

  /**
   * Scan VPCs
   */
  private async scanVPCs(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeVpcsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Vpcs) {
          for (const vpc of response.Vpcs) {
            const resource = this.mapVPC(vpc, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeVpcs', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan subnets
   */
  private async scanSubnets(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeSubnetsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Subnets) {
          for (const subnet of response.Subnets) {
            const resource = this.mapSubnet(subnet, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeSubnets', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan route tables
   */
  private async scanRouteTables(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeRouteTablesCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.RouteTables) {
          for (const rt of response.RouteTables) {
            const resource = this.mapRouteTable(rt, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeRouteTables', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan internet gateways
   */
  private async scanInternetGateways(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeInternetGatewaysCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.InternetGateways) {
          for (const igw of response.InternetGateways) {
            const resource = this.mapInternetGateway(igw, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeInternetGateways', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan NAT gateways
   */
  private async scanNatGateways(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeNatGatewaysCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.NatGateways) {
          for (const nat of response.NatGateways) {
            const resource = this.mapNatGateway(nat, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeNatGateways', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan VPN gateways
   */
  private async scanVpnGateways(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const command = new DescribeVpnGatewaysCommand({});

      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.VpnGateways) {
        for (const vgw of response.VpnGateways) {
          const resource = this.mapVpnGateway(vgw, context);
          if (resource) {
            resources.push(resource);
          }
        }
      }
    } catch (error: any) {
      this.recordError('DescribeVpnGateways', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan network ACLs
   */
  private async scanNetworkAcls(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeNetworkAclsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.NetworkAcls) {
          for (const nacl of response.NetworkAcls) {
            const resource = this.mapNetworkAcl(nacl, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeNetworkAcls', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan VPC endpoints
   */
  private async scanVpcEndpoints(
    client: EC2Client,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;

      do {
        const command = new DescribeVpcEndpointsCommand({
          NextToken: nextToken,
          MaxResults: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.VpcEndpoints) {
          for (const endpoint of response.VpcEndpoints) {
            const resource = this.mapVpcEndpoint(endpoint, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);
    } catch (error: any) {
      this.recordError('DescribeVpcEndpoints', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Map a VPC to a DiscoveredResource
   */
  private mapVPC(vpc: Vpc, context: ScannerContext): DiscoveredResource | null {
    if (!vpc.VpcId) return null;

    return this.createResource({
      id: vpc.VpcId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: vpc.OwnerId || context.accountId,
        resourceType: 'vpc',
        resource: vpc.VpcId,
      }),
      awsType: 'AWS::EC2::VPC',
      region: context.region,
      name: this.getNameFromTags(vpc.Tags, vpc.VpcId),
      tags: this.tagsToRecord(vpc.Tags),
      properties: {
        cidrBlock: vpc.CidrBlock,
        cidrBlockAssociations: vpc.CidrBlockAssociationSet?.map(a => ({
          cidrBlock: a.CidrBlock,
          state: a.CidrBlockState?.State,
          associationId: a.AssociationId,
        })),
        ipv6CidrBlockAssociations: vpc.Ipv6CidrBlockAssociationSet?.map(a => ({
          ipv6CidrBlock: a.Ipv6CidrBlock,
          state: a.Ipv6CidrBlockState?.State,
          associationId: a.AssociationId,
        })),
        dhcpOptionsId: vpc.DhcpOptionsId,
        instanceTenancy: vpc.InstanceTenancy,
        isDefault: vpc.IsDefault,
        ownerId: vpc.OwnerId,
      },
      relationships: [],
      status: vpc.State,
    });
  }

  /**
   * Map a subnet to a DiscoveredResource
   */
  private mapSubnet(subnet: Subnet, context: ScannerContext): DiscoveredResource | null {
    if (!subnet.SubnetId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (subnet.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: subnet.OwnerId || context.accountId,
          resourceType: 'vpc',
          resource: subnet.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    return this.createResource({
      id: subnet.SubnetId,
      arn: subnet.SubnetArn || this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: subnet.OwnerId || context.accountId,
        resourceType: 'subnet',
        resource: subnet.SubnetId,
      }),
      awsType: 'AWS::EC2::Subnet',
      region: context.region,
      name: this.getNameFromTags(subnet.Tags, subnet.SubnetId),
      tags: this.tagsToRecord(subnet.Tags),
      properties: {
        vpcId: subnet.VpcId,
        cidrBlock: subnet.CidrBlock,
        ipv6CidrBlockAssociations: subnet.Ipv6CidrBlockAssociationSet?.map(a => ({
          ipv6CidrBlock: a.Ipv6CidrBlock,
          state: a.Ipv6CidrBlockState?.State,
        })),
        availabilityZone: subnet.AvailabilityZone,
        availabilityZoneId: subnet.AvailabilityZoneId,
        availableIpAddressCount: subnet.AvailableIpAddressCount,
        defaultForAz: subnet.DefaultForAz,
        mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch,
        mapCustomerOwnedIpOnLaunch: subnet.MapCustomerOwnedIpOnLaunch,
        assignIpv6AddressOnCreation: subnet.AssignIpv6AddressOnCreation,
        enableDns64: subnet.EnableDns64,
        privateDnsNameOptionsOnLaunch: subnet.PrivateDnsNameOptionsOnLaunch,
        ownerId: subnet.OwnerId,
      },
      relationships,
      status: subnet.State,
    });
  }

  /**
   * Map a route table to a DiscoveredResource
   */
  private mapRouteTable(rt: RouteTable, context: ScannerContext): DiscoveredResource | null {
    if (!rt.RouteTableId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (rt.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: rt.OwnerId || context.accountId,
          resourceType: 'vpc',
          resource: rt.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet associations
    if (rt.Associations) {
      for (const assoc of rt.Associations) {
        if (assoc.SubnetId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'subnet',
              resource: assoc.SubnetId,
            }),
            targetType: 'aws_subnet',
          });
        }
      }
    }

    // Add gateway relationships from routes
    if (rt.Routes) {
      for (const route of rt.Routes) {
        if (route.GatewayId && !route.GatewayId.startsWith('local')) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'internet-gateway',
              resource: route.GatewayId,
            }),
            targetType: 'aws_internet_gateway',
          });
        }
        if (route.NatGatewayId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'natgateway',
              resource: route.NatGatewayId,
            }),
            targetType: 'aws_nat_gateway',
          });
        }
      }
    }

    return this.createResource({
      id: rt.RouteTableId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: rt.OwnerId || context.accountId,
        resourceType: 'route-table',
        resource: rt.RouteTableId,
      }),
      awsType: 'AWS::EC2::RouteTable',
      region: context.region,
      name: this.getNameFromTags(rt.Tags, rt.RouteTableId),
      tags: this.tagsToRecord(rt.Tags),
      properties: {
        vpcId: rt.VpcId,
        routes: rt.Routes?.map(r => ({
          destinationCidrBlock: r.DestinationCidrBlock,
          destinationIpv6CidrBlock: r.DestinationIpv6CidrBlock,
          destinationPrefixListId: r.DestinationPrefixListId,
          gatewayId: r.GatewayId,
          natGatewayId: r.NatGatewayId,
          transitGatewayId: r.TransitGatewayId,
          vpcPeeringConnectionId: r.VpcPeeringConnectionId,
          networkInterfaceId: r.NetworkInterfaceId,
          instanceId: r.InstanceId,
          state: r.State,
          origin: r.Origin,
        })),
        associations: rt.Associations?.map(a => ({
          associationId: a.RouteTableAssociationId,
          subnetId: a.SubnetId,
          gatewayId: a.GatewayId,
          main: a.Main,
          state: a.AssociationState?.State,
        })),
        propagatingVgws: rt.PropagatingVgws?.map(v => v.GatewayId),
        ownerId: rt.OwnerId,
      },
      relationships,
    });
  }

  /**
   * Map an internet gateway to a DiscoveredResource
   */
  private mapInternetGateway(
    igw: InternetGateway,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!igw.InternetGatewayId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationships
    if (igw.Attachments) {
      for (const attachment of igw.Attachments) {
        if (attachment.VpcId) {
          relationships.push({
            type: 'attached_to',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'vpc',
              resource: attachment.VpcId,
            }),
            targetType: 'aws_vpc',
          });
        }
      }
    }

    return this.createResource({
      id: igw.InternetGatewayId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: igw.OwnerId || context.accountId,
        resourceType: 'internet-gateway',
        resource: igw.InternetGatewayId,
      }),
      awsType: 'AWS::EC2::InternetGateway',
      region: context.region,
      name: this.getNameFromTags(igw.Tags, igw.InternetGatewayId),
      tags: this.tagsToRecord(igw.Tags),
      properties: {
        attachments: igw.Attachments?.map(a => ({
          vpcId: a.VpcId,
          state: a.State,
        })),
        ownerId: igw.OwnerId,
      },
      relationships,
    });
  }

  /**
   * Map a NAT gateway to a DiscoveredResource
   */
  private mapNatGateway(nat: NatGateway, context: ScannerContext): DiscoveredResource | null {
    if (!nat.NatGatewayId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (nat.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: nat.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet relationship
    if (nat.SubnetId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'subnet',
          resource: nat.SubnetId,
        }),
        targetType: 'aws_subnet',
      });
    }

    return this.createResource({
      id: nat.NatGatewayId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'natgateway',
        resource: nat.NatGatewayId,
      }),
      awsType: 'AWS::EC2::NatGateway',
      region: context.region,
      name: this.getNameFromTags(nat.Tags, nat.NatGatewayId),
      tags: this.tagsToRecord(nat.Tags),
      properties: {
        vpcId: nat.VpcId,
        subnetId: nat.SubnetId,
        connectivityType: nat.ConnectivityType,
        natGatewayAddresses: nat.NatGatewayAddresses?.map(a => ({
          allocationId: a.AllocationId,
          publicIp: a.PublicIp,
          privateIp: a.PrivateIp,
          networkInterfaceId: a.NetworkInterfaceId,
        })),
        failureCode: nat.FailureCode,
        failureMessage: nat.FailureMessage,
      },
      relationships,
      createdAt: nat.CreateTime,
      status: nat.State,
    });
  }

  /**
   * Map a VPN gateway to a DiscoveredResource
   */
  private mapVpnGateway(vgw: VpnGateway, context: ScannerContext): DiscoveredResource | null {
    if (!vgw.VpnGatewayId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationships
    if (vgw.VpcAttachments) {
      for (const attachment of vgw.VpcAttachments) {
        if (attachment.VpcId) {
          relationships.push({
            type: 'attached_to',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'vpc',
              resource: attachment.VpcId,
            }),
            targetType: 'aws_vpc',
          });
        }
      }
    }

    return this.createResource({
      id: vgw.VpnGatewayId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'vpn-gateway',
        resource: vgw.VpnGatewayId,
      }),
      awsType: 'AWS::EC2::VPNGateway',
      region: context.region,
      name: this.getNameFromTags(vgw.Tags, vgw.VpnGatewayId),
      tags: this.tagsToRecord(vgw.Tags),
      properties: {
        type: vgw.Type,
        amazonSideAsn: vgw.AmazonSideAsn,
        availabilityZone: vgw.AvailabilityZone,
        vpcAttachments: vgw.VpcAttachments?.map(a => ({
          vpcId: a.VpcId,
          state: a.State,
        })),
      },
      relationships,
      status: vgw.State,
    });
  }

  /**
   * Map a network ACL to a DiscoveredResource
   */
  private mapNetworkAcl(nacl: NetworkAcl, context: ScannerContext): DiscoveredResource | null {
    if (!nacl.NetworkAclId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (nacl.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: nacl.OwnerId || context.accountId,
          resourceType: 'vpc',
          resource: nacl.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet associations
    if (nacl.Associations) {
      for (const assoc of nacl.Associations) {
        if (assoc.SubnetId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'subnet',
              resource: assoc.SubnetId,
            }),
            targetType: 'aws_subnet',
          });
        }
      }
    }

    return this.createResource({
      id: nacl.NetworkAclId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: nacl.OwnerId || context.accountId,
        resourceType: 'network-acl',
        resource: nacl.NetworkAclId,
      }),
      awsType: 'AWS::EC2::NetworkAcl',
      region: context.region,
      name: this.getNameFromTags(nacl.Tags, nacl.NetworkAclId),
      tags: this.tagsToRecord(nacl.Tags),
      properties: {
        vpcId: nacl.VpcId,
        isDefault: nacl.IsDefault,
        entries: nacl.Entries?.map(e => ({
          ruleNumber: e.RuleNumber,
          protocol: e.Protocol,
          ruleAction: e.RuleAction,
          egress: e.Egress,
          cidrBlock: e.CidrBlock,
          ipv6CidrBlock: e.Ipv6CidrBlock,
          icmpTypeCode: e.IcmpTypeCode,
          portRange: e.PortRange,
        })),
        associations: nacl.Associations?.map(a => ({
          associationId: a.NetworkAclAssociationId,
          subnetId: a.SubnetId,
        })),
        ownerId: nacl.OwnerId,
      },
      relationships,
    });
  }

  /**
   * Map a VPC endpoint to a DiscoveredResource
   */
  private mapVpcEndpoint(
    endpoint: VpcEndpoint,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!endpoint.VpcEndpointId) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (endpoint.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: endpoint.OwnerId || context.accountId,
          resourceType: 'vpc',
          resource: endpoint.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet relationships
    if (endpoint.SubnetIds) {
      for (const subnetId of endpoint.SubnetIds) {
        relationships.push({
          type: 'contains',
          targetArn: this.buildArn({
            service: 'ec2',
            region: context.region,
            accountId: context.accountId,
            resourceType: 'subnet',
            resource: subnetId,
          }),
          targetType: 'aws_subnet',
        });
      }
    }

    // Add security group relationships
    if (endpoint.Groups) {
      for (const group of endpoint.Groups) {
        if (group.GroupId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'security-group',
              resource: group.GroupId,
            }),
            targetType: 'aws_security_group',
          });
        }
      }
    }

    return this.createResource({
      id: endpoint.VpcEndpointId,
      arn: this.buildArn({
        service: 'ec2',
        region: context.region,
        accountId: endpoint.OwnerId || context.accountId,
        resourceType: 'vpc-endpoint',
        resource: endpoint.VpcEndpointId,
      }),
      awsType: 'AWS::EC2::VPCEndpoint',
      region: context.region,
      name: this.getNameFromTags(endpoint.Tags, endpoint.VpcEndpointId),
      tags: this.tagsToRecord(endpoint.Tags),
      properties: {
        vpcId: endpoint.VpcId,
        serviceName: endpoint.ServiceName,
        vpcEndpointType: endpoint.VpcEndpointType,
        state: endpoint.State,
        routeTableIds: endpoint.RouteTableIds,
        subnetIds: endpoint.SubnetIds,
        securityGroups: endpoint.Groups?.map(g => ({
          groupId: g.GroupId,
          groupName: g.GroupName,
        })),
        privateDnsEnabled: endpoint.PrivateDnsEnabled,
        requesterManaged: endpoint.RequesterManaged,
        networkInterfaceIds: endpoint.NetworkInterfaceIds,
        dnsEntries: endpoint.DnsEntries?.map(d => ({
          dnsName: d.DnsName,
          hostedZoneId: d.HostedZoneId,
        })),
        policyDocument: endpoint.PolicyDocument,
        ownerId: endpoint.OwnerId,
      },
      relationships,
      createdAt: endpoint.CreationTimestamp,
      status: endpoint.State,
    });
  }
}
