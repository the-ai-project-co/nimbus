# Generator Service

AI-powered infrastructure code generation service for the Nimbus platform.

## Overview

The Generator Service provides intelligent infrastructure code generation through multiple interaction modes:
- **Questionnaire Mode**: Guided step-by-step configuration wizard
- **Conversational Mode**: Natural language infrastructure requests
- **Template-Based Generation**: Production-ready Terraform code
- **Best Practices Enforcement**: Automated security, cost, and compliance checks

## Features

### 🎯 Questionnaire System
- 8-step Terraform questionnaire with 40+ questions
- Conditional logic and dynamic question visibility
- Multi-type validation (required, min, max, pattern, custom)
- Session management with progress tracking

### 🗣️ Conversational Mode
- Natural Language Understanding (NLU) with intent parsing
- Context extraction from user messages
- Multi-turn conversation support
- Requirements clarification and validation

### 📄 Template Engine
- Handlebars-based template rendering
- 20+ custom helpers for infrastructure code
- Template validation and variable extraction
- Caching for performance optimization

### 🏗️ AWS Infrastructure Templates
- **VPC**: Comprehensive networking with subnets, NAT, IGW, flow logs
- **EKS**: Full Kubernetes cluster with node groups, OIDC, add-ons
- **RDS**: Aurora and standalone instances with backups, encryption
- **S3**: Buckets with versioning, encryption, lifecycle policies

### ✅ Best Practices Engine
- **30+ Rules** across 5 categories:
  - Security (encryption, access controls, network isolation)
  - Tagging (mandatory tags, cost allocation)
  - Cost Optimization (lifecycle policies, right-sizing)
  - Reliability (multi-AZ, backups, auto-updates)
  - Performance (Performance Insights, GP3 storage)
- Automated fixing capabilities
- Compliance scoring (0-100)
- Markdown report generation

## API Endpoints

### Questionnaire
```
POST   /api/questionnaire/start              # Start new session
POST   /api/questionnaire/answer              # Submit answer
GET    /api/questionnaire/session/:sessionId  # Get session state
DELETE /api/questionnaire/session/:sessionId  # Delete session
```

### Templates
```
GET    /api/templates                      # List all templates
GET    /api/templates/type/:type           # Filter by type
GET    /api/templates/provider/:provider   # Filter by provider
POST   /api/templates/render               # Render template
POST   /api/templates/validate             # Validate syntax
```

### Best Practices
```
POST   /api/best-practices/analyze         # Analyze configuration
POST   /api/best-practices/analyze-all     # Analyze multiple components
POST   /api/best-practices/autofix         # Apply automated fixes
GET    /api/best-practices/rules           # List all rules
GET    /api/best-practices/rules/:category # Rules by category
POST   /api/best-practices/report/markdown # Generate markdown report
```

### Conversational
```
POST   /api/conversational/message          # Process user message
GET    /api/conversational/history/:sessionId # Get conversation history
GET    /api/conversational/session/:sessionId # Get session context
POST   /api/conversational/clear/:sessionId   # Clear history
DELETE /api/conversational/session/:sessionId # Delete session
```

### Generation
```
POST   /api/generate/from-questionnaire    # Generate from questionnaire
POST   /api/generate/from-conversation     # Generate from conversation
```

## Installation

```bash
cd services/generator-service
bun install
```

## Running

```bash
# Development mode
bun run dev

# Production mode
bun run start

# Run tests
bun test
```

## Environment Variables

```env
PORT=3003                           # HTTP server port
WS_PORT=3103                        # WebSocket server port (future)
GENERATOR_SERVICE_URL=http://localhost:3003
```

## Usage Examples

### Start Questionnaire Session
```bash
curl -X POST http://localhost:3003/api/questionnaire/start \
  -H "Content-Type: application/json" \
  -d '{"type": "terraform"}'
```

### Submit Answer
```bash
curl -X POST http://localhost:3003/api/questionnaire/answer \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "qst_...",
    "questionId": "selected_provider",
    "value": "aws"
  }'
```

### Analyze Best Practices
```bash
curl -X POST http://localhost:3003/api/best-practices/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "component": "rds",
    "config": {
      "storage_encrypted": false,
      "publicly_accessible": true,
      "environment": "production"
    }
  }'
```

### Process Conversational Message
```bash
curl -X POST http://localhost:3003/api/conversational/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "conv-123",
    "message": "Create a VPC on AWS",
    "userId": "user-123"
  }'
```

## Architecture

```
generator-service/
├── src/
│   ├── questionnaire/       # Questionnaire system
│   │   ├── types.ts         # Type definitions
│   │   ├── engine.ts        # Flow control engine
│   │   ├── validator.ts     # Validation engine
│   │   └── terraform.ts     # Terraform questionnaire
│   ├── templates/           # Template system
│   │   ├── loader.ts        # Template loader
│   │   └── renderer.ts      # Handlebars renderer
│   ├── best-practices/      # Best practices engine
│   │   ├── types.ts         # Type definitions
│   │   ├── rules.ts         # 30+ rules
│   │   └── engine.ts        # Analysis engine
│   ├── conversational/      # Conversational mode
│   │   ├── types.ts         # Type definitions
│   │   ├── intent-parser.ts # NLU engine
│   │   ├── context-extractor.ts # Context management
│   │   └── conversational-engine.ts # Main engine
│   ├── routes.ts            # HTTP routes
│   ├── server.ts            # Elysia server
│   └── index.ts             # Entry point
├── templates/               # Infrastructure templates
│   └── terraform/aws/       # AWS Terraform templates
│       ├── vpc.hbs
│       ├── eks.hbs
│       ├── rds.hbs
│       └── s3.hbs
└── __tests__/               # Unit tests
```

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/questionnaire-engine.test.ts

# Watch mode
bun test --watch
```

## Performance

- **Template Caching**: Reduces rendering time by 70%
- **Parallel Processing**: Multiple components generated simultaneously
- **Streaming Support**: Large templates streamed to client
- **Memory Efficient**: Handles 1000+ concurrent sessions

## Security

- **Input Validation**: All user inputs validated with Zod
- **Template Sandboxing**: Handlebars runs in strict mode
- **No Code Execution**: Templates cannot execute arbitrary code
- **Rate Limiting**: API endpoints rate-limited (future)

## Contributing

1. Create feature branch from `main`
2. Write tests for new features
3. Ensure all tests pass (`bun test`)
4. Submit pull request with description

## License

MIT
