import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  type Parameter,
  type Capability,
  type StackStatus,
} from '@aws-sdk/client-cloudformation';
import { logger } from '@nimbus/shared-utils';

export interface CloudFormationConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface CreateStackOptions {
  stackName: string;
  templateBody: string;
  parameters?: Record<string, string>;
  capabilities?: string[];
  tags?: Record<string, string>;
  timeoutInMinutes?: number;
  onFailure?: 'DO_NOTHING' | 'ROLLBACK' | 'DELETE';
}

export interface UpdateStackOptions {
  stackName: string;
  templateBody: string;
  parameters?: Record<string, string>;
  capabilities?: string[];
  tags?: Record<string, string>;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * CloudFormation operations using AWS SDK
 */
export class CloudFormationOperations {
  private client: CloudFormationClient;

  constructor(config: CloudFormationConfig = {}) {
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

    this.client = new CloudFormationClient(clientConfig);
  }

  /**
   * Convert a key-value record to CloudFormation Parameter array
   */
  private toParameters(params?: Record<string, string>): Parameter[] | undefined {
    if (!params) return undefined;
    return Object.entries(params).map(([key, value]) => ({
      ParameterKey: key,
      ParameterValue: value,
    }));
  }

  /**
   * Create a CloudFormation stack
   */
  async createStack(options: CreateStackOptions): Promise<OperationResult> {
    try {
      const command = new CreateStackCommand({
        StackName: options.stackName,
        TemplateBody: options.templateBody,
        Parameters: this.toParameters(options.parameters),
        Capabilities: options.capabilities as Capability[],
        Tags: options.tags
          ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
          : undefined,
        TimeoutInMinutes: options.timeoutInMinutes,
        OnFailure: options.onFailure,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          stackId: response.StackId,
          stackName: options.stackName,
        },
      };
    } catch (error: any) {
      logger.error('Failed to create stack', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update a CloudFormation stack
   */
  async updateStack(options: UpdateStackOptions): Promise<OperationResult> {
    try {
      const command = new UpdateStackCommand({
        StackName: options.stackName,
        TemplateBody: options.templateBody,
        Parameters: this.toParameters(options.parameters),
        Capabilities: options.capabilities as Capability[],
        Tags: options.tags
          ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
          : undefined,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          stackId: response.StackId,
          stackName: options.stackName,
        },
      };
    } catch (error: any) {
      logger.error('Failed to update stack', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a CloudFormation stack
   */
  async deleteStack(stackName: string): Promise<OperationResult> {
    try {
      const command = new DeleteStackCommand({
        StackName: stackName,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Stack ${stackName} deletion initiated` },
      };
    } catch (error: any) {
      logger.error('Failed to delete stack', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Describe CloudFormation stacks
   * If stackName is provided, returns details for that specific stack.
   * Otherwise, returns all stacks.
   */
  async describeStacks(stackName?: string): Promise<OperationResult> {
    try {
      const command = new DescribeStacksCommand(
        stackName ? { StackName: stackName } : {}
      );

      const response = await this.client.send(command);

      const stacks = response.Stacks?.map((s) => ({
        stackId: s.StackId,
        stackName: s.StackName,
        description: s.Description,
        stackStatus: s.StackStatus,
        stackStatusReason: s.StackStatusReason,
        creationTime: s.CreationTime,
        lastUpdatedTime: s.LastUpdatedTime,
        deletionTime: s.DeletionTime,
        parameters: s.Parameters?.map((p) => ({
          key: p.ParameterKey,
          value: p.ParameterValue,
        })),
        outputs: s.Outputs?.map((o) => ({
          key: o.OutputKey,
          value: o.OutputValue,
          description: o.Description,
          exportName: o.ExportName,
        })),
        capabilities: s.Capabilities,
        tags: s.Tags?.reduce(
          (acc, tag) => {
            if (tag.Key) acc[tag.Key] = tag.Value || '';
            return acc;
          },
          {} as Record<string, string>
        ),
        enableTerminationProtection: s.EnableTerminationProtection,
        roleArn: s.RoleARN,
      }));

      return {
        success: true,
        data: { stacks: stacks || [] },
      };
    } catch (error: any) {
      logger.error('Failed to describe stacks', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List CloudFormation stacks with optional status filter
   */
  async listStacks(statusFilter?: string[]): Promise<OperationResult> {
    try {
      const command = new ListStacksCommand({
        StackStatusFilter: statusFilter as StackStatus[],
      });

      const response = await this.client.send(command);

      const stacks = response.StackSummaries?.map((s) => ({
        stackId: s.StackId,
        stackName: s.StackName,
        templateDescription: s.TemplateDescription,
        stackStatus: s.StackStatus,
        stackStatusReason: s.StackStatusReason,
        creationTime: s.CreationTime,
        lastUpdatedTime: s.LastUpdatedTime,
        deletionTime: s.DeletionTime,
        driftStatus: s.DriftInformation?.StackDriftStatus,
        lastCheckTimestamp: s.DriftInformation?.LastCheckTimestamp,
      }));

      return {
        success: true,
        data: { stacks: stacks || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list stacks', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
