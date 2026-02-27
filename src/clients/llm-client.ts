/**
 * LLM Client
 *
 * WebSocket client for streaming LLM responses from the LLM Service
 */

import { WebSocketClient, WebSocketURLs } from '.';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamingChunk {
  type: 'content' | 'tool_calls' | 'done' | 'error';
  content?: string;
  toolCalls?: any[];
  done?: boolean;
  tokenCount?: number;
  error?: string;
  message?: string;
}

export interface ChatOptions {
  model?: string;
  taskType?: string;
}

/**
 * LLM Client for streaming chat completions
 */
export class LLMClient {
  private wsUrl: string;

  constructor(wsUrl?: string) {
    this.wsUrl = wsUrl || WebSocketURLs.LLM;
  }

  /**
   * Stream a chat completion
   * @param messages - Array of chat messages
   * @param options - Chat options (model, taskType)
   * @returns AsyncGenerator yielding StreamingChunk objects
   */
  async *streamChat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamingChunk> {
    const ws = new WebSocketClient(this.wsUrl, {
      reconnect: false, // Don't reconnect for single requests
    });

    const messageQueue: StreamingChunk[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWaiting: (() => void) | null = null;

    // Set up message handler
    const removeMessageHandler = ws.onMessage((data: StreamingChunk) => {
      messageQueue.push(data);

      if (data.type === 'done' || data.type === 'error') {
        done = true;
        if (data.type === 'error') {
          error = new Error(data.message || data.error || 'Unknown error');
        }
      }

      // Wake up the generator if it's waiting
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    const removeErrorHandler = ws.onError(() => {
      error = new Error('WebSocket connection failed');
      done = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    const removeCloseHandler = ws.onClose(() => {
      done = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    try {
      // Connect to WebSocket
      await ws.connect();

      // Send the chat request
      ws.send({
        messages,
        model: options.model,
        taskType: options.taskType,
      });

      // Yield chunks as they arrive
      while (!done || messageQueue.length > 0) {
        if (messageQueue.length > 0) {
          const chunk = messageQueue.shift()!;
          yield chunk;
        } else if (!done) {
          // Wait for more messages
          await new Promise<void>(resolve => {
            resolveWaiting = resolve;
          });
        }
      }

      if (error) {
        throw error;
      }
    } finally {
      // Clean up
      removeMessageHandler();
      removeErrorHandler();
      removeCloseHandler();
      ws.close();
    }
  }

  /**
   * Send a single chat message and get streaming response
   * Convenience method that builds the messages array
   */
  async *chat(
    userMessage: string,
    history: ChatMessage[] = [],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamingChunk> {
    const messages: ChatMessage[] = [...history, { role: 'user', content: userMessage }];

    yield* this.streamChat(messages, options);
  }

  /**
   * Check if LLM service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Use HTTP health check endpoint
      const httpUrl = this.wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const llmClient = new LLMClient();
