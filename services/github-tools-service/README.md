# GitHub Tools Service

Integrates with the GitHub API via Octokit, providing HTTP endpoints for pull requests, issues, repositories, GitHub Actions, and releases.

## Port

`PORT` (default: `3010`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/github/user` -- Authenticated user info
- `GET /api/github/prs` -- List pull requests
- `POST /api/github/prs` -- Create pull request
- `POST /api/github/prs/:number/merge` -- Merge PR
- `GET /api/github/issues` -- List issues
- `POST /api/github/issues` -- Create issue
- `GET /api/github/repos` -- Repository info
- `GET /api/github/repos/branches` -- List branches
- `GET /api/github/actions/workflows` -- List workflows
- `POST /api/github/actions/trigger` -- Trigger workflow
- `GET /api/github/releases` -- List releases
- `POST /api/github/releases` -- Create release
- `POST /api/github/releases/notes` -- Generate release notes
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3010` |
| `GITHUB_TOKEN` | GitHub personal access token | -- |

## Running

```bash
cd services/github-tools-service
bun run dev
```

## Testing

```bash
bun test services/github-tools-service
```
