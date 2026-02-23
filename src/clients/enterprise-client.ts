/**
 * Enterprise API Clients
 * Clients for auth, team, billing, and audit services
 */

import { RestClient } from '.';
import { ServiceURLs } from '.';
import type {
  DeviceCodeResponse,
  DevicePollResponse,
  TokenValidateResponse,
  Team,
  TeamMember,
  CreateTeamRequest,
  InviteMemberRequest,
  BillingStatus,
  SubscribeRequest,
  Invoice,
  UsageSummary,
  AuditLog,
  AuditLogQuery,
  CreateAuditLogRequest,
} from '../types';

// ==================== Auth Client ====================

export class AuthClient {
  private client: RestClient;

  constructor() {
    this.client = new RestClient(ServiceURLs.AUTH);
  }

  async initiateDeviceFlow(): Promise<DeviceCodeResponse> {
    const response = await this.client.post<DeviceCodeResponse>('/api/auth/device/initiate');
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to initiate device flow');
    }
    return response.data;
  }

  async pollDeviceCode(deviceCode: string): Promise<DevicePollResponse> {
    const response = await this.client.get<DevicePollResponse>(`/api/auth/device/poll/${deviceCode}`);
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to poll device code');
    }
    return response.data;
  }

  async verifyDeviceCode(userCode: string, userId: string): Promise<boolean> {
    const response = await this.client.post<{ verified: boolean }>('/api/auth/device/verify', {
      userCode,
      userId,
    });
    return response.success && response.data?.verified === true;
  }

  async validateToken(accessToken: string): Promise<TokenValidateResponse> {
    const response = await this.client.post<TokenValidateResponse>('/api/auth/token/validate', {
      accessToken,
    });
    if (!response.success || !response.data) {
      return { valid: false };
    }
    return response.data;
  }
}

// ==================== Team Client ====================

export class TeamClient {
  private client: RestClient;

  constructor() {
    this.client = new RestClient(ServiceURLs.TEAM);
  }

  async createTeam(request: CreateTeamRequest): Promise<Team> {
    const response = await this.client.post<Team>('/api/team/teams', request);
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create team');
    }
    return response.data;
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const response = await this.client.get<Team>(`/api/team/teams/${teamId}`);
    if (!response.success) {
      return null;
    }
    return response.data || null;
  }

  async listTeams(userId: string): Promise<Team[]> {
    const response = await this.client.get<Team[]>(`/api/team/teams?userId=${userId}`);
    if (!response.success || !response.data) {
      return [];
    }
    return response.data;
  }

  async deleteTeam(teamId: string): Promise<void> {
    const response = await this.client.delete(`/api/team/teams/${teamId}`);
    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to delete team');
    }
  }

  async inviteMember(teamId: string, request: InviteMemberRequest): Promise<TeamMember> {
    const response = await this.client.post<TeamMember>(
      `/api/team/teams/${teamId}/members`,
      request
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to invite member');
    }
    return response.data;
  }

  async listMembers(teamId: string): Promise<TeamMember[]> {
    const response = await this.client.get<TeamMember[]>(`/api/team/teams/${teamId}/members`);
    if (!response.success || !response.data) {
      return [];
    }
    return response.data;
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const response = await this.client.delete(`/api/team/teams/${teamId}/members/${userId}`);
    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to remove member');
    }
  }

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<TeamMember> {
    const response = await this.client.put<TeamMember>(
      `/api/team/teams/${teamId}/members/${userId}`,
      { role }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to update member role');
    }
    return response.data;
  }
}

// ==================== Billing Client ====================

export class BillingClient {
  private client: RestClient;

  constructor() {
    this.client = new RestClient(ServiceURLs.BILLING);
  }

  async getStatus(teamId: string): Promise<BillingStatus> {
    const response = await this.client.get<BillingStatus>(
      `/api/billing/status?teamId=${teamId}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get billing status');
    }
    return response.data;
  }

  async subscribe(teamId: string, request: SubscribeRequest): Promise<BillingStatus> {
    const response = await this.client.post<BillingStatus>('/api/billing/subscribe', {
      ...request,
      teamId,
    });
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to subscribe');
    }
    return response.data;
  }

  async cancel(teamId: string): Promise<BillingStatus> {
    const response = await this.client.post<BillingStatus>('/api/billing/cancel', { teamId });
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to cancel subscription');
    }
    return response.data;
  }

  async getUsage(teamId: string, period: 'day' | 'week' | 'month' = 'month'): Promise<UsageSummary> {
    const response = await this.client.get<UsageSummary>(
      `/api/billing/usage?teamId=${teamId}&period=${period}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get usage');
    }
    return response.data;
  }

  async getInvoices(teamId: string, limit: number = 10): Promise<Invoice[]> {
    const response = await this.client.get<Invoice[]>(
      `/api/billing/invoices?teamId=${teamId}&limit=${limit}`
    );
    if (!response.success || !response.data) {
      return [];
    }
    return response.data;
  }

  async recordUsage(
    teamId: string,
    operationType: string,
    tokensUsed: number,
    costUsd: number,
    userId?: string
  ): Promise<void> {
    await this.client.post('/api/billing/usage', {
      teamId,
      userId,
      operationType,
      tokensUsed,
      costUsd,
    });
  }
}

// ==================== Audit Client ====================

export class AuditClient {
  private client: RestClient;

  constructor() {
    this.client = new RestClient(ServiceURLs.AUDIT);
  }

  async createLog(request: CreateAuditLogRequest): Promise<AuditLog> {
    const response = await this.client.post<AuditLog>('/api/audit/logs', request);
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create audit log');
    }
    return response.data;
  }

  async queryLogs(query: AuditLogQuery = {}): Promise<{
    logs: AuditLog[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (query.teamId) params.set('teamId', query.teamId);
    if (query.userId) params.set('userId', query.userId);
    if (query.action) params.set('action', query.action);
    if (query.status) params.set('status', query.status);
    if (query.since) params.set('since', query.since);
    if (query.until) params.set('until', query.until);
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.offset) params.set('offset', query.offset.toString());

    const response = await this.client.get<{
      logs: AuditLog[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/audit/logs?${params}`);

    if (!response.success || !response.data) {
      return { logs: [], total: 0, limit: 100, offset: 0 };
    }
    return response.data;
  }

  async exportLogs(
    format: 'csv' | 'json',
    query: Partial<AuditLogQuery> = {}
  ): Promise<string> {
    const params = new URLSearchParams();
    params.set('format', format);
    if (query.teamId) params.set('teamId', query.teamId);
    if (query.userId) params.set('userId', query.userId);
    if (query.action) params.set('action', query.action);
    if (query.since) params.set('since', query.since);
    if (query.until) params.set('until', query.until);

    const url = `${ServiceURLs.AUDIT}/api/audit/export?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to export audit logs');
    }

    return response.text();
  }
}

// ==================== Singleton Instances ====================

export const authClient = new AuthClient();
export const teamClient = new TeamClient();
export const billingClient = new BillingClient();
export const auditClient = new AuditClient();
