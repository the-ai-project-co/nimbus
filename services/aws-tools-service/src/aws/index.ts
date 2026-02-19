export { EC2Operations, type EC2Config, type ListInstancesOptions, type RunInstanceOptions } from './ec2';
export { S3Operations, type S3Config, type ListObjectsOptions, type PutObjectOptions, type CopyObjectOptions } from './s3';
export { IAMOperations, type IAMConfig, type ListOptions, type CreateRoleOptions, type CreatePolicyOptions } from './iam';
export { CloudFormationOperations, type CloudFormationConfig, type CreateStackOptions, type UpdateStackOptions } from './cloudformation';

// Common result type
export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
