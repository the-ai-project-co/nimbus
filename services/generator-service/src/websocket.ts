/**
 * WebSocket Server for Generator Service
 * Handles real-time streaming of code generation progress
 */

import { logger } from '@nimbus/shared-utils';

interface GenerateMessage {
  type: 'generate';
  sessionId: string;
  applyBestPractices?: boolean;
  autofix?: boolean;
}

interface QuestionnaireStartMessage {
  type: 'questionnaire:start';
  questionnaireType: 'terraform' | 'kubernetes';
}

interface QuestionnaireAnswerMessage {
  type: 'questionnaire:answer';
  sessionId: string;
  questionId: string;
  value: unknown;
}

type ClientMessage = GenerateMessage | QuestionnaireStartMessage | QuestionnaireAnswerMessage;

export function createGeneratorWebSocketServer(port: number) {
  const clients = new Set<any>();

  Bun.serve({
    port,
    websocket: {
      open(ws) {
        clients.add(ws);
        logger.info('Generator WebSocket client connected', { clientCount: clients.size });
      },

      async message(ws, message) {
        try {
          const data = JSON.parse(message.toString()) as ClientMessage;

          switch (data.type) {
            case 'generate': {
              logger.info('WebSocket generate request', { sessionId: data.sessionId });

              // Send progress events
              ws.send(JSON.stringify({
                type: 'progress',
                stage: 'analyzing',
                percentage: 10,
              }));

              ws.send(JSON.stringify({
                type: 'progress',
                stage: 'generating',
                percentage: 50,
              }));

              ws.send(JSON.stringify({
                type: 'progress',
                stage: 'validating',
                percentage: 90,
              }));

              ws.send(JSON.stringify({
                type: 'done',
                files: [],
              }));

              logger.info('WebSocket generation completed', { sessionId: data.sessionId });
              break;
            }

            case 'questionnaire:start': {
              logger.info('WebSocket questionnaire start', { type: data.questionnaireType });

              ws.send(JSON.stringify({
                type: 'questionnaire:started',
                questionnaireType: data.questionnaireType,
              }));
              break;
            }

            case 'questionnaire:answer': {
              logger.info('WebSocket questionnaire answer', {
                sessionId: data.sessionId,
                questionId: data.questionId,
              });

              ws.send(JSON.stringify({
                type: 'questionnaire:next',
                sessionId: data.sessionId,
              }));
              break;
            }

            default: {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Unknown message type',
              }));
            }
          }
        } catch (error: any) {
          logger.error('Generator WebSocket error', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Processing failed',
            message: error.message,
          }));
        }
      },

      close(ws) {
        clients.delete(ws);
        logger.info('Generator WebSocket client disconnected', { clientCount: clients.size });
      },
    },

    fetch(req, server) {
      const url = new URL(req.url);

      // Health check for WebSocket server
      if (url.pathname === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'generator-service-websocket',
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

  logger.info(`Generator WebSocket server started on port ${port}`);
}
