/**
 * Cloud Scanner
 *
 * Detects cloud providers and configurations in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, ScanOptions, CloudInfo, ConfidenceLevel } from './types';

interface CloudPattern {
  name: string;
  displayName: string;
  configFiles: string[];
  envVarPrefixes: string[];
  sdkPackages: string[];
  regions: string[];
}

const CLOUD_PATTERNS: CloudPattern[] = [
  {
    name: 'aws',
    displayName: 'Amazon Web Services',
    configFiles: [
      '.aws/credentials',
      '.aws/config',
      'samconfig.toml',
      'cdk.json',
      'serverless.yml',
      'template.yaml',
      'buildspec.yml',
    ],
    envVarPrefixes: ['AWS_'],
    sdkPackages: [
      '@aws-sdk',
      'aws-sdk',
      'boto3',
      'botocore',
      'aws-cdk-lib',
      'github.com/aws/aws-sdk-go',
    ],
    regions: [
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'eu-central-1',
      'eu-north-1',
      'ap-southeast-1',
      'ap-southeast-2',
      'ap-northeast-1',
      'ap-northeast-2',
      'ap-south-1',
      'sa-east-1',
      'ca-central-1',
    ],
  },
  {
    name: 'gcp',
    displayName: 'Google Cloud Platform',
    configFiles: ['.gcloud/credentials.json', 'app.yaml', 'cloudbuild.yaml', 'cloudrun.yaml'],
    envVarPrefixes: ['GOOGLE_', 'GCLOUD_', 'GCP_'],
    sdkPackages: [
      '@google-cloud',
      'google-cloud',
      'google-api-python-client',
      'cloud.google.com/go',
    ],
    regions: [
      'us-central1',
      'us-east1',
      'us-east4',
      'us-west1',
      'us-west2',
      'europe-west1',
      'europe-west2',
      'europe-west3',
      'europe-west4',
      'asia-east1',
      'asia-east2',
      'asia-northeast1',
      'asia-southeast1',
    ],
  },
  {
    name: 'azure',
    displayName: 'Microsoft Azure',
    configFiles: ['.azure/credentials', 'azure-pipelines.yml', 'host.json', 'local.settings.json'],
    envVarPrefixes: ['AZURE_', 'ARM_'],
    sdkPackages: [
      '@azure',
      'azure-sdk',
      'azure-identity',
      'azure-mgmt',
      'github.com/Azure/azure-sdk-for-go',
    ],
    regions: [
      'eastus',
      'eastus2',
      'westus',
      'westus2',
      'centralus',
      'westeurope',
      'northeurope',
      'uksouth',
      'ukwest',
      'southeastasia',
      'eastasia',
      'japaneast',
      'australiaeast',
    ],
  },
  {
    name: 'digitalocean',
    displayName: 'DigitalOcean',
    configFiles: ['.do/app.yaml', 'do.yaml'],
    envVarPrefixes: ['DIGITALOCEAN_', 'DO_'],
    sdkPackages: ['digitalocean', 'do-spaces'],
    regions: [
      'nyc1',
      'nyc2',
      'nyc3',
      'sfo1',
      'sfo2',
      'sfo3',
      'ams2',
      'ams3',
      'sgp1',
      'lon1',
      'fra1',
      'tor1',
      'blr1',
    ],
  },
  {
    name: 'heroku',
    displayName: 'Heroku',
    configFiles: ['Procfile', 'app.json', 'heroku.yml'],
    envVarPrefixes: ['HEROKU_'],
    sdkPackages: [],
    regions: ['us', 'eu'],
  },
  {
    name: 'vercel',
    displayName: 'Vercel',
    configFiles: ['vercel.json', '.vercel/project.json'],
    envVarPrefixes: ['VERCEL_'],
    sdkPackages: ['vercel', '@vercel/node'],
    regions: ['iad1', 'sfo1', 'hnd1', 'cdg1'],
  },
  {
    name: 'netlify',
    displayName: 'Netlify',
    configFiles: ['netlify.toml', '.netlify/state.json'],
    envVarPrefixes: ['NETLIFY_'],
    sdkPackages: ['netlify', '@netlify/functions'],
    regions: [],
  },
  {
    name: 'cloudflare',
    displayName: 'Cloudflare',
    configFiles: ['wrangler.toml', 'wrangler.json'],
    envVarPrefixes: ['CLOUDFLARE_', 'CF_'],
    sdkPackages: ['@cloudflare/workers-types', 'wrangler'],
    regions: [],
  },
  {
    name: 'fly',
    displayName: 'Fly.io',
    configFiles: ['fly.toml'],
    envVarPrefixes: ['FLY_'],
    sdkPackages: ['flyctl'],
    regions: ['iad', 'lax', 'sjc', 'ord', 'dfw', 'sea', 'lhr', 'ams', 'fra', 'sin', 'syd', 'nrt'],
  },
  {
    name: 'render',
    displayName: 'Render',
    configFiles: ['render.yaml'],
    envVarPrefixes: ['RENDER_'],
    sdkPackages: [],
    regions: ['oregon', 'ohio', 'virginia', 'frankfurt', 'singapore'],
  },
  {
    name: 'railway',
    displayName: 'Railway',
    configFiles: ['railway.json', 'railway.toml'],
    envVarPrefixes: ['RAILWAY_'],
    sdkPackages: [],
    regions: [],
  },
];

export class CloudScanner implements Scanner {
  name = 'cloud';

  async scan(cwd: string, _options?: ScanOptions): Promise<ScanResult> {
    const cloud = await this.detectCloud(cwd);

    return {
      detected: cloud.length > 0,
      confidence: cloud.length > 0 ? cloud[0].confidence : 'low',
      details: {
        cloud,
      },
    };
  }

  async detectCloud(cwd: string): Promise<CloudInfo[]> {
    const detected: CloudInfo[] = [];

    // Load package.json for SDK detection
    const packageJson = this.loadPackageJson(cwd);
    const requirements = this.loadRequirements(cwd);
    const goMod = this.loadGoMod(cwd);
    const terraformFiles = this.scanTerraformProviders(cwd);

    for (const pattern of CLOUD_PATTERNS) {
      const result = await this.detectCloudProvider(cwd, pattern, {
        packageJson,
        requirements,
        goMod,
        terraformFiles,
      });
      if (result) {
        detected.push(result);
      }
    }

    // Sort by confidence
    return detected.sort((a, b) => {
      const order: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };
      return order[b.confidence] - order[a.confidence];
    });
  }

  private loadPackageJson(cwd: string): Record<string, unknown> | null {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }

  private loadRequirements(cwd: string): string | null {
    const requirementsPath = path.join(cwd, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        return fs.readFileSync(requirementsPath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  }

  private loadGoMod(cwd: string): string | null {
    const goModPath = path.join(cwd, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        return fs.readFileSync(goModPath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  }

  private scanTerraformProviders(cwd: string): { providers: string[]; regions: string[] } {
    const result = { providers: [] as string[], regions: [] as string[] };
    const tfDirs = ['.', 'terraform', 'infra', 'infrastructure'];

    for (const dir of tfDirs) {
      const dirPath = path.join(cwd, dir);
      if (!fs.existsSync(dirPath)) {
        continue;
      }

      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.endsWith('.tf')) {
            const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');

            // Check for providers
            if (
              content.includes('provider "aws"') ||
              content.includes('source = "hashicorp/aws"')
            ) {
              if (!result.providers.includes('aws')) {
                result.providers.push('aws');
              }
            }
            if (
              content.includes('provider "google"') ||
              content.includes('source = "hashicorp/google"')
            ) {
              if (!result.providers.includes('gcp')) {
                result.providers.push('gcp');
              }
            }
            if (
              content.includes('provider "azurerm"') ||
              content.includes('source = "hashicorp/azurerm"')
            ) {
              if (!result.providers.includes('azure')) {
                result.providers.push('azure');
              }
            }

            // Extract regions
            const regionMatches = content.match(/region\s*=\s*["']([^"']+)["']/g);
            if (regionMatches) {
              for (const match of regionMatches) {
                const region = match.match(/["']([^"']+)["']/)?.[1];
                if (region && !result.regions.includes(region)) {
                  result.regions.push(region);
                }
              }
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return result;
  }

  private async detectCloudProvider(
    cwd: string,
    pattern: CloudPattern,
    deps: {
      packageJson: Record<string, unknown> | null;
      requirements: string | null;
      goMod: string | null;
      terraformFiles: { providers: string[]; regions: string[] };
    }
  ): Promise<CloudInfo | null> {
    let confidence: ConfidenceLevel = 'low';
    const detectedRegions: string[] = [];
    const detectedServices: string[] = [];

    // Check Terraform providers first (highest confidence)
    if (deps.terraformFiles.providers.includes(pattern.name)) {
      confidence = 'high';
      detectedRegions.push(...deps.terraformFiles.regions.filter(r => pattern.regions.includes(r)));
    }

    // Check config files
    for (const configFile of pattern.configFiles) {
      const configPath = path.join(cwd, configFile);
      if (fs.existsSync(configPath)) {
        confidence = 'high';
        break;
      }
    }

    // Check SDK packages in package.json
    if (deps.packageJson) {
      const allDeps = {
        ...((deps.packageJson.dependencies as Record<string, string>) || {}),
        ...((deps.packageJson.devDependencies as Record<string, string>) || {}),
      };

      for (const pkg of pattern.sdkPackages) {
        for (const depName of Object.keys(allDeps)) {
          if (depName.startsWith(pkg) || depName === pkg) {
            if (confidence === 'low') {
              confidence = 'medium';
            }
            detectedServices.push(depName);
          }
        }
      }
    }

    // Check Python requirements
    if (deps.requirements) {
      for (const pkg of pattern.sdkPackages) {
        if (deps.requirements.toLowerCase().includes(pkg.toLowerCase())) {
          if (confidence === 'low') {
            confidence = 'medium';
          }
        }
      }
    }

    // Check Go modules
    if (deps.goMod) {
      for (const pkg of pattern.sdkPackages) {
        if (deps.goMod.includes(pkg)) {
          if (confidence === 'low') {
            confidence = 'medium';
          }
        }
      }
    }

    // Check for .env files with cloud env vars
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
    for (const envFile of envFiles) {
      const envPath = path.join(cwd, envFile);
      if (fs.existsSync(envPath)) {
        try {
          const content = fs.readFileSync(envPath, 'utf-8');
          for (const prefix of pattern.envVarPrefixes) {
            if (content.includes(prefix)) {
              if (confidence === 'low') {
                confidence = 'medium';
              }
              break;
            }
          }
        } catch {
          // Ignore errors
        }
      }
    }

    if (confidence === 'low') {
      return null;
    }

    return {
      provider: pattern.name,
      regions: [...new Set(detectedRegions)],
      services: [...new Set(detectedServices)],
      confidence,
    };
  }

  /**
   * Get all detected cloud providers
   */
  async getProviders(cwd: string): Promise<string[]> {
    const cloudInfo = await this.detectCloud(cwd);
    return cloudInfo.map(info => info.provider);
  }

  /**
   * Get all detected cloud regions
   */
  async getRegions(cwd: string): Promise<string[]> {
    const cloudInfo = await this.detectCloud(cwd);
    const regions: string[] = [];
    for (const info of cloudInfo) {
      regions.push(...info.regions);
    }
    return [...new Set(regions)];
  }
}

/**
 * Create cloud scanner instance
 */
export function createCloudScanner(): CloudScanner {
  return new CloudScanner();
}
