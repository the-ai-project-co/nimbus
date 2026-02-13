/**
 * Package Manager Scanner
 *
 * Detects package managers used in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, PackageManagerInfo, ConfidenceLevel } from './types';

interface PackageManagerPattern {
  name: string;
  lockFiles: string[];
  configFiles: string[];
  language: string;
}

const PACKAGE_MANAGER_PATTERNS: PackageManagerPattern[] = [
  // JavaScript/TypeScript
  {
    name: 'npm',
    lockFiles: ['package-lock.json'],
    configFiles: ['.npmrc'],
    language: 'javascript',
  },
  {
    name: 'yarn',
    lockFiles: ['yarn.lock'],
    configFiles: ['.yarnrc', '.yarnrc.yml'],
    language: 'javascript',
  },
  {
    name: 'pnpm',
    lockFiles: ['pnpm-lock.yaml'],
    configFiles: ['.pnpmrc', 'pnpm-workspace.yaml'],
    language: 'javascript',
  },
  {
    name: 'bun',
    lockFiles: ['bun.lockb'],
    configFiles: ['bunfig.toml'],
    language: 'javascript',
  },
  // Python
  {
    name: 'pip',
    lockFiles: [],
    configFiles: ['requirements.txt', 'requirements-dev.txt'],
    language: 'python',
  },
  {
    name: 'pipenv',
    lockFiles: ['Pipfile.lock'],
    configFiles: ['Pipfile'],
    language: 'python',
  },
  {
    name: 'poetry',
    lockFiles: ['poetry.lock'],
    configFiles: ['pyproject.toml'],
    language: 'python',
  },
  {
    name: 'uv',
    lockFiles: ['uv.lock'],
    configFiles: ['pyproject.toml'],
    language: 'python',
  },
  {
    name: 'conda',
    lockFiles: ['conda-lock.yml'],
    configFiles: ['environment.yml', 'environment.yaml'],
    language: 'python',
  },
  // Go
  {
    name: 'go-modules',
    lockFiles: ['go.sum'],
    configFiles: ['go.mod'],
    language: 'go',
  },
  // Rust
  {
    name: 'cargo',
    lockFiles: ['Cargo.lock'],
    configFiles: ['Cargo.toml'],
    language: 'rust',
  },
  // Ruby
  {
    name: 'bundler',
    lockFiles: ['Gemfile.lock'],
    configFiles: ['Gemfile'],
    language: 'ruby',
  },
  // PHP
  {
    name: 'composer',
    lockFiles: ['composer.lock'],
    configFiles: ['composer.json'],
    language: 'php',
  },
  // Java
  {
    name: 'maven',
    lockFiles: [],
    configFiles: ['pom.xml'],
    language: 'java',
  },
  {
    name: 'gradle',
    lockFiles: ['gradle.lockfile'],
    configFiles: ['build.gradle', 'build.gradle.kts', 'settings.gradle'],
    language: 'java',
  },
  // .NET
  {
    name: 'nuget',
    lockFiles: ['packages.lock.json'],
    configFiles: ['*.csproj', 'nuget.config'],
    language: 'csharp',
  },
  // Swift
  {
    name: 'swift-pm',
    lockFiles: ['Package.resolved'],
    configFiles: ['Package.swift'],
    language: 'swift',
  },
  // Dart
  {
    name: 'pub',
    lockFiles: ['pubspec.lock'],
    configFiles: ['pubspec.yaml'],
    language: 'dart',
  },
  // Elixir
  {
    name: 'mix',
    lockFiles: ['mix.lock'],
    configFiles: ['mix.exs'],
    language: 'elixir',
  },
  // Haskell
  {
    name: 'stack',
    lockFiles: ['stack.yaml.lock'],
    configFiles: ['stack.yaml'],
    language: 'haskell',
  },
  {
    name: 'cabal',
    lockFiles: ['cabal.project.freeze'],
    configFiles: ['*.cabal'],
    language: 'haskell',
  },
];

export class PackageManagerScanner implements Scanner {
  name = 'package-manager';

  async scan(cwd: string): Promise<ScanResult> {
    const packageManagers = await this.detectPackageManagers(cwd);

    return {
      detected: packageManagers.length > 0,
      confidence: packageManagers.length > 0 ? packageManagers[0].confidence : 'low',
      details: {
        packageManagers,
      },
    };
  }

  async detectPackageManagers(cwd: string): Promise<PackageManagerInfo[]> {
    const detected: PackageManagerInfo[] = [];

    for (const pattern of PACKAGE_MANAGER_PATTERNS) {
      const result = await this.detectPackageManager(cwd, pattern);
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

  private async detectPackageManager(
    cwd: string,
    pattern: PackageManagerPattern
  ): Promise<PackageManagerInfo | null> {
    let confidence: ConfidenceLevel = 'low';
    let lockFile: string | undefined;

    // Check for lock files first (highest confidence)
    for (const file of pattern.lockFiles) {
      const filePath = path.join(cwd, file);
      if (fs.existsSync(filePath)) {
        confidence = 'high';
        lockFile = file;
        break;
      }
    }

    // Check for config files
    if (confidence !== 'high') {
      for (const file of pattern.configFiles) {
        if (file.includes('*')) {
          // Glob pattern - simple check
          const extension = file.replace('*', '');
          try {
            const files = fs.readdirSync(cwd);
            if (files.some(f => f.endsWith(extension))) {
              confidence = 'medium';
              break;
            }
          } catch {
            // Ignore errors
          }
        } else {
          const filePath = path.join(cwd, file);
          if (fs.existsSync(filePath)) {
            // Special handling for pyproject.toml - need to check for poetry section
            if (file === 'pyproject.toml' && pattern.name === 'poetry') {
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('[tool.poetry]')) {
                  confidence = 'high';
                }
              } catch {
                // Ignore errors
              }
            } else if (file === 'pyproject.toml' && pattern.name === 'uv') {
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                if (content.includes('[tool.uv]')) {
                  confidence = 'high';
                }
              } catch {
                // Ignore errors
              }
            } else {
              confidence = confidence === 'low' ? 'medium' : confidence;
            }
            break;
          }
        }
      }
    }

    if (confidence === 'low') {
      return null;
    }

    return {
      name: pattern.name,
      lockFile,
      confidence,
    };
  }
}

/**
 * Create package manager scanner instance
 */
export function createPackageManagerScanner(): PackageManagerScanner {
  return new PackageManagerScanner();
}
