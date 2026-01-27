# Enterprise Backend Team - Release 4 Specification

> **Team**: Enterprise Backend Team
> **Phase**: Release 4 (Months 10-12)
> **Dependencies**: Core Engine, Infrastructure Team

---

## Overview

In Release 4, the Enterprise Backend Team implements compliance automation (SOC2, HIPAA, PCI-DSS), the marketplace backend for templates and plugins, on-premise deployment capabilities, and advanced RBAC for enterprise customers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Enterprise Backend - R4                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                Compliance Engine                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │ Scanner │  │ Policy  │  │   Fix   │  │  Report   │  │   │
│  │  │         │  │ Engine  │  │ Engine  │  │ Generator │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                Marketplace Service                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │ Catalog │  │ Billing │  │ Reviews │  │ Publisher │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              On-Premise Deployment                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐ │   │
│  │  │  Helm   │  │ License │  │    Air-Gap Support      │ │   │
│  │  │ Charts  │  │ Manager │  │                         │ │   │
│  │  └─────────┘  └─────────┘  └─────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Compliance Automation

### 1. Compliance Scanner

**File**: `packages/enterprise/src/compliance/scanner.ts`

```typescript
import { z } from 'zod';

interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  standard: string;
  section: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  check: (context: ScanContext) => Promise<ControlResult>;
  fix?: (context: ScanContext) => Promise<FixResult>;
}

interface ControlResult {
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message: string;
  resources?: string[];
  evidence?: Record<string, unknown>;
}

interface ScanContext {
  awsAccountId?: string;
  gcpProjectId?: string;
  azureSubscriptionId?: string;
  kubeContexts?: string[];
  scope?: string[];
}

type ComplianceStandard = 'soc2' | 'hipaa' | 'pci-dss' | 'gdpr' | 'iso27001' | 'cis-aws' | 'cis-gcp' | 'cis-azure' | 'cis-kubernetes';

export class ComplianceScanner {
  private controls: Map<ComplianceStandard, ComplianceControl[]>;

  constructor() {
    this.controls = new Map();
    this.loadControls();
  }

  private loadControls(): void {
    this.controls.set('soc2', soc2Controls);
    this.controls.set('hipaa', hipaaControls);
    this.controls.set('pci-dss', pciDssControls);
    this.controls.set('cis-aws', cisAwsControls);
    this.controls.set('cis-kubernetes', cisK8sControls);
  }

  async scan(standard: ComplianceStandard, context: ScanContext): Promise<ComplianceScanResult> {
    const controls = this.controls.get(standard) || [];
    const results: ControlResult[] = [];
    const startTime = Date.now();

    for (const control of controls) {
      try {
        const result = await control.check(context);
        results.push({
          controlId: control.id,
          controlName: control.name,
          section: control.section,
          severity: control.severity,
          ...result,
        });
      } catch (error) {
        results.push({
          controlId: control.id,
          controlName: control.name,
          section: control.section,
          severity: control.severity,
          status: 'skipped',
          message: `Error checking control: ${error.message}`,
        });
      }
    }

    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const warnings = results.filter(r => r.status === 'warning').length;

    return {
      standard,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      summary: {
        total: results.length,
        passed,
        failed,
        warnings,
        score: Math.round((passed / results.length) * 100),
      },
      results,
      criticalFindings: results.filter(r => r.status === 'failed' && r.severity === 'critical'),
    };
  }

  async fix(standard: ComplianceStandard, controlId: string, context: ScanContext): Promise<FixResult> {
    const controls = this.controls.get(standard) || [];
    const control = controls.find(c => c.id === controlId);

    if (!control) {
      return { success: false, message: `Control ${controlId} not found` };
    }

    if (!control.fix) {
      return { success: false, message: `No auto-fix available for ${controlId}` };
    }

    return control.fix(context);
  }

  async generateReport(
    scanResult: ComplianceScanResult,
    format: 'html' | 'pdf' | 'json' | 'csv'
  ): Promise<string> {
    switch (format) {
      case 'html':
        return this.generateHtmlReport(scanResult);
      case 'json':
        return JSON.stringify(scanResult, null, 2);
      case 'csv':
        return this.generateCsvReport(scanResult);
      default:
        return JSON.stringify(scanResult);
    }
  }

  private generateHtmlReport(result: ComplianceScanResult): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${result.standard.toUpperCase()} Compliance Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
    .summary-card { padding: 20px; border-radius: 8px; text-align: center; }
    .passed { background: #d4edda; color: #155724; }
    .failed { background: #f8d7da; color: #721c24; }
    .warning { background: #fff3cd; color: #856404; }
    .score { background: #e2e3e5; }
    .control { border: 1px solid #ddd; border-radius: 8px; margin: 10px 0; padding: 15px; }
    .control.passed { border-left: 4px solid #28a745; }
    .control.failed { border-left: 4px solid #dc3545; }
    .control.warning { border-left: 4px solid #ffc107; }
    .severity { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
    .critical { background: #dc3545; color: white; }
    .high { background: #fd7e14; color: white; }
    .medium { background: #ffc107; }
    .low { background: #6c757d; color: white; }
  </style>
</head>
<body>
  <h1>${result.standard.toUpperCase()} Compliance Report</h1>
  <p>Generated: ${result.timestamp}</p>

  <div class="summary">
    <div class="summary-card score"><h2>${result.summary.score}%</h2><p>Compliance Score</p></div>
    <div class="summary-card passed"><h2>${result.summary.passed}</h2><p>Passed</p></div>
    <div class="summary-card failed"><h2>${result.summary.failed}</h2><p>Failed</p></div>
    <div class="summary-card warning"><h2>${result.summary.warnings}</h2><p>Warnings</p></div>
  </div>

  ${result.criticalFindings.length > 0 ? `
  <h2>Critical Findings</h2>
  ${result.criticalFindings.map(f => `
    <div class="control failed">
      <h3>${f.controlId}: ${f.controlName}</h3>
      <span class="severity critical">CRITICAL</span>
      <p>${f.message}</p>
    </div>
  `).join('')}
  ` : ''}

  <h2>All Controls (${result.results.length})</h2>
  ${result.results.map(r => `
    <div class="control ${r.status}">
      <h3>${r.controlId}: ${r.controlName}</h3>
      <span class="severity ${r.severity}">${r.severity.toUpperCase()}</span>
      <span>${r.status.toUpperCase()}</span>
      <p>${r.message}</p>
    </div>
  `).join('')}
</body>
</html>`;
  }
}
```

### 2. SOC2 Controls

**File**: `packages/enterprise/src/compliance/standards/soc2.ts`

```typescript
export const soc2Controls: ComplianceControl[] = [
  // CC6.1 - Access Control
  {
    id: 'SOC2-CC6.1-001',
    name: 'MFA Enabled for IAM Users',
    description: 'All IAM users should have MFA enabled',
    standard: 'soc2',
    section: 'CC6.1 - Access Control',
    severity: 'critical',
    check: async (ctx) => {
      const result = await runCommand('aws', [
        'iam', 'list-users', '--output', 'json',
      ]);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not list IAM users' };
      }

      const users = JSON.parse(result.stdout).Users || [];
      const usersWithoutMfa: string[] = [];

      for (const user of users) {
        const mfaResult = await runCommand('aws', [
          'iam', 'list-mfa-devices',
          '--user-name', user.UserName,
          '--output', 'json',
        ]);

        if (mfaResult.exitCode === 0) {
          const mfaDevices = JSON.parse(mfaResult.stdout).MFADevices || [];
          if (mfaDevices.length === 0) {
            usersWithoutMfa.push(user.UserName);
          }
        }
      }

      if (usersWithoutMfa.length > 0) {
        return {
          status: 'failed',
          message: `${usersWithoutMfa.length} users without MFA: ${usersWithoutMfa.join(', ')}`,
          resources: usersWithoutMfa,
        };
      }

      return { status: 'passed', message: 'All IAM users have MFA enabled' };
    },
  },

  {
    id: 'SOC2-CC6.1-002',
    name: 'No Root Account Access Keys',
    description: 'Root account should not have access keys',
    standard: 'soc2',
    section: 'CC6.1 - Access Control',
    severity: 'critical',
    check: async (ctx) => {
      const result = await runCommand('aws', [
        'iam', 'get-account-summary', '--output', 'json',
      ]);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not get account summary' };
      }

      const summary = JSON.parse(result.stdout).SummaryMap;
      const rootAccessKeys = summary.AccountAccessKeysPresent || 0;

      if (rootAccessKeys > 0) {
        return {
          status: 'failed',
          message: 'Root account has active access keys',
        };
      }

      return { status: 'passed', message: 'No root account access keys' };
    },
    fix: async (ctx) => {
      return {
        success: false,
        message: 'Manual action required: Delete root access keys from AWS Console',
        instructions: [
          '1. Sign in to AWS Console as root user',
          '2. Go to Security Credentials',
          '3. Delete all access keys',
        ],
      };
    },
  },

  // CC6.6 - Encryption
  {
    id: 'SOC2-CC6.6-001',
    name: 'S3 Bucket Encryption',
    description: 'All S3 buckets should have default encryption enabled',
    standard: 'soc2',
    section: 'CC6.6 - Encryption',
    severity: 'high',
    check: async (ctx) => {
      const result = await runCommand('aws', ['s3api', 'list-buckets', '--output', 'json']);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not list S3 buckets' };
      }

      const buckets = JSON.parse(result.stdout).Buckets || [];
      const unencryptedBuckets: string[] = [];

      for (const bucket of buckets) {
        const encResult = await runCommand('aws', [
          's3api', 'get-bucket-encryption',
          '--bucket', bucket.Name,
          '--output', 'json',
        ]);

        if (encResult.exitCode !== 0) {
          unencryptedBuckets.push(bucket.Name);
        }
      }

      if (unencryptedBuckets.length > 0) {
        return {
          status: 'failed',
          message: `${unencryptedBuckets.length} buckets without encryption`,
          resources: unencryptedBuckets,
        };
      }

      return { status: 'passed', message: 'All S3 buckets have encryption enabled' };
    },
    fix: async (ctx) => {
      // Get unencrypted buckets and enable encryption
      const listResult = await runCommand('aws', ['s3api', 'list-buckets', '--output', 'json']);
      const buckets = JSON.parse(listResult.stdout).Buckets || [];

      for (const bucket of buckets) {
        await runCommand('aws', [
          's3api', 'put-bucket-encryption',
          '--bucket', bucket.Name,
          '--server-side-encryption-configuration', JSON.stringify({
            Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
          }),
        ]);
      }

      return { success: true, message: 'Encryption enabled on all buckets' };
    },
  },

  // CC7.2 - Monitoring
  {
    id: 'SOC2-CC7.2-001',
    name: 'CloudTrail Enabled',
    description: 'AWS CloudTrail should be enabled in all regions',
    standard: 'soc2',
    section: 'CC7.2 - System Monitoring',
    severity: 'critical',
    check: async (ctx) => {
      const result = await runCommand('aws', [
        'cloudtrail', 'describe-trails', '--output', 'json',
      ]);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not describe trails' };
      }

      const trails = JSON.parse(result.stdout).trailList || [];
      const multiRegionTrail = trails.find((t: any) => t.IsMultiRegionTrail);

      if (!multiRegionTrail) {
        return {
          status: 'failed',
          message: 'No multi-region CloudTrail found',
        };
      }

      // Check if logging is enabled
      const statusResult = await runCommand('aws', [
        'cloudtrail', 'get-trail-status',
        '--name', multiRegionTrail.Name,
        '--output', 'json',
      ]);

      if (statusResult.exitCode === 0) {
        const status = JSON.parse(statusResult.stdout);
        if (!status.IsLogging) {
          return {
            status: 'failed',
            message: `CloudTrail ${multiRegionTrail.Name} exists but logging is disabled`,
          };
        }
      }

      return { status: 'passed', message: 'Multi-region CloudTrail enabled and logging' };
    },
  },

  // Additional SOC2 controls...
];
```

### 3. HIPAA Controls

**File**: `packages/enterprise/src/compliance/standards/hipaa.ts`

```typescript
export const hipaaControls: ComplianceControl[] = [
  // §164.312(a)(1) - Access Control
  {
    id: 'HIPAA-164.312(a)(1)-001',
    name: 'Unique User Identification',
    description: 'Assign unique identifiers for tracking user identity',
    standard: 'hipaa',
    section: '§164.312(a)(1) - Access Control',
    severity: 'critical',
    check: async (ctx) => {
      // Check IAM policies enforce unique users
      const result = await runCommand('aws', [
        'iam', 'get-account-password-policy', '--output', 'json',
      ]);

      if (result.exitCode !== 0) {
        return { status: 'failed', message: 'No password policy configured' };
      }

      const policy = JSON.parse(result.stdout).PasswordPolicy;

      const checks = [
        { name: 'RequireUppercaseCharacters', value: policy.RequireUppercaseCharacters },
        { name: 'RequireLowercaseCharacters', value: policy.RequireLowercaseCharacters },
        { name: 'RequireNumbers', value: policy.RequireNumbers },
        { name: 'RequireSymbols', value: policy.RequireSymbols },
        { name: 'MinimumPasswordLength >= 14', value: policy.MinimumPasswordLength >= 14 },
      ];

      const failed = checks.filter(c => !c.value);

      if (failed.length > 0) {
        return {
          status: 'failed',
          message: `Password policy missing: ${failed.map(f => f.name).join(', ')}`,
        };
      }

      return { status: 'passed', message: 'Strong password policy configured' };
    },
  },

  // §164.312(e)(1) - Transmission Security
  {
    id: 'HIPAA-164.312(e)(1)-001',
    name: 'RDS Encryption in Transit',
    description: 'RDS instances must enforce SSL connections',
    standard: 'hipaa',
    section: '§164.312(e)(1) - Transmission Security',
    severity: 'critical',
    check: async (ctx) => {
      const result = await runCommand('aws', [
        'rds', 'describe-db-instances', '--output', 'json',
      ]);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not describe RDS instances' };
      }

      const instances = JSON.parse(result.stdout).DBInstances || [];
      const insecure: string[] = [];

      for (const instance of instances) {
        // Check parameter group for SSL requirement
        const pgResult = await runCommand('aws', [
          'rds', 'describe-db-parameters',
          '--db-parameter-group-name', instance.DBParameterGroups[0]?.DBParameterGroupName,
          '--output', 'json',
        ]);

        if (pgResult.exitCode === 0) {
          const params = JSON.parse(pgResult.stdout).Parameters || [];
          const sslParam = params.find((p: any) => p.ParameterName === 'rds.force_ssl');

          if (!sslParam || sslParam.ParameterValue !== '1') {
            insecure.push(instance.DBInstanceIdentifier);
          }
        }
      }

      if (insecure.length > 0) {
        return {
          status: 'failed',
          message: `${insecure.length} RDS instances without SSL enforcement`,
          resources: insecure,
        };
      }

      return { status: 'passed', message: 'All RDS instances enforce SSL' };
    },
    fix: async (ctx) => {
      // Generate Terraform to fix
      const terraform = `
resource "aws_db_parameter_group" "hipaa_compliant" {
  family = "postgres14"
  name   = "hipaa-compliant-pg"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}
`;
      return {
        success: true,
        message: 'Generated Terraform to enforce SSL',
        artifacts: [{ path: 'compliance-fixes/rds-ssl.tf', content: terraform }],
      };
    },
  },

  // §164.312(c)(1) - Integrity
  {
    id: 'HIPAA-164.312(c)(1)-001',
    name: 'S3 Versioning for PHI',
    description: 'S3 buckets containing PHI must have versioning enabled',
    standard: 'hipaa',
    section: '§164.312(c)(1) - Integrity',
    severity: 'high',
    check: async (ctx) => {
      const result = await runCommand('aws', ['s3api', 'list-buckets', '--output', 'json']);

      if (result.exitCode !== 0) {
        return { status: 'skipped', message: 'Could not list buckets' };
      }

      const buckets = JSON.parse(result.stdout).Buckets || [];
      const noVersioning: string[] = [];

      for (const bucket of buckets) {
        // Check if bucket is tagged as containing PHI
        const tagResult = await runCommand('aws', [
          's3api', 'get-bucket-tagging',
          '--bucket', bucket.Name,
          '--output', 'json',
        ]);

        let containsPHI = false;
        if (tagResult.exitCode === 0) {
          const tags = JSON.parse(tagResult.stdout).TagSet || [];
          containsPHI = tags.some((t: any) => t.Key === 'DataClassification' && t.Value === 'PHI');
        }

        if (containsPHI) {
          const versionResult = await runCommand('aws', [
            's3api', 'get-bucket-versioning',
            '--bucket', bucket.Name,
            '--output', 'json',
          ]);

          if (versionResult.exitCode === 0) {
            const versioning = JSON.parse(versionResult.stdout);
            if (versioning.Status !== 'Enabled') {
              noVersioning.push(bucket.Name);
            }
          }
        }
      }

      if (noVersioning.length > 0) {
        return {
          status: 'failed',
          message: `${noVersioning.length} PHI buckets without versioning`,
          resources: noVersioning,
        };
      }

      return { status: 'passed', message: 'All PHI buckets have versioning enabled' };
    },
  },
];
```

---

## Marketplace Service

### 4. Marketplace Backend

**File**: `packages/enterprise/src/marketplace/service.ts`

```typescript
interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  type: 'template' | 'plugin';
  author: {
    id: string;
    name: string;
    verified: boolean;
  };
  version: string;
  priceCents: number;
  downloads: number;
  rating: number;
  reviewCount: number;
  categories: string[];
  tags: string[];
  content: string;
  readme: string;
  screenshots?: string[];
  createdAt: Date;
  updatedAt: Date;
  published: boolean;
}

interface MarketplaceSearchOptions {
  query?: string;
  type?: 'template' | 'plugin';
  categories?: string[];
  minRating?: number;
  priceRange?: { min: number; max: number };
  sortBy?: 'downloads' | 'rating' | 'newest' | 'price';
  page?: number;
  limit?: number;
}

export class MarketplaceService {
  private db: Database;
  private stripe: Stripe;
  private storage: StorageService;

  constructor(db: Database, stripe: Stripe, storage: StorageService) {
    this.db = db;
    this.stripe = stripe;
    this.storage = storage;
  }

  async search(options: MarketplaceSearchOptions): Promise<PaginatedResult<MarketplaceItem>> {
    let query = `
      SELECT * FROM marketplace_items
      WHERE published = true
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (options.query) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${options.query}%`);
      paramIndex++;
    }

    if (options.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(options.type);
      paramIndex++;
    }

    if (options.categories?.length) {
      query += ` AND categories && $${paramIndex}`;
      params.push(options.categories);
      paramIndex++;
    }

    if (options.minRating) {
      query += ` AND rating >= $${paramIndex}`;
      params.push(options.minRating);
      paramIndex++;
    }

    if (options.priceRange) {
      query += ` AND price_cents >= $${paramIndex} AND price_cents <= $${paramIndex + 1}`;
      params.push(options.priceRange.min, options.priceRange.max);
      paramIndex += 2;
    }

    // Sorting
    const sortMap: Record<string, string> = {
      downloads: 'downloads DESC',
      rating: 'rating DESC',
      newest: 'created_at DESC',
      price: 'price_cents ASC',
    };
    query += ` ORDER BY ${sortMap[options.sortBy || 'downloads']}`;

    // Pagination
    const limit = options.limit || 20;
    const offset = ((options.page || 1) - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const items = await this.db.query(query, params);

    // Get total count
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*)').replace(/LIMIT.*/, '');
    const totalResult = await this.db.query(countQuery, params.slice(0, -2));
    const total = parseInt(totalResult.rows[0].count);

    return {
      items: items.rows.map(row => this.mapItem(row)),
      total,
      page: options.page || 1,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getItem(id: string): Promise<MarketplaceItem | null> {
    const result = await this.db.query(
      'SELECT * FROM marketplace_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapItem(result.rows[0]);
  }

  async publish(item: Omit<MarketplaceItem, 'id' | 'downloads' | 'rating' | 'reviewCount' | 'createdAt' | 'updatedAt'>): Promise<MarketplaceItem> {
    const id = generateId();

    // Upload content to storage
    const contentUrl = await this.storage.upload(`marketplace/${id}/content.zip`, item.content);

    // If paid, create Stripe product
    let stripeProductId: string | undefined;
    let stripePriceId: string | undefined;

    if (item.priceCents > 0) {
      const product = await this.stripe.products.create({
        name: item.name,
        description: item.description,
        metadata: { marketplace_item_id: id },
      });

      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: item.priceCents,
        currency: 'usd',
      });

      stripeProductId = product.id;
      stripePriceId = price.id;
    }

    const result = await this.db.query(`
      INSERT INTO marketplace_items (
        id, name, description, type, author_id, version, price_cents,
        categories, tags, content_url, readme, screenshots,
        stripe_product_id, stripe_price_id, published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
      RETURNING *
    `, [
      id, item.name, item.description, item.type, item.author.id,
      item.version, item.priceCents, item.categories, item.tags,
      contentUrl, item.readme, item.screenshots,
      stripeProductId, stripePriceId,
    ]);

    return this.mapItem(result.rows[0]);
  }

  async purchase(itemId: string, userId: string): Promise<PurchaseResult> {
    const item = await this.getItem(itemId);
    if (!item) throw new Error('Item not found');

    if (item.priceCents === 0) {
      // Free item - just record the download
      await this.recordDownload(itemId, userId);
      return { success: true, downloadUrl: await this.getDownloadUrl(itemId) };
    }

    // Get Stripe price ID
    const result = await this.db.query(
      'SELECT stripe_price_id FROM marketplace_items WHERE id = $1',
      [itemId]
    );

    // Create Stripe checkout session
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: result.rows[0].stripe_price_id, quantity: 1 }],
      success_url: `${process.env.APP_URL}/marketplace/${itemId}/download?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/marketplace/${itemId}`,
      metadata: { item_id: itemId, user_id: userId },
    });

    return { success: true, checkoutUrl: session.url };
  }

  async recordDownload(itemId: string, userId: string): Promise<void> {
    await this.db.query(`
      INSERT INTO marketplace_downloads (id, item_id, user_id)
      VALUES ($1, $2, $3)
    `, [generateId(), itemId, userId]);

    await this.db.query(`
      UPDATE marketplace_items
      SET downloads = downloads + 1
      WHERE id = $1
    `, [itemId]);
  }

  async addReview(itemId: string, userId: string, rating: number, comment: string): Promise<void> {
    await this.db.query(`
      INSERT INTO marketplace_reviews (id, item_id, user_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (item_id, user_id) DO UPDATE SET rating = $4, comment = $5, updated_at = NOW()
    `, [generateId(), itemId, userId, rating, comment]);

    // Update average rating
    await this.db.query(`
      UPDATE marketplace_items
      SET rating = (SELECT AVG(rating) FROM marketplace_reviews WHERE item_id = $1),
          review_count = (SELECT COUNT(*) FROM marketplace_reviews WHERE item_id = $1)
      WHERE id = $1
    `, [itemId]);
  }

  private mapItem(row: any): MarketplaceItem {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      author: {
        id: row.author_id,
        name: row.author_name,
        verified: row.author_verified,
      },
      version: row.version,
      priceCents: row.price_cents,
      downloads: row.downloads,
      rating: row.rating,
      reviewCount: row.review_count,
      categories: row.categories,
      tags: row.tags,
      content: row.content_url,
      readme: row.readme,
      screenshots: row.screenshots,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      published: row.published,
    };
  }
}
```

---

## On-Premise Deployment

### 5. Helm Charts

**File**: `deploy/helm/nimbus-enterprise/values.yaml`

```yaml
# Nimbus Enterprise Helm Values

global:
  imageRegistry: ""
  imagePullSecrets: []
  storageClass: ""

nimbus:
  replicaCount: 2
  image:
    repository: nimbus/nimbus-enterprise
    tag: "latest"
    pullPolicy: IfNotPresent

  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

  env:
    LOG_LEVEL: info
    NODE_ENV: production

  # LLM Configuration
  llm:
    # For on-premise, use self-hosted models
    provider: ollama  # or 'anthropic', 'openai' with VPN
    ollamaUrl: "http://ollama.nimbus:11434"

    # For cloud APIs through VPN
    # anthropicApiKeySecret: nimbus-llm-secrets
    # openaiApiKeySecret: nimbus-llm-secrets

  # Feature flags
  features:
    marketplace: false  # Disable for air-gapped
    telemetry: false
    updates: false

# Database
postgresql:
  enabled: true
  auth:
    database: nimbus
    username: nimbus
    existingSecret: nimbus-db-secret
  primary:
    persistence:
      enabled: true
      size: 50Gi
  metrics:
    enabled: true

# Redis (for caching and sessions)
redis:
  enabled: true
  auth:
    existingSecret: nimbus-redis-secret
  master:
    persistence:
      enabled: true
      size: 10Gi

# Ollama (self-hosted LLM)
ollama:
  enabled: true
  replicaCount: 1
  persistence:
    enabled: true
    size: 100Gi
  resources:
    limits:
      nvidia.com/gpu: 1
  models:
    # Pre-pull models
    - llama3.2
    - codellama

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  hosts:
    - host: nimbus.internal
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: nimbus-tls
      hosts:
        - nimbus.internal

# Service Account
serviceAccount:
  create: true
  annotations: {}
  name: nimbus

# RBAC
rbac:
  create: true
  rules:
    - apiGroups: [""]
      resources: ["pods", "services", "configmaps", "secrets"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["apps"]
      resources: ["deployments", "statefulsets"]
      verbs: ["get", "list", "watch"]

# Network Policies
networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
  egress:
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 5432  # PostgreSQL
        - protocol: TCP
          port: 6379  # Redis
        - protocol: TCP
          port: 11434 # Ollama

# Pod Security
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

# Monitoring
metrics:
  enabled: true
  serviceMonitor:
    enabled: true
    namespace: monitoring
```

### 6. License Manager

**File**: `packages/enterprise/src/license/manager.ts`

```typescript
import * as crypto from 'crypto';

interface License {
  id: string;
  organization: string;
  type: 'team' | 'enterprise' | 'enterprise-plus';
  seats: number;
  features: string[];
  expiresAt: Date;
  signature: string;
}

export class LicenseManager {
  private publicKey: string;
  private currentLicense: License | null = null;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  async loadLicense(licenseKey: string): Promise<License> {
    // Decode license
    const decoded = Buffer.from(licenseKey, 'base64').toString('utf-8');
    const [payload, signature] = decoded.split('.');

    // Verify signature
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(payload);

    if (!verify.verify(this.publicKey, signature, 'base64')) {
      throw new Error('Invalid license signature');
    }

    const license: License = JSON.parse(payload);

    // Check expiration
    if (new Date(license.expiresAt) < new Date()) {
      throw new Error('License has expired');
    }

    this.currentLicense = license;
    return license;
  }

  isFeatureEnabled(feature: string): boolean {
    if (!this.currentLicense) return false;
    return this.currentLicense.features.includes(feature) ||
           this.currentLicense.features.includes('*');
  }

  getRemainingSeats(): number {
    if (!this.currentLicense) return 0;
    // Query active users
    return this.currentLicense.seats;
  }

  getLicenseInfo(): LicenseInfo {
    if (!this.currentLicense) {
      return {
        valid: false,
        type: 'none',
        message: 'No license loaded',
      };
    }

    const daysRemaining = Math.ceil(
      (new Date(this.currentLicense.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    return {
      valid: true,
      type: this.currentLicense.type,
      organization: this.currentLicense.organization,
      seats: this.currentLicense.seats,
      features: this.currentLicense.features,
      expiresAt: this.currentLicense.expiresAt,
      daysRemaining,
      message: daysRemaining < 30 ? `License expires in ${daysRemaining} days` : undefined,
    };
  }
}
```

---

## White-Label / Embedding SDK

### 7. Nimbus SDK for Third-Party Integration

The Nimbus SDK enables enterprises to embed Nimbus capabilities into their own applications, internal tools, and platforms. This creates a programmatic interface for all Nimbus functionality with full white-labeling support.

**File**: `packages/sdk/src/index.ts`

```typescript
import { EventEmitter } from 'events';

// SDK Configuration
interface NimbusSDKConfig {
  apiKey: string;
  baseUrl?: string;
  team?: string;
  branding?: {
    name?: string;
    logo?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
  };
  webhooks?: {
    onOperationStart?: string;
    onOperationComplete?: string;
    onApprovalRequired?: string;
  };
  defaults?: {
    provider?: 'aws' | 'gcp' | 'azure';
    region?: string;
    kubeContext?: string;
  };
}

// Core SDK Class
export class NimbusSDK extends EventEmitter {
  private config: NimbusSDKConfig;
  private apiClient: APIClient;

  public generate: GenerateModule;
  public terraform: TerraformModule;
  public kubernetes: KubernetesModule;
  public helm: HelmModule;
  public mlops: MLOpsModule;
  public compliance: ComplianceModule;
  public chat: ChatModule;

  constructor(config: NimbusSDKConfig) {
    super();
    this.config = config;
    this.apiClient = new APIClient(config);

    // Initialize modules
    this.generate = new GenerateModule(this.apiClient, this);
    this.terraform = new TerraformModule(this.apiClient, this);
    this.kubernetes = new KubernetesModule(this.apiClient, this);
    this.helm = new HelmModule(this.apiClient, this);
    this.mlops = new MLOpsModule(this.apiClient, this);
    this.compliance = new ComplianceModule(this.apiClient, this);
    this.chat = new ChatModule(this.apiClient, this);
  }

  // Get branding info for UI customization
  getBranding(): BrandingInfo {
    return {
      name: this.config.branding?.name || 'Nimbus',
      logo: this.config.branding?.logo || null,
      colors: this.config.branding?.colors || {
        primary: '#6366f1',
        secondary: '#4f46e5',
        accent: '#10b981',
      },
    };
  }

  // Event handling for integrations
  onApprovalRequired(handler: (approval: ApprovalRequest) => Promise<boolean>): void {
    this.on('approvalRequired', handler);
  }

  onOperationProgress(handler: (progress: OperationProgress) => void): void {
    this.on('operationProgress', handler);
  }
}

// Generate Module - IaC Generation
class GenerateModule {
  constructor(private api: APIClient, private sdk: NimbusSDK) {}

  async terraform(options: TerraformGenerateOptions): Promise<GenerateResult> {
    const response = await this.api.post('/generate/terraform', options);

    this.sdk.emit('operationProgress', {
      type: 'generate',
      status: 'complete',
      files: response.files.length,
    });

    return {
      success: true,
      files: response.files,
      summary: response.summary,
      warnings: response.warnings,
    };
  }

  async kubernetes(options: K8sGenerateOptions): Promise<GenerateResult> {
    return this.api.post('/generate/kubernetes', options);
  }

  async cicd(options: CICDGenerateOptions): Promise<GenerateResult> {
    return this.api.post('/generate/cicd', options);
  }

  async monitoring(options: MonitoringGenerateOptions): Promise<GenerateResult> {
    return this.api.post('/generate/monitoring', options);
  }
}

// Terraform Module - Terraform Operations
class TerraformModule {
  constructor(private api: APIClient, private sdk: NimbusSDK) {}

  async plan(directory: string, options?: TerraformPlanOptions): Promise<TerraformPlanResult> {
    return this.api.post('/terraform/plan', { directory, ...options });
  }

  async apply(
    directory: string,
    options?: TerraformApplyOptions
  ): Promise<TerraformApplyResult> {
    // If approval is required and not auto-approved
    if (!options?.autoApprove) {
      const plan = await this.plan(directory, options);

      // Emit approval event
      const approved = await new Promise<boolean>((resolve) => {
        if (this.sdk.listenerCount('approvalRequired') > 0) {
          this.sdk.emit('approvalRequired', {
            type: 'terraform_apply',
            changes: plan.changes,
            estimatedCost: plan.estimatedCost,
            resolve,
          });
        } else if (options?.onApprovalRequired) {
          options.onApprovalRequired(plan.changes).then(resolve);
        } else {
          resolve(false);
        }
      });

      if (!approved) {
        return { success: false, message: 'Apply cancelled by user' };
      }
    }

    return this.api.post('/terraform/apply', { directory, ...options });
  }

  async destroy(directory: string, options?: TerraformDestroyOptions): Promise<TerraformResult> {
    // Always require explicit approval for destroy
    const resources = await this.api.post('/terraform/show', { directory });

    const approved = await new Promise<boolean>((resolve) => {
      this.sdk.emit('approvalRequired', {
        type: 'terraform_destroy',
        resources: resources.resources,
        warning: 'This will permanently destroy all resources',
        resolve,
      });
    });

    if (!approved) {
      return { success: false, message: 'Destroy cancelled by user' };
    }

    return this.api.post('/terraform/destroy', { directory, ...options });
  }

  async import(directory: string, resource: string, id: string): Promise<TerraformResult> {
    return this.api.post('/terraform/import', { directory, resource, id });
  }
}

// MLOps Module - ML/LLM Operations
class MLOpsModule {
  constructor(private api: APIClient, private sdk: NimbusSDK) {}

  async deployModel(options: ModelDeployOptions): Promise<DeployResult> {
    return this.api.post('/mlops/deploy', options);
  }

  async createPipeline(options: PipelineOptions): Promise<PipelineResult> {
    return this.api.post('/mlops/pipeline', options);
  }

  async setupFeatureStore(options: FeatureStoreOptions): Promise<SetupResult> {
    return this.api.post('/mlops/feature-store', options);
  }

  async deployLLM(options: LLMDeployOptions): Promise<DeployResult> {
    return this.api.post('/mlops/llm-deploy', options);
  }
}

// Compliance Module
class ComplianceModule {
  constructor(private api: APIClient, private sdk: NimbusSDK) {}

  async scan(standard: ComplianceStandard, scope?: ScanScope): Promise<ComplianceScanResult> {
    return this.api.post('/compliance/scan', { standard, scope });
  }

  async fix(controlId: string, options?: FixOptions): Promise<FixResult> {
    if (!options?.autoApprove) {
      const fix = await this.api.get(`/compliance/fix/${controlId}/preview`);

      const approved = await new Promise<boolean>((resolve) => {
        this.sdk.emit('approvalRequired', {
          type: 'compliance_fix',
          controlId,
          changes: fix.changes,
          resolve,
        });
      });

      if (!approved) {
        return { success: false, message: 'Fix cancelled' };
      }
    }

    return this.api.post(`/compliance/fix/${controlId}`, options);
  }

  async generateReport(scanId: string, format: 'html' | 'pdf' | 'json'): Promise<string> {
    return this.api.get(`/compliance/report/${scanId}?format=${format}`);
  }

  async generatePolicies(standard: ComplianceStandard): Promise<GenerateResult> {
    return this.api.post('/compliance/policies/generate', { standard });
  }
}

// Chat Module - Conversational Interface
class ChatModule {
  constructor(private api: APIClient, private sdk: NimbusSDK) {}

  async send(message: string, context?: ChatContext): Promise<ChatResponse> {
    return this.api.post('/chat', { message, context });
  }

  async stream(
    message: string,
    onChunk: (chunk: string) => void,
    context?: ChatContext
  ): Promise<void> {
    const response = await this.api.stream('/chat/stream', { message, context });

    for await (const chunk of response) {
      onChunk(chunk);
    }
  }

  async executeAction(action: ChatAction): Promise<ActionResult> {
    return this.api.post('/chat/action', action);
  }
}
```

### 8. SDK Usage Examples

**File**: `packages/sdk/examples/integration.ts`

```typescript
import { NimbusSDK } from '@nimbus/sdk';

// Initialize SDK with white-labeling
const nimbus = new NimbusSDK({
  apiKey: process.env.NIMBUS_API_KEY!,
  team: 'acme-corp',
  branding: {
    name: 'ACME Cloud Platform',
    logo: 'https://acme.com/logo.png',
    colors: {
      primary: '#0066cc',
      secondary: '#004499',
      accent: '#00cc66',
    },
  },
  defaults: {
    provider: 'aws',
    region: 'us-east-1',
  },
});

// Example 1: Generate Terraform infrastructure
async function generateInfrastructure() {
  const result = await nimbus.generate.terraform({
    provider: 'aws',
    components: ['vpc', 'eks', 'rds'],
    config: {
      region: 'us-east-1',
      environment: 'production',
      vpcCidr: '10.0.0.0/16',
      eksNodeCount: 5,
      eksNodeType: 't3.large',
      rdsEngine: 'postgres',
      rdsInstanceClass: 'db.r5.large',
    },
  });

  console.log(`Generated ${result.files.length} files`);
  for (const file of result.files) {
    console.log(`  - ${file.path}`);
  }
}

// Example 2: Apply Terraform with custom approval UI
async function applyWithApproval() {
  const result = await nimbus.terraform.apply('./infrastructure', {
    autoApprove: false,
    onApprovalRequired: async (changes) => {
      // Show changes in your custom UI
      console.log('Changes to apply:');
      console.log(`  + ${changes.create} to create`);
      console.log(`  ~ ${changes.update} to update`);
      console.log(`  - ${changes.delete} to delete`);
      console.log(`  Estimated cost: $${changes.estimatedMonthlyCost}/month`);

      // Return true to approve, false to cancel
      return await showApprovalDialog(changes);
    },
  });

  if (result.success) {
    console.log('Infrastructure applied successfully!');
  }
}

// Example 3: Run compliance scan and auto-fix
async function complianceScanAndFix() {
  // Run SOC2 compliance scan
  const scanResult = await nimbus.compliance.scan('soc2', {
    awsAccountId: '123456789012',
    regions: ['us-east-1', 'us-west-2'],
  });

  console.log(`Compliance Score: ${scanResult.summary.score}%`);
  console.log(`Failed Controls: ${scanResult.summary.failed}`);

  // Auto-fix safe issues
  const criticalFailures = scanResult.results.filter(
    r => r.status === 'failed' && r.severity === 'critical'
  );

  for (const failure of criticalFailures) {
    const fixResult = await nimbus.compliance.fix(failure.controlId, {
      autoApprove: false, // Require approval for each fix
    });

    if (fixResult.success) {
      console.log(`✓ Fixed: ${failure.controlId}`);
    }
  }

  // Generate compliance report
  const report = await nimbus.compliance.generateReport(scanResult.id, 'pdf');
  console.log(`Report generated: ${report}`);
}

// Example 4: Deploy ML model with monitoring
async function deployMLModel() {
  const result = await nimbus.mlops.deployModel({
    platform: 'sagemaker',
    model: {
      name: 'fraud-detection-v2',
      artifactUri: 's3://models/fraud-detection/v2',
      framework: 'pytorch',
    },
    endpoint: {
      instanceType: 'ml.m5.xlarge',
      initialInstanceCount: 2,
      autoScaling: {
        minCapacity: 1,
        maxCapacity: 10,
        targetInvocationsPerInstance: 100,
      },
    },
    monitoring: {
      enabled: true,
      dataCapturePercentage: 10,
    },
  });

  console.log(`Model deployed to: ${result.endpointUrl}`);
}

// Example 5: Conversational interface integration
async function chatInterface() {
  // Send a message
  const response = await nimbus.chat.send(
    'Create a Redis cluster with 3 replicas for caching',
    {
      currentDirectory: './infrastructure',
      kubeContext: 'production',
    }
  );

  console.log(response.message);

  // If there are actions to execute
  if (response.suggestedActions?.length > 0) {
    for (const action of response.suggestedActions) {
      console.log(`Action: ${action.description}`);

      // Execute the action
      const actionResult = await nimbus.chat.executeAction(action);
      console.log(`Result: ${actionResult.message}`);
    }
  }
}

// Example 6: Stream responses for real-time UI updates
async function streamingChat() {
  process.stdout.write('Nimbus: ');

  await nimbus.chat.stream(
    'Explain how to set up a CI/CD pipeline for my microservices',
    (chunk) => {
      process.stdout.write(chunk);
    }
  );

  console.log(); // Newline
}

// Example 7: Event-driven integration
nimbus.onApprovalRequired(async (approval) => {
  console.log(`Approval required for: ${approval.type}`);

  // Send notification to Slack
  await sendSlackNotification({
    channel: '#infrastructure-approvals',
    message: `Approval needed: ${approval.type}`,
    changes: approval.changes,
    approvalUrl: `https://acme.com/approvals/${approval.id}`,
  });

  // Wait for approval via webhook
  return await waitForWebhookApproval(approval.id);
});

nimbus.onOperationProgress((progress) => {
  // Update progress in your dashboard
  updateDashboard({
    operation: progress.type,
    status: progress.status,
    percentage: progress.percentage,
  });
});
```

### 9. React Component Library for SDK

**File**: `packages/sdk-react/src/components/NimbusProvider.tsx`

```typescript
import React, { createContext, useContext, useMemo } from 'react';
import { NimbusSDK, NimbusSDKConfig } from '@nimbus/sdk';

interface NimbusContextValue {
  sdk: NimbusSDK;
  branding: BrandingInfo;
}

const NimbusContext = createContext<NimbusContextValue | null>(null);

export function NimbusProvider({
  config,
  children,
}: {
  config: NimbusSDKConfig;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const sdk = new NimbusSDK(config);
    return {
      sdk,
      branding: sdk.getBranding(),
    };
  }, [config]);

  return (
    <NimbusContext.Provider value={value}>
      {children}
    </NimbusContext.Provider>
  );
}

export function useNimbus(): NimbusContextValue {
  const context = useContext(NimbusContext);
  if (!context) {
    throw new Error('useNimbus must be used within NimbusProvider');
  }
  return context;
}

// Hooks for common operations
export function useGenerate() {
  const { sdk } = useNimbus();
  return sdk.generate;
}

export function useTerraform() {
  const { sdk } = useNimbus();
  return sdk.terraform;
}

export function useCompliance() {
  const { sdk } = useNimbus();
  return sdk.compliance;
}

export function useChat() {
  const { sdk } = useNimbus();
  return sdk.chat;
}
```

**File**: `packages/sdk-react/src/components/ApprovalDialog.tsx`

```typescript
import React, { useState } from 'react';
import { useNimbus } from './NimbusProvider';

interface ApprovalDialogProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalDialog({ approval, onApprove, onReject }: ApprovalDialogProps) {
  const { branding } = useNimbus();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    onApprove();
  };

  return (
    <div className="approval-dialog" style={{ '--primary': branding.colors.primary }}>
      <div className="approval-header">
        {branding.logo && <img src={branding.logo} alt={branding.name} />}
        <h2>Approval Required</h2>
      </div>

      <div className="approval-content">
        <p className="approval-type">{approval.type}</p>

        {approval.changes && (
          <div className="changes-summary">
            <div className="change create">
              <span className="icon">+</span>
              <span className="count">{approval.changes.create}</span>
              <span className="label">to create</span>
            </div>
            <div className="change update">
              <span className="icon">~</span>
              <span className="count">{approval.changes.update}</span>
              <span className="label">to update</span>
            </div>
            <div className="change delete">
              <span className="icon">-</span>
              <span className="count">{approval.changes.delete}</span>
              <span className="label">to destroy</span>
            </div>
          </div>
        )}

        {approval.estimatedCost && (
          <div className="cost-estimate">
            <span className="label">Estimated monthly cost:</span>
            <span className="value">${approval.estimatedCost}</span>
          </div>
        )}

        {approval.warning && (
          <div className="warning">
            <span className="icon">⚠️</span>
            <span>{approval.warning}</span>
          </div>
        )}
      </div>

      <div className="approval-actions">
        <button
          className="btn-reject"
          onClick={onReject}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          className="btn-approve"
          onClick={handleApprove}
          disabled={loading}
          style={{ backgroundColor: branding.colors.primary }}
        >
          {loading ? 'Applying...' : 'Approve & Apply'}
        </button>
      </div>
    </div>
  );
}
```

### User Stories for SDK

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-406 | As a developer, I want to embed Nimbus in my app | SDK initializes and makes API calls | Sprint 23-24 |
| US-407 | As a developer, I want white-labeled branding | Custom colors/logo used in UI | Sprint 23-24 |
| US-408 | As a developer, I want custom approval workflows | Approval callbacks work | Sprint 23-24 |
| US-409 | As a developer, I want React components | Components render with branding | Sprint 23-24 |
| US-410 | As a developer, I want streaming responses | Chat streams work in UI | Sprint 23-24 |

---

## Database Schema Additions

```sql
-- Marketplace tables
CREATE TABLE marketplace_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('template', 'plugin')),
    author_id TEXT NOT NULL REFERENCES users(id),
    version TEXT NOT NULL,
    price_cents INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    categories TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    content_url TEXT NOT NULL,
    readme TEXT,
    screenshots TEXT[],
    stripe_product_id TEXT,
    stripe_price_id TEXT,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_marketplace_type ON marketplace_items(type);
CREATE INDEX idx_marketplace_categories ON marketplace_items USING GIN(categories);
CREATE INDEX idx_marketplace_published ON marketplace_items(published);

CREATE TABLE marketplace_reviews (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES marketplace_items(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (item_id, user_id)
);

CREATE TABLE marketplace_downloads (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES marketplace_items(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Compliance tables
CREATE TABLE compliance_scans (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id),
    standard TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    scope TEXT,
    results JSONB,
    summary JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_compliance_team ON compliance_scans(team_id);
CREATE INDEX idx_compliance_standard ON compliance_scans(standard);

-- License table
CREATE TABLE licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT NOT NULL UNIQUE,
    organization TEXT NOT NULL,
    type TEXT NOT NULL,
    seats INTEGER NOT NULL,
    features TEXT[] DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    activated_at TIMESTAMP DEFAULT NOW()
);
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-400 | As an admin, I want to scan for SOC2 compliance | Scan completes with report | Sprint 19-20 |
| US-401 | As an admin, I want to auto-fix compliance issues | Fixes applied successfully | Sprint 19-20 |
| US-402 | As a user, I want to browse marketplace templates | Search and filter working | Sprint 21-22 |
| US-403 | As a user, I want to purchase marketplace items | Stripe checkout works | Sprint 21-22 |
| US-404 | As an admin, I want to deploy Nimbus on-premise | Helm install succeeds | Sprint 23-24 |
| US-405 | As an admin, I want to manage enterprise licenses | License validation works | Sprint 23-24 |

---

## Sprint Breakdown

### Sprint 19-20 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Compliance scanner framework | 3 days | Base scanner |
| SOC2 controls | 4 days | 20+ controls |
| HIPAA controls | 3 days | 15+ controls |
| Auto-fix framework | 3 days | Fix generation |

### Sprint 21-22 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Marketplace backend | 4 days | CRUD operations |
| Stripe integration | 3 days | Payments working |
| Review system | 2 days | Ratings and reviews |
| Publisher dashboard | 3 days | Publishing workflow |

### Sprint 23-24 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Helm charts | 3 days | Enterprise deployment |
| License manager | 2 days | Validation system |
| Air-gap support | 3 days | Offline mode |
| Documentation | 3 days | Install guides |

---

## Acceptance Criteria

- [ ] SOC2 compliance scanning working
- [ ] HIPAA compliance scanning working
- [ ] Auto-fix for common compliance issues
- [ ] Marketplace search and browsing
- [ ] Marketplace purchase flow with Stripe
- [ ] Publisher workflow for marketplace
- [ ] Helm chart for on-premise deployment
- [ ] License validation working
- [ ] Air-gapped deployment supported

---

*Document Version: 1.0*
*Last Updated: January 2026*
