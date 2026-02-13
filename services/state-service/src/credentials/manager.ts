import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '@nimbus/shared-utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const KEYCHAIN_SERVICE = 'nimbus-cli';
const CREDENTIALS_DIR = path.join(os.homedir(), '.nimbus');

// Lazy-loaded keytar (native module may not be available)
let keytar: any = null;
let keytarLoaded = false;
async function loadKeytar(): Promise<any> {
  if (keytarLoaded) return keytar;
  keytarLoaded = true;
  try {
    // @ts-ignore - keytar is an optional native dependency
    keytar = await import('keytar');
    return keytar;
  } catch {
    keytar = null;
    return null;
  }
}

export interface AWSCredentials {
  provider: 'aws';
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  profile?: string;
}

export interface GCPCredentials {
  provider: 'gcp';
  projectId?: string;
  keyFile?: string;
  clientEmail?: string;
  credentials?: any;
}

export interface AzureCredentials {
  provider: 'azure';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  subscriptionId?: string;
}

export type CloudCredentials = AWSCredentials | GCPCredentials | AzureCredentials;

export class CredentialsManager {
  /**
   * Get AWS credentials from ~/.aws/credentials and ~/.aws/config
   */
  async getAWSCredentials(profile: string = 'default'): Promise<AWSCredentials> {
    try {
      const credentials: AWSCredentials = { provider: 'aws', profile };

      // Check environment variables first
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        credentials.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        credentials.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
        credentials.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        logger.info('AWS credentials loaded from environment variables');
        return credentials;
      }

      // Read from ~/.aws/credentials
      const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
      const configPath = path.join(os.homedir(), '.aws', 'config');

      try {
        const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
        const credentialsData = this.parseINI(credentialsContent);

        if (credentialsData[profile]) {
          credentials.accessKeyId = credentialsData[profile].aws_access_key_id;
          credentials.secretAccessKey = credentialsData[profile].aws_secret_access_key;
          credentials.sessionToken = credentialsData[profile].aws_session_token;
        }
      } catch (error) {
        logger.warn(`Could not read AWS credentials file: ${credentialsPath}`);
      }

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const configData = this.parseINI(configContent);

        const configProfile = profile === 'default' ? 'default' : `profile ${profile}`;
        if (configData[configProfile]) {
          credentials.region = configData[configProfile].region;
        }
      } catch (error) {
        logger.warn(`Could not read AWS config file: ${configPath}`);
      }

      if (!credentials.accessKeyId) {
        throw new Error(`AWS credentials not found for profile: ${profile}`);
      }

      logger.info(`AWS credentials loaded for profile: ${profile}`);
      return credentials;
    } catch (error) {
      logger.error('Failed to get AWS credentials', error);
      throw error;
    }
  }

  /**
   * Get GCP credentials from GOOGLE_APPLICATION_CREDENTIALS or gcloud
   */
  async getGCPCredentials(): Promise<GCPCredentials> {
    try {
      const credentials: GCPCredentials = { provider: 'gcp' };

      // Check GOOGLE_APPLICATION_CREDENTIALS environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credentials.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        try {
          const keyFileContent = await fs.readFile(credentials.keyFile, 'utf-8');
          const keyData = JSON.parse(keyFileContent);

          credentials.projectId = keyData.project_id;
          credentials.clientEmail = keyData.client_email;
          credentials.credentials = keyData;

          logger.info('GCP credentials loaded from GOOGLE_APPLICATION_CREDENTIALS');
          return credentials;
        } catch (error) {
          logger.warn(`Could not read GCP key file: ${credentials.keyFile}`);
        }
      }

      // Try to get credentials from gcloud CLI
      try {
        const { stdout: configStdout } = await execAsync('gcloud config get-value project 2>/dev/null');
        credentials.projectId = configStdout.trim();

        const { stdout: authStdout } = await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null');
        credentials.clientEmail = authStdout.trim();

        logger.info('GCP credentials loaded from gcloud CLI');
        return credentials;
      } catch (error) {
        logger.warn('Could not get GCP credentials from gcloud CLI');
      }

      // Check Application Default Credentials path
      const adcPath = path.join(
        os.homedir(),
        '.config',
        'gcloud',
        'application_default_credentials.json'
      );

      try {
        await fs.access(adcPath);
        credentials.keyFile = adcPath;

        const adcContent = await fs.readFile(adcPath, 'utf-8');
        const adcData = JSON.parse(adcContent);

        credentials.projectId = adcData.quota_project_id || adcData.project_id;
        credentials.credentials = adcData;

        logger.info('GCP credentials loaded from Application Default Credentials');
        return credentials;
      } catch (error) {
        logger.warn('Could not read GCP Application Default Credentials');
      }

      throw new Error('GCP credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth login`');
    } catch (error) {
      logger.error('Failed to get GCP credentials', error);
      throw error;
    }
  }

  /**
   * Get Azure credentials from az CLI
   */
  async getAzureCredentials(): Promise<AzureCredentials> {
    try {
      const credentials: AzureCredentials = { provider: 'azure' };

      // Check environment variables
      if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
        credentials.tenantId = process.env.AZURE_TENANT_ID;
        credentials.clientId = process.env.AZURE_CLIENT_ID;
        credentials.clientSecret = process.env.AZURE_CLIENT_SECRET;
        credentials.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;

        logger.info('Azure credentials loaded from environment variables');
        return credentials;
      }

      // Try to get credentials from az CLI
      try {
        const { stdout: accountStdout } = await execAsync('az account show --output json 2>/dev/null');
        const accountData = JSON.parse(accountStdout);

        credentials.tenantId = accountData.tenantId;
        credentials.subscriptionId = accountData.id;

        logger.info('Azure credentials loaded from az CLI');
        return credentials;
      } catch (error) {
        logger.warn('Could not get Azure credentials from az CLI');
      }

      throw new Error('Azure credentials not found. Set environment variables or run `az login`');
    } catch (error) {
      logger.error('Failed to get Azure credentials', error);
      throw error;
    }
  }

  /**
   * Get credentials for any provider
   */
  async getCredentials(provider: 'aws' | 'gcp' | 'azure', options?: any): Promise<CloudCredentials> {
    switch (provider) {
      case 'aws':
        return this.getAWSCredentials(options?.profile);
      case 'gcp':
        return this.getGCPCredentials();
      case 'azure':
        return this.getAzureCredentials();
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Validate AWS credentials
   */
  async validateAWSCredentials(credentials: AWSCredentials): Promise<boolean> {
    try {
      // Build environment variables for this command only
      const env: Record<string, string> = {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      } as Record<string, string>;

      if (credentials.sessionToken) {
        env.AWS_SESSION_TOKEN = credentials.sessionToken;
      }
      if (credentials.region) {
        env.AWS_DEFAULT_REGION = credentials.region;
      }

      // Try to execute a simple AWS CLI command with credential env vars
      await execAsync('aws sts get-caller-identity 2>/dev/null', { env });

      logger.info('AWS credentials validated successfully');
      return true;
    } catch (error) {
      logger.error('AWS credentials validation failed', error);
      return false;
    }
  }

  /**
   * Validate GCP credentials
   */
  async validateGCPCredentials(credentials: GCPCredentials): Promise<boolean> {
    try {
      if (credentials.keyFile) {
        const originalEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials.keyFile;

        await execAsync('gcloud auth application-default print-access-token 2>/dev/null');

        if (originalEnv) {
          process.env.GOOGLE_APPLICATION_CREDENTIALS = originalEnv;
        } else {
          delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }

        logger.info('GCP credentials validated successfully');
        return true;
      }

      // Just check if gcloud is authenticated
      await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null');
      logger.info('GCP credentials validated successfully');
      return true;
    } catch (error) {
      logger.error('GCP credentials validation failed', error);
      return false;
    }
  }

  /**
   * Validate Azure credentials
   *
   * NOTE: This method validates credentials using the Azure SDK to authenticate
   * directly with Azure services. If service principal credentials are provided,
   * it attempts to authenticate using them. Otherwise, it validates the subscription
   * ID is accessible with current authentication.
   */
  async validateAzureCredentials(credentials: AzureCredentials): Promise<boolean> {
    try {
      // Validate that the provided credentials have required fields
      if (!credentials.subscriptionId || !credentials.tenantId) {
        logger.error('Azure credentials missing required fields (subscriptionId, tenantId)');
        return false;
      }

      // If service principal credentials are provided, authenticate with them
      if (credentials.clientId && credentials.clientSecret) {
        try {
          // Attempt to login using service principal credentials
          const loginCmd = `az login --service-principal -u "${credentials.clientId}" -p "${credentials.clientSecret}" --tenant "${credentials.tenantId}" --output json 2>/dev/null`;
          await execAsync(loginCmd);

          // Verify the subscription is accessible
          const { stdout } = await execAsync(`az account show --subscription "${credentials.subscriptionId}" --output json 2>/dev/null`);
          const accountData = JSON.parse(stdout);

          if (accountData.id !== credentials.subscriptionId) {
            logger.error('Azure subscription ID mismatch');
            return false;
          }

          logger.info('Azure credentials validated successfully using service principal');
          return true;
        } catch (error) {
          logger.error('Azure service principal authentication failed', error);
          return false;
        }
      } else {
        // Fall back to validating subscription access with current authentication
        const { stdout } = await execAsync(`az account show --subscription "${credentials.subscriptionId}" --output json 2>/dev/null`);
        const accountData = JSON.parse(stdout);

        if (accountData.id !== credentials.subscriptionId) {
          logger.error('Azure subscription ID mismatch');
          return false;
        }

        logger.info('Azure subscription validated successfully');
        return true;
      }
    } catch (error) {
      logger.error('Azure credentials validation failed', error);
      return false;
    }
  }

  /**
   * Store a credential securely via OS keychain or file fallback
   */
  async storeCredential(provider: string, data: Record<string, unknown>): Promise<void> {
    const serialized = JSON.stringify(data);

    if (await this.isKeychainAvailable()) {
      const kt = (await loadKeytar())!;
      await kt.setPassword(KEYCHAIN_SERVICE, provider, serialized);
      logger.info(`Credential stored in OS keychain for provider: ${provider}`);
      return;
    }

    await this.storeCredentialInFile(provider, serialized);
    logger.info(`Credential stored in file fallback for provider: ${provider}`);
  }

  /**
   * Retrieve a credential from OS keychain or file fallback
   */
  async retrieveCredential(provider: string): Promise<Record<string, unknown> | null> {
    if (await this.isKeychainAvailable()) {
      const kt = (await loadKeytar())!;
      const value = await kt.getPassword(KEYCHAIN_SERVICE, provider);
      if (value) {
        return JSON.parse(value);
      }
    }

    const value = await this.retrieveCredentialFromFile(provider);
    if (value) {
      return JSON.parse(value);
    }

    return null;
  }

  /**
   * Delete a credential from OS keychain and file fallback
   */
  async deleteCredential(provider: string): Promise<void> {
    if (await this.isKeychainAvailable()) {
      const kt = (await loadKeytar())!;
      await kt.deletePassword(KEYCHAIN_SERVICE, provider);
      logger.info(`Credential deleted from OS keychain for provider: ${provider}`);
    }

    await this.deleteCredentialFromFile(provider);
  }

  /**
   * Check if OS keychain is available via keytar
   */
  private async isKeychainAvailable(): Promise<boolean> {
    const kt = await loadKeytar();
    if (!kt) return false;
    try {
      // Test access by attempting a read
      await kt.getPassword(KEYCHAIN_SERVICE, '__test__');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store credential data as base64-encoded file
   */
  private async storeCredentialInFile(provider: string, data: string): Promise<void> {
    await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
    const filePath = path.join(CREDENTIALS_DIR, `credentials.${provider}.enc`);
    const encoded = Buffer.from(data).toString('base64');
    await fs.writeFile(filePath, encoded, { mode: 0o600 });
  }

  /**
   * Retrieve credential data from base64-encoded file
   */
  private async retrieveCredentialFromFile(provider: string): Promise<string | null> {
    const filePath = path.join(CREDENTIALS_DIR, `credentials.${provider}.enc`);
    try {
      const encoded = await fs.readFile(filePath, 'utf-8');
      return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Delete credential file
   */
  private async deleteCredentialFromFile(provider: string): Promise<void> {
    const filePath = path.join(CREDENTIALS_DIR, `credentials.${provider}.enc`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, ignore
    }
  }

  /**
   * Parse INI file format (used by AWS credentials/config)
   */
  private parseINI(content: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    let currentSection = '';

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Section header
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        result[currentSection] = {};
        continue;
      }

      // Key-value pair
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0 && currentSection) {
        const key = trimmed.slice(0, equalIndex).trim();
        const value = trimmed.slice(equalIndex + 1).trim();
        result[currentSection][key] = value;
      }
    }

    return result;
  }
}
