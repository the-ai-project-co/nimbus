# Contributing to Nimbus

Thank you for your interest in contributing to Nimbus! We welcome contributions from developers of all skill levels and backgrounds. This guide will help you get started.

## Ways to Contribute

### For Everyone
- **Star this repository** - Show your support and help others discover the project
- **Report bugs** - Help us identify and fix issues
- **Suggest features** - Share your ideas for improvements
- **Improve documentation** - Help others understand the project better
- **Spread the word** - Share the project on social media, blogs, or with colleagues

### For Developers
- **Fix bugs** - Contribute code fixes
- **Add features** - Implement new functionality
- **Add cloud provider support** - Help expand AWS coverage or add GCP/Azure
- **Write tests** - Improve code quality and reliability
- **Improve tooling** - Enhance the development experience

### For Technical Writers
- **Write guides** - Create tutorials and how-to guides
- **API documentation** - Document functions and interfaces
- **Create examples** - Build sample configurations and use cases

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Git
- Node.js v20+ (for some tooling)
- AWS credentials (for testing AWS features)

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/nimbus.git
cd nimbus

# Add upstream remote
git remote add upstream https://github.com/the-ai-project-co/nimbus.git
```

### 2. Set up Development Environment

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests to verify setup
bun test

# Start development servers
bun dev

# Check health of all services
./scripts/check-health.sh
```

### 3. Create a Feature Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

## Project Structure

```
nimbus/
├── services/                    # Microservices
│   ├── aws-tools-service/       # AWS infrastructure discovery & operations
│   ├── cli-service/             # CLI interface and commands
│   ├── core-engine-service/     # Agent orchestration engine
│   ├── fs-tools-service/        # File system operations
│   ├── git-tools-service/       # Git operations
│   ├── helm-tools-service/      # Helm chart operations
│   ├── k8s-tools-service/       # Kubernetes operations
│   ├── llm-service/             # LLM provider abstraction
│   └── terraform-tools-service/ # Terraform operations
├── shared/                      # Shared libraries
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Common utilities and logger
│   └── clients/                 # HTTP/WebSocket clients
├── tests/                       # Test suites
│   ├── unit/                    # Unit tests by service
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
├── scripts/                     # Development and build scripts
└── docs/                        # Documentation
```

## Development Workflow

### Development Commands

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run all tests
bun test

# Run tests for specific service
bun test --filter aws-tools

# Run tests with coverage
bun test --coverage

# Type checking
bun run typecheck

# Linting
bun run lint

# Format code
bun run format

# Start all services in development mode
bun dev

# Start specific service
cd services/aws-tools-service && bun dev
```

### Working with Services

Each service follows a consistent structure:

```
services/example-service/
├── src/
│   ├── index.ts          # Main entry point
│   ├── server.ts         # Elysia server setup
│   ├── routes.ts         # API route definitions
│   └── [feature]/        # Feature-specific modules
├── tests/
│   └── *.test.ts         # Unit tests
├── package.json
└── tsconfig.json
```

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in tsconfig
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer `const` over `let`, avoid `var`
- Use async/await instead of raw Promises

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `terraform-generator.ts` |
| Classes | PascalCase | `TerraformGenerator` |
| Functions | camelCase | `generateTerraform` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_PORT` |
| Interfaces | PascalCase | `DiscoveryConfig` |
| Types | PascalCase | `ResourceType` |

### Example Code Style

```typescript
/**
 * Discovers AWS infrastructure resources in specified regions
 * @param config - Discovery configuration options
 * @returns Promise resolving to discovered resources
 */
export async function discoverInfrastructure(
  config: DiscoveryConfig
): Promise<DiscoveryResult> {
  const scanner = new InfrastructureScanner(config);

  try {
    const resources = await scanner.scan();
    return {
      success: true,
      resources,
      summary: generateSummary(resources),
    };
  } catch (error) {
    logger.error('Discovery failed', error);
    throw new DiscoveryError(`Failed to discover infrastructure: ${error.message}`);
  }
}
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(aws): add support for EKS node group discovery
fix(cli): resolve authentication error with SSO profiles
docs(readme): update installation instructions
test(terraform): add unit tests for HCL formatter
chore(deps): update dependencies to latest versions
refactor(scanner): improve error handling in base scanner
```

**Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `test`: Test additions or modifications
- `chore`: Maintenance tasks
- `refactor`: Code refactoring
- `perf`: Performance improvements

**Scopes (examples):**
- `aws`, `cli`, `terraform`, `k8s`, `helm`, `git`, `fs`
- `discovery`, `scanner`, `generator`, `formatter`
- `deps`, `ci`, `build`

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Run specific test file
bun test tests/unit/aws-tools-service/discovery/scanner.test.ts

# Run tests matching pattern
bun test --filter "TerraformGenerator"
```

### Writing Tests

- Write tests for all new features
- Maintain or improve test coverage
- Use descriptive test names
- Mock external dependencies (AWS API calls, etc.)
- Place unit tests in `tests/unit/[service-name]/`
- Place integration tests in `tests/integration/`

#### Example Test

```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { EC2Scanner } from '../src/discovery/scanners/ec2';

describe('EC2Scanner', () => {
  let scanner: EC2Scanner;

  beforeEach(() => {
    scanner = new EC2Scanner();
  });

  describe('scan', () => {
    test('should return discovered EC2 instances with properties', async () => {
      const mockInstances = [
        {
          InstanceId: 'i-1234567890abcdef0',
          InstanceType: 't3.micro',
          State: { Name: 'running' },
        },
      ];

      // Mock AWS SDK calls
      mock.module('@aws-sdk/client-ec2', () => ({
        EC2Client: class {
          send = () => Promise.resolve({ Reservations: [{ Instances: mockInstances }] });
        },
        DescribeInstancesCommand: class {},
      }));

      const result = await scanner.scan(mockContext);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].properties.instanceType).toBe('t3.micro');
    });
  });
});
```

## Adding New Features

### Adding a New AWS Scanner

1. Create the scanner file:

```typescript
// services/aws-tools-service/src/discovery/scanners/newservice.ts
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource } from '../types';

export class NewServiceScanner extends BaseScanner {
  readonly serviceName = 'NewService';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    // Implementation
  }

  getResourceTypes(): string[] {
    return ['AWS::NewService::Resource'];
  }
}
```

2. Register in the scanner index:

```typescript
// services/aws-tools-service/src/discovery/scanners/index.ts
import { NewServiceScanner } from './newservice';

export function createScannerRegistry(): ScannerRegistry {
  return new ScannerRegistry([
    // ... existing scanners
    new NewServiceScanner(),
  ]);
}
```

3. Add Terraform mapper:

```typescript
// services/aws-tools-service/src/terraform/mappers/newservice.ts
```

4. Add tests:

```typescript
// tests/unit/aws-tools-service/discovery/scanners/newservice.test.ts
```

### Adding a New Service

1. Create the service directory structure:

```bash
mkdir -p services/new-service/src
mkdir -p services/new-service/tests
```

2. Create package.json:

```json
{
  "name": "@nimbus/new-service",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "test": "bun test"
  },
  "dependencies": {
    "@nimbus/shared-utils": "workspace:*",
    "elysia": "^1.2.0"
  }
}
```

3. Implement the service following existing patterns
4. Add health endpoint at `/health`
5. Write tests
6. Update root package.json workspaces

## Pull Request Process

### Before Submitting

1. **Sync with upstream**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks**
   ```bash
   bun run lint
   bun run typecheck
   bun test
   ```

3. **Update documentation** if adding features

4. **Write/update tests** for your changes

### Submitting Your PR

1. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub

3. Fill out the PR template completely

4. Link related issues using `Fixes #123` or `Closes #123`

### PR Review Process

1. **Automated checks** run (tests, linting, type checking, CodeQL)
2. **CodeRabbit review** provides automated feedback
3. **Maintainer review** with constructive feedback
4. **Address feedback** and push updates
5. **Approval and merge** once everything looks good

## Good First Issues

Looking for a place to start? Look for issues labeled:
- `good first issue` - Perfect for newcomers
- `help wanted` - We'd love community help
- `documentation` - Great for non-code contributions

### Suggested First Contributions

- Fix typos in documentation
- Add examples to README
- Write tests for existing functions
- Improve error messages
- Add JSDoc comments to public APIs
- Add support for new AWS resource types

## Issue Guidelines

### Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:
- **Environment**: OS, Bun version, Node.js version
- **Affected service**: Which service is impacted
- **Steps to reproduce**: Detailed steps
- **Expected vs actual behavior**
- **Logs**: Relevant error messages or output

### Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml) and include:
- **Problem**: What problem does this solve?
- **Solution**: Describe your proposed solution
- **Alternatives**: Other approaches you've considered
- **Use cases**: How would this be used?

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions

### Communication

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: Questions, ideas, showcase
- **Pull Requests**: Code contributions

## Learning Resources

### Nimbus Stack

- [Bun Documentation](https://bun.sh/docs)
- [Elysia Documentation](https://elysiajs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### AWS & Infrastructure

- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs)
- [AWS CloudFormation Resource Types](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html)

### Testing

- [Bun Test Runner](https://bun.sh/docs/cli/test)

## Recognition

### Contributors

All contributors are recognized in:
- GitHub contributors page
- Release notes for significant contributions
- README mentions for major features

### Becoming a Maintainer

Regular contributors who demonstrate:
- Technical expertise
- Good communication skills
- Community helpfulness
- Consistent high-quality contributions

May be invited to join the maintainer team!

## Getting Help

Stuck? Need help? Reach out:

- **GitHub Discussions**: [Ask questions](https://github.com/the-ai-project-co/nimbus/discussions)
- **GitHub Issues**: [Report issues](https://github.com/the-ai-project-co/nimbus/issues)
- **Documentation**: Check the README and docs/ first

---

**Thank you for contributing to Nimbus!**

Every contribution, no matter how small, helps make Nimbus better for everyone. We're excited to see what you'll build!
