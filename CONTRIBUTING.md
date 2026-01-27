# Contributing to Nimbus

Thank you for your interest in contributing to Nimbus! This document provides guidelines and instructions for contributing.

## 🚀 Getting Started

### Prerequisites

- Bun v1.0+
- Git
- Node.js v18+ (for some tooling)

### Setup Development Environment

1. Fork and clone the repository
2. Run the setup script:

```bash
./scripts/dev-setup.sh
```

3. Create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
```

## 📁 Project Structure

```
nimbus/
├── services/              # Microservices
│   ├── cli-service/       # CLI interface
│   ├── core-engine-service/  # Agent orchestration
│   ├── llm-service/       # LLM abstraction
│   └── ...               # Other services
├── shared/               # Shared libraries
│   ├── types/           # TypeScript types
│   ├── utils/           # Utilities
│   └── clients/         # HTTP/WebSocket clients
├── scripts/             # Development scripts
├── tests/               # Integration tests
└── docs/                # Documentation
```

## 🔧 Development Workflow

### 1. Make Changes

- Follow the existing code style
- Write tests for new features
- Update documentation as needed

### 2. Test Your Changes

```bash
# Run tests
bun test

# Type check
bun run type-check

# Start services and verify
bun dev
./scripts/check-health.sh
```

### 3. Commit Guidelines

We follow conventional commits:

```bash
feat: add new feature
fix: bug fix
docs: documentation changes
test: add or update tests
refactor: code refactoring
chore: maintenance tasks
```

Examples:
```bash
git commit -m "feat: add Terraform validation to generator service"
git commit -m "fix: resolve WebSocket connection issue in LLM service"
git commit -m "docs: update CLI usage examples"
```

### 4. Submit a Pull Request

1. Push your branch to your fork
2. Create a pull request to the `develop` branch
3. Fill out the PR template
4. Wait for review

## 📝 Code Style

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Export types from shared/types
- Use async/await over promises

### Naming Conventions

- **Files**: kebab-case (`terraform-generator.ts`)
- **Classes**: PascalCase (`TerraformGenerator`)
- **Functions**: camelCase (`generateTerraform`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_PORT`)
- **Interfaces**: PascalCase with `I` prefix optional (`Config` or `IConfig`)

### Project Conventions

- Use `logger` from shared/utils for logging
- Use shared error classes for errors
- Follow REST client patterns for service communication
- Add health endpoints to all services
- Write tests alongside features

## 🧪 Testing

### Unit Tests

Place tests in `tests/` directory within each package:

```typescript
// services/state-service/tests/storage.test.ts
import { describe, test, expect } from 'bun:test';
import { SQLiteAdapter } from '../src/storage/sqlite-adapter';

describe('SQLiteAdapter', () => {
  test('saves and retrieves operations', async () => {
    // test implementation
  });
});
```

### Integration Tests

Place in `tests/integration/`:

```typescript
// tests/integration/llm-core-engine.test.ts
import { describe, test, expect } from 'bun:test';

describe('LLM + Core Engine Integration', () => {
  test('chat flow works end-to-end', async () => {
    // test implementation
  });
});
```

### Running Tests

```bash
# All tests
bun test

# Specific service
cd services/state-service
bun test

# With coverage
bun test --coverage

# Watch mode
bun test --watch
```

## 📚 Documentation

- Update README.md for user-facing changes
- Update team specs in `releases/mvp/` for architectural changes
- Add JSDoc comments for public APIs
- Update API documentation in `docs/api/`

## 🏗️ Adding a New Service

1. Use the generator:

```bash
bun scripts/create-service.ts
```

2. Implement the service following the template
3. Add routes and handlers
4. Write tests
5. Update documentation

## 🐛 Reporting Bugs

1. Check existing issues first
2. Create a new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Bun version, etc.)
   - Logs if applicable

## ✨ Feature Requests

1. Check if it aligns with the MVP scope
2. Open an issue with:
   - Use case description
   - Proposed solution
   - Alternatives considered
   - Impact assessment

## 📋 Pull Request Process

1. Update tests
2. Update documentation
3. Ensure CI passes
4. Request review from maintainers
5. Address feedback
6. Squash commits if requested

## 🔍 Code Review Guidelines

### For Authors

- Keep PRs focused and small
- Provide context in description
- Respond to feedback promptly
- Test thoroughly before submitting

### For Reviewers

- Be respectful and constructive
- Focus on code quality and architecture
- Check tests and documentation
- Approve when ready, request changes when needed

## 🎯 Areas for Contribution

### High Priority

- [ ] LLM provider implementations
- [ ] Terraform generator templates
- [ ] CLI commands and UI components
- [ ] Test coverage improvements

### Medium Priority

- [ ] Documentation improvements
- [ ] Additional MCP tools
- [ ] Performance optimizations
- [ ] Error handling improvements

### Good First Issues

Look for issues labeled `good-first-issue` for beginner-friendly tasks.

## 📞 Getting Help

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and general discussion
- Documentation: Check docs/ first

## 🏆 Recognition

Contributors will be acknowledged in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to Nimbus! 🚀
