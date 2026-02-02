/**
 * IAM Scanner
 *
 * Discovers IAM resources including roles, policies, users, groups,
 * and instance profiles. IAM is a global service.
 */

import {
  IAMClient,
  ListRolesCommand,
  ListPoliciesCommand,
  ListUsersCommand,
  ListGroupsCommand,
  ListInstanceProfilesCommand,
  GetRoleCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  ListAttachedUserPoliciesCommand,
  ListUserPoliciesCommand,
  ListAttachedGroupPoliciesCommand,
  ListGroupPoliciesCommand,
  type Role,
  type Policy,
  type User,
  type Group,
  type InstanceProfile,
} from '@aws-sdk/client-iam';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * IAM Scanner - discovers IAM roles, policies, users, groups, and instance profiles
 */
export class IAMScanner extends BaseScanner {
  readonly serviceName = 'IAM';
  readonly isGlobal = true;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    // IAM is global - only scan from us-east-1
    if (context.region !== 'us-east-1') {
      return { resources: [], errors: [] };
    }

    const client = new IAMClient({
      region: 'us-east-1',
      credentials: context.credentials,
    });

    // Scan all IAM resource types in parallel
    const [roles, policies, users, groups, instanceProfiles] = await Promise.all([
      this.scanRoles(client, context),
      this.scanPolicies(client, context),
      this.scanUsers(client, context),
      this.scanGroups(client, context),
      this.scanInstanceProfiles(client, context),
    ]);

    resources.push(...roles, ...policies, ...users, ...groups, ...instanceProfiles);

    logger.debug(`IAM scanner found ${resources.length} resources`, {
      region: 'global',
      roles: roles.length,
      policies: policies.length,
      users: users.length,
      groups: groups.length,
      instanceProfiles: instanceProfiles.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::IAM::Role',
      'AWS::IAM::Policy',
      'AWS::IAM::User',
      'AWS::IAM::Group',
      'AWS::IAM::InstanceProfile',
    ];
  }

  /**
   * Scan IAM roles
   */
  private async scanRoles(
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListRolesCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Roles) {
          const rolePromises = response.Roles.map(role =>
            this.processRole(role, client, context)
          );

          const results = await Promise.allSettled(rolePromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListRoles', error.message, 'global', error.code);
    }

    return resources;
  }

  /**
   * Process a single IAM role with details
   */
  private async processRole(
    role: Role,
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!role.RoleName || !role.Arn) return null;

    const relationships: ResourceRelationship[] = [];

    // Get attached managed policies
    let attachedPolicies: string[] = [];
    try {
      const attachedCommand = new ListAttachedRolePoliciesCommand({
        RoleName: role.RoleName,
      });
      const attachedResponse = await this.withRateLimit(context, () => client.send(attachedCommand));

      if (attachedResponse.AttachedPolicies) {
        attachedPolicies = attachedResponse.AttachedPolicies
          .map(p => p.PolicyArn)
          .filter((arn): arn is string => !!arn);

        for (const policyArn of attachedPolicies) {
          relationships.push({
            type: 'references',
            targetArn: policyArn,
            targetType: 'aws_iam_policy',
          });
        }
      }
    } catch {
      // Continue without attached policies
    }

    // Get inline policies
    let inlinePolicies: string[] = [];
    try {
      const inlineCommand = new ListRolePoliciesCommand({
        RoleName: role.RoleName,
      });
      const inlineResponse = await this.withRateLimit(context, () => client.send(inlineCommand));
      inlinePolicies = inlineResponse.PolicyNames || [];
    } catch {
      // Continue without inline policies
    }

    // Parse assume role policy document
    let assumeRolePolicyDocument: unknown;
    if (role.AssumeRolePolicyDocument) {
      try {
        assumeRolePolicyDocument = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
      } catch {
        assumeRolePolicyDocument = role.AssumeRolePolicyDocument;
      }
    }

    return this.createResource({
      id: role.RoleName,
      arn: role.Arn,
      awsType: 'AWS::IAM::Role',
      region: 'global',
      name: role.RoleName,
      tags: this.tagsToRecord(role.Tags),
      properties: {
        path: role.Path,
        roleId: role.RoleId,
        description: role.Description,
        assumeRolePolicyDocument,
        maxSessionDuration: role.MaxSessionDuration,
        permissionsBoundary: role.PermissionsBoundary?.PermissionsBoundaryArn,
        attachedPolicies,
        inlinePolicies,
        lastUsed: role.RoleLastUsed
          ? {
              lastUsedDate: role.RoleLastUsed.LastUsedDate,
              region: role.RoleLastUsed.Region,
            }
          : undefined,
      },
      relationships,
      createdAt: role.CreateDate,
    });
  }

  /**
   * Scan IAM policies (customer managed only)
   */
  private async scanPolicies(
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListPoliciesCommand({
          Marker: marker,
          MaxItems: 100,
          Scope: 'Local', // Only customer managed policies
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Policies) {
          const policyPromises = response.Policies.map(policy =>
            this.processPolicy(policy, client, context)
          );

          const results = await Promise.allSettled(policyPromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListPolicies', error.message, 'global', error.code);
    }

    return resources;
  }

  /**
   * Process a single IAM policy with details
   */
  private async processPolicy(
    policy: Policy,
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!policy.PolicyName || !policy.Arn) return null;

    // Get the default policy version document
    let policyDocument: unknown;
    if (policy.DefaultVersionId) {
      try {
        const versionCommand = new GetPolicyVersionCommand({
          PolicyArn: policy.Arn,
          VersionId: policy.DefaultVersionId,
        });
        const versionResponse = await this.withRateLimit(context, () => client.send(versionCommand));

        if (versionResponse.PolicyVersion?.Document) {
          policyDocument = JSON.parse(decodeURIComponent(versionResponse.PolicyVersion.Document));
        }
      } catch {
        // Continue without policy document
      }
    }

    return this.createResource({
      id: policy.PolicyName,
      arn: policy.Arn,
      awsType: 'AWS::IAM::Policy',
      region: 'global',
      name: policy.PolicyName,
      tags: this.tagsToRecord(policy.Tags),
      properties: {
        path: policy.Path,
        policyId: policy.PolicyId,
        description: policy.Description,
        defaultVersionId: policy.DefaultVersionId,
        attachmentCount: policy.AttachmentCount,
        permissionsBoundaryUsageCount: policy.PermissionsBoundaryUsageCount,
        isAttachable: policy.IsAttachable,
        policyDocument,
      },
      relationships: [],
      createdAt: policy.CreateDate,
    });
  }

  /**
   * Scan IAM users
   */
  private async scanUsers(
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListUsersCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Users) {
          const userPromises = response.Users.map(user =>
            this.processUser(user, client, context)
          );

          const results = await Promise.allSettled(userPromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListUsers', error.message, 'global', error.code);
    }

    return resources;
  }

  /**
   * Process a single IAM user with details
   */
  private async processUser(
    user: User,
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!user.UserName || !user.Arn) return null;

    const relationships: ResourceRelationship[] = [];

    // Get attached managed policies
    let attachedPolicies: string[] = [];
    try {
      const attachedCommand = new ListAttachedUserPoliciesCommand({
        UserName: user.UserName,
      });
      const attachedResponse = await this.withRateLimit(context, () => client.send(attachedCommand));

      if (attachedResponse.AttachedPolicies) {
        attachedPolicies = attachedResponse.AttachedPolicies
          .map(p => p.PolicyArn)
          .filter((arn): arn is string => !!arn);

        for (const policyArn of attachedPolicies) {
          relationships.push({
            type: 'references',
            targetArn: policyArn,
            targetType: 'aws_iam_policy',
          });
        }
      }
    } catch {
      // Continue without attached policies
    }

    // Get inline policies
    let inlinePolicies: string[] = [];
    try {
      const inlineCommand = new ListUserPoliciesCommand({
        UserName: user.UserName,
      });
      const inlineResponse = await this.withRateLimit(context, () => client.send(inlineCommand));
      inlinePolicies = inlineResponse.PolicyNames || [];
    } catch {
      // Continue without inline policies
    }

    return this.createResource({
      id: user.UserName,
      arn: user.Arn,
      awsType: 'AWS::IAM::User',
      region: 'global',
      name: user.UserName,
      tags: this.tagsToRecord(user.Tags),
      properties: {
        path: user.Path,
        userId: user.UserId,
        passwordLastUsed: user.PasswordLastUsed,
        permissionsBoundary: user.PermissionsBoundary?.PermissionsBoundaryArn,
        attachedPolicies,
        inlinePolicies,
      },
      relationships,
      createdAt: user.CreateDate,
    });
  }

  /**
   * Scan IAM groups
   */
  private async scanGroups(
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListGroupsCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Groups) {
          const groupPromises = response.Groups.map(group =>
            this.processGroup(group, client, context)
          );

          const results = await Promise.allSettled(groupPromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListGroups', error.message, 'global', error.code);
    }

    return resources;
  }

  /**
   * Process a single IAM group with details
   */
  private async processGroup(
    group: Group,
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!group.GroupName || !group.Arn) return null;

    const relationships: ResourceRelationship[] = [];

    // Get attached managed policies
    let attachedPolicies: string[] = [];
    try {
      const attachedCommand = new ListAttachedGroupPoliciesCommand({
        GroupName: group.GroupName,
      });
      const attachedResponse = await this.withRateLimit(context, () => client.send(attachedCommand));

      if (attachedResponse.AttachedPolicies) {
        attachedPolicies = attachedResponse.AttachedPolicies
          .map(p => p.PolicyArn)
          .filter((arn): arn is string => !!arn);

        for (const policyArn of attachedPolicies) {
          relationships.push({
            type: 'references',
            targetArn: policyArn,
            targetType: 'aws_iam_policy',
          });
        }
      }
    } catch {
      // Continue without attached policies
    }

    // Get inline policies
    let inlinePolicies: string[] = [];
    try {
      const inlineCommand = new ListGroupPoliciesCommand({
        GroupName: group.GroupName,
      });
      const inlineResponse = await this.withRateLimit(context, () => client.send(inlineCommand));
      inlinePolicies = inlineResponse.PolicyNames || [];
    } catch {
      // Continue without inline policies
    }

    return this.createResource({
      id: group.GroupName,
      arn: group.Arn,
      awsType: 'AWS::IAM::Group',
      region: 'global',
      name: group.GroupName,
      tags: {},
      properties: {
        path: group.Path,
        groupId: group.GroupId,
        attachedPolicies,
        inlinePolicies,
      },
      relationships,
      createdAt: group.CreateDate,
    });
  }

  /**
   * Scan IAM instance profiles
   */
  private async scanInstanceProfiles(
    client: IAMClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListInstanceProfilesCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.InstanceProfiles) {
          for (const profile of response.InstanceProfiles) {
            const resource = this.mapInstanceProfile(profile, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListInstanceProfiles', error.message, 'global', error.code);
    }

    return resources;
  }

  /**
   * Map an instance profile to a DiscoveredResource
   */
  private mapInstanceProfile(
    profile: InstanceProfile,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!profile.InstanceProfileName || !profile.Arn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add role relationships
    if (profile.Roles) {
      for (const role of profile.Roles) {
        if (role.Arn) {
          relationships.push({
            type: 'contains',
            targetArn: role.Arn,
            targetType: 'aws_iam_role',
          });
        }
      }
    }

    return this.createResource({
      id: profile.InstanceProfileName,
      arn: profile.Arn,
      awsType: 'AWS::IAM::InstanceProfile',
      region: 'global',
      name: profile.InstanceProfileName,
      tags: this.tagsToRecord(profile.Tags),
      properties: {
        path: profile.Path,
        instanceProfileId: profile.InstanceProfileId,
        roles: profile.Roles?.map(r => ({
          name: r.RoleName,
          arn: r.Arn,
        })),
      },
      relationships,
      createdAt: profile.CreateDate,
    });
  }
}
