/**
 * Test utilities and helpers for integration and e2e tests
 */

export interface ServiceInstance {
  stop: () => void;
  port: number;
  wsPort?: number;
  baseUrl: string;
  wsUrl?: string;
}

/**
 * Wait for a service to be ready by polling the health endpoint
 */
export async function waitForService(
  baseUrl: string,
  maxRetries: number = 30,
  retryDelay: number = 100
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  return false;
}

/**
 * Create a test request helper for a service
 */
export function createTestClient(baseUrl: string) {
  return {
    get: async (path: string, options?: RequestInit) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        ...options,
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
        response,
      };
    },
    post: async (path: string, body?: any, options?: RequestInit) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
        response,
      };
    },
    delete: async (path: string, body?: any, options?: RequestInit) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
        response,
      };
    },
    put: async (path: string, body?: any, options?: RequestInit) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });
      return {
        status: response.status,
        data: await response.json().catch(() => null),
        response,
      };
    },
  };
}

/**
 * Generate unique ports for test services to avoid conflicts
 * Uses timestamp + random offset to ensure uniqueness across parallel test runs
 */
export function getTestPorts(): { http: number; ws: number } {
  // Use a combination of timestamp and random number to generate unique ports
  // Port range: 10000-60000 to avoid common ports
  const basePort = 10000 + Math.floor(Math.random() * 50000);
  return {
    http: basePort,
    ws: basePort + 1
  };
}

/**
 * Create a WebSocket test client
 */
export function createWebSocketClient(wsUrl: string): Promise<{
  ws: WebSocket;
  messages: any[];
  send: (data: any) => void;
  waitForMessage: (timeout?: number) => Promise<any>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages: any[] = [];
    let messageResolvers: ((msg: any) => void)[] = [];

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        send: (data: any) => ws.send(JSON.stringify(data)),
        waitForMessage: (timeout = 5000) => {
          return new Promise((res, rej) => {
            if (messages.length > 0) {
              res(messages.shift());
              return;
            }
            const timer = setTimeout(() => rej(new Error('WebSocket message timeout')), timeout);
            messageResolvers.push((msg) => {
              clearTimeout(timer);
              res(msg);
            });
          });
        },
        close: () => ws.close(),
      });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (messageResolvers.length > 0) {
        const resolver = messageResolvers.shift()!;
        resolver(data);
      } else {
        messages.push(data);
      }
    };

    ws.onerror = (error) => reject(error);
  });
}

/**
 * Clean up test resources
 */
export async function cleanupServices(services: ServiceInstance[]): Promise<void> {
  for (const service of services) {
    try {
      service.stop();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a temporary directory for test files
 */
export async function createTempDir(prefix: string): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Remove a temporary directory
 */
export async function removeTempDir(dir: string): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await rm(dir, { recursive: true, force: true });
}
