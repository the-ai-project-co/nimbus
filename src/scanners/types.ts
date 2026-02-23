/**
 * Scanner Types
 *
 * Type definitions for project scanners
 */

/**
 * Confidence level for detection
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Base scan result for all scanners
 */
export interface ScanResult {
  detected: boolean;
  confidence: ConfidenceLevel;
  details: Record<string, unknown>;
}

/**
 * Scanner interface
 */
export interface Scanner {
  name: string;
  scan(cwd: string, options?: ScanOptions): Promise<ScanResult>;
}

/**
 * Language detection result
 */
export interface LanguageInfo {
  name: string;
  version?: string;
  confidence: ConfidenceLevel;
  files: string[];
}

/**
 * Framework detection result
 */
export interface FrameworkInfo {
  name: string;
  version?: string;
  confidence: ConfidenceLevel;
  language: string;
}

/**
 * Package manager detection result
 */
export interface PackageManagerInfo {
  name: string;
  lockFile?: string;
  confidence: ConfidenceLevel;
}

/**
 * Infrastructure as Code detection result
 */
export interface IaCInfo {
  name: string;
  type: 'terraform' | 'pulumi' | 'cdk' | 'cloudformation' | 'ansible' | 'other';
  files: string[];
  confidence: ConfidenceLevel;
}

/**
 * CI/CD detection result
 */
export interface CICDInfo {
  platform: string;
  workflows: string[];
  confidence: ConfidenceLevel;
}

/**
 * Cloud provider detection result
 */
export interface CloudInfo {
  provider: string;
  regions: string[];
  services: string[];
  confidence: ConfidenceLevel;
}

/**
 * Git repository info
 */
export interface GitInfo {
  isRepo: boolean;
  remote: string | null;
  branch: string;
  hasUncommittedChanges: boolean;
}

/**
 * Complete project context from scanning
 */
export interface ProjectContext {
  project: {
    name: string;
    path: string;
    detected_at: string;
  };
  structure: {
    type: ProjectType;
    languages: LanguageInfo[];
    frameworks: FrameworkInfo[];
    packageManagers: PackageManagerInfo[];
  };
  files: {
    terraform: string[];
    kubernetes: string[];
    docker: string[];
    cicd: string[];
  };
  git: GitInfo;
  cicd: {
    platform: string | null;
    workflows: string[];
  };
  cloud: {
    providers: string[];
    regions: string[];
  };
  instructions: string;
}

/**
 * Project type classification
 */
export type ProjectType =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'monorepo'
  | 'library'
  | 'infrastructure'
  | 'mobile'
  | 'cli'
  | 'unknown';

/**
 * Scan options
 */
export interface ScanOptions {
  /** Scan depth: quick, standard, or deep */
  depth: 'quick' | 'standard' | 'deep';
  /** Maximum files to scan per pattern */
  maxFiles?: number;
  /** Include hidden directories */
  includeHidden?: boolean;
  /** Custom project instructions */
  instructions?: string;
  /** Maximum directory depth for scanning */
  maxDepth?: number;
}

/**
 * Aggregate scan results from all scanners
 */
export interface AggregateScanResult {
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  packageManagers: PackageManagerInfo[];
  iac: IaCInfo[];
  cicd: CICDInfo[];
  cloud: CloudInfo[];
  git: GitInfo;
  projectType: ProjectType;
}
