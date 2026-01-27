import type { Operation } from '@nimbus/shared-types';

/**
 * In-memory storage adapter for testing
 */
export class MemoryAdapter {
  private operations: Map<string, Operation> = new Map();
  private config: Map<string, any> = new Map();
  private templates: Map<string, any> = new Map();

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

  // Cleanup
  clear(): void {
    this.operations.clear();
    this.config.clear();
    this.templates.clear();
  }
}
