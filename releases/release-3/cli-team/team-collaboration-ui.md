# CLI Team - Release 3 Specification

> **Team**: CLI/Frontend Team
> **Phase**: Release 3 (Months 7-9)
> **Dependencies**: Enterprise Backend, Auth System

---

## Overview

Release 3 adds team collaboration UI, usage tracking displays, and enterprise SSO login flows.

---

## New Features

### 1. Team Management UI

#### 1.1 Team Commands

```bash
nimbus team create <name>              # Create team
nimbus team invite <email> [--role]    # Invite member
nimbus team members                    # List members
nimbus team remove <email>             # Remove member
nimbus team switch <team>              # Switch active team
```

#### 1.2 Team Creation Flow

```bash
$ nimbus team create my-team

  ╭─ Team Created ───────────────────────────────────────────╮
  │                                                          │
  │  Team: my-team                                           │
  │  ID: team_abc123                                         │
  │                                                          │
  │  Invite members:                                         │
  │  $ nimbus team invite user@example.com                   │
  │                                                          │
  │  Features enabled:                                       │
  │  ✓ Shared operation history                              │
  │  ✓ Shared templates                                      │
  │  ✓ Audit logging                                         │
  │  ✓ Role-based access control                             │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 1.3 Team Members View

```bash
$ nimbus team members

  ╭─ Team: my-team ──────────────────────────────────────────╮
  │                                                          │
  │  Members (4)                                             │
  │                                                          │
  │  alice@company.com          Owner    Active 2h ago      │
  │  bob@company.com            Admin    Active 1d ago      │
  │  charlie@company.com        Member   Active now         │
  │  diana@company.com          Viewer   Never logged in    │
  │                                                          │
  │  [Invite Member] [Manage Roles] [Team Settings]         │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 2. Shared Templates UI

#### 2.1 Template Sharing Commands

```bash
nimbus templates share <name> --team <team>    # Share template
nimbus templates list --team                   # List team templates
nimbus templates import <id>                   # Import to local
```

#### 2.2 Team Templates Browser

```bash
$ nimbus templates list --team

  ╭─ Team Templates ─────────────────────────────────────────╮
  │                                                          │
  │  my-eks-template          by: alice@company.com         │
  │  └─ EKS cluster with company standards                  │
  │                                                          │
  │  production-vpc           by: bob@company.com           │
  │  └─ VPC with compliance requirements                    │
  │                                                          │
  │  ml-training-cluster      by: charlie@company.com       │
  │  └─ GPU cluster for ML training                         │
  │                                                          │
  │  [Use Template] [View Details] [Copy to Local]          │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 3. Usage & Billing UI

#### 3.1 Usage Dashboard

```bash
$ nimbus usage

  ╭─ Usage This Month ───────────────────────────────────────╮
  │                                                          │
  │  Plan: Pro ($29/month)                                   │
  │  Billing Period: Jan 1 - Jan 31, 2026                   │
  │                                                          │
  │  Operations Used: 127 / Unlimited                       │
  │  ████████░░░░░░░░░░░░                                   │
  │                                                          │
  │  By Category:                                            │
  │  • Terraform generation: 45                              │
  │  • K8s operations: 52                                    │
  │  • CI/CD generation: 18                                  │
  │  • Chat queries: 12                                      │
  │                                                          │
  │  [Upgrade to Team] [View Invoice] [Manage Billing]      │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 3.2 Billing Commands

```bash
nimbus billing status                 # Current plan status
nimbus billing upgrade <plan>         # Upgrade plan
nimbus billing invoices               # View invoices
nimbus billing payment                # Update payment method
```

---

### 4. SSO Login Flow

#### 4.1 SSO Authentication

```bash
$ nimbus auth login --sso

  ╭─ SSO Login ──────────────────────────────────────────────╮
  │                                                          │
  │  Opening browser for authentication...                   │
  │                                                          │
  │  If the browser doesn't open automatically, visit:       │
  │  https://api.nimbus.dev/auth/sso/start?code=ABC123      │
  │                                                          │
  │  Waiting for authentication... ⣾                        │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  ✓ Authenticated as alice@company.com
  ✓ Team: my-team (Enterprise)
  ✓ Role: Admin

  Welcome back, Alice!
```

#### 4.2 Device Code Flow (for headless environments)

```bash
$ nimbus auth login --sso --device-code

  ╭─ Device Authentication ──────────────────────────────────╮
  │                                                          │
  │  To sign in, visit: https://nimbus.dev/device           │
  │  Enter code: ABCD-1234                                   │
  │                                                          │
  │  Waiting for authentication... ⣾                        │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 5. Audit Log Viewer

#### 5.1 Audit Commands

```bash
nimbus audit                           # View recent audit logs
nimbus audit --user <email>            # Filter by user
nimbus audit --action <action>         # Filter by action
nimbus audit export --format csv       # Export logs
```

#### 5.2 Audit Log Display

```bash
$ nimbus audit

  ╭─ Audit Log ──────────────────────────────────────────────╮
  │                                                          │
  │  2026-01-20 14:32:15                                     │
  │  User: alice@company.com                                 │
  │  Action: terraform_apply                                 │
  │  Resources: aws_eks_cluster.production                   │
  │  Status: approved by bob@company.com                     │
  │  IP: 192.168.1.100                                       │
  │                                                          │
  │  2026-01-20 14:15:03                                     │
  │  User: charlie@company.com                               │
  │  Action: k8s_delete                                      │
  │  Resources: deployment/api-server                        │
  │  Status: denied (production protection)                  │
  │  IP: 192.168.1.101                                       │
  │                                                          │
  │  [Filter] [Export] [Search]                              │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 6. Cost Estimation Display

#### 6.1 Pre-Operation Cost Estimates

```bash
  ╭─ Monthly Cost Estimate ─────────────────────────────────╮
  │                                                          │
  │  EKS Control Plane        $73.00                        │
  │  EC2 Instances (5x t3.large)                            │
  │    └─ On-Demand           $304.00                       │
  │    └─ Spot (estimated)    $91.20  ← 70% savings        │
  │  NAT Gateway              $32.40                        │
  │  Load Balancer            $16.20                        │
  │  EBS Storage (100GB × 5)  $50.00                        │
  │                           ─────────                     │
  │  Total (On-Demand)        $475.60/month                │
  │  Total (with Spot)        $262.80/month                │
  │                                                          │
  │  💡 Use Spot instances for 70% savings                  │
  │                                                          │
  │  [Apply On-Demand] [Apply with Spot] [Optimize]         │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 6.2 Cost Component Breakdown

```tsx
interface CostBreakdownProps {
  items: CostItem[];
  total: number;
  optimizations?: Optimization[];
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({
  items,
  total,
  optimizations,
}) => {
  // Render cost breakdown with optimization tips
};
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-230 | As a user, I want to create and manage teams | Team CRUD operations working | Sprint 17-18 |
| US-231 | As a user, I want to share templates with my team | Template sharing functional | Sprint 17-18 |
| US-232 | As a user, I want to view my usage and billing | Usage dashboard accurate | Sprint 17-18 |
| US-233 | As a user, I want to login with SSO | SSO flow complete | Sprint 17-18 |
| US-234 | As an admin, I want to view audit logs | Audit log viewer working | Sprint 17-18 |
| US-235 | As a user, I want to see cost estimates | Cost breakdown displayed | Sprint 15-16 |

---

## Technical Requirements

### New Commands Structure

```
packages/cli/src/commands/
├── team/
│   ├── create.ts
│   ├── invite.ts
│   ├── members.ts
│   ├── remove.ts
│   └── switch.ts
├── templates/
│   ├── share.ts
│   └── list.ts
├── billing/
│   ├── status.ts
│   ├── upgrade.ts
│   └── invoices.ts
├── audit/
│   ├── index.ts
│   └── export.ts
└── auth/
    ├── login.ts        # Updated for SSO
    └── sso-callback.ts
```

### New UI Components

```
packages/cli/src/ui/
├── TeamMembers.tsx
├── TemplatesBrowser.tsx
├── UsageDashboard.tsx
├── BillingStatus.tsx
├── SSOLogin.tsx
├── AuditLog.tsx
└── CostBreakdown.tsx
```

---

## Sprint Breakdown

### Sprint 15-16 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Cost breakdown component | 3 days | Cost visualization |
| Optimization suggestions UI | 2 days | Cost tips display |
| Pre-operation cost estimates | 3 days | Integrated estimates |

### Sprint 17-18 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Team management commands | 4 days | Team CRUD |
| Template sharing UI | 3 days | Share/browse templates |
| Usage dashboard | 3 days | Usage tracking |
| SSO login flow | 4 days | Browser + device code |
| Audit log viewer | 3 days | Log display + export |

---

## Acceptance Criteria

- [ ] Team creation and management fully functional
- [ ] Template sharing with role-based access
- [ ] Usage dashboard shows accurate data
- [ ] SSO login works with Okta, Azure AD, Google
- [ ] Device code flow works in headless environments
- [ ] Audit logs filterable and exportable
- [ ] Cost estimates shown before expensive operations
- [ ] All components respect RBAC permissions

---

*Document Version: 1.0*
*Last Updated: January 2026*
