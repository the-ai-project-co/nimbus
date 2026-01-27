# MCP Tools Team - Release 3 Codebase Analysis Specification

> **Team**: MCP Tools Team
> **Phase**: Release 3 (Months 7-9)
> **Dependencies**: Core Engine, LLM Integration Team, File System Tools

---

## Overview

Release 3 introduces advanced codebase analysis tools for deep code understanding, security auditing, architecture analysis, and AI-powered code insights. These tools enable Nimbus to provide intelligent suggestions, identify issues, and understand complex codebases.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Codebase Analysis Tool Layer                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Code Analysis                          │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │   │
│  │  │AST Analysis │  │ Dependency    │  │ Complexity    │  │   │
│  │  │             │  │ Analysis      │  │ Analysis      │  │   │
│  │  └─────────────┘  └───────────────┘  └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Security Analysis                       │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │   │
│  │  │Vulnerability│  │ Secret        │  │ OWASP         │  │   │
│  │  │ Scanner     │  │ Detection     │  │ Compliance    │  │   │
│  │  └─────────────┘  └───────────────┘  └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Architecture Analysis                    │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │   │
│  │  │ Pattern     │  │ Module        │  │ Dependency    │  │   │
│  │  │ Detection   │  │ Boundaries    │  │ Graph         │  │   │
│  │  └─────────────┘  └───────────────┘  └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AI-Powered Insights                    │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │   │
│  │  │ Code        │  │ Refactoring   │  │ Documentation │  │   │
│  │  │ Explanation │  │ Suggestions   │  │ Generation    │  │   │
│  │  └─────────────┘  └───────────────┘  └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Analysis Tools

### 1. Codebase Overview Tool

**File**: `packages/mcp-tools/src/codebase/overview.ts`

```typescript
import { z } from 'zod';
import { MCPTool } from '../types';

const codebaseOverviewSchema = z.object({
  path: z.string().describe('Root path of the codebase'),
  includePatterns: z.array(z.string()).optional().default(['**/*']),
  excludePatterns: z.array(z.string()).optional().default(['node_modules/**', 'dist/**', '.git/**']),
  depth: z.enum(['shallow', 'medium', 'deep']).default('medium'),
});

interface CodebaseOverview {
  structure: DirectoryStructure;
  languages: LanguageBreakdown[];
  entryPoints: EntryPoint[];
  frameworks: FrameworkInfo[];
  stats: CodeStats;
}

interface LanguageBreakdown {
  language: string;
  files: number;
  lines: number;
  percentage: number;
}

interface CodeStats {
  totalFiles: number;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  averageFileSize: number;
}

export const codebaseOverview: MCPTool = {
  name: 'codebase_overview',
  description: 'Analyze codebase structure, languages, and statistics',
  inputSchema: codebaseOverviewSchema,
  handler: async (input) => {
    const files = await glob(input.includePatterns, {
      cwd: input.path,
      ignore: input.excludePatterns,
    });

    const languageStats = new Map<string, { files: number; lines: number }>();
    let totalLines = 0;
    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;

    for (const file of files) {
      const ext = getExtension(file);
      const lang = detectLanguage(ext);
      const content = await fs.readFile(path.join(input.path, file), 'utf-8');
      const lines = content.split('\n');

      const stats = languageStats.get(lang) || { files: 0, lines: 0 };
      stats.files++;
      stats.lines += lines.length;
      languageStats.set(lang, stats);

      totalLines += lines.length;
      const lineStats = analyzeLines(content, lang);
      codeLines += lineStats.code;
      commentLines += lineStats.comments;
      blankLines += lineStats.blank;
    }

    const languages: LanguageBreakdown[] = Array.from(languageStats.entries())
      .map(([language, stats]) => ({
        language,
        files: stats.files,
        lines: stats.lines,
        percentage: Math.round((stats.lines / totalLines) * 100),
      }))
      .sort((a, b) => b.lines - a.lines);

    const structure = await buildDirectoryTree(input.path, input.depth);
    const entryPoints = await detectEntryPoints(input.path, files);
    const frameworks = await detectFrameworks(input.path);

    const overview: CodebaseOverview = {
      structure,
      languages,
      entryPoints,
      frameworks,
      stats: {
        totalFiles: files.length,
        totalLines,
        codeLines,
        commentLines,
        blankLines,
        averageFileSize: Math.round(totalLines / files.length),
      },
    };

    return {
      success: true,
      output: formatCodebaseOverview(overview),
      metadata: overview,
    };
  },
};
```

### 2. AST Analysis Tool

**File**: `packages/mcp-tools/src/codebase/ast-analysis.ts`

```typescript
const astAnalysisSchema = z.object({
  filePath: z.string().describe('Path to file to analyze'),
  analysisType: z.enum(['functions', 'classes', 'imports', 'exports', 'all']).default('all'),
  includeDocstrings: z.boolean().default(true),
});

interface ASTAnalysis {
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  complexity: ComplexityMetrics;
}

interface FunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType?: string;
  docstring?: string;
  lineStart: number;
  lineEnd: number;
  complexity: number;
  isAsync: boolean;
  isExported: boolean;
}

interface ClassInfo {
  name: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  extends?: string;
  implements?: string[];
  lineStart: number;
  lineEnd: number;
  docstring?: string;
}

export const astAnalysis: MCPTool = {
  name: 'codebase_ast_analysis',
  description: 'Analyze code structure using AST parsing',
  inputSchema: astAnalysisSchema,
  handler: async (input) => {
    const content = await fs.readFile(input.filePath, 'utf-8');
    const language = detectLanguageFromPath(input.filePath);

    let analysis: ASTAnalysis;

    switch (language) {
      case 'typescript':
      case 'javascript':
        analysis = await analyzeTypeScript(content, input);
        break;
      case 'python':
        analysis = await analyzePython(content, input);
        break;
      case 'go':
        analysis = await analyzeGo(content, input);
        break;
      case 'rust':
        analysis = await analyzeRust(content, input);
        break;
      default:
        return {
          success: false,
          output: '',
          error: `Unsupported language: ${language}`,
        };
    }

    return {
      success: true,
      output: formatASTAnalysis(analysis),
      metadata: analysis,
    };
  },
};

async function analyzeTypeScript(content: string, options: any): Promise<ASTAnalysis> {
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
      functions.push(extractFunctionInfo(node, sourceFile));
    }
    if (ts.isClassDeclaration(node)) {
      classes.push(extractClassInfo(node, sourceFile));
    }
    if (ts.isImportDeclaration(node)) {
      imports.push(extractImportInfo(node, sourceFile));
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      exports.push(extractExportInfo(node, sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    functions,
    classes,
    imports,
    exports,
    complexity: calculateComplexity(sourceFile),
  };
}
```

### 3. Dependency Analysis Tool

**File**: `packages/mcp-tools/src/codebase/dependency-analysis.ts`

```typescript
const dependencyAnalysisSchema = z.object({
  path: z.string().describe('Project root path'),
  analysisType: z.enum(['packages', 'imports', 'graph', 'all']).default('all'),
  includeDevDependencies: z.boolean().default(true),
  checkVulnerabilities: z.boolean().default(true),
  checkOutdated: z.boolean().default(true),
});

interface DependencyAnalysis {
  packages: PackageInfo[];
  importGraph: ImportGraph;
  vulnerabilities?: Vulnerability[];
  outdated?: OutdatedPackage[];
  circularDependencies: string[][];
  unusedDependencies: string[];
}

interface PackageInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  license: string;
  size?: string;
  directDependencies: string[];
}

interface ImportGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
}

export const dependencyAnalysis: MCPTool = {
  name: 'codebase_dependency_analysis',
  description: 'Analyze project dependencies and import relationships',
  inputSchema: dependencyAnalysisSchema,
  handler: async (input) => {
    const packageManager = await detectPackageManager(input.path);
    let packages: PackageInfo[] = [];

    // Analyze package dependencies
    if (packageManager === 'npm' || packageManager === 'yarn' || packageManager === 'pnpm') {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(input.path, 'package.json'), 'utf-8')
      );

      packages = [
        ...Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({
          name,
          version: version as string,
          type: 'production' as const,
          license: '',
          directDependencies: [],
        })),
        ...(input.includeDevDependencies
          ? Object.entries(packageJson.devDependencies || {}).map(([name, version]) => ({
              name,
              version: version as string,
              type: 'development' as const,
              license: '',
              directDependencies: [],
            }))
          : []),
      ];
    }

    // Build import graph
    const importGraph = await buildImportGraph(input.path);

    // Detect circular dependencies
    const circularDependencies = detectCircularDependencies(importGraph);

    // Find unused dependencies
    const unusedDependencies = await findUnusedDependencies(input.path, packages);

    // Check vulnerabilities
    let vulnerabilities: Vulnerability[] | undefined;
    if (input.checkVulnerabilities) {
      vulnerabilities = await checkVulnerabilities(input.path, packageManager);
    }

    // Check outdated packages
    let outdated: OutdatedPackage[] | undefined;
    if (input.checkOutdated) {
      outdated = await checkOutdated(input.path, packageManager);
    }

    const analysis: DependencyAnalysis = {
      packages,
      importGraph,
      vulnerabilities,
      outdated,
      circularDependencies,
      unusedDependencies,
    };

    return {
      success: true,
      output: formatDependencyAnalysis(analysis),
      metadata: analysis,
    };
  },
};

async function checkVulnerabilities(projectPath: string, pm: string): Promise<Vulnerability[]> {
  const args = pm === 'npm' ? ['audit', '--json'] : ['audit', '--json'];
  const result = await runCommand(pm, args, { cwd: projectPath });

  if (result.exitCode !== 0 && !result.stdout.includes('vulnerabilities')) {
    return [];
  }

  try {
    const audit = JSON.parse(result.stdout);
    return parseAuditResult(audit, pm);
  } catch {
    return [];
  }
}
```

---

## Security Analysis Tools

### 4. Security Scan Tool

**File**: `packages/mcp-tools/src/codebase/security-scan.ts`

```typescript
const securityScanSchema = z.object({
  path: z.string().describe('Path to scan'),
  scanType: z.array(z.enum([
    'secrets',
    'vulnerabilities',
    'owasp',
    'dependencies',
    'misconfigurations',
    'all',
  ])).default(['all']),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  outputFormat: z.enum(['summary', 'detailed', 'json']).default('detailed'),
});

interface SecurityScanResult {
  secrets: SecretFinding[];
  vulnerabilities: VulnerabilityFinding[];
  owaspIssues: OWASPFinding[];
  misconfigurations: MisconfigFinding[];
  summary: SecuritySummary;
}

interface SecretFinding {
  type: string;
  file: string;
  line: number;
  match: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

interface VulnerabilityFinding {
  type: string;
  file: string;
  line: number;
  code: string;
  cwe?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
}

export const securityScan: MCPTool = {
  name: 'codebase_security_scan',
  description: 'Perform comprehensive security analysis of codebase',
  inputSchema: securityScanSchema,
  handler: async (input) => {
    const scanTypes = input.scanType.includes('all')
      ? ['secrets', 'vulnerabilities', 'owasp', 'dependencies', 'misconfigurations']
      : input.scanType;

    const result: SecurityScanResult = {
      secrets: [],
      vulnerabilities: [],
      owaspIssues: [],
      misconfigurations: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    };

    // Scan for secrets
    if (scanTypes.includes('secrets')) {
      result.secrets = await scanForSecrets(input.path);
    }

    // Scan for code vulnerabilities
    if (scanTypes.includes('vulnerabilities')) {
      result.vulnerabilities = await scanForVulnerabilities(input.path);
    }

    // OWASP Top 10 analysis
    if (scanTypes.includes('owasp')) {
      result.owaspIssues = await scanForOWASP(input.path);
    }

    // Configuration issues
    if (scanTypes.includes('misconfigurations')) {
      result.misconfigurations = await scanForMisconfigurations(input.path);
    }

    // Calculate summary
    const allFindings = [
      ...result.secrets,
      ...result.vulnerabilities,
      ...result.owaspIssues,
      ...result.misconfigurations,
    ];

    result.summary = {
      total: allFindings.length,
      critical: allFindings.filter(f => f.severity === 'critical').length,
      high: allFindings.filter(f => f.severity === 'high').length,
      medium: allFindings.filter(f => f.severity === 'medium').length,
      low: allFindings.filter(f => f.severity === 'low').length,
    };

    // Filter by severity
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const minSeverityIndex = severityOrder.indexOf(input.severity);

    return {
      success: true,
      output: formatSecurityScan(result, input.outputFormat),
      metadata: result,
    };
  },
};

// Secret patterns for detection
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' as const },
  { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}/g, severity: 'critical' as const },
  { name: 'GitHub Token', pattern: /ghp_[A-Za-z0-9]{36}/g, severity: 'critical' as const },
  { name: 'Slack Token', pattern: /xox[baprs]-[A-Za-z0-9-]+/g, severity: 'high' as const },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical' as const },
  { name: 'Generic API Key', pattern: /['"][a-zA-Z0-9_]{32,}['"]/g, severity: 'medium' as const },
  { name: 'Password in Code', pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, severity: 'high' as const },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/g, severity: 'high' as const },
];

async function scanForSecrets(projectPath: string): Promise<SecretFinding[]> {
  const files = await glob(['**/*'], {
    cwd: projectPath,
    ignore: ['node_modules/**', '.git/**', '*.lock', 'package-lock.json'],
  });

  const findings: SecretFinding[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      const lines = content.split('\n');

      for (const pattern of SECRET_PATTERNS) {
        for (let i = 0; i < lines.length; i++) {
          const matches = lines[i].match(pattern.pattern);
          if (matches) {
            findings.push({
              type: pattern.name,
              file,
              line: i + 1,
              match: maskSecret(matches[0]),
              severity: pattern.severity,
              recommendation: `Remove ${pattern.name} and use environment variables or secrets manager`,
            });
          }
        }
      }
    } catch {
      // Skip binary files
    }
  }

  return findings;
}
```

### 5. OWASP Compliance Tool

**File**: `packages/mcp-tools/src/codebase/owasp-analysis.ts`

```typescript
const owaspAnalysisSchema = z.object({
  path: z.string(),
  categories: z.array(z.enum([
    'A01:2021-Broken Access Control',
    'A02:2021-Cryptographic Failures',
    'A03:2021-Injection',
    'A04:2021-Insecure Design',
    'A05:2021-Security Misconfiguration',
    'A06:2021-Vulnerable Components',
    'A07:2021-Authentication Failures',
    'A08:2021-Integrity Failures',
    'A09:2021-Logging Failures',
    'A10:2021-SSRF',
    'all',
  ])).default(['all']),
});

interface OWASPAnalysis {
  findings: OWASPFinding[];
  complianceScore: number;
  categoryScores: Record<string, number>;
  recommendations: string[];
}

interface OWASPFinding {
  category: string;
  title: string;
  file: string;
  line: number;
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  cwe: string;
  remediation: string;
}

export const owaspAnalysis: MCPTool = {
  name: 'codebase_owasp_analysis',
  description: 'Analyze code for OWASP Top 10 vulnerabilities',
  inputSchema: owaspAnalysisSchema,
  handler: async (input) => {
    const categories = input.categories.includes('all')
      ? OWASP_CATEGORIES
      : input.categories;

    const findings: OWASPFinding[] = [];

    for (const category of categories) {
      const categoryFindings = await analyzeOWASPCategory(input.path, category);
      findings.push(...categoryFindings);
    }

    // Calculate compliance scores
    const categoryScores: Record<string, number> = {};
    for (const category of OWASP_CATEGORIES) {
      const categoryFindings = findings.filter(f => f.category === category);
      const criticalCount = categoryFindings.filter(f => f.severity === 'critical').length;
      const highCount = categoryFindings.filter(f => f.severity === 'high').length;
      categoryScores[category] = Math.max(0, 100 - (criticalCount * 25) - (highCount * 10));
    }

    const complianceScore = Math.round(
      Object.values(categoryScores).reduce((a, b) => a + b, 0) / OWASP_CATEGORIES.length
    );

    const analysis: OWASPAnalysis = {
      findings,
      complianceScore,
      categoryScores,
      recommendations: generateOWASPRecommendations(findings),
    };

    return {
      success: true,
      output: formatOWASPAnalysis(analysis),
      metadata: analysis,
    };
  },
};

const OWASP_PATTERNS = {
  'A03:2021-Injection': [
    {
      pattern: /eval\s*\(/g,
      title: 'Eval Usage',
      cwe: 'CWE-94',
      severity: 'critical' as const,
      remediation: 'Avoid using eval(). Use safer alternatives like JSON.parse() or function constructors.',
    },
    {
      pattern: /\$\{.*\}/g,
      context: /exec|query|sql/i,
      title: 'Potential SQL Injection',
      cwe: 'CWE-89',
      severity: 'critical' as const,
      remediation: 'Use parameterized queries or prepared statements.',
    },
    {
      pattern: /innerHTML\s*=/g,
      title: 'DOM-based XSS Risk',
      cwe: 'CWE-79',
      severity: 'high' as const,
      remediation: 'Use textContent or sanitize HTML input.',
    },
  ],
  'A02:2021-Cryptographic Failures': [
    {
      pattern: /md5|sha1/gi,
      title: 'Weak Cryptographic Algorithm',
      cwe: 'CWE-327',
      severity: 'high' as const,
      remediation: 'Use stronger algorithms like SHA-256 or bcrypt for passwords.',
    },
    {
      pattern: /http:\/\//g,
      title: 'Insecure HTTP Usage',
      cwe: 'CWE-319',
      severity: 'medium' as const,
      remediation: 'Use HTTPS for all communications.',
    },
  ],
  'A07:2021-Authentication Failures': [
    {
      pattern: /password.*=.*['"][^'"]{1,8}['"]/gi,
      title: 'Weak Password Detected',
      cwe: 'CWE-521',
      severity: 'high' as const,
      remediation: 'Enforce strong password policies.',
    },
    {
      pattern: /jwt\.verify.*{.*algorithms.*none/gi,
      title: 'JWT Algorithm None Vulnerability',
      cwe: 'CWE-345',
      severity: 'critical' as const,
      remediation: 'Explicitly specify allowed algorithms in JWT verification.',
    },
  ],
};
```

---

## Architecture Analysis Tools

### 6. Architecture Analysis Tool

**File**: `packages/mcp-tools/src/codebase/architecture-analysis.ts`

```typescript
const architectureAnalysisSchema = z.object({
  path: z.string(),
  analysisDepth: z.enum(['surface', 'standard', 'deep']).default('standard'),
  detectPatterns: z.boolean().default(true),
  generateDiagram: z.boolean().default(true),
});

interface ArchitectureAnalysis {
  pattern: DetectedPattern;
  layers: LayerInfo[];
  modules: ModuleInfo[];
  dependencies: DependencyInfo[];
  boundaries: BoundaryInfo[];
  metrics: ArchitectureMetrics;
  diagram?: string;
}

interface DetectedPattern {
  name: string;
  confidence: number;
  description: string;
  indicators: string[];
}

interface LayerInfo {
  name: string;
  path: string;
  files: number;
  responsibilities: string[];
  dependencies: string[];
}

interface ArchitectureMetrics {
  modularity: number;
  coupling: number;
  cohesion: number;
  abstractness: number;
  instability: number;
  distance: number;
}

export const architectureAnalysis: MCPTool = {
  name: 'codebase_architecture_analysis',
  description: 'Analyze codebase architecture patterns and structure',
  inputSchema: architectureAnalysisSchema,
  handler: async (input) => {
    // Detect architecture pattern
    const pattern = await detectArchitecturePattern(input.path);

    // Analyze layers
    const layers = await analyzeLayers(input.path, pattern);

    // Analyze modules
    const modules = await analyzeModules(input.path);

    // Build dependency graph
    const dependencies = await buildDependencyGraph(input.path);

    // Detect boundaries
    const boundaries = await detectBoundaries(input.path, modules);

    // Calculate metrics
    const metrics = calculateArchitectureMetrics(modules, dependencies);

    // Generate diagram if requested
    let diagram: string | undefined;
    if (input.generateDiagram) {
      diagram = generateMermaidDiagram(layers, modules, dependencies);
    }

    const analysis: ArchitectureAnalysis = {
      pattern,
      layers,
      modules,
      dependencies,
      boundaries,
      metrics,
      diagram,
    };

    return {
      success: true,
      output: formatArchitectureAnalysis(analysis),
      metadata: analysis,
    };
  },
};

async function detectArchitecturePattern(projectPath: string): Promise<DetectedPattern> {
  const structure = await getDirectoryStructure(projectPath);
  const patterns = [
    { name: 'MVC', indicators: ['controllers', 'models', 'views'] },
    { name: 'Layered', indicators: ['presentation', 'business', 'data', 'domain'] },
    { name: 'Hexagonal', indicators: ['adapters', 'ports', 'domain', 'application'] },
    { name: 'Clean Architecture', indicators: ['entities', 'usecases', 'interfaces', 'frameworks'] },
    { name: 'Microservices', indicators: ['services', 'api-gateway', 'shared'] },
    { name: 'Modular Monolith', indicators: ['modules', 'shared', 'core'] },
    { name: 'Feature-First', indicators: ['features', 'shared', 'common'] },
  ];

  let bestMatch = { pattern: patterns[0], score: 0 };

  for (const pattern of patterns) {
    const score = calculatePatternMatch(structure, pattern.indicators);
    if (score > bestMatch.score) {
      bestMatch = { pattern, score };
    }
  }

  return {
    name: bestMatch.pattern.name,
    confidence: Math.round(bestMatch.score * 100),
    description: PATTERN_DESCRIPTIONS[bestMatch.pattern.name],
    indicators: bestMatch.pattern.indicators.filter(i =>
      structure.some(s => s.toLowerCase().includes(i.toLowerCase()))
    ),
  };
}

function generateMermaidDiagram(
  layers: LayerInfo[],
  modules: ModuleInfo[],
  dependencies: DependencyInfo[]
): string {
  let diagram = 'graph TB\n';

  // Add layer subgraphs
  for (const layer of layers) {
    diagram += `  subgraph ${layer.name}\n`;
    const layerModules = modules.filter(m => m.layer === layer.name);
    for (const mod of layerModules) {
      diagram += `    ${mod.id}["${mod.name}"]\n`;
    }
    diagram += `  end\n`;
  }

  // Add dependencies
  for (const dep of dependencies) {
    diagram += `  ${dep.from} --> ${dep.to}\n`;
  }

  return diagram;
}
```

---

## AI-Powered Insight Tools

### 7. Code Explanation Tool

**File**: `packages/mcp-tools/src/codebase/code-explanation.ts`

```typescript
const codeExplanationSchema = z.object({
  filePath: z.string().optional(),
  code: z.string().optional(),
  context: z.enum(['function', 'class', 'file', 'module']).default('function'),
  detailLevel: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  includeExamples: z.boolean().default(true),
});

interface CodeExplanation {
  summary: string;
  purpose: string;
  howItWorks: string[];
  parameters?: ParameterExplanation[];
  returnValue?: string;
  sideEffects?: string[];
  examples?: CodeExample[];
  relatedCode?: string[];
  complexity: string;
  suggestions?: string[];
}

export const codeExplanation: MCPTool = {
  name: 'codebase_explain',
  description: 'Generate AI-powered explanation of code',
  inputSchema: codeExplanationSchema,
  handler: async (input) => {
    let code: string;
    let filePath: string | undefined;

    if (input.filePath) {
      code = await fs.readFile(input.filePath, 'utf-8');
      filePath = input.filePath;
    } else if (input.code) {
      code = input.code;
    } else {
      return {
        success: false,
        output: '',
        error: 'Either filePath or code must be provided',
      };
    }

    // Use LLM to generate explanation
    const explanation = await generateExplanation(code, {
      context: input.context,
      detailLevel: input.detailLevel,
      includeExamples: input.includeExamples,
      filePath,
    });

    return {
      success: true,
      output: formatCodeExplanation(explanation),
      metadata: explanation,
    };
  },
};

async function generateExplanation(
  code: string,
  options: ExplanationOptions
): Promise<CodeExplanation> {
  const prompt = buildExplanationPrompt(code, options);

  // Call LLM through abstraction layer
  const response = await llmClient.complete({
    model: 'claude-sonnet-4-20250514',
    messages: [
      {
        role: 'system',
        content: `You are a code explanation expert. Analyze the provided code and generate a clear, accurate explanation.

Detail level: ${options.detailLevel}
Context: ${options.context}

Provide your response in the following JSON format:
{
  "summary": "Brief one-line summary",
  "purpose": "What the code is meant to accomplish",
  "howItWorks": ["Step 1...", "Step 2..."],
  "parameters": [{"name": "...", "type": "...", "description": "..."}],
  "returnValue": "What is returned",
  "sideEffects": ["Any side effects"],
  "examples": [{"description": "...", "code": "..."}],
  "complexity": "Time/space complexity if applicable",
  "suggestions": ["Potential improvements"]
}`,
      },
      {
        role: 'user',
        content: code,
      },
    ],
    maxTokens: 2000,
  });

  return JSON.parse(response.content);
}
```

### 8. Refactoring Suggestions Tool

**File**: `packages/mcp-tools/src/codebase/refactoring.ts`

```typescript
const refactoringSuggestionsSchema = z.object({
  path: z.string().describe('File or directory to analyze'),
  focusAreas: z.array(z.enum([
    'complexity',
    'duplication',
    'naming',
    'structure',
    'performance',
    'readability',
    'testability',
    'all',
  ])).default(['all']),
  maxSuggestions: z.number().default(10),
  includeDiff: z.boolean().default(true),
});

interface RefactoringSuggestion {
  type: string;
  file: string;
  lineStart: number;
  lineEnd: number;
  originalCode: string;
  suggestedCode: string;
  explanation: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  benefits: string[];
}

export const refactoringSuggestions: MCPTool = {
  name: 'codebase_refactoring_suggestions',
  description: 'Generate AI-powered refactoring suggestions',
  inputSchema: refactoringSuggestionsSchema,
  handler: async (input) => {
    const files = await getFilesToAnalyze(input.path);
    const allSuggestions: RefactoringSuggestion[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const analysis = await analyzeForRefactoring(content, file, input.focusAreas);
      allSuggestions.push(...analysis);
    }

    // Sort by impact and limit
    const sortedSuggestions = allSuggestions
      .sort((a, b) => {
        const impactOrder = { high: 3, medium: 2, low: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      })
      .slice(0, input.maxSuggestions);

    return {
      success: true,
      output: formatRefactoringSuggestions(sortedSuggestions, input.includeDiff),
      metadata: { suggestions: sortedSuggestions },
    };
  },
};

async function analyzeForRefactoring(
  code: string,
  filePath: string,
  focusAreas: string[]
): Promise<RefactoringSuggestion[]> {
  const suggestions: RefactoringSuggestion[] = [];

  // Complexity analysis
  if (focusAreas.includes('all') || focusAreas.includes('complexity')) {
    const complexFunctions = findComplexFunctions(code);
    for (const func of complexFunctions) {
      suggestions.push({
        type: 'Reduce Complexity',
        file: filePath,
        lineStart: func.lineStart,
        lineEnd: func.lineEnd,
        originalCode: func.code,
        suggestedCode: await generateSimplifiedCode(func.code),
        explanation: `Function has cyclomatic complexity of ${func.complexity}. Consider extracting helper functions.`,
        impact: func.complexity > 15 ? 'high' : 'medium',
        effort: 'medium',
        benefits: ['Improved readability', 'Easier testing', 'Better maintainability'],
      });
    }
  }

  // Duplication analysis
  if (focusAreas.includes('all') || focusAreas.includes('duplication')) {
    const duplicates = findDuplicatedCode(code);
    for (const dup of duplicates) {
      suggestions.push({
        type: 'Extract Duplicate Code',
        file: filePath,
        lineStart: dup.lineStart,
        lineEnd: dup.lineEnd,
        originalCode: dup.code,
        suggestedCode: await generateExtractedFunction(dup.code),
        explanation: `This code block appears ${dup.occurrences} times. Consider extracting to a reusable function.`,
        impact: 'medium',
        effort: 'low',
        benefits: ['DRY principle', 'Single point of change', 'Reduced code size'],
      });
    }
  }

  return suggestions;
}
```

---

## Project Structure

```
packages/mcp-tools/src/
├── codebase/
│   ├── overview.ts              # Codebase overview analysis
│   ├── ast-analysis.ts          # AST parsing and analysis
│   ├── dependency-analysis.ts   # Dependency graph and analysis
│   ├── security-scan.ts         # Security vulnerability scanning
│   ├── owasp-analysis.ts        # OWASP Top 10 compliance
│   ├── architecture-analysis.ts # Architecture pattern detection
│   ├── code-explanation.ts      # AI code explanation
│   ├── refactoring.ts           # Refactoring suggestions
│   ├── documentation.ts         # Documentation generation
│   └── index.ts
├── utils/
│   ├── ast-parser.ts            # Multi-language AST parsing
│   ├── pattern-matcher.ts       # Pattern matching utilities
│   ├── graph-builder.ts         # Dependency graph utilities
│   ├── mermaid-generator.ts     # Diagram generation
│   └── llm-prompts.ts           # LLM prompt templates
└── index.ts
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-210 | As a developer, I want to get codebase overview | Overview shows languages, stats, structure | Sprint 13-14 |
| US-211 | As a developer, I want to analyze code structure | AST analysis shows functions, classes, imports | Sprint 13-14 |
| US-212 | As a developer, I want dependency analysis | Dependency graph with vulnerabilities shown | Sprint 13-14 |
| US-213 | As a security engineer, I want security scanning | Secrets, vulns, OWASP issues detected | Sprint 15-16 |
| US-214 | As an architect, I want architecture analysis | Pattern detection and metrics calculated | Sprint 15-16 |
| US-215 | As a developer, I want AI code explanations | Clear explanations with examples | Sprint 15-16 |
| US-216 | As a developer, I want refactoring suggestions | Actionable suggestions with diffs | Sprint 17-18 |

---

## Sprint Breakdown

### Sprint 13-14 (Weeks 1-4) - Core Analysis

| Task | Effort | Deliverable |
|------|--------|-------------|
| Codebase overview tool | 3 days | Language detection, stats |
| AST analysis tool | 4 days | Multi-language parsing |
| Dependency analysis tool | 3 days | Import graph, vulnerabilities |
| Basic security scan | 3 days | Secret detection |

### Sprint 15-16 (Weeks 5-8) - Security & Architecture

| Task | Effort | Deliverable |
|------|--------|-------------|
| Full security scan | 4 days | OWASP compliance |
| Architecture analysis | 4 days | Pattern detection, metrics |
| Mermaid diagram generation | 2 days | Visual diagrams |
| AI code explanation | 3 days | LLM integration |

### Sprint 17-18 (Weeks 9-12) - AI Insights

| Task | Effort | Deliverable |
|------|--------|-------------|
| Refactoring suggestions | 4 days | AI-powered suggestions |
| Documentation generation | 3 days | Auto-generated docs |
| Integration with CLI | 3 days | `nimbus analyze` command |
| Testing and polish | 3 days | Production-ready |

---

## Acceptance Criteria

- [ ] Codebase overview detects languages and frameworks accurately
- [ ] AST analysis supports TypeScript, Python, Go, Rust
- [ ] Dependency analysis detects vulnerabilities and circular deps
- [ ] Security scan finds secrets with low false positive rate
- [ ] OWASP analysis covers all Top 10 categories
- [ ] Architecture analysis detects common patterns
- [ ] AI explanations are accurate and helpful
- [ ] Refactoring suggestions include working code diffs
- [ ] All tools have comprehensive error handling

---

## Integration Points

### With CLI Team
- `nimbus analyze` command uses these tools
- `nimbus explain` uses code explanation tool
- Security findings displayed in rich UI

### With Core Engine
- Tools registered in MCP tool registry
- Results flow through Core Engine
- Caching for expensive analyses

### With LLM Integration
- AI explanations use LLM abstraction layer
- Structured prompts for consistent output
- Token optimization for large codebases

---

*Document Version: 1.0*
*Last Updated: January 2026*
