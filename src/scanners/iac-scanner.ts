/**
 * IaC Scanner
 *
 * Detects Infrastructure as Code tools in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, ScanOptions, IaCInfo, ConfidenceLevel } from './types';

interface IaCPattern {
  name: string;
  type: IaCInfo['type'];
  configFiles: string[];
  directories: string[];
  extensions: string[];
}

const IAC_PATTERNS: IaCPattern[] = [
  {
    name: 'terraform',
    type: 'terraform',
    configFiles: [
      'main.tf',
      'variables.tf',
      'outputs.tf',
      'providers.tf',
      'versions.tf',
      'terraform.tfvars',
    ],
    directories: ['terraform', 'infra', 'infrastructure', 'iac', 'tf'],
    extensions: ['.tf', '.tfvars'],
  },
  {
    name: 'terragrunt',
    type: 'terraform',
    configFiles: ['terragrunt.hcl'],
    directories: [],
    extensions: ['.hcl'],
  },
  {
    name: 'opentofu',
    type: 'terraform',
    configFiles: ['.terraform-version', '.opentofu-version'],
    directories: [],
    extensions: ['.tf'],
  },
  {
    name: 'pulumi',
    type: 'pulumi',
    configFiles: ['Pulumi.yaml', 'Pulumi.yml'],
    directories: [],
    extensions: [],
  },
  {
    name: 'aws-cdk',
    type: 'cdk',
    configFiles: ['cdk.json', 'cdk.context.json'],
    directories: ['cdk', 'lib'],
    extensions: [],
  },
  {
    name: 'cdk8s',
    type: 'cdk',
    configFiles: ['cdk8s.yaml'],
    directories: [],
    extensions: [],
  },
  {
    name: 'cdktf',
    type: 'cdk',
    configFiles: ['cdktf.json'],
    directories: [],
    extensions: [],
  },
  {
    name: 'cloudformation',
    type: 'cloudformation',
    configFiles: ['template.yaml', 'template.yml', 'cloudformation.yaml', 'cloudformation.yml'],
    directories: ['cloudformation', 'cfn'],
    extensions: [],
  },
  {
    name: 'sam',
    type: 'cloudformation',
    configFiles: ['samconfig.toml', 'template.yaml'],
    directories: ['.aws-sam'],
    extensions: [],
  },
  {
    name: 'serverless',
    type: 'cloudformation',
    configFiles: ['serverless.yml', 'serverless.yaml', 'serverless.ts', 'serverless.js'],
    directories: ['.serverless'],
    extensions: [],
  },
  {
    name: 'ansible',
    type: 'ansible',
    configFiles: ['ansible.cfg', 'playbook.yml', 'playbook.yaml', 'site.yml'],
    directories: ['playbooks', 'roles', 'inventories'],
    extensions: [],
  },
  {
    name: 'chef',
    type: 'other',
    configFiles: ['Berksfile', 'metadata.rb', 'Policyfile.rb'],
    directories: ['cookbooks', 'recipes'],
    extensions: [],
  },
  {
    name: 'puppet',
    type: 'other',
    configFiles: ['Puppetfile'],
    directories: ['manifests', 'modules'],
    extensions: ['.pp'],
  },
  {
    name: 'saltstack',
    type: 'other',
    configFiles: ['master', 'minion'],
    directories: ['salt', 'pillar'],
    extensions: ['.sls'],
  },
  {
    name: 'crossplane',
    type: 'other',
    configFiles: ['crossplane.yaml'],
    directories: [],
    extensions: [],
  },
];

export class IaCScanner implements Scanner {
  name = 'iac';

  async scan(cwd: string, _options?: ScanOptions): Promise<ScanResult> {
    const iac = await this.detectIaC(cwd);

    return {
      detected: iac.length > 0,
      confidence: iac.length > 0 ? iac[0].confidence : 'low',
      details: {
        iac,
      },
    };
  }

  async detectIaC(cwd: string): Promise<IaCInfo[]> {
    const detected: IaCInfo[] = [];

    for (const pattern of IAC_PATTERNS) {
      const result = await this.detectIaCTool(cwd, pattern);
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

  private async detectIaCTool(cwd: string, pattern: IaCPattern): Promise<IaCInfo | null> {
    let confidence: ConfidenceLevel = 'low';
    const foundFiles: string[] = [];

    // Check for config files in root
    for (const file of pattern.configFiles) {
      const filePath = path.join(cwd, file);
      if (fs.existsSync(filePath)) {
        confidence = 'high';
        foundFiles.push(file);
      }
    }

    // Check for directories
    for (const dir of pattern.directories) {
      const dirPath = path.join(cwd, dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        if (confidence === 'low') {
          confidence = 'medium';
        }

        // Check for config files in directory
        for (const file of pattern.configFiles) {
          const filePath = path.join(dirPath, file);
          if (fs.existsSync(filePath)) {
            confidence = 'high';
            foundFiles.push(path.join(dir, file));
          }
        }

        // Check for files with matching extensions
        if (pattern.extensions.length > 0) {
          try {
            const files = fs.readdirSync(dirPath).slice(0, 50); // Limit for performance
            for (const file of files) {
              const ext = path.extname(file);
              if (pattern.extensions.includes(ext)) {
                confidence = 'high';
                foundFiles.push(path.join(dir, file));
              }
            }
          } catch {
            // Ignore read errors
          }
        }
      }
    }

    // Check for files with matching extensions in root
    if (pattern.extensions.length > 0 && confidence !== 'high') {
      try {
        const files = fs.readdirSync(cwd).slice(0, 100); // Limit for performance
        for (const file of files) {
          const ext = path.extname(file);
          if (pattern.extensions.includes(ext)) {
            if (confidence === 'low') {
              confidence = 'medium';
            }
            foundFiles.push(file);
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // Special handling for SAM - need to check template.yaml for Transform
    if (pattern.name === 'sam' && foundFiles.includes('template.yaml')) {
      try {
        const content = fs.readFileSync(path.join(cwd, 'template.yaml'), 'utf-8');
        if (!content.includes('AWS::Serverless')) {
          // Not a SAM template, reduce confidence
          const idx = foundFiles.indexOf('template.yaml');
          if (idx > -1) {
            foundFiles.splice(idx, 1);
          }
          if (foundFiles.length === 0) {
            return null;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    if (foundFiles.length === 0) {
      return null;
    }

    return {
      name: pattern.name,
      type: pattern.type,
      files: [...new Set(foundFiles)].slice(0, 20), // Dedupe and limit
      confidence,
    };
  }

  /**
   * Get all Terraform files in the project
   */
  async getTerraformFiles(cwd: string): Promise<string[]> {
    const files: string[] = [];

    const scanDir = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            scanDir(fullPath, relPath);
          } else if (
            entry.isFile() &&
            (entry.name.endsWith('.tf') || entry.name.endsWith('.tfvars'))
          ) {
            files.push(relPath);
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    scanDir(cwd);
    return files;
  }

  /**
   * Get all Kubernetes files in the project
   */
  async getKubernetesFiles(cwd: string): Promise<string[]> {
    const files: string[] = [];
    const k8sDirs = ['k8s', 'kubernetes', 'manifests', 'deploy', 'deployments'];

    const scanDir = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            scanDir(fullPath, relPath);
          } else if (
            entry.isFile() &&
            (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
          ) {
            // Quick check if it looks like a K8s file
            try {
              const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 500);
              if (content.includes('apiVersion:') || content.includes('kind:')) {
                files.push(relPath);
              }
            } catch {
              // Ignore read errors
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    // Scan known K8s directories
    for (const k8sDir of k8sDirs) {
      const dirPath = path.join(cwd, k8sDir);
      if (fs.existsSync(dirPath)) {
        scanDir(dirPath, k8sDir);
      }
    }

    return files;
  }

  /**
   * Get all Docker files in the project
   */
  async getDockerFiles(cwd: string): Promise<string[]> {
    const files: string[] = [];

    const scanDir = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 100);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !entry.name.includes('node_modules')
          ) {
            scanDir(fullPath, relPath);
          } else if (entry.isFile()) {
            if (
              entry.name === 'Dockerfile' ||
              entry.name.startsWith('Dockerfile.') ||
              entry.name === 'docker-compose.yml' ||
              entry.name === 'docker-compose.yaml' ||
              entry.name.startsWith('docker-compose.') ||
              entry.name === '.dockerignore'
            ) {
              files.push(relPath);
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    };

    scanDir(cwd);
    return files;
  }
}

/**
 * Create IaC scanner instance
 */
export function createIaCScanner(): IaCScanner {
  return new IaCScanner();
}
