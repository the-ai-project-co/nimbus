import {
  IAMClient,
  ListUsersCommand,
  ListRolesCommand,
  ListGroupsCommand,
  ListPoliciesCommand,
  GetUserCommand,
  GetRoleCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListAttachedUserPoliciesCommand,
  ListAttachedRolePoliciesCommand,
  ListGroupsForUserCommand,
  ListRolePoliciesCommand,
  CreateUserCommand,
  DeleteUserCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  AttachUserPolicyCommand,
  DetachUserPolicyCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  ListAccessKeysCommand,
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  type ListUsersCommandInput,
  type ListRolesCommandInput,
} from '@aws-sdk/client-iam';
import { logger } from '@nimbus/shared-utils';

export interface IAMConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface ListOptions {
  maxItems?: number;
  marker?: string;
  pathPrefix?: string;
}

export interface CreateRoleOptions {
  roleName: string;
  assumeRolePolicyDocument: string;
  description?: string;
  path?: string;
  maxSessionDuration?: number;
  tags?: Record<string, string>;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * IAM operations using AWS SDK
 */
export class IAMOperations {
  private client: IAMClient;

  constructor(config: IAMConfig = {}) {
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

    this.client = new IAMClient(clientConfig);
  }

  /**
   * List IAM users
   */
  async listUsers(options: ListOptions = {}): Promise<OperationResult> {
    try {
      const input: ListUsersCommandInput = {};

      if (options.maxItems) {
        input.MaxItems = options.maxItems;
      }

      if (options.marker) {
        input.Marker = options.marker;
      }

      if (options.pathPrefix) {
        input.PathPrefix = options.pathPrefix;
      }

      const command = new ListUsersCommand(input);
      const response = await this.client.send(command);

      const users = response.Users?.map((u) => ({
        userName: u.UserName,
        userId: u.UserId,
        arn: u.Arn,
        path: u.Path,
        createDate: u.CreateDate,
        passwordLastUsed: u.PasswordLastUsed,
      }));

      return {
        success: true,
        data: {
          users: users || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list users', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get IAM user details
   */
  async getUser(userName: string): Promise<OperationResult> {
    try {
      const command = new GetUserCommand({ UserName: userName });
      const response = await this.client.send(command);

      const user = response.User;

      return {
        success: true,
        data: {
          userName: user?.UserName,
          userId: user?.UserId,
          arn: user?.Arn,
          path: user?.Path,
          createDate: user?.CreateDate,
          passwordLastUsed: user?.PasswordLastUsed,
          tags: user?.Tags?.reduce(
            (acc, tag) => {
              if (tag.Key) acc[tag.Key] = tag.Value || '';
              return acc;
            },
            {} as Record<string, string>
          ),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get user', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create IAM user
   */
  async createUser(userName: string, path?: string, tags?: Record<string, string>): Promise<OperationResult> {
    try {
      const command = new CreateUserCommand({
        UserName: userName,
        Path: path,
        Tags: tags ? Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) : undefined,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          userName: response.User?.UserName,
          userId: response.User?.UserId,
          arn: response.User?.Arn,
        },
      };
    } catch (error: any) {
      logger.error('Failed to create user', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete IAM user
   */
  async deleteUser(userName: string): Promise<OperationResult> {
    try {
      const command = new DeleteUserCommand({ UserName: userName });
      await this.client.send(command);

      return {
        success: true,
        data: { message: `User ${userName} deleted` },
      };
    } catch (error: any) {
      logger.error('Failed to delete user', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List IAM roles
   */
  async listRoles(options: ListOptions = {}): Promise<OperationResult> {
    try {
      const input: ListRolesCommandInput = {};

      if (options.maxItems) {
        input.MaxItems = options.maxItems;
      }

      if (options.marker) {
        input.Marker = options.marker;
      }

      if (options.pathPrefix) {
        input.PathPrefix = options.pathPrefix;
      }

      const command = new ListRolesCommand(input);
      const response = await this.client.send(command);

      const roles = response.Roles?.map((r) => ({
        roleName: r.RoleName,
        roleId: r.RoleId,
        arn: r.Arn,
        path: r.Path,
        createDate: r.CreateDate,
        description: r.Description,
        maxSessionDuration: r.MaxSessionDuration,
      }));

      return {
        success: true,
        data: {
          roles: roles || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list roles', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get IAM role details
   */
  async getRole(roleName: string): Promise<OperationResult> {
    try {
      const command = new GetRoleCommand({ RoleName: roleName });
      const response = await this.client.send(command);

      const role = response.Role;

      return {
        success: true,
        data: {
          roleName: role?.RoleName,
          roleId: role?.RoleId,
          arn: role?.Arn,
          path: role?.Path,
          createDate: role?.CreateDate,
          description: role?.Description,
          maxSessionDuration: role?.MaxSessionDuration,
          assumeRolePolicyDocument: role?.AssumeRolePolicyDocument
            ? decodeURIComponent(role.AssumeRolePolicyDocument)
            : undefined,
          tags: role?.Tags?.reduce(
            (acc, tag) => {
              if (tag.Key) acc[tag.Key] = tag.Value || '';
              return acc;
            },
            {} as Record<string, string>
          ),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get role', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create IAM role
   */
  async createRole(options: CreateRoleOptions): Promise<OperationResult> {
    try {
      const command = new CreateRoleCommand({
        RoleName: options.roleName,
        AssumeRolePolicyDocument: options.assumeRolePolicyDocument,
        Description: options.description,
        Path: options.path,
        MaxSessionDuration: options.maxSessionDuration,
        Tags: options.tags
          ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
          : undefined,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          roleName: response.Role?.RoleName,
          roleId: response.Role?.RoleId,
          arn: response.Role?.Arn,
        },
      };
    } catch (error: any) {
      logger.error('Failed to create role', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete IAM role
   */
  async deleteRole(roleName: string): Promise<OperationResult> {
    try {
      const command = new DeleteRoleCommand({ RoleName: roleName });
      await this.client.send(command);

      return {
        success: true,
        data: { message: `Role ${roleName} deleted` },
      };
    } catch (error: any) {
      logger.error('Failed to delete role', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List IAM groups
   */
  async listGroups(options: ListOptions = {}): Promise<OperationResult> {
    try {
      const command = new ListGroupsCommand({
        MaxItems: options.maxItems,
        Marker: options.marker,
        PathPrefix: options.pathPrefix,
      });

      const response = await this.client.send(command);

      const groups = response.Groups?.map((g) => ({
        groupName: g.GroupName,
        groupId: g.GroupId,
        arn: g.Arn,
        path: g.Path,
        createDate: g.CreateDate,
      }));

      return {
        success: true,
        data: {
          groups: groups || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list groups', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List IAM policies
   */
  async listPolicies(options: ListOptions & { scope?: 'All' | 'AWS' | 'Local'; onlyAttached?: boolean } = {}): Promise<OperationResult> {
    try {
      const command = new ListPoliciesCommand({
        MaxItems: options.maxItems,
        Marker: options.marker,
        PathPrefix: options.pathPrefix,
        Scope: options.scope,
        OnlyAttached: options.onlyAttached,
      });

      const response = await this.client.send(command);

      const policies = response.Policies?.map((p) => ({
        policyName: p.PolicyName,
        policyId: p.PolicyId,
        arn: p.Arn,
        path: p.Path,
        createDate: p.CreateDate,
        updateDate: p.UpdateDate,
        attachmentCount: p.AttachmentCount,
        isAttachable: p.IsAttachable,
        description: p.Description,
      }));

      return {
        success: true,
        data: {
          policies: policies || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list policies', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get IAM policy details
   */
  async getPolicy(policyArn: string): Promise<OperationResult> {
    try {
      const command = new GetPolicyCommand({ PolicyArn: policyArn });
      const response = await this.client.send(command);

      const policy = response.Policy;

      return {
        success: true,
        data: {
          policyName: policy?.PolicyName,
          policyId: policy?.PolicyId,
          arn: policy?.Arn,
          path: policy?.Path,
          createDate: policy?.CreateDate,
          updateDate: policy?.UpdateDate,
          attachmentCount: policy?.AttachmentCount,
          defaultVersionId: policy?.DefaultVersionId,
          isAttachable: policy?.IsAttachable,
          description: policy?.Description,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get policy', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get policy version (document)
   */
  async getPolicyVersion(policyArn: string, versionId: string): Promise<OperationResult> {
    try {
      const command = new GetPolicyVersionCommand({
        PolicyArn: policyArn,
        VersionId: versionId,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          versionId: response.PolicyVersion?.VersionId,
          isDefaultVersion: response.PolicyVersion?.IsDefaultVersion,
          document: response.PolicyVersion?.Document
            ? JSON.parse(decodeURIComponent(response.PolicyVersion.Document))
            : undefined,
          createDate: response.PolicyVersion?.CreateDate,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get policy version', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List policies attached to user
   */
  async listAttachedUserPolicies(userName: string): Promise<OperationResult> {
    try {
      const command = new ListAttachedUserPoliciesCommand({ UserName: userName });
      const response = await this.client.send(command);

      const policies = response.AttachedPolicies?.map((p) => ({
        policyName: p.PolicyName,
        policyArn: p.PolicyArn,
      }));

      return {
        success: true,
        data: { attachedPolicies: policies || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list attached user policies', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List policies attached to role
   */
  async listAttachedRolePolicies(roleName: string): Promise<OperationResult> {
    try {
      const command = new ListAttachedRolePoliciesCommand({ RoleName: roleName });
      const response = await this.client.send(command);

      const policies = response.AttachedPolicies?.map((p) => ({
        policyName: p.PolicyName,
        policyArn: p.PolicyArn,
      }));

      return {
        success: true,
        data: { attachedPolicies: policies || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list attached role policies', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List inline policies attached to role
   */
  async listRolePolicies(roleName: string): Promise<OperationResult> {
    try {
      const command = new ListRolePoliciesCommand({ RoleName: roleName });
      const response = await this.client.send(command);

      return {
        success: true,
        data: { policyNames: response.PolicyNames || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list role policies', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List groups for user
   */
  async listUserGroups(userName: string): Promise<OperationResult> {
    try {
      const command = new ListGroupsForUserCommand({ UserName: userName });
      const response = await this.client.send(command);

      const groups = response.Groups?.map((g: any) => ({
        groupName: g.GroupName,
        groupId: g.GroupId,
        arn: g.Arn,
      }));

      return {
        success: true,
        data: { groups: groups || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list user groups', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Attach policy to user
   */
  async attachUserPolicy(userName: string, policyArn: string): Promise<OperationResult> {
    try {
      const command = new AttachUserPolicyCommand({
        UserName: userName,
        PolicyArn: policyArn,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} attached to user ${userName}` },
      };
    } catch (error: any) {
      logger.error('Failed to attach user policy', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detach policy from user
   */
  async detachUserPolicy(userName: string, policyArn: string): Promise<OperationResult> {
    try {
      const command = new DetachUserPolicyCommand({
        UserName: userName,
        PolicyArn: policyArn,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} detached from user ${userName}` },
      };
    } catch (error: any) {
      logger.error('Failed to detach user policy', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Attach policy to role
   */
  async attachRolePolicy(roleName: string, policyArn: string): Promise<OperationResult> {
    try {
      const command = new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} attached to role ${roleName}` },
      };
    } catch (error: any) {
      logger.error('Failed to attach role policy', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detach policy from role
   */
  async detachRolePolicy(roleName: string, policyArn: string): Promise<OperationResult> {
    try {
      const command = new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} detached from role ${roleName}` },
      };
    } catch (error: any) {
      logger.error('Failed to detach role policy', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List access keys for user
   */
  async listAccessKeys(userName: string): Promise<OperationResult> {
    try {
      const command = new ListAccessKeysCommand({ UserName: userName });
      const response = await this.client.send(command);

      const accessKeys = response.AccessKeyMetadata?.map((k) => ({
        accessKeyId: k.AccessKeyId,
        status: k.Status,
        createDate: k.CreateDate,
      }));

      return {
        success: true,
        data: { accessKeys: accessKeys || [] },
      };
    } catch (error: any) {
      logger.error('Failed to list access keys', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create access key for user
   */
  async createAccessKey(userName: string): Promise<OperationResult> {
    try {
      const command = new CreateAccessKeyCommand({ UserName: userName });
      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          accessKeyId: response.AccessKey?.AccessKeyId,
          secretAccessKey: response.AccessKey?.SecretAccessKey,
          status: response.AccessKey?.Status,
          createDate: response.AccessKey?.CreateDate,
        },
      };
    } catch (error: any) {
      logger.error('Failed to create access key', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete access key for user
   */
  async deleteAccessKey(userName: string, accessKeyId: string): Promise<OperationResult> {
    try {
      const command = new DeleteAccessKeyCommand({
        UserName: userName,
        AccessKeyId: accessKeyId,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Access key ${accessKeyId} deleted for user ${userName}` },
      };
    } catch (error: any) {
      logger.error('Failed to delete access key', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
