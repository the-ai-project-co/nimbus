/**
 * Filesystem Tools Service Client
 *
 * Client for communicating with the FS Tools Service
 */

import { logger } from '@nimbus/shared-utils';

export interface FileWriteResult {
  success: boolean;
  path: string;
  bytesWritten: number;
}

export interface FileReadResult {
  content: string;
  path: string;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifiedAt: Date;
}

export interface FileExistsResult {
  exists: boolean;
  path: string;
}

export class FSToolsClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.FS_TOOLS_SERVICE_URL || 'http://localhost:3005';
  }

  /**
   * Check if fs tools service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Write content to a file
   */
  async write(path: string, content: string, options?: {
    createDirs?: boolean;
  }): Promise<FileWriteResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          content,
          createDirs: options?.createDirs ?? true,
        }),
      });

      if (!response.ok) {
        throw new Error(`File write failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'File write failed');
      }

      return {
        success: true,
        path: data.data.path || path,
        bytesWritten: data.data.bytesWritten || content.length,
      };
    } catch (error) {
      logger.error('File write error', error);
      throw error;
    }
  }

  /**
   * Read content from a file
   */
  async read(path: string, encoding?: BufferEncoding): Promise<FileReadResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, encoding }),
      });

      if (!response.ok) {
        throw new Error(`File read failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'File read failed');
      }

      return {
        content: data.data.content,
        path: data.data.path || path,
      };
    } catch (error) {
      logger.error('File read error', error);
      throw error;
    }
  }

  /**
   * Check if a file or directory exists
   */
  async exists(path: string): Promise<FileExistsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`Exists check failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Exists check failed');
      }

      return {
        exists: data.data.exists,
        path: data.data.path || path,
      };
    } catch (error) {
      logger.error('Exists check error', error);
      throw error;
    }
  }

  /**
   * Create a directory
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<{ success: boolean; path: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          recursive: options?.recursive ?? true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mkdir failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Mkdir failed');
      }

      return {
        success: true,
        path: data.data.path || path,
      };
    } catch (error) {
      logger.error('Mkdir error', error);
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  async list(directory: string, options?: {
    pattern?: string;
    recursive?: boolean;
    includeHidden?: boolean;
    onlyFiles?: boolean;
    onlyDirectories?: boolean;
  }): Promise<FileInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`List failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'List failed');
      }

      return (data.data.files || []).map((f: any) => ({
        name: f.name,
        path: f.path,
        isDirectory: f.isDirectory,
        isFile: f.isFile,
        size: f.size,
        modifiedAt: new Date(f.modifiedAt),
      }));
    } catch (error) {
      logger.error('List error', error);
      throw error;
    }
  }

  /**
   * Copy a file or directory
   */
  async copy(source: string, destination: string, options?: {
    recursive?: boolean;
    overwrite?: boolean;
  }): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          destination,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Copy failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Copy failed');
      }

      return { success: true };
    } catch (error) {
      logger.error('Copy error', error);
      throw error;
    }
  }

  /**
   * Move/rename a file or directory
   */
  async move(source: string, destination: string): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination }),
      });

      if (!response.ok) {
        throw new Error(`Move failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Move failed');
      }

      return { success: true };
    } catch (error) {
      logger.error('Move error', error);
      throw error;
    }
  }

  /**
   * Delete a file or directory
   */
  async delete(path: string, options?: {
    recursive?: boolean;
    force?: boolean;
  }): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Delete failed');
      }

      return { success: true };
    } catch (error) {
      logger.error('Delete error', error);
      throw error;
    }
  }

  /**
   * Get file stats
   */
  async stat(path: string): Promise<FileInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/api/fs/stat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        throw new Error(`Stat failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Stat failed');
      }

      const stats = data.data.stats;
      return {
        name: stats.name || path.split('/').pop() || '',
        path: stats.path || path,
        isDirectory: stats.isDirectory,
        isFile: stats.isFile,
        size: stats.size,
        modifiedAt: new Date(stats.modifiedAt || stats.mtime),
      };
    } catch (error) {
      logger.error('Stat error', error);
      throw error;
    }
  }
}
