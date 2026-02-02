/**
 * Service Scanners Index
 *
 * Exports all service scanners and provides factory functions
 */

export * from './base';
export * from './tagging';
export * from './ec2';
export * from './s3';
export * from './rds';
export * from './lambda';
export * from './vpc';
export * from './iam';
export * from './ecs-eks';
export * from './dynamodb';
export * from './cloudfront';

import { ScannerRegistry, type ServiceScanner } from './base';
import { TaggingScanner } from './tagging';
import { EC2Scanner } from './ec2';
import { S3Scanner } from './s3';
import { RDSScanner } from './rds';
import { LambdaScanner } from './lambda';
import { VPCScanner } from './vpc';
import { IAMScanner } from './iam';
import { ECSEKSScanner } from './ecs-eks';
import { DynamoDBScanner } from './dynamodb';
import { CloudFrontScanner } from './cloudfront';

/**
 * Create a scanner registry with all available scanners
 */
export function createScannerRegistry(): ScannerRegistry {
  const registry = new ScannerRegistry();

  // Register all scanners
  registry.register(new TaggingScanner());
  registry.register(new EC2Scanner());
  registry.register(new S3Scanner());
  registry.register(new RDSScanner());
  registry.register(new LambdaScanner());
  registry.register(new VPCScanner());
  registry.register(new IAMScanner());
  registry.register(new ECSEKSScanner());
  registry.register(new DynamoDBScanner());
  registry.register(new CloudFrontScanner());

  return registry;
}

/**
 * Get a scanner by service name
 */
export function getScanner(serviceName: string): ServiceScanner | undefined {
  const registry = createScannerRegistry();
  return registry.get(serviceName);
}

/**
 * Get all available scanners
 */
export function getAllScanners(): ServiceScanner[] {
  const registry = createScannerRegistry();
  return registry.getAll();
}

/**
 * Map of service names to their scanner classes
 */
export const SERVICE_SCANNER_MAP: Record<string, new () => ServiceScanner> = {
  Tagging: TaggingScanner,
  EC2: EC2Scanner,
  S3: S3Scanner,
  RDS: RDSScanner,
  Lambda: LambdaScanner,
  VPC: VPCScanner,
  IAM: IAMScanner,
  ECS: ECSEKSScanner,
  EKS: ECSEKSScanner,
  DynamoDB: DynamoDBScanner,
  CloudFront: CloudFrontScanner,
};
