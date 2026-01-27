/**
 * WebSocket Server for Streaming Chat
 * Handles real-time streaming of LLM responses
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from './router';
import { CompletionRequest } from './providers/base';

export function createWebSocketServer(router: LLMRouter, port: number) {
  const clients = new Set<any>();

  Bun.serve({
    port,
    websocket: {
      open(ws) {
        clients.add(ws);
        logger.info('WebSocket client connected', { clientCount: clients.size });
      },

      async message(ws, message) {
        try {
          const data = JSON.parse(message.toString()) as CompletionRequest & {
            taskType?: string;
          };

          if (!data.messages || !Array.isArray(data.messages)) {
            ws.send(
              JSON.stringify({
                error: 'Invalid request',
                message: 'messages array is required',
              })
            );
            return;
          }

          logger.info('WebSocket streaming request received', {
            model: data.model,
            taskType: data.taskType,
            messageCount: data.messages.length,
          });

          let tokenCount = 0;

          // Stream the response
          for await (const chunk of router.routeStream(data, data.taskType)) {
            if (chunk.content) {
              tokenCount++;
              ws.send(
                JSON.stringify({
                  type: 'content',
                  content: chunk.content,
                  done: false,
                })
              );
            }

            if (chunk.toolCalls) {
              ws.send(
                JSON.stringify({
                  type: 'tool_calls',
                  toolCalls: chunk.toolCalls,
                  done: false,
                })
              );
            }

            if (chunk.done) {
              ws.send(
                JSON.stringify({
                  type: 'done',
                  done: true,
                  tokenCount,
                })
              );

              logger.info('WebSocket streaming completed', {
                tokenCount,
              });
            }
          }
        } catch (error: any) {
          logger.error('WebSocket streaming failed', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Streaming failed',
              message: error.message,
            })
          );
        }
      },

      close(ws) {
        clients.delete(ws);
        logger.info('WebSocket client disconnected', { clientCount: clients.size });
      },
    },

    fetch(req, server) {
      const url = new URL(req.url);

      // Health check for WebSocket server
      if (url.pathname === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'llm-service-websocket',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          connectedClients: clients.size,
        });
      }

      // Upgrade to WebSocket
      if (server.upgrade(req)) {
        return; // Connection upgraded to WebSocket
      }

      return new Response('WebSocket server - send WebSocket connection', { status: 426 });
    },
  });

  logger.info(`WebSocket server started on port ${port}`);
}
