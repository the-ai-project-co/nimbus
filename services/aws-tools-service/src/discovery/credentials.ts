/**
 * AWS Credential Manager
 *
 * Handles AWS credential management including:
 * - Profile listing and selection
 * - SSO authentication
 * - Credential validation
 * - Assume role operations
 */

import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
  type AssumeRoleCommandInput,
} from '@aws-sdk/client-sts';
import {
  fromIni,
  fromSSO,
  fromEnv,
  fromNodeProviderChain,
} from '@aws-sdk/credential-providers';
import { logger } from '@nimbus/shared-utils';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseIni } from 'ini';
import type {
  AWSProfile,
  AWSAccountInfo,
  CredentialValidationResult,
} from './types';

export interface CredentialManagerConfig {
  defaultRegion?: string;
}

export interface AssumeRoleOptions {
  roleArn: string;
  roleSessionName?: string;
  durationSeconds?: number;
  externalId?: string;
}

/**
 * Manages AWS credentials and authentication
 */
export class CredentialManager {
  private defaultRegion: string;
  private credentialsPath: string;
  private configPath: string;

  constructor(config: CredentialManagerConfig = {}) {
    this.defaultRegion = config.defaultRegion || process.env.AWS_REGION || 'us-east-1';
    this.credentialsPath = process.env.AWS_SHARED_CREDENTIALS_FILE ||
      join(homedir(), '.aws', 'credentials');
    this.configPath = process.env.AWS_CONFIG_FILE ||
      join(homedir(), '.aws', 'config');
  }

  /**
   * List all available AWS profiles from credentials and config files
   */
  async listProfiles(): Promise<AWSProfile[]> {
    const profiles: AWSProfile[] = [];

    // Check for environment credentials first
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      profiles.push({
        name: 'environment',
        source: 'environment',
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
      });
    }

    // Parse credentials file
    try {
      const credentialsContent = await readFile(this.credentialsPath, 'utf-8');
      const credentials = parseIni(credentialsContent);

      for (const [name, values] of Object.entries(credentials)) {
        if (typeof values === 'object' && values !== null) {
          profiles.push({
            name,
            source: 'credentials',
            region: (values as Record<string, string>).region,
          });
        }
      }
    } catch (error) {
      // Credentials file may not exist
      logger.debug('Could not read credentials file', { path: this.credentialsPath });
    }

    // Parse config file for SSO profiles
    try {
      const configContent = await readFile(this.configPath, 'utf-8');
      const config = parseIni(configContent);

      for (const [section, values] of Object.entries(config)) {
        if (typeof values !== 'object' || values === null) continue;

        const profileValues = values as Record<string, string>;

        // Config file sections are prefixed with "profile " except for default
        const profileName = section.startsWith('profile ')
          ? section.substring(8)
          : section;

        // Skip if already added from credentials
        if (profiles.some(p => p.name === profileName)) {
          // Update with config values
          const existing = profiles.find(p => p.name === profileName);
          if (existing) {
            existing.region = existing.region || profileValues.region;
          }
          continue;
        }

        // Check if it's an SSO profile
        if (profileValues.sso_start_url) {
          profiles.push({
            name: profileName,
            source: 'sso',
            region: profileValues.region,
            ssoStartUrl: profileValues.sso_start_url,
            ssoRegion: profileValues.sso_region,
            ssoAccountId: profileValues.sso_account_id,
            ssoRoleName: profileValues.sso_role_name,
          });
        } else if (profileValues.role_arn) {
          // Assume role profile
          profiles.push({
            name: profileName,
            source: 'config',
            region: profileValues.region,
          });
        }
      }
    } catch (error) {
      // Config file may not exist
      logger.debug('Could not read config file', { path: this.configPath });
    }

    return profiles;
  }

  /**
   * Get credentials provider for a specific profile
   */
  async getCredentialsProvider(profile?: string) {
    if (!profile || profile === 'environment') {
      // Try environment variables first, then default provider chain
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        return fromEnv();
      }
      return fromNodeProviderChain();
    }

    // Check if it's an SSO profile
    const profiles = await this.listProfiles();
    const profileInfo = profiles.find(p => p.name === profile);

    if (profileInfo?.source === 'sso') {
      return fromSSO({ profile });
    }

    // Use INI provider for credentials file profiles
    return fromIni({ profile });
  }

  /**
   * Validate credentials and get account information
   */
  async validateCredentials(profile?: string): Promise<CredentialValidationResult> {
    try {
      const credentials = await this.getCredentialsProvider(profile);

      const stsClient = new STSClient({
        region: this.defaultRegion,
        credentials,
      });

      const command = new GetCallerIdentityCommand({});
      const response = await stsClient.send(command);

      if (!response.Account || !response.Arn) {
        return {
          valid: false,
          error: 'Could not retrieve account information',
        };
      }

      const accountInfo: AWSAccountInfo = {
        accountId: response.Account,
        arn: response.Arn,
      };

      // Try to get account alias (optional)
      try {
        const alias = await this.getAccountAlias(credentials);
        if (alias) {
          accountInfo.alias = alias;
        }
      } catch {
        // Alias is optional, ignore errors
      }

      logger.info(`Validated credentials for account ${response.Account}`);

      return {
        valid: true,
        account: accountInfo,
      };
    } catch (error: any) {
      logger.error('Credential validation failed', error);

      return {
        valid: false,
        error: error.message || 'Failed to validate credentials',
      };
    }
  }

  /**
   * Get account alias if available
   */
  private async getAccountAlias(credentials: any): Promise<string | undefined> {
    // This would require IAM:ListAccountAliases permission
    // For now, return undefined - can be enhanced later
    return undefined;
  }

  /**
   * Assume an IAM role and return temporary credentials
   */
  async assumeRole(
    options: AssumeRoleOptions,
    sourceProfile?: string
  ): Promise<CredentialValidationResult> {
    try {
      const credentials = await this.getCredentialsProvider(sourceProfile);

      const stsClient = new STSClient({
        region: this.defaultRegion,
        credentials,
      });

      const input: AssumeRoleCommandInput = {
        RoleArn: options.roleArn,
        RoleSessionName: options.roleSessionName || 'nimbus-discovery-session',
        DurationSeconds: options.durationSeconds || 3600,
      };

      if (options.externalId) {
        input.ExternalId = options.externalId;
      }

      const command = new AssumeRoleCommand(input);
      const response = await stsClient.send(command);

      if (!response.Credentials || !response.AssumedRoleUser) {
        return {
          valid: false,
          error: 'Failed to assume role - no credentials returned',
        };
      }

      // Validate the assumed role credentials
      const assumedCredentials = {
        accessKeyId: response.Credentials.AccessKeyId!,
        secretAccessKey: response.Credentials.SecretAccessKey!,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration,
      };

      const assumedStsClient = new STSClient({
        region: this.defaultRegion,
        credentials: assumedCredentials,
      });

      const identityCommand = new GetCallerIdentityCommand({});
      const identityResponse = await assumedStsClient.send(identityCommand);

      logger.info(`Assumed role ${options.roleArn} in account ${identityResponse.Account}`);

      return {
        valid: true,
        account: {
          accountId: identityResponse.Account!,
          arn: identityResponse.Arn!,
        },
      };
    } catch (error: any) {
      logger.error('Failed to assume role', { roleArn: options.roleArn, error });

      return {
        valid: false,
        error: error.message || 'Failed to assume role',
      };
    }
  }

  /**
   * Create an STS client with the specified profile
   */
  async createSTSClient(profile?: string, region?: string): Promise<STSClient> {
    const credentials = await this.getCredentialsProvider(profile);

    return new STSClient({
      region: region || this.defaultRegion,
      credentials,
    });
  }

  /**
   * Get the default region for operations
   */
  getDefaultRegion(): string {
    return this.defaultRegion;
  }

  /**
   * Check if SSO login is required for a profile
   */
  async isSSOLoginRequired(profile: string): Promise<boolean> {
    const profiles = await this.listProfiles();
    const profileInfo = profiles.find(p => p.name === profile);

    if (profileInfo?.source !== 'sso') {
      return false;
    }

    // Try to use SSO credentials to see if they're valid
    try {
      const credentials = fromSSO({ profile });
      const stsClient = new STSClient({
        region: this.defaultRegion,
        credentials,
      });

      await stsClient.send(new GetCallerIdentityCommand({}));
      return false; // SSO is already logged in
    } catch (error: any) {
      // If we get a token refresh error, SSO login is required
      if (error.name === 'SSOTokenProviderFailure' ||
          error.message?.includes('SSO') ||
          error.message?.includes('token')) {
        return true;
      }
      throw error;
    }
  }

  /**
   * Get SSO login URL for a profile
   */
  async getSSOLoginUrl(profile: string): Promise<string | undefined> {
    const profiles = await this.listProfiles();
    const profileInfo = profiles.find(p => p.name === profile);

    if (profileInfo?.source !== 'sso') {
      return undefined;
    }

    return profileInfo.ssoStartUrl;
  }
}
