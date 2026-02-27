/**
 * Enterprise Types
 * Types for team collaboration, billing, audit, and SSO features
 */

// ==================== User Types ====================

export interface User {
  id: string;
  email: string;
  name?: string;
  githubUsername?: string;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  name?: string;
  githubUsername?: string;
}

// ==================== Team Types ====================

export type TeamPlan = 'free' | 'pro' | 'enterprise';
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  plan: TeamPlan;
  stripeSubscriptionId?: string;
  ssoConfig?: SSOConfig;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  user?: User;
}

export interface CreateTeamRequest {
  name: string;
  ownerId: string;
}

export interface InviteMemberRequest {
  email: string;
  role?: TeamRole;
}

export interface UpdateMemberRoleRequest {
  role: TeamRole;
}

export interface SSOConfig {
  provider: 'okta' | 'azure' | 'google' | 'onelogin';
  issuerUrl: string;
  clientId: string;
  enabled: boolean;
}

// ==================== Device Code Flow (SSO) ====================

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DevicePollResponse {
  accessToken?: string;
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied';
  errorDescription?: string;
}

export interface DeviceVerifyRequest {
  userCode: string;
  userId: string;
}

export interface TokenValidateRequest {
  accessToken: string;
}

export interface TokenValidateResponse {
  valid: boolean;
  userId?: string;
  teamId?: string;
  expiresAt?: string;
}

// ==================== Billing Types ====================

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';

export interface BillingStatus {
  plan: TeamPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  seats: {
    used: number;
    total: number;
  };
}

export interface SubscribeRequest {
  plan: TeamPlan;
  paymentMethodId?: string;
  seats?: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amountDue: number;
  amountPaid: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  pdfUrl?: string;
  createdAt: string;
}

export interface UsageSummary {
  period: {
    start: string;
    end: string;
  };
  totals: {
    operations: number;
    tokensUsed: number;
    costUsd: number;
  };
  byOperationType: Record<
    string,
    {
      count: number;
      tokensUsed: number;
      costUsd: number;
    }
  >;
  byUser?: Record<
    string,
    {
      count: number;
      tokensUsed: number;
      costUsd: number;
    }
  >;
}

// ==================== Audit Types ====================

export type AuditAction =
  | 'login'
  | 'logout'
  | 'team_create'
  | 'team_update'
  | 'team_delete'
  | 'member_invite'
  | 'member_remove'
  | 'member_role_change'
  | 'terraform_plan'
  | 'terraform_apply'
  | 'terraform_destroy'
  | 'k8s_apply'
  | 'k8s_delete'
  | 'helm_install'
  | 'helm_upgrade'
  | 'helm_uninstall'
  | 'chat'
  | 'generate'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'billing_update'
  | 'sso_configure';

export type AuditStatus = 'success' | 'failure' | 'pending';

export interface AuditLog {
  id: string;
  timestamp: string;
  teamId?: string;
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  status: AuditStatus;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface CreateAuditLogRequest {
  teamId?: string;
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  status: AuditStatus;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditLogQuery {
  teamId?: string;
  userId?: string;
  action?: AuditAction;
  status?: AuditStatus;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface AuditExportOptions {
  format: 'csv' | 'json';
  query?: AuditLogQuery;
}

// ==================== Analyze Types ====================

export type AnalysisType = 'refactor' | 'docs' | 'security' | 'all';

export interface AnalyzeOptions {
  path?: string;
  type: AnalysisType;
  json?: boolean;
}

export interface RefactoringSuggestion {
  file: string;
  line: number;
  endLine?: number;
  type: 'complexity' | 'duplication' | 'naming' | 'performance' | 'security' | 'style';
  severity: 'info' | 'warning' | 'error';
  explanation: string;
  original?: string;
  suggested?: string;
  diff?: string;
}

export interface CodeAnalysis {
  path: string;
  analyzedAt: string;
  summary: {
    filesAnalyzed: number;
    suggestionsCount: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  suggestions: RefactoringSuggestion[];
}

// ==================== CLI Option Types ====================

export interface TeamCommandOptions {
  nonInteractive?: boolean;
}

export interface TeamCreateOptions extends TeamCommandOptions {
  name?: string;
}

export interface TeamInviteOptions extends TeamCommandOptions {
  email?: string;
  role?: TeamRole;
}

export interface TeamMembersOptions extends TeamCommandOptions {
  json?: boolean;
}

export interface TeamRemoveOptions extends TeamCommandOptions {
  email?: string;
  force?: boolean;
}

export interface TeamSwitchOptions extends TeamCommandOptions {
  teamId?: string;
}

export interface BillingCommandOptions {
  nonInteractive?: boolean;
}

export interface BillingStatusOptions extends BillingCommandOptions {
  json?: boolean;
}

export interface BillingUpgradeOptions extends BillingCommandOptions {
  plan?: TeamPlan;
}

export interface BillingInvoicesOptions extends BillingCommandOptions {
  limit?: number;
  json?: boolean;
}

export interface UsageOptions {
  period?: 'day' | 'week' | 'month';
  teamId?: string;
  json?: boolean;
  nonInteractive?: boolean;
}

export interface AuditCommandOptions {
  nonInteractive?: boolean;
}

export interface AuditListOptions extends AuditCommandOptions {
  since?: string;
  until?: string;
  action?: string;
  userId?: string;
  limit?: number;
  json?: boolean;
}

export interface AuditExportCommandOptions extends AuditCommandOptions {
  format?: 'csv' | 'json';
  output?: string;
  since?: string;
  until?: string;
}
