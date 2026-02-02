/**
 * CloudFront Resource Mappers
 *
 * Maps CloudFront resources to Terraform configuration
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
 * CloudFront Distribution Mapper
 */
export class CloudFrontDistributionMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::CloudFront::Distribution';
  readonly terraformType = 'aws_cloudfront_distribution';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Enabled
    if (props.enabled !== undefined) {
      attributes.enabled = props.enabled as boolean;
    }

    // Is IPv6 enabled
    if (props.isIPV6Enabled !== undefined) {
      attributes.is_ipv6_enabled = props.isIPV6Enabled as boolean;
    }

    // Comment
    if (props.comment) {
      attributes.comment = props.comment as string;
    }

    // Default root object
    if (props.defaultRootObject) {
      attributes.default_root_object = props.defaultRootObject as string;
    }

    // Price class
    if (props.priceClass) {
      attributes.price_class = props.priceClass as string;
    }

    // Web ACL ID
    if (props.webAclId) {
      attributes.web_acl_id = props.webAclId as string;
    }

    // HTTP version
    if (props.httpVersion) {
      attributes.http_version = props.httpVersion as string;
    }

    // Aliases (CNAMEs)
    if (props.aliases && typeof props.aliases === 'object') {
      const aliasItems = (props.aliases as { items?: string[] }).items;
      if (aliasItems && aliasItems.length > 0) {
        attributes.aliases = aliasItems;
      }
    }

    // Origins
    if (props.origins && typeof props.origins === 'object') {
      const originItems = (props.origins as { items?: Array<Record<string, unknown>> }).items;
      if (originItems && originItems.length > 0) {
        const originBlocks: TerraformValue[] = [];

        for (const origin of originItems) {
          const originAttrs: Record<string, TerraformValue> = {};

          if (origin.id) {
            originAttrs.origin_id = origin.id as string;
          }
          if (origin.domainName) {
            originAttrs.domain_name = origin.domainName as string;
          }
          if (origin.originPath) {
            originAttrs.origin_path = origin.originPath as string;
          }
          if (origin.connectionAttempts) {
            originAttrs.connection_attempts = origin.connectionAttempts as number;
          }
          if (origin.connectionTimeout) {
            originAttrs.connection_timeout = origin.connectionTimeout as number;
          }

          // S3 origin config
          if (origin.s3OriginConfig && typeof origin.s3OriginConfig === 'object') {
            const s3Config = origin.s3OriginConfig as { originAccessIdentity?: string };
            if (s3Config.originAccessIdentity) {
              originAttrs.s3_origin_config = this.createBlock({
                origin_access_identity: s3Config.originAccessIdentity,
              });
            }
          }

          // Custom origin config
          if (origin.customOriginConfig && typeof origin.customOriginConfig === 'object') {
            const customConfig = origin.customOriginConfig as {
              httpPort?: number;
              httpsPort?: number;
              originProtocolPolicy?: string;
              originSslProtocols?: { items?: string[] };
              originKeepaliveTimeout?: number;
              originReadTimeout?: number;
            };

            const customAttrs: Record<string, TerraformValue> = {};
            if (customConfig.httpPort) {
              customAttrs.http_port = customConfig.httpPort;
            }
            if (customConfig.httpsPort) {
              customAttrs.https_port = customConfig.httpsPort;
            }
            if (customConfig.originProtocolPolicy) {
              customAttrs.origin_protocol_policy = customConfig.originProtocolPolicy;
            }
            if (customConfig.originSslProtocols?.items) {
              customAttrs.origin_ssl_protocols = customConfig.originSslProtocols.items;
            }
            if (customConfig.originKeepaliveTimeout) {
              customAttrs.origin_keepalive_timeout = customConfig.originKeepaliveTimeout;
            }
            if (customConfig.originReadTimeout) {
              customAttrs.origin_read_timeout = customConfig.originReadTimeout;
            }

            if (Object.keys(customAttrs).length > 0) {
              originAttrs.custom_origin_config = this.createBlock(customAttrs);
            }
          }

          // Origin shield
          if (origin.originShield && typeof origin.originShield === 'object') {
            const shield = origin.originShield as {
              enabled?: boolean;
              originShieldRegion?: string;
            };
            originAttrs.origin_shield = this.createBlock({
              enabled: shield.enabled || false,
              origin_shield_region: shield.originShieldRegion || '',
            });
          }

          // Custom headers
          if (origin.customHeaders && typeof origin.customHeaders === 'object') {
            const headers = (origin.customHeaders as { items?: Array<{ headerName?: string; headerValue?: string }> }).items;
            if (headers && headers.length > 0) {
              const headerBlocks: TerraformValue[] = [];
              for (const header of headers) {
                if (header.headerName && header.headerValue) {
                  headerBlocks.push(this.createBlock({
                    name: header.headerName,
                    value: header.headerValue,
                  }));
                }
              }
              if (headerBlocks.length > 0) {
                originAttrs.custom_header = headerBlocks;
              }
            }
          }

          if (Object.keys(originAttrs).length > 0) {
            originBlocks.push(this.createBlock(originAttrs));
          }
        }

        if (originBlocks.length > 0) {
          attributes.origin = originBlocks;
        }
      }
    }

    // Default cache behavior
    if (props.defaultCacheBehavior && typeof props.defaultCacheBehavior === 'object') {
      const dcb = props.defaultCacheBehavior as Record<string, unknown>;
      attributes.default_cache_behavior = this.createBlock(
        this.mapCacheBehavior(dcb)
      );
    }

    // Ordered cache behaviors
    if (props.cacheBehaviors && typeof props.cacheBehaviors === 'object') {
      const behaviors = (props.cacheBehaviors as { items?: Array<Record<string, unknown>> }).items;
      if (behaviors && behaviors.length > 0) {
        const behaviorBlocks: TerraformValue[] = [];
        for (const behavior of behaviors) {
          behaviorBlocks.push(this.createBlock(this.mapCacheBehavior(behavior)));
        }
        attributes.ordered_cache_behavior = behaviorBlocks;
      }
    }

    // Viewer certificate
    if (props.viewerCertificate && typeof props.viewerCertificate === 'object') {
      const cert = props.viewerCertificate as {
        cloudFrontDefaultCertificate?: boolean;
        acmCertificateArn?: string;
        iamCertificateId?: string;
        sslSupportMethod?: string;
        minimumProtocolVersion?: string;
      };

      const certAttrs: Record<string, TerraformValue> = {};
      if (cert.cloudFrontDefaultCertificate) {
        certAttrs.cloudfront_default_certificate = true;
      }
      if (cert.acmCertificateArn) {
        certAttrs.acm_certificate_arn = cert.acmCertificateArn;
      }
      if (cert.iamCertificateId) {
        certAttrs.iam_certificate_id = cert.iamCertificateId;
      }
      if (cert.sslSupportMethod) {
        certAttrs.ssl_support_method = cert.sslSupportMethod;
      }
      if (cert.minimumProtocolVersion) {
        certAttrs.minimum_protocol_version = cert.minimumProtocolVersion;
      }

      attributes.viewer_certificate = this.createBlock(certAttrs);
    }

    // Restrictions
    if (props.restrictions && typeof props.restrictions === 'object') {
      const restrictions = props.restrictions as {
        geoRestriction?: {
          restrictionType?: string;
          locations?: string[];
        };
      };

      if (restrictions.geoRestriction) {
        const geoAttrs: Record<string, TerraformValue> = {};
        if (restrictions.geoRestriction.restrictionType) {
          geoAttrs.restriction_type = restrictions.geoRestriction.restrictionType;
        }
        if (restrictions.geoRestriction.locations) {
          geoAttrs.locations = restrictions.geoRestriction.locations;
        }

        attributes.restrictions = this.createBlock({
          geo_restriction: this.createBlock(geoAttrs),
        });
      }
    } else {
      // Default restrictions block required by Terraform
      attributes.restrictions = this.createBlock({
        geo_restriction: this.createBlock({
          restriction_type: 'none',
        }),
      });
    }

    // Custom error responses
    if (props.customErrorResponses && typeof props.customErrorResponses === 'object') {
      const errorResponses = (props.customErrorResponses as { items?: Array<{
        errorCode?: number;
        responsePagePath?: string;
        responseCode?: number;
        errorCachingMinTTL?: number;
      }> }).items;

      if (errorResponses && errorResponses.length > 0) {
        const errorBlocks: TerraformValue[] = [];
        for (const err of errorResponses) {
          const errAttrs: Record<string, TerraformValue> = {};
          if (err.errorCode) {
            errAttrs.error_code = err.errorCode;
          }
          if (err.responsePagePath) {
            errAttrs.response_page_path = err.responsePagePath;
          }
          if (err.responseCode) {
            errAttrs.response_code = err.responseCode;
          }
          if (err.errorCachingMinTTL !== undefined) {
            errAttrs.error_caching_min_ttl = err.errorCachingMinTTL;
          }
          if (Object.keys(errAttrs).length > 0) {
            errorBlocks.push(this.createBlock(errAttrs));
          }
        }
        if (errorBlocks.length > 0) {
          attributes.custom_error_response = errorBlocks;
        }
      }
    }

    // Logging config
    if (props.logging && typeof props.logging === 'object') {
      const logging = props.logging as {
        bucket?: string;
        includeCookies?: boolean;
        prefix?: string;
      };

      if (logging.bucket) {
        const loggingAttrs: Record<string, TerraformValue> = {
          bucket: logging.bucket,
        };
        if (logging.includeCookies !== undefined) {
          loggingAttrs.include_cookies = logging.includeCookies;
        }
        if (logging.prefix) {
          loggingAttrs.prefix = logging.prefix;
        }
        attributes.logging_config = this.createBlock(loggingAttrs);
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

  /**
   * Map cache behavior configuration
   */
  private mapCacheBehavior(behavior: Record<string, unknown>): Record<string, TerraformValue> {
    const attrs: Record<string, TerraformValue> = {};

    if (behavior.targetOriginId) {
      attrs.target_origin_id = behavior.targetOriginId as string;
    }
    if (behavior.viewerProtocolPolicy) {
      attrs.viewer_protocol_policy = behavior.viewerProtocolPolicy as string;
    }
    if (behavior.pathPattern) {
      attrs.path_pattern = behavior.pathPattern as string;
    }

    // Allowed methods
    if (behavior.allowedMethods && typeof behavior.allowedMethods === 'object') {
      const methods = (behavior.allowedMethods as { items?: string[] }).items;
      if (methods) {
        attrs.allowed_methods = methods;
      }
    }

    // Cached methods
    if (behavior.cachedMethods && typeof behavior.cachedMethods === 'object') {
      const methods = (behavior.cachedMethods as { items?: string[] }).items;
      if (methods) {
        attrs.cached_methods = methods;
      }
    }

    // TTL settings
    if (behavior.minTTL !== undefined) {
      attrs.min_ttl = behavior.minTTL as number;
    }
    if (behavior.maxTTL !== undefined) {
      attrs.max_ttl = behavior.maxTTL as number;
    }
    if (behavior.defaultTTL !== undefined) {
      attrs.default_ttl = behavior.defaultTTL as number;
    }

    // Compress
    if (behavior.compress !== undefined) {
      attrs.compress = behavior.compress as boolean;
    }

    // Smooth streaming
    if (behavior.smoothStreaming !== undefined) {
      attrs.smooth_streaming = behavior.smoothStreaming as boolean;
    }

    // Cache policy ID (modern approach)
    if (behavior.cachePolicyId) {
      attrs.cache_policy_id = behavior.cachePolicyId as string;
    }

    // Origin request policy ID
    if (behavior.originRequestPolicyId) {
      attrs.origin_request_policy_id = behavior.originRequestPolicyId as string;
    }

    // Response headers policy ID
    if (behavior.responseHeadersPolicyId) {
      attrs.response_headers_policy_id = behavior.responseHeadersPolicyId as string;
    }

    // Forwarded values (legacy, but needed for import)
    if (behavior.forwardedValues && typeof behavior.forwardedValues === 'object') {
      const fv = behavior.forwardedValues as {
        queryString?: boolean;
        cookies?: { forward?: string; whitelistedNames?: { items?: string[] } };
        headers?: { items?: string[] };
        queryStringCacheKeys?: { items?: string[] };
      };

      const fvAttrs: Record<string, TerraformValue> = {};
      if (fv.queryString !== undefined) {
        fvAttrs.query_string = fv.queryString;
      }

      if (fv.cookies) {
        const cookieAttrs: Record<string, TerraformValue> = {
          forward: fv.cookies.forward || 'none',
        };
        if (fv.cookies.whitelistedNames?.items) {
          cookieAttrs.whitelisted_names = fv.cookies.whitelistedNames.items;
        }
        fvAttrs.cookies = this.createBlock(cookieAttrs);
      }

      if (fv.headers?.items) {
        fvAttrs.headers = fv.headers.items;
      }

      if (fv.queryStringCacheKeys?.items) {
        fvAttrs.query_string_cache_keys = fv.queryStringCacheKeys.items;
      }

      if (Object.keys(fvAttrs).length > 0) {
        attrs.forwarded_values = this.createBlock(fvAttrs);
      }
    }

    // Lambda function associations
    if (behavior.lambdaFunctionAssociations && typeof behavior.lambdaFunctionAssociations === 'object') {
      const lambdas = (behavior.lambdaFunctionAssociations as { items?: Array<{
        eventType?: string;
        lambdaFunctionArn?: string;
        includeBody?: boolean;
      }> }).items;

      if (lambdas && lambdas.length > 0) {
        const lambdaBlocks: TerraformValue[] = [];
        for (const lambda of lambdas) {
          const lambdaAttrs: Record<string, TerraformValue> = {};
          if (lambda.eventType) {
            lambdaAttrs.event_type = lambda.eventType;
          }
          if (lambda.lambdaFunctionArn) {
            lambdaAttrs.lambda_arn = lambda.lambdaFunctionArn;
          }
          if (lambda.includeBody !== undefined) {
            lambdaAttrs.include_body = lambda.includeBody;
          }
          if (Object.keys(lambdaAttrs).length > 0) {
            lambdaBlocks.push(this.createBlock(lambdaAttrs));
          }
        }
        if (lambdaBlocks.length > 0) {
          attrs.lambda_function_association = lambdaBlocks;
        }
      }
    }

    // Function associations (CloudFront Functions)
    if (behavior.functionAssociations && typeof behavior.functionAssociations === 'object') {
      const functions = (behavior.functionAssociations as { items?: Array<{
        eventType?: string;
        functionArn?: string;
      }> }).items;

      if (functions && functions.length > 0) {
        const funcBlocks: TerraformValue[] = [];
        for (const func of functions) {
          const funcAttrs: Record<string, TerraformValue> = {};
          if (func.eventType) {
            funcAttrs.event_type = func.eventType;
          }
          if (func.functionArn) {
            funcAttrs.function_arn = func.functionArn;
          }
          if (Object.keys(funcAttrs).length > 0) {
            funcBlocks.push(this.createBlock(funcAttrs));
          }
        }
        if (funcBlocks.length > 0) {
          attrs.function_association = funcBlocks;
        }
      }
    }

    return attrs;
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_id`,
        value: `aws_cloudfront_distribution.${name}.id`,
        description: `ID of CloudFront distribution ${resource.id}`,
      },
      {
        name: `${name}_domain_name`,
        value: `aws_cloudfront_distribution.${name}.domain_name`,
        description: `Domain name of CloudFront distribution ${resource.id}`,
      },
      {
        name: `${name}_arn`,
        value: `aws_cloudfront_distribution.${name}.arn`,
        description: `ARN of CloudFront distribution ${resource.id}`,
      },
    ];
  }
}

/**
 * CloudFront Origin Access Identity Mapper
 */
export class CloudFrontOAIMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::CloudFront::CloudFrontOriginAccessIdentity';
  readonly terraformType = 'aws_cloudfront_origin_access_identity';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Comment
    if (props.comment) {
      attributes.comment = props.comment as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * CloudFront Origin Access Control Mapper
 */
export class CloudFrontOACMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::CloudFront::OriginAccessControl';
  readonly terraformType = 'aws_cloudfront_origin_access_control';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Name
    if (props.name) {
      attributes.name = props.name as string;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Origin access control origin type
    if (props.originAccessControlOriginType) {
      attributes.origin_access_control_origin_type = props.originAccessControlOriginType as string;
    }

    // Signing behavior
    if (props.signingBehavior) {
      attributes.signing_behavior = props.signingBehavior as string;
    }

    // Signing protocol
    if (props.signingProtocol) {
      attributes.signing_protocol = props.signingProtocol as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Get all CloudFront mappers
 */
export function getCloudFrontMappers(): BaseResourceMapper[] {
  return [
    new CloudFrontDistributionMapper(),
    new CloudFrontOAIMapper(),
    new CloudFrontOACMapper(),
  ];
}
