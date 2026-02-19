import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
  TerminateInstancesCommand,
  RunInstancesCommand,
  DescribeInstanceStatusCommand,
  DescribeRegionsCommand,
  DescribeAvailabilityZonesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateTagsCommand,
  DescribeImagesCommand,
  ModifyInstanceAttributeCommand,
  type DescribeInstancesCommandInput,
  type RunInstancesCommandInput,
  type Filter,
} from '@aws-sdk/client-ec2';
import { logger } from '@nimbus/shared-utils';

export interface EC2Config {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
}

export interface ListInstancesOptions {
  instanceIds?: string[];
  filters?: Record<string, string[]>;
  maxResults?: number;
  nextToken?: string;
}

export interface RunInstanceOptions {
  imageId: string;
  instanceType: string;
  minCount?: number;
  maxCount?: number;
  keyName?: string;
  securityGroupIds?: string[];
  subnetId?: string;
  userData?: string;
  tags?: Record<string, string>;
  ebsOptimized?: boolean;
  monitoring?: boolean;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * EC2 operations using AWS SDK
 */
export class EC2Operations {
  private client: EC2Client;

  constructor(config: EC2Config = {}) {
    const clientConfig: any = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      };
    }

    this.client = new EC2Client(clientConfig);
  }

  /**
   * List EC2 instances
   */
  async listInstances(options: ListInstancesOptions = {}): Promise<OperationResult> {
    try {
      const input: DescribeInstancesCommandInput = {};

      if (options.instanceIds && options.instanceIds.length > 0) {
        input.InstanceIds = options.instanceIds;
      }

      if (options.filters) {
        input.Filters = Object.entries(options.filters).map(([name, values]): Filter => ({
          Name: name,
          Values: values,
        }));
      }

      if (options.maxResults) {
        input.MaxResults = options.maxResults;
      }

      if (options.nextToken) {
        input.NextToken = options.nextToken;
      }

      const command = new DescribeInstancesCommand(input);
      const response = await this.client.send(command);

      const instances = response.Reservations?.flatMap(
        (r) =>
          r.Instances?.map((i) => ({
            instanceId: i.InstanceId,
            instanceType: i.InstanceType,
            state: i.State?.Name,
            publicIpAddress: i.PublicIpAddress,
            privateIpAddress: i.PrivateIpAddress,
            launchTime: i.LaunchTime,
            availabilityZone: i.Placement?.AvailabilityZone,
            vpcId: i.VpcId,
            subnetId: i.SubnetId,
            imageId: i.ImageId,
            keyName: i.KeyName,
            tags: i.Tags?.reduce(
              (acc, tag) => {
                if (tag.Key) acc[tag.Key] = tag.Value || '';
                return acc;
              },
              {} as Record<string, string>
            ),
          })) || []
      );

      return {
        success: true,
        data: {
          instances: instances || [],
          nextToken: response.NextToken,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get instance status
   */
  async getInstanceStatus(instanceIds: string[]): Promise<OperationResult> {
    try {
      const command = new DescribeInstanceStatusCommand({
        InstanceIds: instanceIds,
        IncludeAllInstances: true,
      });

      const response = await this.client.send(command);

      const statuses = response.InstanceStatuses?.map((s) => ({
        instanceId: s.InstanceId,
        instanceState: s.InstanceState?.Name,
        instanceStatus: s.InstanceStatus?.Status,
        systemStatus: s.SystemStatus?.Status,
        availabilityZone: s.AvailabilityZone,
      }));

      return {
        success: true,
        data: { statuses: statuses || [] },
      };
    } catch (error: any) {
      logger.error('Failed to get instance status', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start instances
   */
  async startInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const command = new StartInstancesCommand({
        InstanceIds: instanceIds,
      });

      const response = await this.client.send(command);

      const results = response.StartingInstances?.map((i) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return {
        success: true,
        data: { instances: results || [] },
      };
    } catch (error: any) {
      logger.error('Failed to start instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start a single instance (convenience wrapper)
   */
  async startInstance(instanceId: string): Promise<OperationResult> {
    return this.startInstances([instanceId]);
  }

  /**
   * Stop instances
   */
  async stopInstances(instanceIds: string[], force?: boolean): Promise<OperationResult> {
    try {
      const command = new StopInstancesCommand({
        InstanceIds: instanceIds,
        Force: force,
      });

      const response = await this.client.send(command);

      const results = response.StoppingInstances?.map((i) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return {
        success: true,
        data: { instances: results || [] },
      };
    } catch (error: any) {
      logger.error('Failed to stop instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stop a single instance (convenience wrapper)
   */
  async stopInstance(instanceId: string, force?: boolean): Promise<OperationResult> {
    return this.stopInstances([instanceId], force);
  }

  /**
   * Reboot instances
   */
  async rebootInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const command = new RebootInstancesCommand({
        InstanceIds: instanceIds,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Reboot initiated for instances: ${instanceIds.join(', ')}` },
      };
    } catch (error: any) {
      logger.error('Failed to reboot instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Terminate instances
   */
  async terminateInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const command = new TerminateInstancesCommand({
        InstanceIds: instanceIds,
      });

      const response = await this.client.send(command);

      const results = response.TerminatingInstances?.map((i) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return {
        success: true,
        data: { instances: results || [] },
      };
    } catch (error: any) {
      logger.error('Failed to terminate instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Terminate a single instance (convenience wrapper)
   */
  async terminateInstance(instanceId: string): Promise<OperationResult> {
    return this.terminateInstances([instanceId]);
  }

  /**
   * Run (launch) new instances
   */
  async runInstances(options: RunInstanceOptions): Promise<OperationResult> {
    try {
      const input: RunInstancesCommandInput = {
        ImageId: options.imageId,
        InstanceType: options.instanceType as any,
        MinCount: options.minCount || 1,
        MaxCount: options.maxCount || 1,
      };

      if (options.keyName) {
        input.KeyName = options.keyName;
      }

      if (options.securityGroupIds) {
        input.SecurityGroupIds = options.securityGroupIds;
      }

      if (options.subnetId) {
        input.SubnetId = options.subnetId;
      }

      if (options.userData) {
        input.UserData = Buffer.from(options.userData).toString('base64');
      }

      if (options.ebsOptimized) {
        input.EbsOptimized = options.ebsOptimized;
      }

      if (options.monitoring) {
        input.Monitoring = { Enabled: options.monitoring };
      }

      if (options.tags) {
        input.TagSpecifications = [
          {
            ResourceType: 'instance',
            Tags: Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value })),
          },
        ];
      }

      const command = new RunInstancesCommand(input);
      const response = await this.client.send(command);

      const instances = response.Instances?.map((i) => ({
        instanceId: i.InstanceId,
        instanceType: i.InstanceType,
        state: i.State?.Name,
        privateIpAddress: i.PrivateIpAddress,
        launchTime: i.LaunchTime,
      }));

      return {
        success: true,
        data: { instances: instances || [] },
      };
    } catch (error: any) {
      logger.error('Failed to run instances', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create tags for resources
   */
  async createTags(
    resourceIds: string[],
    tags: Record<string, string>
  ): Promise<OperationResult> {
    try {
      const command = new CreateTagsCommand({
        Resources: resourceIds,
        Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Tags created for resources: ${resourceIds.join(', ')}` },
      };
    } catch (error: any) {
      logger.error('Failed to create tags', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List regions
   */
  async listRegions(): Promise<OperationResult> {
    try {
      const command = new DescribeRegionsCommand({});
      const response = await this.client.send(command);

      const regions = response.Regions?.map((r) => ({
        regionName: r.RegionName,
        endpoint: r.Endpoint,
      }));

      return {
        success: true,
        data: { regions: regions || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list regions', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List availability zones
   */
  async listAvailabilityZones(): Promise<OperationResult> {
    try {
      const command = new DescribeAvailabilityZonesCommand({});
      const response = await this.client.send(command);

      const zones = response.AvailabilityZones?.map((z) => ({
        zoneName: z.ZoneName,
        zoneId: z.ZoneId,
        state: z.State,
        regionName: z.RegionName,
      }));

      return {
        success: true,
        data: { availabilityZones: zones || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list availability zones', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List security groups
   */
  async listSecurityGroups(vpcId?: string): Promise<OperationResult> {
    try {
      const input: any = {};
      if (vpcId) {
        input.Filters = [{ Name: 'vpc-id', Values: [vpcId] }];
      }

      const command = new DescribeSecurityGroupsCommand(input);
      const response = await this.client.send(command);

      const groups = response.SecurityGroups?.map((g) => ({
        groupId: g.GroupId,
        groupName: g.GroupName,
        description: g.Description,
        vpcId: g.VpcId,
      }));

      return {
        success: true,
        data: { securityGroups: groups || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list security groups', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Describe security groups with flexible filters
   */
  async describeSecurityGroups(filters?: Record<string, string[]>): Promise<OperationResult> {
    try {
      const input: any = {};

      if (filters) {
        input.Filters = Object.entries(filters).map(([name, values]): Filter => ({
          Name: name,
          Values: values,
        }));
      }

      const command = new DescribeSecurityGroupsCommand(input);
      const response = await this.client.send(command);

      const groups = response.SecurityGroups?.map((g) => ({
        groupId: g.GroupId,
        groupName: g.GroupName,
        description: g.Description,
        vpcId: g.VpcId,
        ownerId: g.OwnerId,
        inboundRules: g.IpPermissions?.map((p) => ({
          protocol: p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          ipRanges: p.IpRanges?.map((r) => ({
            cidr: r.CidrIp,
            description: r.Description,
          })),
          ipv6Ranges: p.Ipv6Ranges?.map((r) => ({
            cidr: r.CidrIpv6,
            description: r.Description,
          })),
          securityGroups: p.UserIdGroupPairs?.map((sg) => ({
            groupId: sg.GroupId,
            userId: sg.UserId,
          })),
        })),
        outboundRules: g.IpPermissionsEgress?.map((p) => ({
          protocol: p.IpProtocol,
          fromPort: p.FromPort,
          toPort: p.ToPort,
          ipRanges: p.IpRanges?.map((r) => ({
            cidr: r.CidrIp,
            description: r.Description,
          })),
        })),
        tags: g.Tags?.reduce(
          (acc, tag) => {
            if (tag.Key) acc[tag.Key] = tag.Value || '';
            return acc;
          },
          {} as Record<string, string>
        ),
      }));

      return {
        success: true,
        data: { securityGroups: groups || [] },
      };
    } catch (error: any) {
      logger.error('Failed to describe security groups', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Modify an instance attribute
   */
  async modifyInstanceAttribute(
    instanceId: string,
    attribute: string,
    value: string
  ): Promise<OperationResult> {
    try {
      const input: any = {
        InstanceId: instanceId,
      };

      // Map common attribute names to the SDK command input fields
      switch (attribute) {
        case 'instanceType':
          input.InstanceType = { Value: value };
          break;
        case 'userData':
          input.UserData = { Value: Buffer.from(value).toString('base64') };
          break;
        case 'disableApiTermination':
          input.DisableApiTermination = { Value: value === 'true' };
          break;
        case 'instanceInitiatedShutdownBehavior':
          input.InstanceInitiatedShutdownBehavior = { Value: value };
          break;
        case 'sourceDestCheck':
          input.SourceDestCheck = { Value: value === 'true' };
          break;
        case 'ebsOptimized':
          input.EbsOptimized = { Value: value === 'true' };
          break;
        case 'enaSupport':
          input.EnaSupport = { Value: value === 'true' };
          break;
        case 'sriovNetSupport':
          input.SriovNetSupport = { Value: value };
          break;
        default:
          return {
            success: false,
            error: `Unsupported attribute: ${attribute}. Supported: instanceType, userData, disableApiTermination, instanceInitiatedShutdownBehavior, sourceDestCheck, ebsOptimized, enaSupport, sriovNetSupport`,
          };
      }

      const command = new ModifyInstanceAttributeCommand(input);
      await this.client.send(command);

      return {
        success: true,
        data: {
          message: `Attribute '${attribute}' modified for instance ${instanceId}`,
          instanceId,
          attribute,
          value,
        },
      };
    } catch (error: any) {
      logger.error('Failed to modify instance attribute', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List VPCs
   */
  async listVpcs(): Promise<OperationResult> {
    try {
      const command = new DescribeVpcsCommand({});
      const response = await this.client.send(command);

      const vpcs = response.Vpcs?.map((v) => ({
        vpcId: v.VpcId,
        cidrBlock: v.CidrBlock,
        state: v.State,
        isDefault: v.IsDefault,
        tags: v.Tags?.reduce(
          (acc, tag) => {
            if (tag.Key) acc[tag.Key] = tag.Value || '';
            return acc;
          },
          {} as Record<string, string>
        ),
      }));

      return {
        success: true,
        data: { vpcs: vpcs || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list VPCs', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List subnets
   */
  async listSubnets(vpcId?: string): Promise<OperationResult> {
    try {
      const input: any = {};
      if (vpcId) {
        input.Filters = [{ Name: 'vpc-id', Values: [vpcId] }];
      }

      const command = new DescribeSubnetsCommand(input);
      const response = await this.client.send(command);

      const subnets = response.Subnets?.map((s) => ({
        subnetId: s.SubnetId,
        vpcId: s.VpcId,
        cidrBlock: s.CidrBlock,
        availabilityZone: s.AvailabilityZone,
        availableIpAddressCount: s.AvailableIpAddressCount,
        defaultForAz: s.DefaultForAz,
        tags: s.Tags?.reduce(
          (acc, tag) => {
            if (tag.Key) acc[tag.Key] = tag.Value || '';
            return acc;
          },
          {} as Record<string, string>
        ),
      }));

      return {
        success: true,
        data: { subnets: subnets || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list subnets', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List AMIs
   */
  async listImages(
    owners?: string[],
    imageIds?: string[],
    filters?: Record<string, string[]>
  ): Promise<OperationResult> {
    try {
      const input: any = {};

      if (owners) {
        input.Owners = owners;
      }

      if (imageIds) {
        input.ImageIds = imageIds;
      }

      if (filters) {
        input.Filters = Object.entries(filters).map(([name, values]) => ({
          Name: name,
          Values: values,
        }));
      }

      const command = new DescribeImagesCommand(input);
      const response = await this.client.send(command);

      const images = response.Images?.slice(0, 50).map((i) => ({
        imageId: i.ImageId,
        name: i.Name,
        description: i.Description,
        state: i.State,
        architecture: i.Architecture,
        platform: i.PlatformDetails,
        creationDate: i.CreationDate,
        ownerId: i.OwnerId,
      }));

      return {
        success: true,
        data: { images: images || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list images', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
