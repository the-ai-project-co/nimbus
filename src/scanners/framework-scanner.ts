/**
 * Framework Scanner
 *
 * Detects frameworks and libraries in a project
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Scanner, ScanResult, ScanOptions, FrameworkInfo, ConfidenceLevel } from './types';

interface FrameworkPattern {
  name: string;
  language: string;
  packageNames: string[]; // Package names to look for
  configFiles: string[]; // Config files specific to this framework
  directoryPattern?: string[]; // Directories that indicate the framework
}

const FRAMEWORK_PATTERNS: FrameworkPattern[] = [
  // JavaScript/TypeScript Frameworks
  {
    name: 'next.js',
    language: 'typescript',
    packageNames: ['next'],
    configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    directoryPattern: ['pages', 'app'],
  },
  {
    name: 'react',
    language: 'typescript',
    packageNames: ['react', 'react-dom'],
    configFiles: [],
  },
  {
    name: 'vue',
    language: 'typescript',
    packageNames: ['vue'],
    configFiles: ['vue.config.js', 'vite.config.ts', 'nuxt.config.ts'],
  },
  {
    name: 'nuxt',
    language: 'typescript',
    packageNames: ['nuxt', 'nuxt3'],
    configFiles: ['nuxt.config.ts', 'nuxt.config.js'],
  },
  {
    name: 'angular',
    language: 'typescript',
    packageNames: ['@angular/core'],
    configFiles: ['angular.json'],
  },
  {
    name: 'svelte',
    language: 'typescript',
    packageNames: ['svelte'],
    configFiles: ['svelte.config.js'],
  },
  {
    name: 'express',
    language: 'javascript',
    packageNames: ['express'],
    configFiles: [],
  },
  {
    name: 'fastify',
    language: 'typescript',
    packageNames: ['fastify'],
    configFiles: [],
  },
  {
    name: 'nestjs',
    language: 'typescript',
    packageNames: ['@nestjs/core'],
    configFiles: ['nest-cli.json'],
  },
  {
    name: 'hono',
    language: 'typescript',
    packageNames: ['hono'],
    configFiles: [],
  },
  {
    name: 'remix',
    language: 'typescript',
    packageNames: ['@remix-run/node', '@remix-run/react'],
    configFiles: ['remix.config.js'],
  },
  {
    name: 'astro',
    language: 'typescript',
    packageNames: ['astro'],
    configFiles: ['astro.config.mjs', 'astro.config.ts'],
  },
  {
    name: 'vite',
    language: 'typescript',
    packageNames: ['vite'],
    configFiles: ['vite.config.ts', 'vite.config.js'],
  },
  {
    name: 'electron',
    language: 'typescript',
    packageNames: ['electron'],
    configFiles: ['electron.config.js'],
  },
  // Python Frameworks
  {
    name: 'django',
    language: 'python',
    packageNames: ['django', 'Django'],
    configFiles: ['manage.py'],
    directoryPattern: ['myapp', 'config'],
  },
  {
    name: 'fastapi',
    language: 'python',
    packageNames: ['fastapi'],
    configFiles: [],
  },
  {
    name: 'flask',
    language: 'python',
    packageNames: ['flask', 'Flask'],
    configFiles: [],
  },
  {
    name: 'starlette',
    language: 'python',
    packageNames: ['starlette'],
    configFiles: [],
  },
  {
    name: 'tornado',
    language: 'python',
    packageNames: ['tornado'],
    configFiles: [],
  },
  {
    name: 'pyramid',
    language: 'python',
    packageNames: ['pyramid'],
    configFiles: [],
  },
  // Go Frameworks
  {
    name: 'gin',
    language: 'go',
    packageNames: ['github.com/gin-gonic/gin'],
    configFiles: [],
  },
  {
    name: 'echo',
    language: 'go',
    packageNames: ['github.com/labstack/echo'],
    configFiles: [],
  },
  {
    name: 'fiber',
    language: 'go',
    packageNames: ['github.com/gofiber/fiber'],
    configFiles: [],
  },
  {
    name: 'chi',
    language: 'go',
    packageNames: ['github.com/go-chi/chi'],
    configFiles: [],
  },
  // Rust Frameworks
  {
    name: 'actix-web',
    language: 'rust',
    packageNames: ['actix-web'],
    configFiles: [],
  },
  {
    name: 'axum',
    language: 'rust',
    packageNames: ['axum'],
    configFiles: [],
  },
  {
    name: 'rocket',
    language: 'rust',
    packageNames: ['rocket'],
    configFiles: [],
  },
  // Java Frameworks
  {
    name: 'spring-boot',
    language: 'java',
    packageNames: ['spring-boot', 'org.springframework.boot'],
    configFiles: ['application.properties', 'application.yml'],
  },
  {
    name: 'quarkus',
    language: 'java',
    packageNames: ['quarkus'],
    configFiles: ['application.properties'],
  },
  {
    name: 'micronaut',
    language: 'java',
    packageNames: ['io.micronaut'],
    configFiles: ['application.yml'],
  },
  // Ruby Frameworks
  {
    name: 'rails',
    language: 'ruby',
    packageNames: ['rails'],
    configFiles: ['config/routes.rb', 'config/application.rb'],
    directoryPattern: ['app/controllers', 'app/models'],
  },
  {
    name: 'sinatra',
    language: 'ruby',
    packageNames: ['sinatra'],
    configFiles: [],
  },
  // PHP Frameworks
  {
    name: 'laravel',
    language: 'php',
    packageNames: ['laravel/framework'],
    configFiles: ['artisan'],
    directoryPattern: ['app/Http', 'routes'],
  },
  {
    name: 'symfony',
    language: 'php',
    packageNames: ['symfony/symfony', 'symfony/framework-bundle'],
    configFiles: ['symfony.lock'],
  },
  // Mobile Frameworks
  {
    name: 'react-native',
    language: 'typescript',
    packageNames: ['react-native'],
    configFiles: ['metro.config.js', 'app.json'],
  },
  {
    name: 'flutter',
    language: 'dart',
    packageNames: ['flutter'],
    configFiles: ['pubspec.yaml'],
    directoryPattern: ['lib', 'android', 'ios'],
  },
  {
    name: 'expo',
    language: 'typescript',
    packageNames: ['expo'],
    configFiles: ['app.json', 'expo.config.js'],
  },
];

export class FrameworkScanner implements Scanner {
  name = 'framework';

  async scan(cwd: string, _options?: ScanOptions): Promise<ScanResult> {
    const frameworks = await this.detectFrameworks(cwd);

    return {
      detected: frameworks.length > 0,
      confidence: frameworks.length > 0 ? frameworks[0].confidence : 'low',
      details: {
        frameworks,
      },
    };
  }

  async detectFrameworks(cwd: string): Promise<FrameworkInfo[]> {
    const detected: FrameworkInfo[] = [];

    // Load package.json for JS/TS projects
    const packageJson = this.loadPackageJson(cwd);
    const requirements = this.loadRequirements(cwd);
    const goMod = this.loadGoMod(cwd);
    const cargoToml = this.loadCargoToml(cwd);

    for (const pattern of FRAMEWORK_PATTERNS) {
      const result = await this.detectFramework(cwd, pattern, {
        packageJson,
        requirements,
        goMod,
        cargoToml,
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

    // Try pyproject.toml
    const pyprojectPath = path.join(cwd, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        return fs.readFileSync(pyprojectPath, 'utf-8');
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

  private loadCargoToml(cwd: string): string | null {
    const cargoPath = path.join(cwd, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        return fs.readFileSync(cargoPath, 'utf-8');
      } catch {
        return null;
      }
    }
    return null;
  }

  private async detectFramework(
    cwd: string,
    pattern: FrameworkPattern,
    deps: {
      packageJson: Record<string, unknown> | null;
      requirements: string | null;
      goMod: string | null;
      cargoToml: string | null;
    }
  ): Promise<FrameworkInfo | null> {
    let confidence: ConfidenceLevel = 'low';
    let version: string | undefined;

    // Check config files first (highest confidence)
    for (const configFile of pattern.configFiles) {
      const configPath = path.join(cwd, configFile);
      if (fs.existsSync(configPath)) {
        confidence = 'high';
        break;
      }
    }

    // Check directory patterns
    if (pattern.directoryPattern && confidence !== 'high') {
      for (const dir of pattern.directoryPattern) {
        const dirPath = path.join(cwd, dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
          if (confidence === 'low') confidence = 'medium';
        }
      }
    }

    // Check package dependencies
    for (const packageName of pattern.packageNames) {
      // Check JavaScript/TypeScript packages
      if (deps.packageJson && ['typescript', 'javascript'].includes(pattern.language)) {
        const allDeps = {
          ...(deps.packageJson.dependencies as Record<string, string> || {}),
          ...(deps.packageJson.devDependencies as Record<string, string> || {}),
        };
        if (allDeps[packageName]) {
          version = allDeps[packageName].replace(/[\^~>=<]/g, '');
          if (confidence === 'low') confidence = 'medium';
          break;
        }
      }

      // Check Python packages
      if (deps.requirements && pattern.language === 'python') {
        const lowerReq = deps.requirements.toLowerCase();
        if (lowerReq.includes(packageName.toLowerCase())) {
          const match = deps.requirements.match(new RegExp(`${packageName}[>=~!<]*([\\d.]+)`, 'i'));
          version = match ? match[1] : undefined;
          if (confidence === 'low') confidence = 'medium';
          break;
        }
      }

      // Check Go modules
      if (deps.goMod && pattern.language === 'go') {
        if (deps.goMod.includes(packageName)) {
          if (confidence === 'low') confidence = 'medium';
          break;
        }
      }

      // Check Rust crates
      if (deps.cargoToml && pattern.language === 'rust') {
        if (deps.cargoToml.includes(packageName)) {
          const match = deps.cargoToml.match(new RegExp(`${packageName}\\s*=\\s*["']?([\\d.]+)`));
          version = match ? match[1] : undefined;
          if (confidence === 'low') confidence = 'medium';
          break;
        }
      }
    }

    if (confidence === 'low' && pattern.configFiles.length === 0) {
      return null;
    }

    // Return null if only low confidence and no config files matched
    if (confidence === 'low') {
      return null;
    }

    return {
      name: pattern.name,
      version,
      confidence,
      language: pattern.language,
    };
  }
}

/**
 * Create framework scanner instance
 */
export function createFrameworkScanner(): FrameworkScanner {
  return new FrameworkScanner();
}
