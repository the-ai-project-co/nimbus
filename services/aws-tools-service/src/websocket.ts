/**
 * WebSocket Server for Real-time Discovery Progress
 *
 * Handles real-time streaming of infrastructure discovery progress
 * and Terraform generation updates
 */

import { logger } from '@nimbus/shared-utils';
import type { ServerWebSocket } from 'bun';
import {
  InfrastructureScanner,
  CredentialManager,
  RegionManager,
  type DiscoveryConfig,
} from './discovery';
import { createTerraformGenerator, type TerraformGeneratorConfig } from './terraform';

interface WebSocketData {
  sessionId?: string;
  subscriptions: Set<string>;
}

type AwsWebSocket = ServerWebSocket<WebSocketData>;

// Discovery singleton instances (shared with routes)
const credentialManager = new CredentialManager();
const regionManager = new RegionManager();
const infrastructureScanner = new InfrastructureScanner({
  credentialManager,
  regionManager,
});

// Client tracking
const clients = new Map<AwsWebSocket, WebSocketData>();
const sessionSubscribers = new Map<string, Set<AwsWebSocket>>();

/**
 * Send message to a specific client
 */
function sendToClient(ws: AwsWebSocket, message: object): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    logger.error('Failed to send WebSocket message', err);
  }
}

/**
 * Broadcast message to all subscribers of a session
 */
function broadcastToSession(sessionId: string, message: object): void {
  const subscribers = sessionSubscribers.get(sessionId);
  if (subscribers) {
    for (const ws of subscribers) {
      sendToClient(ws, message);
    }
  }
}

/**
 * Subscribe client to a session
 */
function subscribeToSession(ws: AwsWebSocket, sessionId: string): void {
  const data = clients.get(ws);
  if (data) {
    data.subscriptions.add(sessionId);
  }

  if (!sessionSubscribers.has(sessionId)) {
    sessionSubscribers.set(sessionId, new Set());
  }
  sessionSubscribers.get(sessionId)!.add(ws);

  logger.info('Client subscribed to session', { sessionId });
}

/**
 * Unsubscribe client from a session
 */
function unsubscribeFromSession(ws: AwsWebSocket, sessionId: string): void {
  const data = clients.get(ws);
  if (data) {
    data.subscriptions.delete(sessionId);
  }

  const subscribers = sessionSubscribers.get(sessionId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      sessionSubscribers.delete(sessionId);
    }
  }
}

/**
 * Unsubscribe client from all sessions
 */
function unsubscribeFromAll(ws: AwsWebSocket): void {
  const data = clients.get(ws);
  if (data) {
    for (const sessionId of data.subscriptions) {
      const subscribers = sessionSubscribers.get(sessionId);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          sessionSubscribers.delete(sessionId);
        }
      }
    }
    data.subscriptions.clear();
  }
}

/**
 * Handle discovery progress updates
 */
function handleProgressCallback(sessionId: string, progress: any): void {
  broadcastToSession(sessionId, {
    type: 'discovery_progress',
    sessionId,
    progress: {
      status: progress.status,
      regionsScanned: progress.regionsScanned,
      totalRegions: progress.totalRegions,
      servicesScanned: progress.servicesScanned,
      totalServices: progress.totalServices,
      resourcesFound: progress.resourcesFound,
      currentRegion: progress.currentRegion,
      currentService: progress.currentService,
      errors: progress.errors,
      updatedAt: progress.updatedAt,
    },
  });
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(ws: AwsWebSocket, message: string): Promise<void> {
  try {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'subscribe':
        // Subscribe to an existing discovery session
        if (data.sessionId) {
          subscribeToSession(ws, data.sessionId);
          sendToClient(ws, {
            type: 'subscribed',
            sessionId: data.sessionId,
          });
        } else {
          sendToClient(ws, {
            type: 'error',
            error: 'Missing sessionId for subscribe',
          });
        }
        break;

      case 'unsubscribe':
        // Unsubscribe from a session
        if (data.sessionId) {
          unsubscribeFromSession(ws, data.sessionId);
          sendToClient(ws, {
            type: 'unsubscribed',
            sessionId: data.sessionId,
          });
        }
        break;

      case 'start_discovery':
        // Start a new discovery and subscribe to it
        await handleStartDiscovery(ws, data);
        break;

      case 'cancel_discovery':
        // Cancel an ongoing discovery
        if (data.sessionId) {
          const cancelled = infrastructureScanner.cancelDiscovery(data.sessionId);
          sendToClient(ws, {
            type: 'discovery_cancelled',
            sessionId: data.sessionId,
            success: cancelled,
          });
        }
        break;

      case 'get_status':
        // Get current status of a session
        if (data.sessionId) {
          const session = infrastructureScanner.getSession(data.sessionId);
          if (session) {
            sendToClient(ws, {
              type: 'status',
              sessionId: data.sessionId,
              progress: session.progress,
              hasInventory: !!session.inventory,
            });
          } else {
            sendToClient(ws, {
              type: 'error',
              error: 'Session not found',
              sessionId: data.sessionId,
            });
          }
        }
        break;

      case 'generate_terraform':
        // Generate Terraform from a completed discovery session
        await handleGenerateTerraform(ws, data);
        break;

      case 'ping':
        sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        sendToClient(ws, {
          type: 'error',
          error: `Unknown message type: ${data.type}`,
        });
    }
  } catch (err: any) {
    logger.error('WebSocket message handling failed', err);
    sendToClient(ws, {
      type: 'error',
      error: err.message,
    });
  }
}

/**
 * Handle start discovery request
 */
async function handleStartDiscovery(ws: AwsWebSocket, data: any): Promise<void> {
  try {
    if (!data.regions) {
      sendToClient(ws, {
        type: 'error',
        error: 'Missing required field: regions',
      });
      return;
    }

    const config: DiscoveryConfig = {
      profile: data.profile,
      regions: {
        regions: data.regions,
        excludeRegions: data.excludeRegions,
      },
      services: data.services,
      excludeServices: data.excludeServices,
    };

    // Start discovery with progress callback
    const sessionId = await infrastructureScanner.startDiscovery(config, (progress) => {
      handleProgressCallback(sessionId, progress);

      // If discovery completed, send final inventory
      if (progress.status === 'completed') {
        const session = infrastructureScanner.getSession(sessionId);
        if (session?.inventory) {
          broadcastToSession(sessionId, {
            type: 'discovery_completed',
            sessionId,
            summary: {
              totalResources: session.inventory.resources.length,
              byType: session.inventory.summary.resourcesByType,
              byRegion: session.inventory.summary.resourcesByRegion,
              byService: session.inventory.summary.resourcesByService,
            },
          });
        }
      }

      // If discovery failed, send error
      if (progress.status === 'failed') {
        broadcastToSession(sessionId, {
          type: 'discovery_failed',
          sessionId,
          errors: progress.errors,
        });
      }
    });

    // Auto-subscribe the requesting client
    subscribeToSession(ws, sessionId);

    sendToClient(ws, {
      type: 'discovery_started',
      sessionId,
      message: 'Discovery started. You will receive progress updates.',
    });
  } catch (err: any) {
    logger.error('Start discovery failed', err);
    sendToClient(ws, {
      type: 'error',
      error: err.message,
    });
  }
}

/**
 * Handle Terraform generation request
 */
async function handleGenerateTerraform(ws: AwsWebSocket, data: any): Promise<void> {
  try {
    if (!data.sessionId) {
      sendToClient(ws, {
        type: 'error',
        error: 'Missing required field: sessionId',
      });
      return;
    }

    const session = infrastructureScanner.getSession(data.sessionId);
    if (!session) {
      sendToClient(ws, {
        type: 'error',
        error: 'Discovery session not found',
      });
      return;
    }

    if (session.progress.status !== 'completed') {
      sendToClient(ws, {
        type: 'error',
        error: `Discovery is not complete. Current status: ${session.progress.status}`,
      });
      return;
    }

    if (!session.inventory || session.inventory.resources.length === 0) {
      sendToClient(ws, {
        type: 'error',
        error: 'No resources found in discovery session',
      });
      return;
    }

    sendToClient(ws, {
      type: 'terraform_generating',
      sessionId: data.sessionId,
      message: 'Generating Terraform configuration...',
    });

    // Create config
    const config: TerraformGeneratorConfig = {
      outputDir: data.options?.outputDir || '/tmp/terraform',
      generateImportBlocks: data.options?.generateImportBlocks ?? true,
      generateImportScript: data.options?.generateImportScript ?? true,
      organizeByService: data.options?.organizeByService ?? true,
      terraformVersion: data.options?.terraformVersion || '1.5.0',
      awsProviderVersion: data.options?.awsProviderVersion || '~> 5.0',
      defaultRegion: session.inventory.resources[0]?.region || 'us-east-1',
    };

    // Generate
    const generator = createTerraformGenerator(config);
    const generatedFiles = generator.generate(session.inventory.resources);

    // Convert files Map to object
    const filesObject: Record<string, string> = {};
    for (const [filename, content] of generatedFiles.files) {
      filesObject[filename] = content;
    }

    sendToClient(ws, {
      type: 'terraform_completed',
      sessionId: data.sessionId,
      terraformSessionId: `tf-${data.sessionId}`,
      summary: generatedFiles.summary,
      files: filesObject,
      unmappedResources: generatedFiles.unmappedResources.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
      })),
      variables: generatedFiles.variables,
      outputs: generatedFiles.outputs,
      imports: generatedFiles.imports,
      importScript: generatedFiles.importScript,
    });
  } catch (err: any) {
    logger.error('Terraform generation failed', err);
    sendToClient(ws, {
      type: 'error',
      error: err.message,
    });
  }
}

/**
 * Create WebSocket server for AWS Tools Service
 */
export function createWebSocketServer(port: number) {
  const server = Bun.serve<WebSocketData>({
    port,
    websocket: {
      open(ws) {
        const data: WebSocketData = {
          subscriptions: new Set(),
        };
        clients.set(ws, data);
        logger.info('WebSocket client connected', { clientCount: clients.size });

        sendToClient(ws, {
          type: 'connected',
          message: 'Connected to AWS Tools Service WebSocket',
          clientId: Math.random().toString(36).substr(2, 9),
        });
      },

      async message(ws, message) {
        await handleMessage(ws, message.toString());
      },

      close(ws) {
        unsubscribeFromAll(ws);
        clients.delete(ws);
        logger.info('WebSocket client disconnected', { clientCount: clients.size });
      },
    },

    fetch(req, server) {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'aws-tools-service-websocket',
          timestamp: new Date().toISOString(),
          connectedClients: clients.size,
          activeSessions: sessionSubscribers.size,
        });
      }

      // Upgrade to WebSocket
      if (server.upgrade(req, { data: { subscriptions: new Set() } })) {
        return; // Connection upgraded
      }

      return new Response('WebSocket server - connect via WebSocket', { status: 426 });
    },
  });

  logger.info(`AWS Tools Service WebSocket server started on port ${port}`);
  return server;
}

/**
 * Get infrastructure scanner instance (for shared use with routes)
 */
export function getInfrastructureScanner(): InfrastructureScanner {
  return infrastructureScanner;
}

/**
 * Get credential manager instance (for shared use with routes)
 */
export function getCredentialManager(): CredentialManager {
  return credentialManager;
}

/**
 * Get region manager instance (for shared use with routes)
 */
export function getRegionManager(): RegionManager {
  return regionManager;
}
