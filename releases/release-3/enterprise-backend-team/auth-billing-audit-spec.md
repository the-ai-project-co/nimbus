# Enterprise Backend Team - Release 3 Specification

> **Team**: Enterprise Backend Team
> **Phase**: Release 3 (Months 7-9)
> **Dependencies**: Core Engine

---

## Overview

The Enterprise Backend Team builds the server-side infrastructure for team management, authentication (SSO), billing integration, and audit logging. This team is formed in Release 3 to support revenue generation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Nimbus Backend Services                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Auth     │  │   Billing   │  │       Audit             │ │
│  │   Service   │  │   Service   │  │       Service           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Team     │  │   Usage     │  │       API               │ │
│  │   Service   │  │   Service   │  │      Gateway            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                      PostgreSQL                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Authentication Service

#### 1.1 SSO Integration (SAML 2.0)

**File**: `backend/src/auth/saml.ts`

```typescript
import { SAML } from '@node-saml/node-saml';

interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  cert: string;
  callbackUrl: string;
}

export class SAMLAuthProvider {
  private saml: SAML;

  constructor(config: SAMLConfig) {
    this.saml = new SAML({
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      cert: config.cert,
      callbackUrl: config.callbackUrl,
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    });
  }

  async getLoginUrl(teamId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.saml.getAuthorizeUrl(
        { RelayState: teamId },
        (err, url) => {
          if (err) reject(err);
          else resolve(url);
        }
      );
    });
  }

  async validateResponse(response: string): Promise<SAMLUser> {
    return new Promise((resolve, reject) => {
      this.saml.validatePostResponse({ SAMLResponse: response }, (err, profile) => {
        if (err) reject(err);
        else resolve({
          email: profile.nameID,
          firstName: profile.firstName,
          lastName: profile.lastName,
          groups: profile.groups || [],
        });
      });
    });
  }
}
```

#### 1.2 OAuth 2.0 / OIDC Integration

**File**: `backend/src/auth/oidc.ts`

```typescript
import { Issuer, Client } from 'openid-client';

interface OIDCConfig {
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class OIDCAuthProvider {
  private client: Client;

  async init(config: OIDCConfig): Promise<void> {
    const issuer = await Issuer.discover(config.discoveryUrl);
    this.client = new issuer.Client({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uris: [config.redirectUri],
      response_types: ['code'],
    });
  }

  getAuthorizationUrl(state: string): string {
    return this.client.authorizationUrl({
      scope: 'openid email profile',
      state,
    });
  }

  async handleCallback(code: string): Promise<OIDCUser> {
    const tokens = await this.client.callback(
      this.config.redirectUri,
      { code },
    );

    const userInfo = await this.client.userinfo(tokens.access_token);

    return {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    };
  }
}
```

#### 1.3 Device Code Flow

**File**: `backend/src/auth/device-code.ts`

```typescript
interface DeviceCodeGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export class DeviceCodeAuth {
  private pendingGrants: Map<string, DeviceCodeGrant> = new Map();

  async initiateDeviceFlow(): Promise<DeviceCodeGrant> {
    const deviceCode = generateSecureToken(32);
    const userCode = generateUserFriendlyCode(); // e.g., "ABCD-1234"

    const grant: DeviceCodeGrant = {
      deviceCode,
      userCode,
      verificationUri: 'https://nimbus.dev/device',
      expiresIn: 900, // 15 minutes
    };

    this.pendingGrants.set(userCode, grant);

    // Set expiration
    setTimeout(() => {
      this.pendingGrants.delete(userCode);
    }, grant.expiresIn * 1000);

    return grant;
  }

  async verifyUserCode(userCode: string, userId: string): Promise<void> {
    const grant = this.pendingGrants.get(userCode);
    if (!grant) {
      throw new Error('Invalid or expired code');
    }

    // Mark as verified
    await this.db.deviceGrants.update(grant.deviceCode, {
      verified: true,
      userId,
    });
  }

  async pollForToken(deviceCode: string): Promise<AuthToken | null> {
    const grant = await this.db.deviceGrants.findOne({ deviceCode });

    if (!grant) {
      throw new Error('Invalid device code');
    }

    if (!grant.verified) {
      return null; // Still waiting for user
    }

    // Generate token
    const user = await this.db.users.findOne({ id: grant.userId });
    return this.generateToken(user);
  }
}
```

---

### 2. Team Management Service

#### 2.1 Team CRUD

**File**: `backend/src/teams/service.ts`

```typescript
interface Team {
  id: string;
  name: string;
  ownerId: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  ssoConfig?: SSOConfig;
  createdAt: Date;
}

interface TeamMember {
  userId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

export class TeamService {
  async createTeam(ownerId: string, name: string): Promise<Team> {
    const team: Team = {
      id: generateId(),
      name,
      ownerId,
      plan: 'free',
      createdAt: new Date(),
    };

    await this.db.teams.insert(team);

    // Add owner as member
    await this.addMember(team.id, ownerId, 'owner');

    return team;
  }

  async addMember(teamId: string, userId: string, role: TeamMember['role']): Promise<void> {
    await this.db.teamMembers.insert({
      teamId,
      userId,
      role,
      joinedAt: new Date(),
    });

    // Send invitation email
    await this.emailService.sendTeamInvite(userId, teamId);
  }

  async removeMember(teamId: string, userId: string, requesterId: string): Promise<void> {
    // Check permissions
    const requester = await this.getMember(teamId, requesterId);
    if (!['owner', 'admin'].includes(requester.role)) {
      throw new ForbiddenError('Only owners and admins can remove members');
    }

    // Can't remove owner
    const target = await this.getMember(teamId, userId);
    if (target.role === 'owner') {
      throw new ForbiddenError('Cannot remove team owner');
    }

    await this.db.teamMembers.delete({ teamId, userId });
  }

  async updateMemberRole(
    teamId: string,
    userId: string,
    newRole: TeamMember['role'],
    requesterId: string
  ): Promise<void> {
    // Only owner can change roles
    const requester = await this.getMember(teamId, requesterId);
    if (requester.role !== 'owner') {
      throw new ForbiddenError('Only owner can change roles');
    }

    await this.db.teamMembers.update(
      { teamId, userId },
      { role: newRole }
    );
  }

  async configurSSO(teamId: string, config: SSOConfig, requesterId: string): Promise<void> {
    // Check permissions
    const requester = await this.getMember(teamId, requesterId);
    if (requester.role !== 'owner') {
      throw new ForbiddenError('Only owner can configure SSO');
    }

    // Validate team has enterprise plan
    const team = await this.getTeam(teamId);
    if (!['team', 'enterprise'].includes(team.plan)) {
      throw new PlanRequiredError('SSO requires Team or Enterprise plan');
    }

    await this.db.teams.update(
      { id: teamId },
      { ssoConfig: config }
    );
  }
}
```

---

### 3. Billing Service (Stripe Integration)

#### 3.1 Subscription Management

**File**: `backend/src/billing/service.ts`

```typescript
import Stripe from 'stripe';

const PRICE_IDS = {
  pro: 'price_pro_monthly',
  team: 'price_team_monthly',
  enterprise: 'price_enterprise_monthly',
};

export class BillingService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }

  async createCustomer(userId: string, email: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      metadata: { userId },
    });

    await this.db.users.update({ id: userId }, { stripeCustomerId: customer.id });

    return customer.id;
  }

  async createSubscription(
    userId: string,
    plan: 'pro' | 'team' | 'enterprise',
    quantity: number = 1
  ): Promise<Stripe.Subscription> {
    const user = await this.db.users.findOne({ id: userId });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      customerId = await this.createCustomer(userId, user.email);
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE_IDS[plan], quantity }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    // Update team plan
    await this.db.teams.update(
      { ownerId: userId },
      { plan, stripeSubscriptionId: subscription.id }
    );

    return subscription;
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(
      invoice.subscription as string
    );

    await this.db.invoices.insert({
      id: invoice.id,
      userId: subscription.metadata.userId,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      paidAt: new Date(),
    });
  }

  private async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;

    // Downgrade to free plan
    await this.db.teams.update(
      { ownerId: userId },
      { plan: 'free', stripeSubscriptionId: null }
    );
  }

  async getUsage(teamId: string): Promise<UsageSummary> {
    const team = await this.db.teams.findOne({ id: teamId });
    const usage = await this.db.usage.aggregate({
      teamId,
      period: 'current_month',
    });

    return {
      plan: team.plan,
      operations: usage.totalOperations,
      limit: PLAN_LIMITS[team.plan].operations,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
    };
  }
}
```

---

### 4. Audit Logging Service

#### 4.1 Audit Logger

**File**: `backend/src/audit/service.ts`

```typescript
interface AuditLog {
  id: string;
  timestamp: Date;
  teamId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'denied' | 'error';
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
}

export class AuditService {
  async log(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const log: AuditLog = {
      id: generateId(),
      timestamp: new Date(),
      ...event,
    };

    await this.db.auditLogs.insert(log);

    // Real-time streaming for compliance
    if (event.status === 'denied' || this.isSensitiveAction(event.action)) {
      await this.alertService.notify({
        type: 'audit_alert',
        log,
      });
    }
  }

  async query(filter: AuditFilter): Promise<AuditLog[]> {
    let query = this.db.auditLogs.select();

    if (filter.teamId) {
      query = query.where('teamId', '=', filter.teamId);
    }

    if (filter.userId) {
      query = query.where('userId', '=', filter.userId);
    }

    if (filter.action) {
      query = query.where('action', '=', filter.action);
    }

    if (filter.since) {
      query = query.where('timestamp', '>=', filter.since);
    }

    if (filter.until) {
      query = query.where('timestamp', '<=', filter.until);
    }

    return query
      .orderBy('timestamp', 'desc')
      .limit(filter.limit || 100)
      .execute();
  }

  async export(teamId: string, format: 'csv' | 'json'): Promise<string> {
    const logs = await this.query({ teamId, limit: 10000 });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV export
    const headers = ['timestamp', 'user', 'action', 'resource', 'status', 'ip'];
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.userId,
      log.action,
      `${log.resourceType}/${log.resourceId || ''}`,
      log.status,
      log.ipAddress,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async generateComplianceReport(
    teamId: string,
    standard: 'soc2' | 'hipaa' | 'gdpr',
    period: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    const logs = await this.query({
      teamId,
      since: period.start,
      until: period.end,
    });

    const report: ComplianceReport = {
      standard,
      period,
      generatedAt: new Date(),
      sections: [],
    };

    // Access Control section
    report.sections.push({
      name: 'Access Control',
      controls: [
        {
          id: 'AC-1',
          name: 'Authentication',
          status: this.checkAuthenticationCompliance(logs),
          evidence: this.getAuthEvidence(logs),
        },
        {
          id: 'AC-2',
          name: 'Authorization',
          status: this.checkAuthorizationCompliance(logs),
          evidence: this.getAuthzEvidence(logs),
        },
      ],
    });

    // Change Management section
    report.sections.push({
      name: 'Change Management',
      controls: [
        {
          id: 'CM-1',
          name: 'Change Logging',
          status: 'passed',
          evidence: `${logs.length} changes logged`,
        },
        {
          id: 'CM-2',
          name: 'Approval Process',
          status: this.checkApprovalCompliance(logs),
          evidence: this.getApprovalEvidence(logs),
        },
      ],
    });

    return report;
  }

  private isSensitiveAction(action: string): boolean {
    return [
      'terraform_destroy',
      'k8s_delete',
      'user_removed',
      'sso_configured',
      'billing_changed',
    ].includes(action);
  }
}
```

---

### 5. Database Schema

**File**: `backend/src/db/schema.sql`

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id UUID REFERENCES users(id),
    plan VARCHAR(50) DEFAULT 'free',
    stripe_subscription_id VARCHAR(255),
    sso_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team Members
CREATE TABLE team_members (
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);

-- Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255),
    resource_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage Records
CREATE TABLE usage_records (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    operation_type VARCHAR(255) NOT NULL,
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 6),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    amount INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_audit_logs_team_timestamp ON audit_logs(team_id, timestamp);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_usage_records_team_timestamp ON usage_records(team_id, timestamp);
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-250 | As an admin, I want to configure Okta SSO | SAML integration working | Sprint 17-18 |
| US-251 | As an admin, I want to configure Azure AD | OIDC integration working | Sprint 17-18 |
| US-252 | As a user, I want to login with SSO | SSO flow complete | Sprint 17-18 |
| US-253 | As an admin, I want to view audit logs | Logs queryable | Sprint 17-18 |
| US-254 | As a user, I want to upgrade my plan | Stripe integration working | Sprint 17-18 |

---

## Sprint Breakdown

### Sprint 17-18 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| SAML integration | 4 days | Okta SSO working |
| OIDC integration | 3 days | Azure AD working |
| Device code flow | 2 days | CLI auth |
| Team management API | 3 days | CRUD operations |
| Stripe integration | 4 days | Billing working |
| Audit logging | 3 days | Full audit trail |
| Compliance reports | 3 days | SOC2 report |

---

## Acceptance Criteria

- [ ] SSO works with Okta and Azure AD
- [ ] Device code flow works for headless CLI
- [ ] Team CRUD operations functional
- [ ] Stripe subscriptions working
- [ ] Webhook handling reliable
- [ ] Audit logs capture all operations
- [ ] Compliance report generation working
- [ ] All APIs secured with authentication

---

*Document Version: 1.0*
*Last Updated: January 2026*
