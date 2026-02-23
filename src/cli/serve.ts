/**
 * nimbus serve -- Headless HTTP API Server
 *
 * Exposes the Nimbus agent loop as a REST + SSE API designed for
 * consumption by the Web UI, IDE extensions, and third-party integrations.
 *
 * Endpoints:
 *   POST /api/chat          -- Send a message, receive SSE streaming response
 *   POST /api/run           -- Non-interactive single prompt (JSON response)
 *   GET  /api/sessions      -- List all sessions
 *   GET  /api/session/:id   -- Session details + conversation messages
 *   POST /api/session/:id   -- Continue an existing session (SSE streaming)
 *   GET  /api/health        -- Health check
 *   GET  /api/openapi.json  -- OpenAPI 3.1 specification
 *
 * Usage:
 *   nimbus serve                        # localhost:4200
 *   nimbus serve --port 8080            # custom port
 *   nimbus serve --host 0.0.0.0        # bind to all interfaces
 *   nimbus serve --auth admin:secret   # enable HTTP Basic Auth
 *
 * @module cli/serve
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { initApp } from '../app';
import { runAgentLoop } from '../agent/loop';
import { defaultToolRegistry } from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools } from '../tools/schemas/devops';
import { SessionManager } from '../sessions/manager';
import { saveConversation, getConversation } from '../state/conversations';
import { shareSession, getSharedSession, listShares } from '../sharing/sync';
import { ContextManager } from '../agent/context-manager';
import { getOpenAPISpec } from './openapi-spec';
import { createAuthMiddleware } from './serve-auth';
import type { LLMMessage } from '../llm/types';
import type { ToolCallInfo } from '../agent/loop';
import type { ToolResult } from '../tools/schemas/types';
import type { AgentMode } from '../agent/system-prompt';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Options for the `nimbus serve` command. */
export interface ServeOptions {
  /** Port to listen on (default: 4200). */
  port?: number;
  /** Hostname to bind to (default: 'localhost'). */
  host?: string;
  /** HTTP Basic Auth credentials in "user:pass" format. */
  auth?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the default tool registry is populated.
 * Idempotent -- skips tools that are already registered.
 */
function ensureToolsRegistered(): void {
  if (defaultToolRegistry.size > 0) return;
  for (const tool of [...standardTools, ...devopsTools]) {
    try {
      defaultToolRegistry.register(tool);
    } catch {
      // Already registered -- skip.
    }
  }
}

/**
 * Validate and narrow a mode string to the AgentMode union.
 */
function parseMode(mode: string | undefined): AgentMode {
  if (mode === 'plan' || mode === 'build' || mode === 'deploy') {
    return mode;
  }
  return 'build';
}

/**
 * Create an SSE-formatted ReadableStream that runs the agent loop and
 * emits events for text, tool calls, completion, and errors.
 *
 * SSE event types:
 *   session    -- { id, mode }
 *   text       -- { content }
 *   tool_start -- { id, name, input? }
 *   tool_end   -- { id, name, output?, isError }
 *   done       -- { turns, usage, cost }
 *   error      -- { message }
 */
function createAgentSSEStream(
  userMessage: string,
  history: LLMMessage[],
  sessionId: string,
  mode: AgentMode,
  model: string | undefined,
  router: any,
  contextManager: ContextManager,
  sessionManager: SessionManager,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown): void => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        send('session', { id: sessionId, mode });

        const result = await runAgentLoop(userMessage, history, {
          router,
          toolRegistry: defaultToolRegistry,
          mode,
          model,
          sessionId,
          onText: (text: string) => {
            send('text', { content: text });
          },
          onToolCallStart: (toolCall: ToolCallInfo) => {
            send('tool_start', {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            });
          },
          onToolCallEnd: (toolCall: ToolCallInfo, toolResult: ToolResult) => {
            send('tool_end', {
              id: toolCall.id,
              name: toolCall.name,
              output: typeof toolResult.output === 'string'
                ? toolResult.output.slice(0, 5000)
                : toolResult.output,
              isError: toolResult.isError,
            });
          },
        });

        // Persist conversation
        saveConversation(
          sessionId,
          userMessage.slice(0, 100),
          result.messages,
          model,
        );

        // Update session stats
        sessionManager.updateSession(sessionId, {
          tokenCount: result.usage.totalTokens,
          costUSD: result.totalCost,
        });

        send('done', {
          turns: result.turns,
          usage: result.usage,
          cost: result.totalCost,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        send('error', { message: msg });
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Wrap a ReadableStream as an SSE Response with proper headers.
 */
function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// Main Command
// ---------------------------------------------------------------------------

/**
 * Start the Nimbus headless API server.
 *
 * Initializes the app context (DB + LLM router), registers tools, sets up
 * all API routes via Elysia, and starts listening.
 */
export async function serveCommand(options: ServeOptions): Promise<void> {
  const port = options.port ?? 4200;
  const host = options.host ?? 'localhost';

  // ------------------------------------------------------------------
  // Initialize core systems
  // ------------------------------------------------------------------

  const { router } = await initApp();
  const sessionManager = SessionManager.getInstance();
  const contextManager = new ContextManager();

  ensureToolsRegistered();

  // ------------------------------------------------------------------
  // Build Elysia app
  // ------------------------------------------------------------------

  const app = new Elysia()
    .use(
      cors({
        origin: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      }),
    );

  // Optional HTTP Basic Auth
  if (options.auth) {
    const colonIdx = options.auth.indexOf(':');
    if (colonIdx > 0) {
      const user = options.auth.slice(0, colonIdx);
      const pass = options.auth.slice(colonIdx + 1);
      app.onBeforeHandle(createAuthMiddleware({ username: user, password: pass }));
    }
  }

  // ------------------------------------------------------------------
  // GET /api/health
  // ------------------------------------------------------------------

  app.get('/api/health', () => ({
    status: 'ok' as const,
    version: '0.2.0',
    uptime: process.uptime(),
    db: true,
    llm: true,
  }));

  // ------------------------------------------------------------------
  // GET /api/openapi.json
  // ------------------------------------------------------------------

  app.get('/api/openapi.json', () => getOpenAPISpec());

  // ------------------------------------------------------------------
  // GET /api/sessions
  // ------------------------------------------------------------------

  app.get('/api/sessions', () => ({
    sessions: sessionManager.list(),
  }));

  // ------------------------------------------------------------------
  // GET /api/session/:id
  // ------------------------------------------------------------------

  app.get('/api/session/:id', ({ params }: { params: { id: string } }) => {
    const session = sessionManager.get(params.id);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const conversation = getConversation(params.id);
    return {
      session,
      messages: conversation?.messages ?? [],
    };
  });

  // ------------------------------------------------------------------
  // POST /api/chat -- SSE streaming chat
  // ------------------------------------------------------------------

  app.post('/api/chat', async ({ body }: {
    body: { message: string; sessionId?: string; model?: string; mode?: string };
  }) => {
    const mode = parseMode(body.mode);

    // Get or create session
    let sessionId = body.sessionId;
    let session = sessionId ? sessionManager.get(sessionId) : null;

    if (!session) {
      session = sessionManager.create({
        name: `API Session ${new Date().toISOString().slice(0, 16)}`,
        mode,
        model: body.model,
      });
      sessionId = session.id;
    }

    // Load existing conversation history
    const existing = getConversation(sessionId!);
    const history: LLMMessage[] = existing?.messages ?? [];

    const stream = createAgentSSEStream(
      body.message,
      history,
      sessionId!,
      mode,
      body.model,
      router,
      contextManager,
      sessionManager,
    );

    return sseResponse(stream);
  });

  // ------------------------------------------------------------------
  // POST /api/run -- Non-interactive single prompt
  // ------------------------------------------------------------------

  app.post('/api/run', async ({ body }: {
    body: { prompt: string; model?: string; mode?: string };
  }) => {
    const mode = parseMode(body.mode);

    const session = sessionManager.create({
      name: `Run: ${body.prompt.slice(0, 50)}`,
      mode,
      model: body.model,
    });

    try {
      const result = await runAgentLoop(body.prompt, [], {
        router,
        toolRegistry: defaultToolRegistry,
        mode,
        model: body.model,
      });

      // Persist conversation and mark session complete
      saveConversation(
        session.id,
        body.prompt.slice(0, 100),
        result.messages,
        body.model,
      );
      sessionManager.complete(session.id);

      // Extract final assistant message
      const lastAssistant = [...result.messages]
        .reverse()
        .find((m) => m.role === 'assistant');

      return {
        sessionId: session.id,
        response: lastAssistant?.content ?? '',
        turns: result.turns,
        usage: result.usage,
        cost: result.totalCost,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      sessionManager.complete(session.id);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  });

  // ------------------------------------------------------------------
  // POST /api/session/:id -- Continue existing session (SSE)
  // ------------------------------------------------------------------

  app.post('/api/session/:id', async ({ params, body }: {
    params: { id: string };
    body: { message: string; model?: string };
  }) => {
    const session = sessionManager.get(params.id);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const existing = getConversation(params.id);
    const history: LLMMessage[] = existing?.messages ?? [];
    const mode = parseMode(session.mode);

    const stream = createAgentSSEStream(
      body.message,
      history,
      params.id,
      mode,
      body.model ?? session.model,
      router,
      contextManager,
      sessionManager,
    );

    return sseResponse(stream);
  });

  // ------------------------------------------------------------------
  // POST /api/share -- Share a session
  // ------------------------------------------------------------------

  app.post('/api/share', ({ body }: {
    body: { sessionId: string; isLive?: boolean; ttlDays?: number };
  }) => {
    const shared = shareSession(body.sessionId, {
      isLive: body.isLive,
      ttlDays: body.ttlDays,
    });

    if (!shared) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return {
      shareId: shared.id,
      url: `http://${host}:${port}/nimbus/share/${shared.id}`,
      expiresAt: shared.expiresAt,
      isLive: shared.isLive,
    };
  });

  // ------------------------------------------------------------------
  // GET /api/share/:id -- Get shared session
  // ------------------------------------------------------------------

  app.get('/api/share/:id', ({ params }: { params: { id: string } }) => {
    const shared = getSharedSession(params.id);
    if (!shared) {
      return new Response(
        JSON.stringify({ error: 'Shared session not found or expired' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return shared;
  });

  // ------------------------------------------------------------------
  // GET /api/shares -- List all shares
  // ------------------------------------------------------------------

  app.get('/api/shares', () => ({
    shares: listShares(),
  }));

  // ------------------------------------------------------------------
  // Start listening
  // ------------------------------------------------------------------

  app.listen({ port, hostname: host });

  console.log(`
  Nimbus API Server
  ─────────────────────────────
  Local:   http://${host}:${port}
  Health:  http://${host}:${port}/api/health
  OpenAPI: http://${host}:${port}/api/openapi.json
  ${options.auth ? '  Auth:    HTTP Basic Auth enabled' : '  Auth:    None (use --auth user:pass to enable)'}

  Press Ctrl+C to stop.
  `);
}
