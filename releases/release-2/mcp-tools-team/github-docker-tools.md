# MCP Tools Team - GitHub & Docker Tools Specification

> **Team**: MCP Tools Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: Core Engine, MVP Git/GitHub Tools
> **Priority**: HIGH

---

## Overview

In Release 2, the MCP Tools Team extends GitHub integration to include comprehensive Pull Request operations (read, review, analyze, merge), Issue analysis, AI-powered commit message generation, and Docker container management tools.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  GitHub & Docker Tool Layer (R2)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                GitHub Advanced Operations                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │ PR Read  │  │ PR Review│  │ PR Merge │  │ Analyze │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Docker Operations                       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │  Build   │  │Push/Pull │  │   Run    │  │ Compose │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AI-Powered Features                     │   │
│  │  ┌────────────────┐  ┌────────────────────────────────┐ │   │
│  │  │ Commit Message │  │      PR Analysis               │ │   │
│  │  │   Generation   │  │  (Security, Quality, Tests)    │ │   │
│  │  └────────────────┘  └────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Advanced GitHub PR Tools

### 1.1 github_pr_read

**File**: `packages/mcp-tools/src/github/pr-read.ts`

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  repo: z.string().optional().describe('Repository (owner/repo)'),
  prNumber: z.number().describe('Pull request number'),
  include: z.array(z.enum([
    'diff',
    'files',
    'comments',
    'reviews',
    'commits',
    'checks'
  ])).optional().default(['diff', 'files', 'comments']),
});

export const githubPRRead: MCPTool = {
  name: 'github_pr_read',
  description: 'Read complete pull request details including diff, comments, and reviews',
  inputSchema,
  handler: async (input) => {
    const baseArgs = ['pr', 'view', String(input.prNumber), '--json',
      'number,title,body,state,author,baseRefName,headRefName,' +
      'additions,deletions,changedFiles,createdAt,updatedAt,' +
      'mergeable,mergeStateStatus,isDraft,labels,assignees,' +
      'reviewRequests,reviewDecision'];

    if (input.repo) {
      baseArgs.push('--repo', input.repo);
    }

    const result = await runCommand('gh', baseArgs);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const prData = JSON.parse(result.stdout);
    const output: PRReadOutput = { ...prData };

    // Fetch additional data based on include options
    if (input.include.includes('diff')) {
      const diffResult = await runCommand('gh', [
        'pr', 'diff', String(input.prNumber),
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.diff = diffResult.stdout;
    }

    if (input.include.includes('files')) {
      const filesResult = await runCommand('gh', [
        'pr', 'view', String(input.prNumber),
        '--json', 'files',
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.files = JSON.parse(filesResult.stdout).files;
    }

    if (input.include.includes('comments')) {
      const commentsResult = await runCommand('gh', [
        'pr', 'view', String(input.prNumber),
        '--json', 'comments',
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.comments = JSON.parse(commentsResult.stdout).comments;
    }

    if (input.include.includes('reviews')) {
      const reviewsResult = await runCommand('gh', [
        'pr', 'view', String(input.prNumber),
        '--json', 'reviews',
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.reviews = JSON.parse(reviewsResult.stdout).reviews;
    }

    if (input.include.includes('commits')) {
      const commitsResult = await runCommand('gh', [
        'pr', 'view', String(input.prNumber),
        '--json', 'commits',
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.commits = JSON.parse(commitsResult.stdout).commits;
    }

    if (input.include.includes('checks')) {
      const checksResult = await runCommand('gh', [
        'pr', 'checks', String(input.prNumber),
        '--json', 'name,state,conclusion,startedAt,completedAt',
        ...(input.repo ? ['--repo', input.repo] : []),
      ]);
      output.checks = JSON.parse(checksResult.stdout);
    }

    return {
      success: true,
      output: formatPRDetails(output),
      metadata: {
        prNumber: input.prNumber,
        title: prData.title,
        state: prData.state,
        additions: prData.additions,
        deletions: prData.deletions,
        filesChanged: prData.changedFiles,
        mergeable: prData.mergeable,
        reviewDecision: prData.reviewDecision,
        ...output,
      },
    };
  },
};

interface PRReadOutput {
  number: number;
  title: string;
  body: string;
  state: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: string;
  reviewDecision: string;
  isDraft: boolean;
  diff?: string;
  files?: Array<{ path: string; additions: number; deletions: number }>;
  comments?: Array<{ body: string; author: { login: string }; createdAt: string }>;
  reviews?: Array<{ body: string; author: { login: string }; state: string }>;
  commits?: Array<{ oid: string; message: string; author: { name: string } }>;
  checks?: Array<{ name: string; state: string; conclusion: string }>;
}
```

### 1.2 github_pr_comment

**File**: `packages/mcp-tools/src/github/pr-comment.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  prNumber: z.number().describe('Pull request number'),
  body: z.string().describe('Comment body'),
  // For inline comments (review comments)
  path: z.string().optional().describe('File path for inline comment'),
  line: z.number().optional().describe('Line number for inline comment'),
  side: z.enum(['LEFT', 'RIGHT']).optional().describe('Side of diff'),
});

export const githubPRComment: MCPTool = {
  name: 'github_pr_comment',
  description: 'Add a comment to a pull request (general or inline)',
  inputSchema,
  handler: async (input) => {
    // If path and line are provided, it's an inline review comment
    if (input.path && input.line) {
      // Use GitHub API for review comments
      const apiArgs = [
        'api',
        '-X', 'POST',
        `/repos/${input.repo || await getCurrentRepo()}/pulls/${input.prNumber}/comments`,
        '-f', `body=${input.body}`,
        '-f', `path=${input.path}`,
        '-F', `line=${input.line}`,
        '-f', `side=${input.side || 'RIGHT'}`,
        '-f', 'commit_id=$(gh pr view ' + input.prNumber + ' --json headRefOid -q .headRefOid)',
      ];

      const result = await runCommand('gh', apiArgs);

      return {
        success: result.exitCode === 0,
        output: result.exitCode === 0
          ? `Added inline comment on ${input.path}:${input.line}`
          : '',
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    }

    // General PR comment
    const args = ['pr', 'comment', String(input.prNumber), '--body', input.body];

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? 'Comment added successfully' : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        prNumber: input.prNumber,
        isInline: false,
      },
    };
  },
};
```

### 1.3 github_pr_review

**File**: `packages/mcp-tools/src/github/pr-review.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  prNumber: z.number().describe('Pull request number'),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  body: z.string().optional().describe('Review body'),
  comments: z.array(z.object({
    path: z.string(),
    line: z.number(),
    body: z.string(),
    side: z.enum(['LEFT', 'RIGHT']).optional(),
  })).optional().describe('Inline review comments'),
});

export const githubPRReview: MCPTool = {
  name: 'github_pr_review',
  description: 'Submit a review on a pull request (approve, request changes, or comment)',
  inputSchema,
  handler: async (input) => {
    const args = ['pr', 'review', String(input.prNumber)];

    switch (input.event) {
      case 'APPROVE':
        args.push('--approve');
        break;
      case 'REQUEST_CHANGES':
        args.push('--request-changes');
        break;
      case 'COMMENT':
        args.push('--comment');
        break;
    }

    if (input.body) {
      args.push('--body', input.body);
    }

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    // Handle inline comments separately if provided
    if (input.comments && input.comments.length > 0 && result.exitCode === 0) {
      for (const comment of input.comments) {
        await runCommand('gh', [
          'api', '-X', 'POST',
          `/repos/${input.repo || await getCurrentRepo()}/pulls/${input.prNumber}/comments`,
          '-f', `body=${comment.body}`,
          '-f', `path=${comment.path}`,
          '-F', `line=${comment.line}`,
        ]);
      }
    }

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Review submitted: ${input.event}`
        : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        prNumber: input.prNumber,
        reviewType: input.event,
        inlineCommentsCount: input.comments?.length || 0,
      },
    };
  },
};
```

### 1.4 github_pr_merge

**File**: `packages/mcp-tools/src/github/pr-merge.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  prNumber: z.number().describe('Pull request number'),
  method: z.enum(['merge', 'squash', 'rebase']).optional().default('merge'),
  subject: z.string().optional().describe('Commit subject'),
  body: z.string().optional().describe('Commit body'),
  deleteBranch: z.boolean().optional().default(false),
  autoMerge: z.boolean().optional().describe('Enable auto-merge when checks pass'),
});

export const githubPRMerge: MCPTool = {
  name: 'github_pr_merge',
  description: 'Merge a pull request',
  inputSchema,
  handler: async (input) => {
    // First check if PR is mergeable
    const checkResult = await runCommand('gh', [
      'pr', 'view', String(input.prNumber),
      '--json', 'mergeable,mergeStateStatus,reviewDecision',
      ...(input.repo ? ['--repo', input.repo] : []),
    ]);

    if (checkResult.exitCode !== 0) {
      return { success: false, output: '', error: checkResult.stderr };
    }

    const prStatus = JSON.parse(checkResult.stdout);

    if (prStatus.mergeable === 'CONFLICTING') {
      return {
        success: false,
        output: '',
        error: 'PR has merge conflicts. Please resolve conflicts first.',
      };
    }

    if (input.autoMerge) {
      // Enable auto-merge
      const autoMergeArgs = [
        'pr', 'merge', String(input.prNumber),
        '--auto',
        `--${input.method}`,
        ...(input.repo ? ['--repo', input.repo] : []),
      ];

      const result = await runCommand('gh', autoMergeArgs);

      return {
        success: result.exitCode === 0,
        output: result.exitCode === 0 ? 'Auto-merge enabled' : '',
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    }

    // Regular merge
    const args = ['pr', 'merge', String(input.prNumber), `--${input.method}`];

    if (input.subject) {
      args.push('--subject', input.subject);
    }

    if (input.body) {
      args.push('--body', input.body);
    }

    if (input.deleteBranch) {
      args.push('--delete-branch');
    }

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? `PR #${input.prNumber} merged successfully` : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        prNumber: input.prNumber,
        method: input.method,
        branchDeleted: input.deleteBranch,
      },
    };
  },
};
```

### 1.5 github_pr_checkout

**File**: `packages/mcp-tools/src/github/pr-checkout.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  prNumber: z.number().describe('Pull request number'),
  detach: z.boolean().optional().describe('Checkout in detached HEAD mode'),
});

export const githubPRCheckout: MCPTool = {
  name: 'github_pr_checkout',
  description: 'Checkout a pull request locally',
  inputSchema,
  handler: async (input) => {
    const args = ['pr', 'checkout', String(input.prNumber)];

    if (input.detach) {
      args.push('--detach');
    }

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Checked out PR #${input.prNumber}`
        : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        prNumber: input.prNumber,
      },
    };
  },
};
```

---

## Part 2: AI-Powered Commit Message Generation

### 2.1 github_commit_message_generate

**File**: `packages/mcp-tools/src/github/commit-message-generate.ts`

```typescript
const inputSchema = z.object({
  style: z.enum(['conventional', 'semantic', 'descriptive', 'gitmoji']).optional().default('conventional'),
  includeBody: z.boolean().optional().default(true),
  maxSubjectLength: z.number().optional().default(50),
  scope: z.string().optional().describe('Scope for conventional commits'),
  path: z.string().optional().describe('Repository path'),
});

export const githubCommitMessageGenerate: MCPTool = {
  name: 'github_commit_message_generate',
  description: 'Generate an AI-powered commit message based on staged changes',
  inputSchema,
  handler: async (input) => {
    // Get staged diff
    const diffResult = await runCommand('git', ['diff', '--staged'], input.path);

    if (diffResult.exitCode !== 0) {
      return { success: false, output: '', error: diffResult.stderr };
    }

    if (!diffResult.stdout.trim()) {
      return {
        success: false,
        output: '',
        error: 'No staged changes found. Stage some changes first with git add.',
      };
    }

    // Get list of staged files
    const filesResult = await runCommand('git', ['diff', '--staged', '--name-only'], input.path);
    const stagedFiles = filesResult.stdout.trim().split('\n');

    // Get diff stats
    const statsResult = await runCommand('git', ['diff', '--staged', '--stat'], input.path);

    // Analyze the diff using LLM
    const analysis = await analyzeChanges(diffResult.stdout, stagedFiles);

    // Generate commit message based on style
    const message = generateMessage(analysis, {
      style: input.style,
      scope: input.scope,
      maxSubjectLength: input.maxSubjectLength,
      includeBody: input.includeBody,
    });

    // Generate alternative suggestions
    const alternatives = generateAlternatives(analysis, input.style);

    return {
      success: true,
      output: formatCommitMessage(message, alternatives),
      metadata: {
        subject: message.subject,
        body: message.body,
        type: message.type,
        scope: message.scope,
        breakingChange: message.breakingChange,
        stagedFiles,
        alternatives,
      },
    };
  },
};

interface ChangeAnalysis {
  type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore' | 'perf';
  scope?: string;
  summary: string;
  details: string[];
  breakingChange: boolean;
  affectedComponents: string[];
}

interface CommitMessage {
  subject: string;
  body?: string;
  type: string;
  scope?: string;
  breakingChange: boolean;
}

async function analyzeChanges(diff: string, files: string[]): Promise<ChangeAnalysis> {
  // This would call the LLM to analyze the diff
  // For now, return a placeholder implementation

  const analysis: ChangeAnalysis = {
    type: 'feat',
    summary: 'Implement new feature',
    details: [],
    breakingChange: false,
    affectedComponents: [],
  };

  // Analyze file patterns to determine type
  if (files.some(f => f.includes('test'))) {
    analysis.type = 'test';
  } else if (files.some(f => f.match(/\.(md|txt|rst)$/))) {
    analysis.type = 'docs';
  } else if (files.some(f => f.match(/\.(css|scss|less)$/))) {
    analysis.type = 'style';
  }

  // Detect scope from file paths
  const commonPath = findCommonPath(files);
  if (commonPath) {
    analysis.scope = commonPath;
  }

  return analysis;
}

function generateMessage(analysis: ChangeAnalysis, options: {
  style: string;
  scope?: string;
  maxSubjectLength: number;
  includeBody: boolean;
}): CommitMessage {
  const scope = options.scope || analysis.scope;

  let subject: string;

  switch (options.style) {
    case 'conventional':
      subject = scope
        ? `${analysis.type}(${scope}): ${analysis.summary}`
        : `${analysis.type}: ${analysis.summary}`;
      break;

    case 'semantic':
      const semanticType = analysis.type.charAt(0).toUpperCase() + analysis.type.slice(1);
      subject = `${semanticType}: ${analysis.summary}`;
      break;

    case 'gitmoji':
      const emoji = getGitmojiForType(analysis.type);
      subject = `${emoji} ${analysis.summary}`;
      break;

    case 'descriptive':
    default:
      subject = analysis.summary;
  }

  // Truncate if too long
  if (subject.length > options.maxSubjectLength) {
    subject = subject.substring(0, options.maxSubjectLength - 3) + '...';
  }

  const body = options.includeBody && analysis.details.length > 0
    ? analysis.details.map(d => `- ${d}`).join('\n')
    : undefined;

  return {
    subject,
    body,
    type: analysis.type,
    scope,
    breakingChange: analysis.breakingChange,
  };
}

function getGitmojiForType(type: string): string {
  const gitmojis: Record<string, string> = {
    feat: '✨',
    fix: '🐛',
    docs: '📝',
    style: '💄',
    refactor: '♻️',
    test: '✅',
    chore: '🔧',
    perf: '⚡️',
  };
  return gitmojis[type] || '📦';
}
```

---

## Part 3: PR and Issue Analysis

### 3.1 github_pr_analyze

**File**: `packages/mcp-tools/src/github/pr-analyze.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  prNumber: z.number().describe('Pull request number'),
  analysisTypes: z.array(z.enum([
    'code_quality',
    'security',
    'performance',
    'best_practices',
    'test_coverage',
    'documentation',
  ])).optional().default(['code_quality', 'security', 'best_practices']),
});

export const githubPRAnalyze: MCPTool = {
  name: 'github_pr_analyze',
  description: 'AI-powered analysis of a pull request',
  inputSchema,
  handler: async (input) => {
    // Fetch PR details
    const prResult = await runCommand('gh', [
      'pr', 'view', String(input.prNumber),
      '--json', 'title,body,additions,deletions,changedFiles,files,commits',
      ...(input.repo ? ['--repo', input.repo] : []),
    ]);

    if (prResult.exitCode !== 0) {
      return { success: false, output: '', error: prResult.stderr };
    }

    const prData = JSON.parse(prResult.stdout);

    // Fetch diff
    const diffResult = await runCommand('gh', [
      'pr', 'diff', String(input.prNumber),
      ...(input.repo ? ['--repo', input.repo] : []),
    ]);

    const analysis: PRAnalysis = {
      summary: '',
      riskLevel: 'low',
      issues: [],
      suggestions: [],
      reviewers: [],
      scores: {},
    };

    // Analyze based on requested types
    for (const analysisType of input.analysisTypes) {
      switch (analysisType) {
        case 'code_quality':
          analysis.scores.codeQuality = await analyzeCodeQuality(diffResult.stdout);
          break;
        case 'security':
          analysis.scores.security = await analyzeSecurityRisks(diffResult.stdout, prData.files);
          break;
        case 'performance':
          analysis.scores.performance = await analyzePerformance(diffResult.stdout);
          break;
        case 'best_practices':
          analysis.scores.bestPractices = await analyzeBestPractices(diffResult.stdout, prData.files);
          break;
        case 'test_coverage':
          analysis.scores.testCoverage = await analyzeTestCoverage(prData.files, diffResult.stdout);
          break;
        case 'documentation':
          analysis.scores.documentation = await analyzeDocumentation(prData.files, diffResult.stdout);
          break;
      }
    }

    // Calculate overall risk level
    analysis.riskLevel = calculateRiskLevel(analysis.scores, analysis.issues);

    // Generate summary
    analysis.summary = generatePRSummary(prData, analysis);

    // Suggest reviewers based on file ownership
    analysis.reviewers = await suggestReviewers(prData.files, input.repo);

    return {
      success: true,
      output: formatPRAnalysis(analysis),
      metadata: {
        prNumber: input.prNumber,
        ...analysis,
      },
    };
  },
};

interface PRAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  issues: Array<{
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    file?: string;
    line?: number;
  }>;
  suggestions: Array<{
    type: string;
    message: string;
    file?: string;
    suggestion?: string;
  }>;
  reviewers: string[];
  scores: {
    codeQuality?: number;
    security?: number;
    performance?: number;
    bestPractices?: number;
    testCoverage?: number;
    documentation?: number;
  };
}

async function analyzeSecurityRisks(diff: string, files: any[]): Promise<number> {
  const issues: string[] = [];

  // Check for common security patterns
  const securityPatterns = [
    { pattern: /password\s*=\s*['"][^'"]+['"]/gi, issue: 'Hardcoded password' },
    { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi, issue: 'Hardcoded API key' },
    { pattern: /secret\s*=\s*['"][^'"]+['"]/gi, issue: 'Hardcoded secret' },
    { pattern: /eval\s*\(/gi, issue: 'Use of eval()' },
    { pattern: /innerHTML\s*=/gi, issue: 'Potential XSS via innerHTML' },
    { pattern: /exec\s*\(/gi, issue: 'Use of exec()' },
    { pattern: /dangerouslySetInnerHTML/gi, issue: 'React dangerouslySetInnerHTML' },
  ];

  for (const { pattern, issue } of securityPatterns) {
    if (pattern.test(diff)) {
      issues.push(issue);
    }
  }

  // Score from 0-100 (100 = no issues)
  return Math.max(0, 100 - (issues.length * 20));
}
```

### 3.2 github_issue_analyze

**File**: `packages/mcp-tools/src/github/issue-analyze.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  issueNumber: z.number().describe('Issue number'),
});

export const githubIssueAnalyze: MCPTool = {
  name: 'github_issue_analyze',
  description: 'AI-powered analysis of a GitHub issue',
  inputSchema,
  handler: async (input) => {
    // Fetch issue details
    const issueResult = await runCommand('gh', [
      'issue', 'view', String(input.issueNumber),
      '--json', 'title,body,labels,comments,assignees,author,createdAt',
      ...(input.repo ? ['--repo', input.repo] : []),
    ]);

    if (issueResult.exitCode !== 0) {
      return { success: false, output: '', error: issueResult.stderr };
    }

    const issueData = JSON.parse(issueResult.stdout);

    // Analyze the issue
    const analysis: IssueAnalysis = {
      summary: '',
      type: 'unknown',
      priority: 'medium',
      suggestedLabels: [],
      relatedFiles: [],
      potentialFixLocations: [],
      estimatedEffort: '',
      suggestedAssignees: [],
    };

    // Determine issue type from content
    analysis.type = classifyIssueType(issueData.title, issueData.body);

    // Determine priority
    analysis.priority = assessPriority(issueData.title, issueData.body, issueData.labels);

    // Suggest labels
    analysis.suggestedLabels = suggestLabels(issueData.title, issueData.body, analysis.type);

    // Find related files in codebase
    analysis.relatedFiles = await findRelatedFiles(issueData.title, issueData.body);

    // Generate summary
    analysis.summary = generateIssueSummary(issueData, analysis);

    // Estimate effort
    analysis.estimatedEffort = estimateEffort(analysis.type, analysis.relatedFiles.length);

    return {
      success: true,
      output: formatIssueAnalysis(analysis),
      metadata: {
        issueNumber: input.issueNumber,
        ...analysis,
      },
    };
  },
};

interface IssueAnalysis {
  summary: string;
  type: 'bug' | 'feature' | 'docs' | 'question' | 'enhancement' | 'unknown';
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggestedLabels: string[];
  relatedFiles: string[];
  potentialFixLocations: Array<{ file: string; reason: string }>;
  estimatedEffort: string;
  suggestedAssignees: string[];
}

function classifyIssueType(title: string, body: string): IssueAnalysis['type'] {
  const text = `${title} ${body}`.toLowerCase();

  if (text.includes('bug') || text.includes('error') || text.includes('crash') ||
      text.includes('not working') || text.includes('broken')) {
    return 'bug';
  }

  if (text.includes('feature') || text.includes('add') || text.includes('implement') ||
      text.includes('request')) {
    return 'feature';
  }

  if (text.includes('docs') || text.includes('documentation') || text.includes('readme')) {
    return 'docs';
  }

  if (text.includes('?') || text.includes('how') || text.includes('question')) {
    return 'question';
  }

  if (text.includes('improve') || text.includes('enhance') || text.includes('optimize')) {
    return 'enhancement';
  }

  return 'unknown';
}
```

---

## Part 4: Docker Tools

### 4.1 docker_build

**File**: `packages/mcp-tools/src/docker/build.ts`

```typescript
const inputSchema = z.object({
  path: z.string().optional().default('.').describe('Build context path'),
  file: z.string().optional().describe('Dockerfile path'),
  tag: z.string().describe('Image tag'),
  buildArgs: z.record(z.string()).optional(),
  target: z.string().optional().describe('Target stage for multi-stage builds'),
  noCache: z.boolean().optional().default(false),
  pull: z.boolean().optional().default(false),
  platform: z.string().optional().describe('Target platform (e.g., linux/amd64)'),
});

export const dockerBuild: MCPTool = {
  name: 'docker_build',
  description: 'Build a Docker image',
  inputSchema,
  handler: async (input) => {
    const args = ['build', '-t', input.tag];

    if (input.file) {
      args.push('-f', input.file);
    }

    if (input.buildArgs) {
      for (const [key, value] of Object.entries(input.buildArgs)) {
        args.push('--build-arg', `${key}=${value}`);
      }
    }

    if (input.target) {
      args.push('--target', input.target);
    }

    if (input.noCache) {
      args.push('--no-cache');
    }

    if (input.pull) {
      args.push('--pull');
    }

    if (input.platform) {
      args.push('--platform', input.platform);
    }

    args.push(input.path);

    const result = await runCommand('docker', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        tag: input.tag,
        context: input.path,
      },
    };
  },
};
```

### 4.2 docker_push

**File**: `packages/mcp-tools/src/docker/push.ts`

```typescript
const inputSchema = z.object({
  image: z.string().describe('Image name with tag'),
  allTags: z.boolean().optional().default(false),
});

export const dockerPush: MCPTool = {
  name: 'docker_push',
  description: 'Push a Docker image to registry',
  inputSchema,
  handler: async (input) => {
    const args = ['push'];

    if (input.allTags) {
      args.push('--all-tags');
    }

    args.push(input.image);

    const result = await runCommand('docker', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        image: input.image,
      },
    };
  },
};
```

### 4.3 docker_run

**File**: `packages/mcp-tools/src/docker/run.ts`

```typescript
const inputSchema = z.object({
  image: z.string().describe('Image name'),
  name: z.string().optional().describe('Container name'),
  detach: z.boolean().optional().default(false),
  rm: z.boolean().optional().default(false),
  ports: z.array(z.string()).optional().describe('Port mappings (e.g., "8080:80")'),
  volumes: z.array(z.string()).optional().describe('Volume mounts'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  envFile: z.string().optional().describe('Path to env file'),
  network: z.string().optional(),
  command: z.string().optional().describe('Command to run'),
});

export const dockerRun: MCPTool = {
  name: 'docker_run',
  description: 'Run a Docker container',
  inputSchema,
  handler: async (input) => {
    const args = ['run'];

    if (input.name) {
      args.push('--name', input.name);
    }

    if (input.detach) {
      args.push('-d');
    }

    if (input.rm) {
      args.push('--rm');
    }

    if (input.ports) {
      for (const port of input.ports) {
        args.push('-p', port);
      }
    }

    if (input.volumes) {
      for (const volume of input.volumes) {
        args.push('-v', volume);
      }
    }

    if (input.env) {
      for (const [key, value] of Object.entries(input.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    if (input.envFile) {
      args.push('--env-file', input.envFile);
    }

    if (input.network) {
      args.push('--network', input.network);
    }

    args.push(input.image);

    if (input.command) {
      args.push(...input.command.split(' '));
    }

    const result = await runCommand('docker', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        image: input.image,
        name: input.name,
        detached: input.detach,
      },
    };
  },
};
```

### 4.4 docker_compose_up

**File**: `packages/mcp-tools/src/docker/compose-up.ts`

```typescript
const inputSchema = z.object({
  file: z.string().optional().describe('Compose file path'),
  services: z.array(z.string()).optional().describe('Specific services to start'),
  detach: z.boolean().optional().default(true),
  build: z.boolean().optional().default(false),
  forceRecreate: z.boolean().optional().default(false),
  noRecreate: z.boolean().optional().default(false),
  removeOrphans: z.boolean().optional().default(false),
  scale: z.record(z.number()).optional().describe('Service scaling'),
});

export const dockerComposeUp: MCPTool = {
  name: 'docker_compose_up',
  description: 'Start Docker Compose services',
  inputSchema,
  handler: async (input) => {
    const args = ['compose'];

    if (input.file) {
      args.push('-f', input.file);
    }

    args.push('up');

    if (input.detach) {
      args.push('-d');
    }

    if (input.build) {
      args.push('--build');
    }

    if (input.forceRecreate) {
      args.push('--force-recreate');
    }

    if (input.noRecreate) {
      args.push('--no-recreate');
    }

    if (input.removeOrphans) {
      args.push('--remove-orphans');
    }

    if (input.scale) {
      for (const [service, count] of Object.entries(input.scale)) {
        args.push('--scale', `${service}=${count}`);
      }
    }

    if (input.services) {
      args.push(...input.services);
    }

    const result = await runCommand('docker', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        file: input.file || 'docker-compose.yml',
        services: input.services,
        detached: input.detach,
      },
    };
  },
};
```

### 4.5 dockerfile_generate

**File**: `packages/mcp-tools/src/docker/dockerfile-generate.ts`

```typescript
const inputSchema = z.object({
  baseImage: z.string().describe('Base image'),
  language: z.enum(['node', 'python', 'go', 'java', 'rust', 'ruby']).optional(),
  workDir: z.string().optional().default('/app'),
  copyFiles: z.array(z.string()).optional(),
  runCommands: z.array(z.string()).optional(),
  exposePort: z.number().optional(),
  entrypoint: z.string().optional(),
  cmd: z.string().optional(),
  multiStage: z.boolean().optional().default(false),
  outputPath: z.string().optional().default('Dockerfile'),
});

export const dockerfileGenerate: MCPTool = {
  name: 'dockerfile_generate',
  description: 'Generate a Dockerfile based on project requirements',
  inputSchema,
  handler: async (input) => {
    const lines: string[] = [];

    // Build stage for multi-stage builds
    if (input.multiStage && input.language) {
      lines.push(`# Build stage`);
      lines.push(`FROM ${getBuildImage(input.language)} AS builder`);
      lines.push(`WORKDIR ${input.workDir}`);
      lines.push(...getBuildInstructions(input.language));
      lines.push('');
    }

    // Runtime stage
    lines.push(`# ${input.multiStage ? 'Runtime stage' : 'Application'}`);
    lines.push(`FROM ${input.baseImage}`);
    lines.push('');
    lines.push(`WORKDIR ${input.workDir}`);
    lines.push('');

    // Copy files
    if (input.multiStage && input.language) {
      lines.push(...getCopyFromBuilder(input.language));
    } else if (input.copyFiles) {
      for (const file of input.copyFiles) {
        lines.push(`COPY ${file} .`);
      }
    }

    // Run commands
    if (input.runCommands) {
      lines.push('');
      for (const cmd of input.runCommands) {
        lines.push(`RUN ${cmd}`);
      }
    }

    // Expose port
    if (input.exposePort) {
      lines.push('');
      lines.push(`EXPOSE ${input.exposePort}`);
    }

    // Entrypoint and CMD
    if (input.entrypoint) {
      lines.push('');
      lines.push(`ENTRYPOINT ["${input.entrypoint.split(' ').join('", "')}"]`);
    }

    if (input.cmd) {
      lines.push('');
      lines.push(`CMD ["${input.cmd.split(' ').join('", "')}"]`);
    }

    const dockerfileContent = lines.join('\n');

    // Write file
    await fs.writeFile(input.outputPath, dockerfileContent);

    return {
      success: true,
      output: `Generated Dockerfile at ${input.outputPath}`,
      artifacts: [{
        type: 'file',
        path: input.outputPath,
        content: dockerfileContent,
      }],
      metadata: {
        baseImage: input.baseImage,
        language: input.language,
        multiStage: input.multiStage,
      },
    };
  },
};
```

---

## Project Structure

```
packages/mcp-tools/src/
├── github/
│   ├── pr-read.ts           # Read PR details
│   ├── pr-comment.ts        # Add comments to PRs
│   ├── pr-review.ts         # Submit PR reviews
│   ├── pr-merge.ts          # Merge PRs
│   ├── pr-checkout.ts       # Checkout PRs locally
│   ├── pr-analyze.ts        # AI-powered PR analysis
│   ├── issue-analyze.ts     # AI-powered issue analysis
│   ├── commit-message-generate.ts  # AI commit message generation
│   └── index.ts
├── docker/
│   ├── build.ts             # Build images
│   ├── push.ts              # Push to registry
│   ├── pull.ts              # Pull from registry
│   ├── run.ts               # Run containers
│   ├── stop.ts              # Stop containers
│   ├── logs.ts              # Container logs
│   ├── ps.ts                # List containers
│   ├── images.ts            # List images
│   ├── compose-up.ts        # Compose up
│   ├── compose-down.ts      # Compose down
│   ├── dockerfile-generate.ts  # Generate Dockerfiles
│   └── index.ts
└── index.ts
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-110 | As a user, I want to read PR details | PR info with diff, comments returned | Sprint 7-8 |
| US-111 | As a user, I want to review PRs | Approve/request changes works | Sprint 7-8 |
| US-112 | As a user, I want AI PR analysis | Security, quality issues identified | Sprint 7-8 |
| US-113 | As a user, I want AI commit messages | Smart messages generated from diff | Sprint 7-8 |
| US-114 | As a user, I want to merge PRs | Merge with squash/rebase works | Sprint 7-8 |
| US-115 | As a user, I want to build Docker images | docker build works | Sprint 9-10 |
| US-116 | As a user, I want to push/pull images | Registry operations work | Sprint 9-10 |
| US-117 | As a user, I want to run containers | docker run works | Sprint 9-10 |
| US-118 | As a user, I want to use docker-compose | Compose up/down works | Sprint 9-10 |
| US-119 | As a user, I want Dockerfile generation | Best-practice Dockerfiles created | Sprint 9-10 |

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| github_pr_read | 2 days | Full PR reading with diff, comments |
| github_pr_comment | 1 day | PR commenting (inline + general) |
| github_pr_review | 2 days | Review submission |
| github_pr_merge | 1 day | Merge with options |
| github_pr_analyze | 3 days | AI-powered PR analysis |
| github_commit_message_generate | 2 days | AI commit messages |
| github_issue_analyze | 2 days | AI issue analysis |

### Sprint 9-10 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| docker_build | 2 days | Image building |
| docker_push/pull | 1 day | Registry operations |
| docker_run/stop | 2 days | Container lifecycle |
| docker_logs/ps | 1 day | Container inspection |
| docker_compose_up/down | 2 days | Compose management |
| dockerfile_generate | 2 days | Dockerfile generation |
| Integration tests | 3 days | All tools tested |

---

## Acceptance Criteria

- [ ] Full PR details readable including diff, comments, reviews
- [ ] PR reviews (approve, request changes) working
- [ ] AI-powered PR analysis identifies security and quality issues
- [ ] AI generates meaningful commit messages from staged changes
- [ ] Docker images can be built, pushed, pulled
- [ ] Docker containers can be run, stopped, inspected
- [ ] Docker Compose up/down working
- [ ] Dockerfile generation creates best-practice files
- [ ] All tools have proper error handling
- [ ] All tools return structured metadata

---

*Document Version: 1.0*
*Last Updated: January 2026*
