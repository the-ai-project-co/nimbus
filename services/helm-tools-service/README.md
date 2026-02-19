# Helm Tools Service

Executes Helm operations, providing HTTP endpoints for chart installation, release management, repository operations, and chart templating.

## Port

`PORT` (default: `3008`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/helm/install` -- Install chart
- `POST /api/helm/upgrade` -- Upgrade release
- `POST /api/helm/uninstall` -- Uninstall release
- `GET /api/helm/list` -- List releases
- `POST /api/helm/rollback` -- Rollback release
- `GET /api/helm/values` -- Get release values
- `GET /api/helm/history` -- Release history
- `POST /api/helm/repo` -- Manage repositories
- `GET /api/helm/search` -- Search charts
- `POST /api/helm/template` -- Template chart
- `POST /api/helm/lint` -- Lint chart
- `POST /api/helm/create` -- Create chart scaffold
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3008` |

## Running

```bash
cd services/helm-tools-service
bun run dev
```

## Testing

```bash
bun test services/helm-tools-service
```
