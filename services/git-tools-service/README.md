# Git Tools Service

Executes Git operations, providing HTTP endpoints for repository management, branching, commits, tags, and remote operations.

## Port

`PORT` (default: `3004`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/git/status` -- Repository status
- `POST /api/git/clone` -- Clone repository
- `POST /api/git/add` -- Stage files
- `POST /api/git/commit` -- Commit changes
- `POST /api/git/push` -- Push to remote
- `POST /api/git/pull` -- Pull from remote
- `POST /api/git/branch` -- Create branch
- `GET /api/git/branches` -- List branches
- `POST /api/git/checkout` -- Checkout branch
- `GET /api/git/diff` -- Get diff
- `GET /api/git/log` -- Commit log
- `POST /api/git/merge` -- Merge branch
- `GET /api/git/tags` -- List tags
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3004` |

## Running

```bash
cd services/git-tools-service
bun run dev
```

## Testing

```bash
bun test services/git-tools-service
```
