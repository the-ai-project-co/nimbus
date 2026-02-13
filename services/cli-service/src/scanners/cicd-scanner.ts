/**
 * CI/CD Scanner
 *
 * Detects CI/CD platforms and workflows in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, CICDInfo, ConfidenceLevel } from './types';

interface CICDPattern {
  name: string;
  displayName: string;
  configPaths: string[];
  workflowPattern?: RegExp;
}

const CICD_PATTERNS: CICDPattern[] = [
  {
    name: 'github-actions',
    displayName: 'GitHub Actions',
    configPaths: ['.github/workflows'],
    workflowPattern: /\.ya?ml$/,
  },
  {
    name: 'gitlab-ci',
    displayName: 'GitLab CI',
    configPaths: ['.gitlab-ci.yml', '.gitlab-ci.yaml'],
  },
  {
    name: 'jenkins',
    displayName: 'Jenkins',
    configPaths: ['Jenkinsfile', 'jenkins/Jenkinsfile', '.jenkins'],
  },
  {
    name: 'circleci',
    displayName: 'CircleCI',
    configPaths: ['.circleci/config.yml', '.circleci/config.yaml'],
  },
  {
    name: 'travis-ci',
    displayName: 'Travis CI',
    configPaths: ['.travis.yml', '.travis.yaml'],
  },
  {
    name: 'azure-pipelines',
    displayName: 'Azure Pipelines',
    configPaths: ['azure-pipelines.yml', 'azure-pipelines.yaml', '.azure-pipelines'],
  },
  {
    name: 'bitbucket-pipelines',
    displayName: 'Bitbucket Pipelines',
    configPaths: ['bitbucket-pipelines.yml', 'bitbucket-pipelines.yaml'],
  },
  {
    name: 'drone',
    displayName: 'Drone CI',
    configPaths: ['.drone.yml', '.drone.yaml'],
  },
  {
    name: 'buildkite',
    displayName: 'Buildkite',
    configPaths: ['.buildkite/pipeline.yml', '.buildkite/pipeline.yaml', 'buildkite.yml'],
  },
  {
    name: 'teamcity',
    displayName: 'TeamCity',
    configPaths: ['.teamcity'],
  },
  {
    name: 'concourse',
    displayName: 'Concourse CI',
    configPaths: ['ci/pipeline.yml', 'ci/pipeline.yaml', 'concourse.yml'],
  },
  {
    name: 'codebuild',
    displayName: 'AWS CodeBuild',
    configPaths: ['buildspec.yml', 'buildspec.yaml'],
  },
  {
    name: 'cloudbuild',
    displayName: 'Google Cloud Build',
    configPaths: ['cloudbuild.yaml', 'cloudbuild.yml'],
  },
  {
    name: 'tekton',
    displayName: 'Tekton',
    configPaths: ['.tekton', 'tekton'],
  },
  {
    name: 'argo-workflows',
    displayName: 'Argo Workflows',
    configPaths: ['.argo'],
  },
  {
    name: 'woodpecker',
    displayName: 'Woodpecker CI',
    configPaths: ['.woodpecker.yml', '.woodpecker.yaml', '.woodpecker'],
  },
  {
    name: 'earthly',
    displayName: 'Earthly',
    configPaths: ['Earthfile'],
  },
  {
    name: 'dagger',
    displayName: 'Dagger',
    configPaths: ['dagger.json', 'dagger'],
  },
  {
    name: 'taskfile',
    displayName: 'Task (Taskfile)',
    configPaths: ['Taskfile.yml', 'Taskfile.yaml', 'Taskfile.dist.yml'],
  },
  {
    name: 'makefile',
    displayName: 'Make',
    configPaths: ['Makefile', 'makefile', 'GNUmakefile'],
  },
  {
    name: 'justfile',
    displayName: 'Just',
    configPaths: ['justfile', 'Justfile', '.justfile'],
  },
];

export class CICDScanner implements Scanner {
  name = 'cicd';

  async scan(cwd: string): Promise<ScanResult> {
    const cicd = await this.detectCICD(cwd);

    return {
      detected: cicd.length > 0,
      confidence: cicd.length > 0 ? cicd[0].confidence : 'low',
      details: {
        cicd,
      },
    };
  }

  async detectCICD(cwd: string): Promise<CICDInfo[]> {
    const detected: CICDInfo[] = [];

    for (const pattern of CICD_PATTERNS) {
      const result = await this.detectCICDPlatform(cwd, pattern);
      if (result) {
        detected.push(result);
      }
    }

    // Sort by confidence, then prioritize CI/CD over build tools
    return detected.sort((a, b) => {
      const order: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };
      const confDiff = order[b.confidence] - order[a.confidence];
      if (confDiff !== 0) return confDiff;

      // Prioritize CI/CD platforms over local build tools
      const buildTools = ['makefile', 'taskfile', 'justfile'];
      const aIsBuildTool = buildTools.includes(a.platform);
      const bIsBuildTool = buildTools.includes(b.platform);
      if (aIsBuildTool && !bIsBuildTool) return 1;
      if (!aIsBuildTool && bIsBuildTool) return -1;
      return 0;
    });
  }

  private async detectCICDPlatform(
    cwd: string,
    pattern: CICDPattern
  ): Promise<CICDInfo | null> {
    let confidence: ConfidenceLevel = 'low';
    const workflows: string[] = [];

    for (const configPath of pattern.configPaths) {
      const fullPath = path.join(cwd, configPath);

      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // It's a directory, look for workflow files
          try {
            const files = fs.readdirSync(fullPath);
            for (const file of files) {
              if (pattern.workflowPattern) {
                if (pattern.workflowPattern.test(file)) {
                  workflows.push(path.join(configPath, file));
                  confidence = 'high';
                }
              } else {
                workflows.push(path.join(configPath, file));
                confidence = 'high';
              }
            }
          } catch {
            // Ignore read errors
          }
        } else {
          // It's a file
          workflows.push(configPath);
          confidence = 'high';
        }
      }
    }

    if (workflows.length === 0) {
      return null;
    }

    return {
      platform: pattern.name,
      workflows,
      confidence,
    };
  }

  /**
   * Get all CI/CD workflow files
   */
  async getCICDFiles(cwd: string): Promise<string[]> {
    const files: string[] = [];
    const cicdInfo = await this.detectCICD(cwd);

    for (const info of cicdInfo) {
      files.push(...info.workflows);
    }

    return [...new Set(files)];
  }

  /**
   * Get the primary CI/CD platform
   */
  async getPrimaryCICDPlatform(cwd: string): Promise<string | null> {
    const cicdInfo = await this.detectCICD(cwd);

    // Filter out local build tools
    const buildTools = ['makefile', 'taskfile', 'justfile'];
    const platforms = cicdInfo.filter(info => !buildTools.includes(info.platform));

    if (platforms.length === 0) {
      return null;
    }

    return platforms[0].platform;
  }
}

/**
 * Create CI/CD scanner instance
 */
export function createCICDScanner(): CICDScanner {
  return new CICDScanner();
}
