# Terraform Tools Service

Executes Terraform CLI operations, providing HTTP endpoints for init, plan, apply, destroy, state management, and workspace operations.

## Port

`PORT` (default: `3006`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/terraform/init` -- Initialize Terraform
- `POST /api/terraform/plan` -- Generate execution plan
- `POST /api/terraform/apply` -- Apply configuration
- `POST /api/terraform/destroy` -- Destroy resources
- `POST /api/terraform/validate` -- Validate configuration
- `POST /api/terraform/fmt` -- Format files
- `POST /api/terraform/import` -- Import resource
- `GET /api/terraform/state/list` -- List state resources
- `GET /api/terraform/output` -- Get output values
- `GET /api/terraform/workspace/list` -- List workspaces
- `POST /api/terraform/workspace/new` -- Create workspace
- `POST /api/terraform/taint` -- Taint resource
- `POST /api/terraform/force-unlock` -- Force unlock state
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3006` |

## Running

```bash
cd services/terraform-tools-service
bun run dev
```

## Testing

```bash
bun test services/terraform-tools-service
```
