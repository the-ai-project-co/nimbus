/**
 * CloudFront Scanner
 *
 * Discovers CloudFront distributions and their configurations
 * CloudFront is a global service but API is accessed via us-east-1
 */

import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  ListTagsForResourceCommand,
  type DistributionSummary,
  type Distribution,
} from '@aws-sdk/client-cloudfront';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * CloudFront Scanner - discovers CloudFront distributions
 */
export class CloudFrontScanner extends BaseScanner {
  readonly serviceName = 'CloudFront';
  readonly isGlobal = true;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    // CloudFront is global - only scan from us-east-1
    if (context.region !== 'us-east-1') {
      return { resources: [], errors: [] };
    }

    const client = new CloudFrontClient({
      region: 'us-east-1',
      credentials: context.credentials,
    });

    try {
      let marker: string | undefined;

      do {
        const listCommand = new ListDistributionsCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.DistributionList?.Items) {
          // Process distributions in parallel
          const distPromises = listResponse.DistributionList.Items.map(dist =>
            this.processDistribution(dist, client, context)
          );

          const results = await Promise.allSettled(distPromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = listResponse.DistributionList?.NextMarker;
      } while (marker);

      logger.debug(`CloudFront scanner found ${resources.length} distributions`, {
        region: 'global',
      });
    } catch (error: any) {
      this.recordError('ListDistributions', error.message, 'global', error.code);
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return ['AWS::CloudFront::Distribution'];
  }

  /**
   * Process a single CloudFront distribution
   */
  private async processDistribution(
    summary: DistributionSummary,
    client: CloudFrontClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!summary.Id || !summary.ARN) return null;

    // Get detailed distribution config
    let distribution: Distribution | undefined;
    try {
      const getCommand = new GetDistributionCommand({
        Id: summary.Id,
      });
      const getResponse = await this.withRateLimit(context, () => client.send(getCommand));
      distribution = getResponse.Distribution;
    } catch {
      // Use summary data if detailed fetch fails
    }

    // Get tags
    let tags: Record<string, string> = {};
    try {
      const tagsCommand = new ListTagsForResourceCommand({
        Resource: summary.ARN,
      });
      const tagsResponse = await this.withRateLimit(context, () => client.send(tagsCommand));

      if (tagsResponse.Tags?.Items) {
        tags = tagsResponse.Tags.Items.reduce((acc, tag) => {
          if (tag.Key) {
            acc[tag.Key] = tag.Value || '';
          }
          return acc;
        }, {} as Record<string, string>);
      }
    } catch {
      // Continue without tags
    }

    return this.mapDistribution(summary, distribution, tags, context);
  }

  /**
   * Map a CloudFront distribution to a DiscoveredResource
   */
  private mapDistribution(
    summary: DistributionSummary,
    distribution: Distribution | undefined,
    tags: Record<string, string>,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!summary.Id || !summary.ARN) return null;

    const relationships: ResourceRelationship[] = [];
    const config = distribution?.DistributionConfig || summary;

    // Add S3 origin relationships
    if ('Origins' in config && config.Origins?.Items) {
      for (const origin of config.Origins.Items) {
        if (origin.S3OriginConfig) {
          // S3 bucket origin
          const bucketName = origin.DomainName?.replace('.s3.amazonaws.com', '')
            .replace('.s3-website-', '')
            .split('.')[0];
          if (bucketName) {
            relationships.push({
              type: 'references',
              targetArn: `arn:aws:s3:::${bucketName}`,
              targetType: 'aws_s3_bucket',
            });
          }
        }

        // Add OAI relationship
        if (origin.S3OriginConfig?.OriginAccessIdentity) {
          relationships.push({
            type: 'references',
            targetArn: `arn:aws:cloudfront::${context.accountId}:origin-access-identity/${origin.S3OriginConfig.OriginAccessIdentity}`,
            targetType: 'aws_cloudfront_origin_access_identity',
          });
        }
      }
    }

    // Add ACM certificate relationship
    if ('ViewerCertificate' in config && config.ViewerCertificate?.ACMCertificateArn) {
      relationships.push({
        type: 'references',
        targetArn: config.ViewerCertificate.ACMCertificateArn,
        targetType: 'aws_acm_certificate',
      });
    }

    // Add WAF Web ACL relationship
    if ('WebACLId' in config && config.WebACLId) {
      relationships.push({
        type: 'references',
        targetArn: config.WebACLId,
        targetType: 'aws_wafv2_web_acl',
      });
    }

    // Add Lambda@Edge function relationships
    if ('DefaultCacheBehavior' in config && config.DefaultCacheBehavior?.LambdaFunctionAssociations?.Items) {
      for (const assoc of config.DefaultCacheBehavior.LambdaFunctionAssociations.Items) {
        if (assoc.LambdaFunctionARN) {
          relationships.push({
            type: 'references',
            targetArn: assoc.LambdaFunctionARN,
            targetType: 'aws_lambda_function',
          });
        }
      }
    }

    const properties: Record<string, unknown> = {
      domainName: summary.DomainName,
      enabled: summary.Enabled,
      status: summary.Status,
      priceClass: summary.PriceClass,
      httpVersion: summary.HttpVersion,
      isIPV6Enabled: summary.IsIPV6Enabled,
      aliases: summary.Aliases?.Items,
    };

    // Add detailed properties if available
    if (distribution?.DistributionConfig) {
      const dc = distribution.DistributionConfig;
      Object.assign(properties, {
        comment: dc.Comment,
        defaultRootObject: dc.DefaultRootObject,
        webACLId: dc.WebACLId,
        origins: dc.Origins?.Items?.map(o => ({
          id: o.Id,
          domainName: o.DomainName,
          originPath: o.OriginPath,
          customHeaders: o.CustomHeaders?.Items?.map(h => ({
            headerName: h.HeaderName,
            headerValue: '***REDACTED***', // Don't expose header values
          })),
          s3OriginConfig: o.S3OriginConfig
            ? {
                originAccessIdentity: o.S3OriginConfig.OriginAccessIdentity,
              }
            : undefined,
          customOriginConfig: o.CustomOriginConfig
            ? {
                httpPort: o.CustomOriginConfig.HTTPPort,
                httpsPort: o.CustomOriginConfig.HTTPSPort,
                originProtocolPolicy: o.CustomOriginConfig.OriginProtocolPolicy,
                originSslProtocols: o.CustomOriginConfig.OriginSslProtocols?.Items,
                originReadTimeout: o.CustomOriginConfig.OriginReadTimeout,
                originKeepaliveTimeout: o.CustomOriginConfig.OriginKeepaliveTimeout,
              }
            : undefined,
          originAccessControlId: o.OriginAccessControlId,
          connectionAttempts: o.ConnectionAttempts,
          connectionTimeout: o.ConnectionTimeout,
          originShield: o.OriginShield
            ? {
                enabled: o.OriginShield.Enabled,
                originShieldRegion: o.OriginShield.OriginShieldRegion,
              }
            : undefined,
        })),
        originGroups: dc.OriginGroups?.Items?.map(og => ({
          id: og.Id,
          failoverCriteria: og.FailoverCriteria,
          members: og.Members?.Items?.map(m => m.OriginId),
        })),
        defaultCacheBehavior: dc.DefaultCacheBehavior
          ? {
              targetOriginId: dc.DefaultCacheBehavior.TargetOriginId,
              viewerProtocolPolicy: dc.DefaultCacheBehavior.ViewerProtocolPolicy,
              allowedMethods: dc.DefaultCacheBehavior.AllowedMethods?.Items,
              cachedMethods: dc.DefaultCacheBehavior.AllowedMethods?.CachedMethods?.Items,
              compress: dc.DefaultCacheBehavior.Compress,
              cachePolicyId: dc.DefaultCacheBehavior.CachePolicyId,
              originRequestPolicyId: dc.DefaultCacheBehavior.OriginRequestPolicyId,
              responseHeadersPolicyId: dc.DefaultCacheBehavior.ResponseHeadersPolicyId,
              smoothStreaming: dc.DefaultCacheBehavior.SmoothStreaming,
              realtimeLogConfigArn: dc.DefaultCacheBehavior.RealtimeLogConfigArn,
              fieldLevelEncryptionId: dc.DefaultCacheBehavior.FieldLevelEncryptionId,
              functionAssociations: dc.DefaultCacheBehavior.FunctionAssociations?.Items?.map(f => ({
                eventType: f.EventType,
                functionArn: f.FunctionARN,
              })),
              lambdaFunctionAssociations: dc.DefaultCacheBehavior.LambdaFunctionAssociations?.Items?.map(l => ({
                eventType: l.EventType,
                lambdaFunctionArn: l.LambdaFunctionARN,
                includeBody: l.IncludeBody,
              })),
            }
          : undefined,
        cacheBehaviors: dc.CacheBehaviors?.Items?.map(cb => ({
          pathPattern: cb.PathPattern,
          targetOriginId: cb.TargetOriginId,
          viewerProtocolPolicy: cb.ViewerProtocolPolicy,
          allowedMethods: cb.AllowedMethods?.Items,
          compress: cb.Compress,
          cachePolicyId: cb.CachePolicyId,
        })),
        customErrorResponses: dc.CustomErrorResponses?.Items?.map(e => ({
          errorCode: e.ErrorCode,
          responsePagePath: e.ResponsePagePath,
          responseCode: e.ResponseCode,
          errorCachingMinTTL: e.ErrorCachingMinTTL,
        })),
        viewerCertificate: dc.ViewerCertificate
          ? {
              cloudFrontDefaultCertificate: dc.ViewerCertificate.CloudFrontDefaultCertificate,
              acmCertificateArn: dc.ViewerCertificate.ACMCertificateArn,
              iamCertificateId: dc.ViewerCertificate.IAMCertificateId,
              sslSupportMethod: dc.ViewerCertificate.SSLSupportMethod,
              minimumProtocolVersion: dc.ViewerCertificate.MinimumProtocolVersion,
            }
          : undefined,
        restrictions: dc.Restrictions?.GeoRestriction
          ? {
              geoRestriction: {
                restrictionType: dc.Restrictions.GeoRestriction.RestrictionType,
                locations: dc.Restrictions.GeoRestriction.Items,
              },
            }
          : undefined,
        logging: dc.Logging
          ? {
              enabled: dc.Logging.Enabled,
              bucket: dc.Logging.Bucket,
              prefix: dc.Logging.Prefix,
              includeCookies: dc.Logging.IncludeCookies,
            }
          : undefined,
      });
    }

    return this.createResource({
      id: summary.Id,
      arn: summary.ARN,
      awsType: 'AWS::CloudFront::Distribution',
      region: 'global',
      name: summary.DomainName,
      tags,
      properties,
      relationships,
      createdAt: summary.LastModifiedTime,
      status: summary.Status,
    });
  }
}
