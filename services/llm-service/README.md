# LLM Service

> Multi-provider LLM abstraction with routing, streaming, and tool calling support

## Overview

The LLM Service provides a unified interface to multiple LLM providers (Anthropic, OpenAI, Google, Ollama) with intelligent routing, cost optimization, and fallback support.

## Features

- **Multi-Provider Support**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama (Local)
- **Intelligent Routing**: Automatic provider selection based on model, task type, and cost
- **Streaming Support**: Real-time token streaming via WebSocket
- **Tool Calling**: Function calling support across providers
- **Cost Optimization**: Route to cheaper models for simple tasks
- **Fallback Logic**: Automatic retry with different providers on failure
- **Token Counting**: Accurate token counting for cost estimation

## Supported Providers

### Anthropic Claude
- **Models**: Claude Sonnet 4, Haiku 4, Opus 4
- **API Key**: `ANTHROPIC_API_KEY`
- **Default Model**: `claude-sonnet-4-20250514`

### OpenAI
- **Models**: GPT-4o, GPT-4o-mini, GPT-4-turbo
- **API Key**: `OPENAI_API_KEY`
- **Default Model**: `gpt-4o`

### Google Gemini
- **Models**: Gemini 2.0 Flash, Gemini 1.5 Pro
- **API Key**: `GOOGLE_API_KEY`
- **Default Model**: `gemini-2.0-flash-exp`

### Ollama (Local)
- **Models**: Llama 3.2, CodeLlama, Mistral, Mixtral
- **Configuration**: `OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- **Default Model**: `llama3.2`

## API Endpoints

### HTTP (Port 3002)

#### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "llm-service",
  "timestamp": "2026-01-27T18:00:00.000Z",
  "uptime": 100.5
}
```

#### Chat Completion
```bash
POST /api/llm/chat
```

Request:
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Hello!" }
  ],
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 1000,
  "taskType": "simple_queries"
}
```

Response:
```json
{
  "content": "Hello! How can I help you today?",
  "usage": {
    "promptTokens": 15,
    "completionTokens": 10,
    "totalTokens": 25
  },
  "model": "claude-sonnet-4-20250514",
  "finishReason": "stop"
}
```

#### Chat with Tool Calling
```bash
POST /api/llm/chat/tools
```

Request:
```json
{
  "messages": [
    { "role": "user", "content": "What's the weather in SF?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": { "type": "string" }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "toolChoice": "auto"
}
```

Response:
```json
{
  "content": "",
  "toolCalls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"San Francisco\"}"
      }
    }
  ],
  "usage": { ... },
  "model": "claude-sonnet-4-20250514",
  "finishReason": "tool_calls"
}
```

#### List Models
```bash
GET /api/llm/models
```

Response:
```json
{
  "models": {
    "anthropic": ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"],
    "openai": ["gpt-4o", "gpt-4o-mini"],
    "google": ["gemini-2.0-flash-exp", "gemini-1.5-pro"],
    "ollama": ["llama3.2", "codellama", "mistral"]
  },
  "providers": ["anthropic", "openai", "google", "ollama"]
}
```

#### Count Tokens
```bash
POST /api/llm/tokens/count
```

Request:
```json
{
  "text": "Hello, world!",
  "model": "gpt-4o"
}
```

Response:
```json
{
  "tokenCount": 4,
  "textLength": 13,
  "model": "gpt-4o"
}
```

### WebSocket (Port 3102)

#### Streaming Chat

Connect to `ws://localhost:3102` and send:
```json
{
  "messages": [
    { "role": "user", "content": "Tell me a story" }
  ],
  "model": "claude-sonnet-4-20250514"
}
```

Receive streaming chunks:
```json
{ "type": "content", "content": "Once", "done": false }
{ "type": "content", "content": " upon", "done": false }
{ "type": "content", "content": " a", "done": false }
{ "type": "done", "done": true, "tokenCount": 100 }
```

## Configuration

### Environment Variables

```bash
# Service Ports
PORT=3002
WS_PORT=3102
LOG_LEVEL=info

# LLM Provider API Keys
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434

# Router Configuration
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-20250514
ENABLE_COST_OPTIMIZATION=true
ENABLE_FALLBACK=true
FALLBACK_PROVIDERS=anthropic,openai,google
```

### Router Behavior

**Cost Optimization**
- When enabled, routes simple tasks to cheaper models (Ollama > Haiku > GPT-4o-mini)
- Routes complex tasks to capable models (Opus > GPT-4o > Gemini Pro)
- Task types:
  - **Cheap**: `simple_queries`, `summarization`, `classification`
  - **Expensive**: `code_generation`, `complex_reasoning`, `planning`

### Fallback Support

- Automatically retries failed requests with alternative providers
- Provider order: Primary → Fallback providers
- Example: Anthropic fails → OpenAI → Google

## Development

### Install Dependencies

```bash
bun install
```

### Run Service
```bash
bun run src/index.ts
```

### Run Tests
```bash
bun test
```

### Type Check
```bash
bun run type-check
```

## Architecture

```text
┌────────────────────────────────────────┐
│          LLM Service                    │
├────────────────────────────────────────┤
│                                        │
│  HTTP Server (3002)    WS Server (3102)│
│  ┌──────────┐         ┌──────────┐     │
│  │ Routes   │         │ Streaming│     │
│  │  /chat   │         │ Handler  │     │
│  │  /models │         └────┬─────┘     │
│  │  /tokens │              │           │
│  └────┬─────┘              │           │
│       │                    │           │
│       └────────┬───────────┘           │
│                │                       │
│         ┌──────▼─────┐                 │
│         │   Router   │                 │
│         │  Selection │                 │
│         │   Fallback │                 │
│         └──────┬─────┘                 │
│                │                       │
│     ┌──────────┼───────────┐          │
│     │          │           │          │
│  ┌──▼─┐   ┌───▼──┐   ┌───▼──┐        │
│  │ AI │   │ OpenAI│   │Google│        │
│  │Claude│ │  GPT  │   │Gemini│        │
│  └────┘   └──────┘   └──────┘        │
│                                        │
│         ┌────────┐                     │
│         │ Ollama │                     │
│         │ Local  │                     │
│         └────────┘                     │
└────────────────────────────────────────┘
```

## Provider Implementation

Each provider implements the `LLMProvider` interface:

```typescript
interface LLMProvider {
  name: string;
  complete(request: CompletionRequest): Promise<LLMResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse>;
  countTokens(text: string): Promise<number>;
  getMaxTokens(model: string): number;
}
```

## Usage Examples

### Simple Chat
```typescript
const response = await fetch('http://localhost:3002/api/llm/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'What is TypeScript?' }
    ]
  })
});

const data = await response.json();
console.log(data.content);
```

### Streaming Chat
```typescript
const ws = new WebSocket('ws://localhost:3102');

ws.onopen = () => {
  ws.send(JSON.stringify({
    messages: [
      { role: 'user', content: 'Write a poem' }
    ]
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'content') {
    process.stdout.write(data.content);
  }
};
```

### Tool Calling
```typescript
const response = await fetch('http://localhost:3002/api/llm/chat/tools', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Generate Terraform for EC2' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'generate_terraform',
          description: 'Generate Terraform configuration',
          parameters: {
            type: 'object',
            properties: {
              resource: { type: 'string' },
              provider: { type: 'string' }
            },
            required: ['resource', 'provider']
          }
        }
      }
    ]
  })
});

const data = await response.json();
if (data.toolCalls) {
  console.log('Tool called:', data.toolCalls[0].function.name);
  console.log('Arguments:', data.toolCalls[0].function.arguments);
}
```

## Troubleshooting

### No providers available
- Ensure at least one API key is set in environment
- Ollama is always available even without API keys

### Provider fails
- Check API key validity
- Enable fallback support for automatic retry
- Check network connectivity

### WebSocket connection fails
- Ensure WS_PORT (3102) is not in use
- Check firewall settings

## Next Steps

After implementing the LLM Service, next tasks are:
1. Implement State Service API routes
2. Integrate LLM Service with Core Engine
3. Add conversation history tracking

---

**Status**: ✅ IMPLEMENTED
**Last Updated**: 2026-01-27
