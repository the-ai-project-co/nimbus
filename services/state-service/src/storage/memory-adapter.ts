import type { Operation } from '@nimbus/shared-types';

/**
 * In-memory storage adapter for testing
 */
export class MemoryAdapter {
  private operations: Map<string, Operation> = new Map();
  private config: Map<string, any> = new Map();
  private templates: Map<string, any> = new Map();
  private projects: Map<string, any> = new Map();
  private auditLogs: any[] = [];
  private safetyChecks: Map<string, any> = new Map();
  private checkpoints: Map<string, any> = new Map();
  private conversations: Map<string, any> = new Map();
  private artifacts: Map<string, any> = new Map();

  // Operations
  saveOperation(operation: Operation): void {
    this.operations.set(operation.id, operation);
  }

  getOperation(id: string): Operation | null {
    return this.operations.get(id) || null;
  }

  listOperations(limit: number = 50, offset: number = 0): Operation[] {
    const all = Array.from(this.operations.values());
    all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return all.slice(offset, offset + limit);
  }

  listOperationsByType(type: string, limit: number = 50): Operation[] {
    const all = Array.from(this.operations.values())
      .filter(op => op.type === type);
    all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return all.slice(0, limit);
  }

  // Config
  setConfig(key: string, value: any): void {
    this.config.set(key, value);
  }

  getConfig(key: string): any | null {
    return this.config.get(key) || null;
  }

  getAllConfig(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.config.entries()) {
      result[key] = value;
    }
    return result;
  }

  // Templates
  saveTemplate(id: string, name: string, type: string, content: string, variables?: any): void {
    this.templates.set(id, {
      id,
      name,
      type,
      content,
      variables,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  getTemplate(id: string): any | null {
    return this.templates.get(id) || null;
  }

  listTemplates(type?: string): any[] {
    const all = Array.from(this.templates.values());
    if (type) {
      return all.filter(t => t.type === type);
    }
    return all;
  }

  deleteTemplate(id: string): void {
    this.templates.delete(id);
  }

  // Conversations
  saveConversation(id: string, title: string, messages: any[], model?: string, metadata?: any): void {
    this.conversations.set(id, { id, title, messages, model, metadata, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  getConversation(id: string): any | null {
    return this.conversations.get(id) || null;
  }

  listConversations(limit: number = 50, offset: number = 0): any[] {
    return Array.from(this.conversations.values()).slice(offset, offset + limit);
  }

  deleteConversation(id: string): void {
    this.conversations.delete(id);
  }

  // Artifacts
  saveArtifact(id: string, conversationId: string | null, name: string, type: string, content: string, language?: string, metadata?: any): void {
    this.artifacts.set(id, { id, conversationId, name, type, content, language, metadata, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  getArtifact(id: string): any | null {
    return this.artifacts.get(id) || null;
  }

  listArtifacts(type?: string, conversationId?: string, limit: number = 50, offset: number = 0): any[] {
    let all = Array.from(this.artifacts.values());
    if (type) all = all.filter(a => a.type === type);
    if (conversationId) all = all.filter(a => a.conversationId === conversationId);
    return all.slice(offset, offset + limit);
  }

  deleteArtifact(id: string): void {
    this.artifacts.delete(id);
  }

  // Projects
  saveProject(id: string, name: string, path: string, config: any): void {
    this.projects.set(id, { id, name, path, config, lastScanned: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  getProject(id: string): any | null {
    return this.projects.get(id) || null;
  }

  getProjectByPath(path: string): any | null {
    for (const p of this.projects.values()) {
      if (p.path === path) return p;
    }
    return null;
  }

  listProjects(): any[] {
    return Array.from(this.projects.values());
  }

  deleteProject(id: string): void {
    this.projects.delete(id);
  }

  // Audit Logs
  logAuditEvent(event: { id: string; userId?: string; action: string; resourceType?: string; resourceId?: string; input?: any; output?: any; status: string; durationMs?: number; metadata?: any }): void {
    this.auditLogs.push({ ...event, timestamp: new Date().toISOString() });
  }

  getAuditLogs(filter?: { userId?: string; action?: string; resourceType?: string; status?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): any[] {
    let logs = [...this.auditLogs];
    if (filter?.userId) logs = logs.filter(l => l.userId === filter.userId);
    if (filter?.action) logs = logs.filter(l => l.action === filter.action);
    if (filter?.resourceType) logs = logs.filter(l => l.resourceType === filter.resourceType);
    if (filter?.status) logs = logs.filter(l => l.status === filter.status);
    if (filter?.startDate) logs = logs.filter(l => new Date(l.timestamp) >= filter.startDate!);
    if (filter?.endDate) logs = logs.filter(l => new Date(l.timestamp) <= filter.endDate!);
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  // Safety Checks
  saveSafetyCheck(check: { id: string; operationId?: string; checkType: string; checkName: string; passed: boolean; severity?: string; message?: string; requiresApproval?: boolean }): void {
    this.safetyChecks.set(check.id, { ...check, createdAt: new Date().toISOString() });
  }

  getSafetyChecksForOperation(operationId: string): any[] {
    return Array.from(this.safetyChecks.values()).filter(c => c.operationId === operationId);
  }

  recordApproval(checkId: string, approvedBy: string): void {
    const check = this.safetyChecks.get(checkId);
    if (check) {
      check.approvedBy = approvedBy;
      check.approvedAt = new Date().toISOString();
    }
  }

  // Checkpoints
  saveCheckpoint(id: string, operationId: string, step: number, state: Record<string, unknown>): void {
    this.checkpoints.set(id, { id, operationId, step, state, createdAt: new Date().toISOString() });
  }

  getCheckpoint(id: string): { id: string; operationId: string; step: number; state: Record<string, unknown>; createdAt: string } | null {
    return this.checkpoints.get(id) || null;
  }

  getLatestCheckpoint(operationId: string): { id: string; operationId: string; step: number; state: Record<string, unknown>; createdAt: string } | null {
    const matching = Array.from(this.checkpoints.values()).filter(c => c.operationId === operationId);
    if (matching.length === 0) return null;
    matching.sort((a: any, b: any) => b.step - a.step);
    return matching[0];
  }

  listCheckpoints(operationId: string): Array<{ id: string; step: number; createdAt: string }> {
    return Array.from(this.checkpoints.values())
      .filter(c => c.operationId === operationId)
      .sort((a: any, b: any) => a.step - b.step)
      .map(c => ({ id: c.id, step: c.step, createdAt: c.createdAt }));
  }

  deleteCheckpoints(operationId: string): void {
    for (const [id, c] of this.checkpoints.entries()) {
      if (c.operationId === operationId) this.checkpoints.delete(id);
    }
  }

  // Cleanup
  clear(): void {
    this.operations.clear();
    this.config.clear();
    this.templates.clear();
    this.projects.clear();
    this.auditLogs = [];
    this.safetyChecks.clear();
    this.checkpoints.clear();
    this.conversations.clear();
    this.artifacts.clear();
  }
}
