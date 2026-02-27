/**
 * Ambient module declarations for optional cloud-provider SDKs and
 * third-party libraries that are dynamically imported at runtime.
 *
 * These declarations prevent TS2307 "Cannot find module" errors when
 * the packages are not installed as direct dependencies (they are
 * loaded lazily only when the corresponding cloud provider is invoked).
 */

// ---------------------------------------------------------------------------
// AWS SDK v3 clients
// ---------------------------------------------------------------------------

declare module '@aws-sdk/client-ec2' {
  export class EC2Client { constructor(config?: any); send(command: any): Promise<any>; }
  export class DescribeInstancesCommand { constructor(input?: any); }
  export class DescribeVpcsCommand { constructor(input?: any); }
  export class DescribeSubnetsCommand { constructor(input?: any); }
  export class DescribeSecurityGroupsCommand { constructor(input?: any); }
  export class DescribeVolumesCommand { constructor(input?: any); }
  export class DescribeImagesCommand { constructor(input?: any); }
  export class DescribeRegionsCommand { constructor(input?: any); }
  export class DescribeAvailabilityZonesCommand { constructor(input?: any); }
  export class DescribeRouteTablesCommand { constructor(input?: any); }
  export class DescribeNetworkInterfacesCommand { constructor(input?: any); }
  export class RunInstancesCommand { constructor(input?: any); }
  export class StopInstancesCommand { constructor(input?: any); }
  export class StartInstancesCommand { constructor(input?: any); }
  export class TerminateInstancesCommand { constructor(input?: any); }
  export class CreateVpcCommand { constructor(input?: any); }
  export class CreateSubnetCommand { constructor(input?: any); }
  export class CreateSecurityGroupCommand { constructor(input?: any); }
  export class AuthorizeSecurityGroupIngressCommand { constructor(input?: any); }
  export class RebootInstancesCommand { constructor(input?: any); }
  export class DescribeInstanceStatusCommand { constructor(input?: any); }
}

declare module '@aws-sdk/client-s3' {
  export class S3Client { constructor(config?: any); send(command: any): Promise<any>; }
  export class ListBucketsCommand { constructor(input?: any); }
  export class ListObjectsV2Command { constructor(input?: any); }
  export class GetObjectCommand { constructor(input?: any); }
  export class PutObjectCommand { constructor(input?: any); }
  export class DeleteObjectCommand { constructor(input?: any); }
  export class CreateBucketCommand { constructor(input?: any); }
  export class DeleteBucketCommand { constructor(input?: any); }
  export class GetBucketPolicyCommand { constructor(input?: any); }
  export class PutBucketPolicyCommand { constructor(input?: any); }
}

declare module '@aws-sdk/client-iam' {
  export class IAMClient { constructor(config?: any); send(command: any): Promise<any>; }
  export class ListUsersCommand { constructor(input?: any); }
  export class ListRolesCommand { constructor(input?: any); }
  export class ListPoliciesCommand { constructor(input?: any); }
  export class ListGroupsCommand { constructor(input?: any); }
  export class GetUserCommand { constructor(input?: any); }
  export class GetRoleCommand { constructor(input?: any); }
  export class CreateUserCommand { constructor(input?: any); }
  export class CreateRoleCommand { constructor(input?: any); }
  export class AttachRolePolicyCommand { constructor(input?: any); }
  export class AttachUserPolicyCommand { constructor(input?: any); }
  export class DetachRolePolicyCommand { constructor(input?: any); }
}

// ---------------------------------------------------------------------------
// Azure SDK
// ---------------------------------------------------------------------------

declare module '@azure/identity' {
  export class DefaultAzureCredential { constructor(options?: any); }
}

declare module '@azure/arm-compute' {
  export class ComputeManagementClient {
    constructor(credential: any, subscriptionId: string);
    virtualMachines: any;
    disks: any;
    images: any;
  }
}

declare module '@azure/arm-storage' {
  export class StorageManagementClient {
    constructor(credential: any, subscriptionId: string);
    storageAccounts: any;
    blobContainers: any;
  }
}

declare module '@azure/arm-containerservice' {
  export class ContainerServiceClient {
    constructor(credential: any, subscriptionId: string);
    managedClusters: any;
    agentPools: any;
  }
}

declare module '@azure/arm-network' {
  export class NetworkManagementClient {
    constructor(credential: any, subscriptionId: string);
    virtualNetworks: any;
    subnets: any;
    networkSecurityGroups: any;
    publicIPAddresses: any;
    loadBalancers: any;
  }
}

// ---------------------------------------------------------------------------
// Google Cloud SDK
// ---------------------------------------------------------------------------

declare module 'google-auth-library' {
  export class GoogleAuth {
    constructor(options?: any);
    getClient(): Promise<any>;
  }
}

declare module '@google-cloud/compute' {
  export class InstancesClient {
    constructor(options?: any);
    list(request?: any): any;
    get(request?: any): any;
    start(request?: any): any;
    stop(request?: any): any;
    aggregatedListAsync(request?: any): AsyncIterable<any>;
  }
  export class ZonesClient { constructor(options?: any); list(request?: any): any; }
  export class ZoneOperationsClient { constructor(options?: any); wait(request?: any): any; }
  export class RegionsClient { constructor(options?: any); list(request?: any): any; }
  export class NetworksClient { constructor(options?: any); list(request?: any): any; get(request?: any): any; }
  export class SubnetworksClient {
    constructor(options?: any);
    list(request?: any): any;
    aggregatedListAsync(request?: any): AsyncIterable<any>;
  }
  export class FirewallsClient { constructor(options?: any); list(request?: any): any; }
  export class DisksClient { constructor(options?: any); list(request?: any): any; }
}

declare module '@google-cloud/storage' {
  export class Storage {
    constructor(options?: any);
    getBuckets(options?: any): Promise<any>;
    bucket(name: string): any;
  }
}

declare module '@google-cloud/container' {
  export class ClusterManagerClient {
    constructor(options?: any);
    listClusters(request?: any): Promise<any>;
    getCluster(request?: any): Promise<any>;
    listNodePools(request?: any): Promise<any>;
  }
}

declare module '@google-cloud/iam' {
  export class IAMClient {
    constructor(options?: any);
    listServiceAccounts(request?: any): Promise<any>;
    getIamPolicy(request?: any): Promise<any>;
  }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

declare module '@octokit/rest' {
  export class Octokit {
    constructor(options?: any);
    repos: any;
    issues: any;
    pulls: any;
    actions: any;
    git: any;
    search: any;
    users: any;
  }
}

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

declare module 'js-yaml' {
  export function load(str: string, opts?: any): any;
  export function dump(obj: any, opts?: any): string;
  export function loadAll(str: string, iterator?: (doc: any) => void, opts?: any): any[];
}
