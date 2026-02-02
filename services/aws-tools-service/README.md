# AWS Tools Service

AWS infrastructure discovery and Terraform code generation service for the Nimbus platform.

## Overview

The AWS Tools Service provides automated discovery of AWS infrastructure resources and generates Terraform configurations for infrastructure-as-code adoption. It supports:

- **Infrastructure Discovery**: Scan AWS accounts to discover resources across multiple regions and services
- **Terraform Generation**: Convert discovered resources into production-ready Terraform configurations
- **Import Management**: Generate import blocks and scripts to bring existing resources under Terraform control
- **Real-time Progress**: WebSocket support for streaming discovery progress updates

## Quick Start

### Starting the Service

```bash
# Development
bun run dev

# Production
bun run start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3009` | HTTP server port |
| `WS_PORT` | `3010` | WebSocket server port |
| `ENABLE_WS` | `false` | Enable WebSocket server |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## Architecture

```
src/
├── server.ts              # HTTP/WS server setup
├── routes.ts              # API route handlers
├── websocket.ts           # WebSocket handlers
├── aws/                   # AWS SDK wrappers
│   ├── ec2.ts
│   ├── s3.ts
│   ├── iam.ts
│   └── ...
├── discovery/             # Infrastructure discovery
│   ├── scanner.ts         # Main scanner orchestration
│   ├── credentials.ts     # AWS credential management
│   ├── regions.ts         # Region management
│   ├── rate-limiter.ts    # API rate limiting
│   ├── types.ts           # Type definitions
│   └── scanners/          # Service-specific scanners
│       ├── base.ts
│       ├── ec2.ts
│       ├── s3.ts
│       └── ...
└── terraform/             # Terraform generation
    ├── generator.ts       # Main generator
    ├── formatter.ts       # HCL formatting
    ├── types.ts           # Type definitions
    └── mappers/           # Resource type mappers
        ├── base.ts
        ├── ec2.ts
        ├── s3.ts
        └── ...
```

## Supported Services

### Discovery

| Service | Resources Discovered |
|---------|---------------------|
| EC2 | Instances, Volumes, AMIs, Security Groups, Key Pairs |
| VPC | VPCs, Subnets, Route Tables, Internet Gateways, NAT Gateways, Network ACLs |
| S3 | Buckets, Bucket Policies |
| RDS | DB Instances, DB Clusters, Subnet Groups, Parameter Groups |
| Lambda | Functions, Layers, Event Source Mappings |
| IAM | Roles, Policies, Users, Groups, Instance Profiles |
| ECS | Clusters, Services, Task Definitions |
| EKS | Clusters, Node Groups |
| DynamoDB | Tables, Global Tables |
| CloudFront | Distributions, Origin Access Identities |

### Terraform Mapping

All discovered resources are mapped to their Terraform equivalents with:
- Resource blocks with all relevant attributes
- Import blocks for Terraform 1.5+
- Import shell scripts for older versions
- Provider configuration
- Variables for sensitive values

## API Reference

### Health Check

```http
GET /health
```

Returns service health status.

### Profile Management

#### List Profiles

```http
GET /api/aws/profiles
```

Lists available AWS profiles from credentials and config files.

**Response:**
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "name": "default",
        "source": "credentials",
        "region": "us-east-1",
        "isSSO": false
      }
    ]
  }
}
```

#### Validate Profile

```http
POST /api/aws/profiles/validate
Content-Type: application/json

{
  "profile": "default"
}
```

Validates AWS credentials for a profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "accountId": "123456789012",
    "accountAlias": "my-account"
  }
}
```

### Region Management

#### List Regions

```http
GET /api/aws/regions
GET /api/aws/regions?grouped=true
```

Lists AWS regions, optionally grouped by geographic area.

#### Validate Regions

```http
POST /api/aws/regions/validate
Content-Type: application/json

{
  "regions": ["us-east-1", "us-west-2", "invalid-region"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": ["us-east-1", "us-west-2"],
    "invalid": ["invalid-region"]
  }
}
```

### Infrastructure Discovery

#### Start Discovery

```http
POST /api/aws/discover
Content-Type: application/json

{
  "profile": "default",
  "regions": ["us-east-1", "us-west-2"],
  "services": ["EC2", "S3", "Lambda"],
  "excludeServices": ["IAM"]
}
```

Starts an asynchronous infrastructure discovery scan.

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "disc-abc123",
    "status": "running"
  }
}
```

#### Get Discovery Status

```http
GET /api/aws/discover/:sessionId
```

Gets the current status and progress of a discovery session.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "running",
    "progress": {
      "regionsScanned": 1,
      "totalRegions": 2,
      "servicesScanned": 5,
      "totalServices": 10,
      "resourcesFound": 42,
      "currentRegion": "us-east-1",
      "currentService": "EC2",
      "errors": []
    }
  }
}
```

#### Cancel Discovery

```http
POST /api/aws/discover/:sessionId/cancel
```

Cancels an ongoing discovery session.

### Terraform Generation

#### Get Supported Types

```http
GET /api/aws/terraform/supported-types
```

Lists all supported AWS resource types for Terraform generation.

#### Generate from Discovery Session

```http
POST /api/aws/terraform/generate
Content-Type: application/json

{
  "sessionId": "disc-abc123",
  "options": {
    "organizeByService": true,
    "generateImportBlocks": true,
    "terraformVersion": "1.5.0"
  }
}
```

Generates Terraform from a completed discovery session.

#### Generate Directly

```http
POST /api/aws/terraform/generate-direct
Content-Type: application/json

{
  "resources": [
    {
      "id": "i-1234567890abcdef0",
      "type": "AWS::EC2::Instance",
      "region": "us-east-1",
      "name": "web-server",
      "tags": { "Environment": "production" },
      "properties": {
        "imageId": "ami-12345678",
        "instanceType": "t3.micro"
      }
    }
  ],
  "options": {
    "organizeByService": true,
    "generateImportBlocks": true,
    "terraformVersion": "1.5.0"
  }
}
```

Generates Terraform directly from provided resources.

**Response:**
```json
{
  "success": true,
  "data": {
    "terraformSessionId": "tf-xyz789",
    "files": {
      "providers.tf": "...",
      "ec2.tf": "...",
      "variables.tf": "..."
    },
    "summary": {
      "totalResources": 1,
      "mappedResources": 1,
      "unmappedResources": 0,
      "filesGenerated": 3,
      "servicesIncluded": ["ec2"],
      "regionsIncluded": ["us-east-1"]
    },
    "imports": [...],
    "importScript": "#!/bin/bash\n..."
  }
}
```

#### List Generated Files

```http
GET /api/aws/terraform/:sessionId/files
```

#### Get Specific File

```http
GET /api/aws/terraform/:sessionId/file/:filename
```

#### Download All Files

```http
GET /api/aws/terraform/:sessionId/download
```

#### Get Import Script

```http
GET /api/aws/terraform/:sessionId/import-script
```

## WebSocket API

Connect to the WebSocket server for real-time discovery progress.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3010');
```

### Message Types

#### Subscribe to Session

```json
{
  "type": "subscribe",
  "sessionId": "disc-abc123"
}
```

#### Start Discovery

```json
{
  "type": "start_discovery",
  "profile": "default",
  "regions": ["us-east-1"],
  "services": ["EC2", "S3"]
}
```

#### Progress Updates

```json
{
  "type": "discovery_progress",
  "sessionId": "disc-abc123",
  "progress": {
    "status": "running",
    "regionsScanned": 1,
    "totalRegions": 2,
    "resourcesFound": 42
  }
}
```

#### Generate Terraform

```json
{
  "type": "generate_terraform",
  "sessionId": "disc-abc123",
  "options": { ... }
}
```

## CLI Integration

The service integrates with the Nimbus CLI:

```bash
# Interactive discovery
nimbus aws discover

# Non-interactive discovery
nimbus aws discover --profile prod --regions us-east-1,us-west-2 --non-interactive

# Generate Terraform
nimbus aws terraform --profile prod --output ./terraform

# Generate from existing session
nimbus aws terraform --session-id disc-abc123 --starter-kit
```

## Development

### Running Tests

```bash
# All tests
bun test

# Unit tests only
bun test tests/unit/aws-tools-service/

# Integration tests
bun test tests/integration/tools-services/aws-tools.integration.test.ts

# E2E tests
bun test tests/e2e/aws-terraform-workflow.e2e.test.ts

# With coverage
bun test --coverage
```

### Adding New Service Support

1. Create scanner in `src/discovery/scanners/`:
   ```typescript
   export class MyServiceScanner extends BaseScanner {
     protected serviceName = 'MyService';

     async scan(region: string): Promise<DiscoveredResource[]> {
       // Implementation
     }
   }
   ```

2. Register scanner in `src/discovery/scanners/index.ts`

3. Create mapper in `src/terraform/mappers/`:
   ```typescript
   export class MyResourceMapper extends BaseMapper {
     readonly awsType = 'AWS::MyService::Resource';
     readonly terraformType = 'aws_my_resource';

     protected mapProperties(resource: DiscoveredResource): TerraformResourceConfig {
       // Implementation
     }
   }
   ```

4. Register mapper in `src/terraform/mappers/index.ts`

5. Add tests for both scanner and mapper

## Rate Limiting

The service implements intelligent rate limiting for AWS API calls:

- Per-service rate limits based on AWS service quotas
- Automatic retry with exponential backoff
- Concurrent request limits per region
- Statistics tracking for monitoring

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error description",
  "details": { ... }
}
```

Common error codes:
- `400` - Bad request (validation error)
- `404` - Resource not found
- `500` - Internal server error

## Performance Considerations

- Discovery is parallelized across regions and services
- Resources are cached during generation sessions
- Large inventories are handled with streaming responses
- Rate limiting prevents API throttling

## Security

- Credentials are never stored; uses AWS SDK credential chain
- Sensitive values are replaced with variables in generated Terraform
- No AWS credentials are logged
- SSO profile support for enterprise environments
