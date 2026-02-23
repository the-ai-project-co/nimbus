/**
 * Language Scanner
 *
 * Detects programming languages in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, ScanOptions, LanguageInfo, ConfidenceLevel } from './types';

interface LanguagePattern {
  name: string;
  configFiles: string[];
  extensions: string[];
  versionExtractor?: (cwd: string) => string | undefined;
}

const LANGUAGE_PATTERNS: LanguagePattern[] = [
  {
    name: 'typescript',
    configFiles: ['tsconfig.json', 'tsconfig.base.json'],
    extensions: ['.ts', '.tsx'],
    versionExtractor: (cwd: string) => {
      const tsconfigPath = path.join(cwd, 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
          return tsconfig.compilerOptions?.target;
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'javascript',
    configFiles: ['package.json', 'jsconfig.json'],
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    name: 'python',
    configFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'setup.cfg'],
    extensions: ['.py', '.pyw', '.pyi'],
    versionExtractor: (cwd: string) => {
      const pyprojectPath = path.join(cwd, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        try {
          const content = fs.readFileSync(pyprojectPath, 'utf-8');
          const match = content.match(/requires-python\s*=\s*["']([^"']+)["']/);
          return match ? match[1] : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'go',
    configFiles: ['go.mod', 'go.sum'],
    extensions: ['.go'],
    versionExtractor: (cwd: string) => {
      const goModPath = path.join(cwd, 'go.mod');
      if (fs.existsSync(goModPath)) {
        try {
          const content = fs.readFileSync(goModPath, 'utf-8');
          const match = content.match(/^go\s+(\d+\.\d+)/m);
          return match ? match[1] : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'rust',
    configFiles: ['Cargo.toml', 'Cargo.lock'],
    extensions: ['.rs'],
    versionExtractor: (cwd: string) => {
      const cargoPath = path.join(cwd, 'Cargo.toml');
      if (fs.existsSync(cargoPath)) {
        try {
          const content = fs.readFileSync(cargoPath, 'utf-8');
          const match = content.match(/rust-version\s*=\s*["']([^"']+)["']/);
          return match ? match[1] : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'java',
    configFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'],
    extensions: ['.java'],
  },
  {
    name: 'kotlin',
    configFiles: ['build.gradle.kts'],
    extensions: ['.kt', '.kts'],
  },
  {
    name: 'swift',
    configFiles: ['Package.swift', '*.xcodeproj', '*.xcworkspace'],
    extensions: ['.swift'],
  },
  {
    name: 'ruby',
    configFiles: ['Gemfile', 'Gemfile.lock', '*.gemspec'],
    extensions: ['.rb', '.rake'],
    versionExtractor: (cwd: string) => {
      const rubyVersionPath = path.join(cwd, '.ruby-version');
      if (fs.existsSync(rubyVersionPath)) {
        try {
          return fs.readFileSync(rubyVersionPath, 'utf-8').trim();
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'php',
    configFiles: ['composer.json', 'composer.lock'],
    extensions: ['.php'],
    versionExtractor: (cwd: string) => {
      const composerPath = path.join(cwd, 'composer.json');
      if (fs.existsSync(composerPath)) {
        try {
          const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
          return composer.require?.php?.replace(/[^0-9.]/g, '');
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
  },
  {
    name: 'csharp',
    configFiles: ['*.csproj', '*.sln'],
    extensions: ['.cs'],
  },
  {
    name: 'scala',
    configFiles: ['build.sbt', 'build.sc'],
    extensions: ['.scala', '.sc'],
  },
  {
    name: 'elixir',
    configFiles: ['mix.exs'],
    extensions: ['.ex', '.exs'],
  },
  {
    name: 'haskell',
    configFiles: ['*.cabal', 'stack.yaml'],
    extensions: ['.hs', '.lhs'],
  },
  {
    name: 'lua',
    configFiles: ['.luacheckrc', 'rockspec'],
    extensions: ['.lua'],
  },
  {
    name: 'dart',
    configFiles: ['pubspec.yaml'],
    extensions: ['.dart'],
  },
];

export class LanguageScanner implements Scanner {
  name = 'language';

  async scan(cwd: string, _options?: ScanOptions): Promise<ScanResult> {
    const languages = await this.detectLanguages(cwd);

    return {
      detected: languages.length > 0,
      confidence: languages.length > 0 ? languages[0].confidence : 'low',
      details: {
        languages,
      },
    };
  }

  async detectLanguages(cwd: string): Promise<LanguageInfo[]> {
    const detected: LanguageInfo[] = [];

    for (const pattern of LANGUAGE_PATTERNS) {
      const result = await this.detectLanguage(cwd, pattern);
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

  private async detectLanguage(
    cwd: string,
    pattern: LanguagePattern
  ): Promise<LanguageInfo | null> {
    const foundFiles: string[] = [];
    let confidence: ConfidenceLevel = 'low';

    // Check for config files
    for (const configFile of pattern.configFiles) {
      if (configFile.includes('*')) {
        // Glob pattern - simple check for directory existence
        const parts = configFile.split('*');
        const dir = path.join(cwd, parts[0]);
        if (fs.existsSync(dir)) {
          foundFiles.push(configFile);
          confidence = 'high';
        }
      } else {
        const filePath = path.join(cwd, configFile);
        if (fs.existsSync(filePath)) {
          foundFiles.push(configFile);
          confidence = 'high';
        }
      }
    }

    // Quick extension check in common directories
    const dirsToCheck = ['src', 'lib', 'app', 'pkg', 'internal', 'cmd', '.'];
    for (const dir of dirsToCheck) {
      const dirPath = path.join(cwd, dir);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        try {
          const files = fs.readdirSync(dirPath).slice(0, 20); // Limit for performance
          for (const file of files) {
            const ext = path.extname(file);
            if (pattern.extensions.includes(ext)) {
              foundFiles.push(path.join(dir, file));
              if (confidence === 'low') {
                confidence = 'medium';
              }
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    if (foundFiles.length === 0) {
      return null;
    }

    // Extract version if available
    const version = pattern.versionExtractor?.(cwd);

    return {
      name: pattern.name,
      version,
      confidence,
      files: foundFiles.slice(0, 10), // Limit files reported
    };
  }
}

/**
 * Create language scanner instance
 */
export function createLanguageScanner(): LanguageScanner {
  return new LanguageScanner();
}
