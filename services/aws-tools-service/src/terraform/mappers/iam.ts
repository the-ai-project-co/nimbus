/**
 * IAM Resource Mappers
 *
 * Maps IAM resources to Terraform configuration
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
 * IAM Role Mapper
 */
export class IAMRoleMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::Role';
  readonly terraformType = 'aws_iam_role';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Role name
    if (props.roleName) {
      attributes.name = props.roleName as string;
    }

    // Path
    if (props.path && props.path !== '/') {
      attributes.path = props.path as string;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Assume role policy
    if (props.assumeRolePolicyDocument) {
      const policyDoc = typeof props.assumeRolePolicyDocument === 'string'
        ? props.assumeRolePolicyDocument
        : JSON.stringify(props.assumeRolePolicyDocument, null, 2);
      attributes.assume_role_policy = policyDoc;
    }

    // Max session duration
    if (props.maxSessionDuration) {
      attributes.max_session_duration = props.maxSessionDuration as number;
    }

    // Permissions boundary
    if (props.permissionsBoundary) {
      attributes.permissions_boundary = props.permissionsBoundary as string;
    }

    // Managed policy ARNs
    if (props.attachedManagedPolicies && Array.isArray(props.attachedManagedPolicies)) {
      const policyArns = (props.attachedManagedPolicies as Array<{ policyArn?: string }>)
        .map(p => p.policyArn)
        .filter((arn): arn is string => !!arn);
      if (policyArns.length > 0) {
        attributes.managed_policy_arns = policyArns;
      }
    }

    // Inline policies
    if (props.inlinePolicies && Array.isArray(props.inlinePolicies)) {
      const inlineBlocks: TerraformValue[] = [];
      for (const policy of props.inlinePolicies as Array<{ policyName?: string; policyDocument?: unknown }>) {
        if (policy.policyName && policy.policyDocument) {
          const policyDoc = typeof policy.policyDocument === 'string'
            ? policy.policyDocument
            : JSON.stringify(policy.policyDocument, null, 2);
          inlineBlocks.push(this.createBlock({
            name: policy.policyName,
            policy: policyDoc,
          }));
        }
      }
      if (inlineBlocks.length > 0) {
        attributes.inline_policy = inlineBlocks;
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
    return (resource.properties.roleName as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_arn`,
        value: `aws_iam_role.${name}.arn`,
        description: `ARN of IAM role ${resource.properties.roleName || resource.id}`,
      },
      {
        name: `${name}_name`,
        value: `aws_iam_role.${name}.name`,
        description: `Name of IAM role ${resource.properties.roleName || resource.id}`,
      },
    ];
  }
}

/**
 * IAM Policy Mapper
 */
export class IAMPolicyMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::ManagedPolicy';
  readonly terraformType = 'aws_iam_policy';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Policy name
    if (props.policyName) {
      attributes.name = props.policyName as string;
    }

    // Path
    if (props.path && props.path !== '/') {
      attributes.path = props.path as string;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Policy document
    if (props.policyDocument) {
      const policyDoc = typeof props.policyDocument === 'string'
        ? props.policyDocument
        : JSON.stringify(props.policyDocument, null, 2);
      attributes.policy = policyDoc;
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
    return resource.arn || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_arn`,
        value: `aws_iam_policy.${name}.arn`,
        description: `ARN of IAM policy ${resource.properties.policyName || resource.id}`,
      },
    ];
  }
}

/**
 * IAM User Mapper
 */
export class IAMUserMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::User';
  readonly terraformType = 'aws_iam_user';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // User name
    if (props.userName) {
      attributes.name = props.userName as string;
    }

    // Path
    if (props.path && props.path !== '/') {
      attributes.path = props.path as string;
    }

    // Permissions boundary
    if (props.permissionsBoundary) {
      attributes.permissions_boundary = props.permissionsBoundary as string;
    }

    // Force destroy (to handle resources created by user)
    attributes.force_destroy = false;

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
    return (resource.properties.userName as string) || resource.id;
  }
}

/**
 * IAM Group Mapper
 */
export class IAMGroupMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::Group';
  readonly terraformType = 'aws_iam_group';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Group name
    if (props.groupName) {
      attributes.name = props.groupName as string;
    }

    // Path
    if (props.path && props.path !== '/') {
      attributes.path = props.path as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.groupName as string) || resource.id;
  }
}

/**
 * IAM Instance Profile Mapper
 */
export class IAMInstanceProfileMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::InstanceProfile';
  readonly terraformType = 'aws_iam_instance_profile';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Instance profile name
    if (props.instanceProfileName) {
      attributes.name = props.instanceProfileName as string;
    }

    // Path
    if (props.path && props.path !== '/') {
      attributes.path = props.path as string;
    }

    // Role
    if (props.roles && Array.isArray(props.roles)) {
      const roles = props.roles as Array<{ roleName?: string }>;
      if (roles.length > 0 && roles[0].roleName) {
        attributes.role = roles[0].roleName;
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
    return (resource.properties.instanceProfileName as string) || resource.id;
  }
}

/**
 * IAM Role Policy Attachment Mapper
 */
export class IAMRolePolicyAttachmentMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::RolePolicyAttachment';
  readonly terraformType = 'aws_iam_role_policy_attachment';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Role
    if (props.roleName) {
      attributes.role = props.roleName as string;
    }

    // Policy ARN
    if (props.policyArn) {
      attributes.policy_arn = props.policyArn as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    const roleName = resource.properties.roleName as string;
    const policyArn = resource.properties.policyArn as string;
    return `${roleName}/${policyArn}`;
  }
}

/**
 * IAM User Policy Attachment Mapper
 */
export class IAMUserPolicyAttachmentMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::UserPolicyAttachment';
  readonly terraformType = 'aws_iam_user_policy_attachment';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // User
    if (props.userName) {
      attributes.user = props.userName as string;
    }

    // Policy ARN
    if (props.policyArn) {
      attributes.policy_arn = props.policyArn as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    const userName = resource.properties.userName as string;
    const policyArn = resource.properties.policyArn as string;
    return `${userName}/${policyArn}`;
  }
}

/**
 * IAM Group Policy Attachment Mapper
 */
export class IAMGroupPolicyAttachmentMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::IAM::GroupPolicyAttachment';
  readonly terraformType = 'aws_iam_group_policy_attachment';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Group
    if (props.groupName) {
      attributes.group = props.groupName as string;
    }

    // Policy ARN
    if (props.policyArn) {
      attributes.policy_arn = props.policyArn as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    const groupName = resource.properties.groupName as string;
    const policyArn = resource.properties.policyArn as string;
    return `${groupName}/${policyArn}`;
  }
}

/**
 * Get all IAM mappers
 */
export function getIAMMappers(): BaseResourceMapper[] {
  return [
    new IAMRoleMapper(),
    new IAMPolicyMapper(),
    new IAMUserMapper(),
    new IAMGroupMapper(),
    new IAMInstanceProfileMapper(),
    new IAMRolePolicyAttachmentMapper(),
    new IAMUserPolicyAttachmentMapper(),
    new IAMGroupPolicyAttachmentMapper(),
  ];
}
