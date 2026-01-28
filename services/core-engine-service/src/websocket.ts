import { Elysia } from 'elysia';
import { logger } from '@nimbus/shared-utils';

interface WebSocketData {
  user_id?: string;
  subscribed_tasks: Set<string>;
}

/**
 * Setup WebSocket server for real-time updates
 * Uses Elysia's built-in WebSocket support (available since v1.2+)
 */
export function setupWebSocket(app: Elysia) {
  app.ws('/ws', {
    message(ws, message) {
        // Initialize data if needed
        const data = ws.data as any;
        if (!data.subscribed_tasks) {
          data.subscribed_tasks = new Set();
        }

        try {
          const msg = typeof message === 'string' ? JSON.parse(message) : message;

          switch (msg.type) {
            case 'subscribe':
              // Subscribe to task updates
              if (msg.task_id) {
                data.subscribed_tasks.add(msg.task_id);
                ws.send(
                  JSON.stringify({
                    type: 'subscribed',
                    task_id: msg.task_id,
                  })
                );
                logger.info(`Client subscribed to task: ${msg.task_id}`);
              }
              break;

            case 'unsubscribe':
              // Unsubscribe from task updates
              if (msg.task_id) {
                data.subscribed_tasks.delete(msg.task_id);
                ws.send(
                  JSON.stringify({
                    type: 'unsubscribed',
                    task_id: msg.task_id,
                  })
                );
                logger.info(`Client unsubscribed from task: ${msg.task_id}`);
              }
              break;

            case 'ping':
              // Heartbeat
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;

            default:
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: `Unknown message type: ${msg.type}`,
                })
              );
          }
        } catch (error) {
          logger.error('WebSocket message error', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
            })
          );
        }
      },

      open(ws) {
        // Initialize WebSocket data
        const data = ws.data as any;
        data.subscribed_tasks = new Set();

        ws.send(
          JSON.stringify({
            type: 'connected',
            message: 'Connected to Core Engine Service',
            timestamp: Date.now(),
          })
        );

        logger.info('WebSocket client connected');
      },

      close(ws) {
        // Clean up subscriptions
        const data = ws.data as any;
        if (data.subscribed_tasks) {
          data.subscribed_tasks.clear();
        }

        logger.info('WebSocket client disconnected');
      },
    });

  return app;
}

/**
 * Broadcast event to all subscribed clients
 * This would be called by the orchestrator when events occur
 */
export function broadcastTaskEvent(taskId: string, event: any) {
  // In production, this would iterate through connected WebSocket clients
  // and send the event to those subscribed to this task
  logger.debug(`Broadcasting event for task ${taskId}`, event);
}
