/**
 * Auth Refresh Command
 *
 * Re-validate and refresh cloud provider credentials:
 * - AWS: re-run SSO login or warn about expired temporary credentials
 * - GCP: re-run gcloud auth application-default login
 * - Azure: re-run az login
 *
 * Usage: nimbus auth-refresh [--provider aws|gcp|azure]
 */

import { ui } from '../wizard';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface AuthRefreshOptions {
  provider?: 'aws' | 'gcp' | 'azure' | 'all';
}

/** Check if AWS credentials are valid and not expired */
async function checkAWSCredentials(): Promise<{ valid: boolean; message: string; sso: boolean }> {
  try {
    const { stdout } = await execAsync('aws sts get-caller-identity --output json', {
      timeout: 10_000,
    });
    const identity = JSON.parse(stdout);
    const isSso = identity.UserId?.includes(':') || false;
    return {
      valid: true,
      message: `Account: ${identity.Account} | User: ${identity.UserId}`,
      sso: isSso,
    };
  } catch (e: any) {
    const msg = e.message || String(e);
    const isExpired =
      msg.includes('ExpiredToken') || msg.includes('expired') || msg.includes('token');
    return { valid: false, message: isExpired ? 'Token expired' : msg, sso: false };
  }
}

/** Refresh AWS SSO credentials */
async function refreshAWS(options: AuthRefreshOptions): Promise<void> {
  ui.header('AWS Credentials');

  const check = await checkAWSCredentials();

  if (check.valid) {
    ui.success(`Credentials valid: ${check.message}`);
    return;
  }

  ui.warning(`Credentials invalid: ${check.message}`);

  // G18: Guide user through AWS SSO login if SSO profile detected
  const awsSsoProfile = process.env.AWS_PROFILE;
  if (awsSsoProfile) {
    ui.info(`AWS SSO profile detected: ${awsSsoProfile}`);
    ui.info(`Run in another terminal: aws sso login --profile ${awsSsoProfile}`);
    ui.info('Then press Enter here to retry...');
    // Wait for user to press Enter
    await new Promise<void>(resolve => {
      const readline = require('readline') as typeof import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', () => { rl.close(); resolve(); });
    });
    // Retry the credentials check
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('aws', ['sts', 'get-caller-identity'], {
        encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      ui.success('AWS credentials refreshed successfully.');
      return;
    } catch {
      ui.warning('AWS credentials still invalid. You may need to re-run aws sso login.');
    }
  }

  // Determine refresh method
  try {
    // Check if SSO is configured
    const { stdout: ssoCheck } = await execAsync(
      'aws configure list-profiles 2>/dev/null || echo ""',
      { timeout: 5000 }
    );
    const profiles = ssoCheck.trim().split('\n').filter(Boolean);

    if (profiles.length > 0) {
      ui.info('Refreshing AWS SSO credentials...');
      ui.info(`Run: aws sso login --profile ${profiles[0]}`);
      ui.info('Or set a new profile: aws configure sso');
    } else {
      ui.info('To refresh AWS credentials:');
      ui.info('  1. aws configure  (for long-term credentials)');
      ui.info('  2. aws sso configure  (for SSO)');
      ui.info('  3. aws sts assume-role  (for role assumption)');
    }
  } catch {
    ui.info('To configure AWS credentials: aws configure');
  }
}

/** Refresh GCP credentials */
async function refreshGCP(_options: AuthRefreshOptions): Promise<void> {
  ui.header('GCP Credentials');

  try {
    const { stdout } = await execAsync('gcloud auth print-access-token 2>/dev/null', {
      timeout: 5000,
    });
    if (stdout.trim().length > 10) {
      try {
        const { stdout: proj } = await execAsync('gcloud config get-value project 2>/dev/null', {
          timeout: 3000,
        });
        ui.success(`Credentials valid. Project: ${proj.trim() || '(not set)'}`);
        return;
      } catch {
        ui.success('Credentials valid');
        return;
      }
    }
  } catch {
    // Not valid
  }

  ui.warning('GCP credentials expired or not configured');
  ui.info('To refresh: gcloud auth application-default login');
  ui.info('For service accounts: gcloud auth activate-service-account --key-file=SA_KEY.json');
}

/** Refresh Azure credentials */
async function refreshAzure(_options: AuthRefreshOptions): Promise<void> {
  ui.header('Azure Credentials');

  try {
    const { stdout } = await execAsync('az account show --output json 2>/dev/null', {
      timeout: 10_000,
    });
    const account = JSON.parse(stdout);
    ui.success(
      `Credentials valid. Subscription: ${account.name || account.id} (${account.state})`
    );
    if (account.state !== 'Enabled') {
      ui.warning('Subscription is not in Enabled state');
    }
    return;
  } catch {
    // Not valid
  }

  ui.warning('Azure credentials expired or not configured');
  ui.info('To refresh: az login');
  ui.info('For service principals: az login --service-principal -u CLIENT_ID -p CLIENT_SECRET --tenant TENANT_ID');
}

/**
 * Run the auth-refresh command
 */
export async function authRefreshCommand(options: AuthRefreshOptions = {}): Promise<void> {
  const provider = options.provider ?? 'all';

  ui.header('Nimbus Auth Refresh');
  ui.info('Checking and refreshing cloud provider credentials...');
  ui.newLine();

  if (provider === 'all' || provider === 'aws') {
    await refreshAWS(options);
    ui.newLine();
  }

  if (provider === 'all' || provider === 'gcp') {
    await refreshGCP(options);
    ui.newLine();
  }

  if (provider === 'all' || provider === 'azure') {
    await refreshAzure(options);
    ui.newLine();
  }

  ui.info('Tip: Run "nimbus doctor" for a full system check');
}

export default authRefreshCommand;
