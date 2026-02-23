import { logger } from '../utils';

export interface WebSocketClientOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * WebSocket Client for streaming communication
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private reconnectAttempts = 0;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private errorHandlers: Set<(error: Event) => void> = new Set();
  private closeHandlers: Set<() => void> = new Set();

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url;
    this.options = {
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          logger.info(`WebSocket connected to ${this.url}`);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.messageHandlers.forEach(handler => handler(data));
          } catch (error) {
            logger.error('Failed to parse WebSocket message', error);
          }
        };

        this.ws.onerror = (event) => {
          logger.error('WebSocket error', event);
          this.errorHandlers.forEach(handler => handler(event));
          reject(event);
        };

        this.ws.onclose = () => {
          logger.warn(`WebSocket disconnected from ${this.url}`);
          this.closeHandlers.forEach(handler => handler());

          // Auto-reconnect
          if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.reconnectAttempts++;
            logger.info(
              `Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`
            );
            setTimeout(() => {
              this.connect().catch(() => {
                // Ignore, will retry or give up
              });
            }, this.options.reconnectInterval);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(data));
  }

  onMessage(handler: (data: any) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: (error: Event) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    if (this.ws) {
      this.options.reconnect = false; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
