# Core Engine Service

Intelligent agentic orchestration engine for the Nimbus platform.

## Overview

The Core Engine Service orchestrates the complete infrastructure generation workflow through an agentic architecture with planning, execution, verification, and safety management.

## Features

### 🤖 Agent Orchestrator
- Complete task lifecycle management
- Event-driven architecture
- Real-time progress tracking via WebSocket
- Task prioritization and queuing
- Comprehensive statistics and monitoring

### 📋 Intelligent Planner
- Multi-step plan generation
- Dependency analysis and ordering
- Risk assessment (security, cost, availability, compliance)
- Duration and cost estimation
- Plan optimization for parallel execution
- Circular dependency detection

### ⚡ Robust Executor
- Parallel step execution with dependency management
- Artifact generation and tracking
- Comprehensive execution logging
- Automatic rollback capabilities
- Integration with Generator Service

### ✓ Multi-Category Verifier
- **Security Checks**: Encryption, access controls, IAM policies
- **Compliance Checks**: Required tags, backups, audit logging
- **Functionality Checks**: Component health, connectivity
- **Performance Checks**: Execution duration, resource sizing
- **Cost Checks**: Budget compliance, cost optimization

### 🛡️ Safety Manager
- **Pre-Execution Checks**:
  - Production environment safeguards
  - Cost limit enforcement
  - Security best practices validation
  - Backup strategy verification
  - Destructive operation protection
- **During-Execution Monitoring**:
  - Resource creation rate monitoring
  - Execution timeout detection
- **Post-Execution Validation**:
  - Deployment verification
  - Cost anomaly detection
  - Security posture assessment

## API Endpoints

### Tasks
```
POST   /api/tasks                  # Create new task
POST   /api/tasks/:taskId/execute  # Execute task
GET    /api/tasks/:taskId          # Get task details
GET    /api/tasks                  # List tasks (with filters)
POST   /api/tasks/:taskId/cancel   # Cancel task
GET    /api/tasks/:taskId/events   # Get task events
```

### Plans
```
GET    /api/plans/:planId          # Get plan details
POST   /api/plans/generate         # Generate new plan
POST   /api/plans/:planId/validate # Validate plan
POST   /api/plans/:planId/optimize # Optimize plan
```

### Safety
```
POST   /api/safety/check           # Run safety checks
GET    /api/safety/checks          # List all safety checks
```

### Statistics
```
GET    /api/statistics             # Get orchestrator statistics
GET    /api/events                 # Get all events
```

## WebSocket API

Connect to `ws://localhost:3004` for real-time updates.

### Client Messages
```json
// Subscribe to task updates
{"type": "subscribe", "task_id": "task_123"}

// Unsubscribe from task updates
{"type": "unsubscribe", "task_id": "task_123"}

// Heartbeat
{"type": "ping"}
```

### Server Messages
```json
// Connection confirmation
{"type": "connected", "message": "Connected to Core Engine Service", "timestamp": 1234567890}

// Subscription confirmation
{"type": "subscribed", "task_id": "task_123"}

// Task event update
{"type": "task_event", "task_id": "task_123", "event": {...}}

// Heartbeat response
{"type": "pong", "timestamp": 1234567890}
```

## Installation

```bash
cd services/core-engine-service
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
PORT=3004                           # HTTP server port
WS_PORT=3104                        # WebSocket server port
GENERATOR_SERVICE_URL=http://localhost:3003
```

## Usage Examples

### Create and Execute Task
```bash
# Create task
curl -X POST http://localhost:3004/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "type": "generate",
    "user_id": "user-123",
    "priority": "high",
    "context": {
      "provider": "aws",
      "environment": "production",
      "region": "us-east-1",
      "components": ["vpc", "eks", "rds"],
      "requirements": {
        "vpc_cidr": "10.0.0.0/16",
        "eks_version": "1.28",
        "rds_engine": "postgres"
      }
    }
  }'

# Execute task
curl -X POST http://localhost:3004/api/tasks/task_123/execute
```

### Generate Plan
```bash
curl -X POST http://localhost:3004/api/plans/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "deploy",
    "context": {
      "provider": "aws",
      "environment": "production",
      "components": ["vpc", "eks"]
    }
  }'
```

### Run Safety Checks
```bash
curl -X POST http://localhost:3004/api/safety/check \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "task_123",
    "plan_id": "plan_456",
    "type": "pre_execution"
  }'
```

### List Tasks
```bash
# All tasks
curl http://localhost:3004/api/tasks

# Filter by user
curl http://localhost:3004/api/tasks?user_id=user-123

# Filter by status
curl http://localhost:3004/api/tasks?status=completed
```

## Architecture

```
core-engine-service/
├── src/
│   ├── components/              # Core components
│   │   ├── orchestrator.ts      # Main orchestrator
│   │   ├── planner.ts           # Plan generation
│   │   ├── executor.ts          # Plan execution
│   │   ├── verifier.ts          # Result verification
│   │   └── safety-manager.ts    # Safety checks
│   ├── clients/                 # Service clients
│   │   └── generator-client.ts  # Generator Service client
│   ├── types/                   # Type definitions
│   │   └── agent.ts             # Agent types
│   ├── routes.ts                # HTTP routes
│   ├── websocket.ts             # WebSocket server
│   ├── server.ts                # Elysia server
│   └── index.ts                 # Entry point
└── __tests__/                   # Unit tests
```

## Workflow

```
1. CREATE TASK
   └─> Task created with context

2. PLAN GENERATION
   ├─> Generate execution steps
   ├─> Analyze dependencies
   ├─> Assess risks
   └─> Estimate duration & cost

3. SAFETY CHECKS (Pre-Execution)
   ├─> Production safeguards
   ├─> Cost limits
   ├─> Security practices
   └─> Backup strategy

4. PLAN APPROVAL (if required)
   └─> Wait for user approval

5. EXECUTION
   ├─> Execute steps in order
   ├─> Handle dependencies
   ├─> Generate artifacts
   └─> Track progress

6. VERIFICATION
   ├─> Security checks
   ├─> Compliance checks
   ├─> Functionality tests
   ├─> Performance validation
   └─> Cost verification

7. SAFETY CHECKS (Post-Execution)
   ├─> Deployment verification
   ├─> Cost anomaly detection
   └─> Security posture

8. COMPLETION
   └─> Task marked complete with results
```

## Task States

- `pending`: Task created, awaiting execution
- `planning`: Generating execution plan
- `executing`: Running plan steps
- `verifying`: Verifying results
- `completed`: Successfully finished
- `failed`: Encountered error
- `cancelled`: Manually cancelled

## Risk Assessment

Plans are assessed for multiple risk categories:

- **Security**: Data exposure, access control issues
- **Cost**: High monthly expenses, unexpected charges
- **Availability**: Downtime risk, backup failures
- **Performance**: Resource constraints, scaling issues
- **Compliance**: Regulatory requirements, audit failures

Risk levels: `low` | `medium` | `high` | `critical`

## Safety Checks

### Pre-Execution (10 checks)
- Production environment safeguards
- Cost limit enforcement
- Security best practices validation
- Backup strategy verification
- Destructive operation protection

### During-Execution (2 checks)
- Resource creation rate monitoring
- Execution timeout detection

### Post-Execution (3 checks)
- Deployment verification
- Cost anomaly detection
- Security posture assessment

## Performance

- **Parallel Execution**: Independent steps run concurrently
- **Plan Optimization**: Automatic parallelization detection
- **Event Streaming**: Real-time WebSocket updates
- **Efficient Caching**: Component configurations cached
- **Resource Pooling**: Connection reuse across requests

## Error Handling

- **Automatic Rollback**: Failed steps trigger rollback
- **Retry Logic**: Transient failures automatically retried
- **Error Recovery**: Graceful degradation on partial failures
- **Detailed Logging**: Comprehensive error context captured

## Monitoring

- **Task Statistics**: Success rate, average duration, throughput
- **Event Stream**: Complete task lifecycle events
- **Resource Metrics**: Memory, CPU, network usage
- **Health Checks**: Service availability monitoring

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/orchestrator.test.ts

# Watch mode
bun test --watch
```

## Integration with Generator Service

The Core Engine integrates with the Generator Service for:
- Template rendering
- Best practices analysis
- Conversational processing
- Questionnaire management

## Contributing

1. Create feature branch from `main`
2. Write tests for new features
3. Ensure all tests pass (`bun test`)
4. Submit pull request with description

## License

MIT
