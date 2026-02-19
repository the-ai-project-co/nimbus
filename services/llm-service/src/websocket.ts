/**
 * WebSocket Server for Streaming Chat
 * Handles real-time streaming of LLM responses with provider fallback support
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from './router';
import { CompletionRequest } from './providers/base';
import { calculateCost } from './cost-calculator';

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

          let contentLength = 0;
          let finalUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

          // Stream the response (router.routeStream handles fallback internally)
          for await (const chunk of router.routeStream(data, data.taskType)) {
            if (chunk.content) {
              contentLength += chunk.content.length;
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

            // Capture usage from the final chunk if the provider sends it
            if (chunk.usage) {
              finalUsage = chunk.usage;
            }

            if (chunk.done) {
              // Use actual token counts from provider if available,
              // otherwise estimate based on content length (~4 chars per token)
              const tokenCount = finalUsage?.totalTokens || Math.ceil(contentLength / 4);
              const usage = finalUsage || {
                promptTokens: 0,
                completionTokens: tokenCount,
                totalTokens: tokenCount,
              };

              // Determine provider name: prefer the fallback metadata (which
              // tracks the actual provider that served the stream) over the
              // model-prefix heuristic.
              const fallbackMeta = router.lastStreamFallbackMeta;
              const providerName = fallbackMeta?.activeProvider
                ?? (data.model ? getProviderNameFromModel(data.model) : 'anthropic');

              const cost = calculateCost(
                providerName,
                data.model || 'unknown',
                usage.promptTokens,
                usage.completionTokens
              );

              // If a fallback occurred, notify the client before the done message
              if (fallbackMeta?.isFallback) {
                ws.send(
                  JSON.stringify({
                    type: 'fallback',
                    done: false,
                    fallback: {
                      originalProvider: fallbackMeta.failedProvider,
                      activeProvider: fallbackMeta.activeProvider,
                      message: `Provider "${fallbackMeta.failedProvider}" was unavailable. Response served by "${fallbackMeta.activeProvider}".`,
                    },
                  })
                );

                logger.info('WebSocket streaming fallback occurred', {
                  failedProvider: fallbackMeta.failedProvider,
                  activeProvider: fallbackMeta.activeProvider,
                });
              }

              ws.send(
                JSON.stringify({
                  type: 'done',
                  done: true,
                  tokenCount,
                  usage,
                  cost,
                  provider: providerName,
                  ...(fallbackMeta?.isFallback
                    ? {
                        fallback: {
                          originalProvider: fallbackMeta.failedProvider,
                          activeProvider: fallbackMeta.activeProvider,
                        },
                      }
                    : {}),
                })
              );

              // Persist usage to state service (fire-and-forget) with cost data
              router.persistUsage(usage, data.model, providerName, cost);

              logger.info('WebSocket streaming completed', {
                tokenCount,
                hasRealUsage: !!finalUsage,
                costUSD: cost.costUSD,
                provider: providerName,
                usedFallback: fallbackMeta?.isFallback ?? false,
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

/**
 * Infer provider name from model identifier for cost calculation in streaming context.
 */
function getProviderNameFromModel(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.includes('/')) return 'openrouter';
  if (model.startsWith('llama') || model.startsWith('mistral') || model.startsWith('codellama') || model.startsWith('phi')) return 'ollama';
  return 'anthropic';
}
