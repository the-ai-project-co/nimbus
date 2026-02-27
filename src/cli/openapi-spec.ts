/**
 * OpenAPI 3.1 Specification for `nimbus serve`
 *
 * Returns a static OpenAPI document describing every endpoint exposed by
 * the headless API server. The spec is served at GET /api/openapi.json so
 * that consumers (Swagger UI, code generators, etc.) can discover the API
 * programmatically.
 *
 * @module cli/openapi-spec
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build and return the full OpenAPI 3.1 specification object.
 *
 * The return type is intentionally `Record<string, unknown>` rather than
 * a strongly-typed OpenAPI interface, because the spec is serialized to
 * JSON verbatim and consumed by external tooling, not by TypeScript code.
 */
export function getOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nimbus API',
      version: '0.2.0',
      description:
        'Headless HTTP API for the Nimbus AI Cloud Engineering Agent. ' +
        'Supports SSE streaming for real-time agent responses, session ' +
        'management, and non-interactive single-prompt execution.',
      license: {
        name: 'MIT',
      },
    },
    servers: [{ url: 'http://localhost:4200', description: 'Local development' }],
    paths: {
      // -----------------------------------------------------------------
      // Health
      // -----------------------------------------------------------------
      '/api/health': {
        get: {
          summary: 'Health check',
          operationId: 'getHealth',
          tags: ['System'],
          responses: {
            '200': {
              description: 'Server health status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['ok'] },
                      version: { type: 'string' },
                      uptime: { type: 'number', description: 'Seconds since server start' },
                      db: { type: 'boolean' },
                      llm: { type: 'boolean' },
                    },
                    required: ['status', 'version', 'uptime', 'db', 'llm'],
                  },
                },
              },
            },
          },
        },
      },

      // -----------------------------------------------------------------
      // Chat (SSE streaming)
      // -----------------------------------------------------------------
      '/api/chat': {
        post: {
          summary: 'Send a chat message (SSE streaming)',
          operationId: 'chat',
          tags: ['Chat'],
          description:
            'Sends a user message to the agent and returns an SSE stream. ' +
            'Events: session, text, tool_start, tool_end, done, error.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string', description: 'User message to send to the agent' },
                    sessionId: {
                      type: 'string',
                      description: 'Session ID to continue. Auto-generated if omitted.',
                    },
                    model: {
                      type: 'string',
                      description: 'Model alias or fully qualified model name',
                    },
                    mode: {
                      type: 'string',
                      enum: ['plan', 'build', 'deploy'],
                      default: 'build',
                      description: 'Agent mode controlling available tools',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'SSE stream of agent responses',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description: 'Server-Sent Events stream',
                  },
                },
              },
            },
          },
        },
      },

      // -----------------------------------------------------------------
      // Run (non-interactive)
      // -----------------------------------------------------------------
      '/api/run': {
        post: {
          summary: 'Non-interactive single prompt execution',
          operationId: 'run',
          tags: ['Chat'],
          description:
            'Executes a single prompt through the agent loop and returns ' +
            'the complete result as JSON. Blocks until the agent finishes.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['prompt'],
                  properties: {
                    prompt: { type: 'string', description: 'Prompt to execute' },
                    model: { type: 'string', description: 'Model alias or full name' },
                    mode: {
                      type: 'string',
                      enum: ['plan', 'build', 'deploy'],
                      default: 'build',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Complete agent response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string' },
                      response: { type: 'string', description: 'Final assistant message content' },
                      turns: { type: 'integer', description: 'Number of LLM turns taken' },
                      usage: { $ref: '#/components/schemas/Usage' },
                      cost: { type: 'number', description: 'Total estimated cost in USD' },
                    },
                    required: ['sessionId', 'response', 'turns', 'usage', 'cost'],
                  },
                },
              },
            },
            '500': {
              description: 'Agent execution error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },

      // -----------------------------------------------------------------
      // Sessions list
      // -----------------------------------------------------------------
      '/api/sessions': {
        get: {
          summary: 'List all sessions',
          operationId: 'listSessions',
          tags: ['Sessions'],
          responses: {
            '200': {
              description: 'Array of session records',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      sessions: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Session' },
                      },
                    },
                    required: ['sessions'],
                  },
                },
              },
            },
          },
        },
      },

      // -----------------------------------------------------------------
      // Session by ID (GET + POST)
      // -----------------------------------------------------------------
      '/api/session/{id}': {
        get: {
          summary: 'Get session details and conversation messages',
          operationId: 'getSession',
          tags: ['Sessions'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Session UUID',
            },
          ],
          responses: {
            '200': {
              description: 'Session details with conversation history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      session: { $ref: '#/components/schemas/Session' },
                      messages: {
                        type: 'array',
                        items: { type: 'object' },
                        description: 'LLM message history',
                      },
                    },
                    required: ['session', 'messages'],
                  },
                },
              },
            },
            '404': {
              description: 'Session not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          summary: 'Continue an existing session (SSE streaming)',
          operationId: 'continueSession',
          tags: ['Sessions'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Session UUID',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string', description: 'Follow-up message' },
                    model: { type: 'string', description: 'Model override for this turn' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'SSE stream of agent responses',
              content: { 'text/event-stream': {} },
            },
            '404': {
              description: 'Session not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
    },

    // -------------------------------------------------------------------
    // Shared Components
    // -------------------------------------------------------------------
    components: {
      schemas: {
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['active', 'suspended', 'completed'] },
            mode: { type: 'string', enum: ['plan', 'build', 'deploy'] },
            model: { type: 'string' },
            tokenCount: { type: 'integer' },
            costUSD: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'status', 'mode'],
        },
        Usage: {
          type: 'object',
          properties: {
            promptTokens: { type: 'integer' },
            completionTokens: { type: 'integer' },
            totalTokens: { type: 'integer' },
          },
          required: ['promptTokens', 'completionTokens', 'totalTokens'],
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Human-readable error message' },
          },
          required: ['error'],
        },
      },
      securitySchemes: {
        basicAuth: {
          type: 'http',
          scheme: 'basic',
          description: 'Optional HTTP Basic Auth. Enable with --auth user:pass.',
        },
      },
    },
  };
}
