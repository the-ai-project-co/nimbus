# Kubernetes Tools Service

Executes Kubernetes operations via kubectl, providing HTTP endpoints for resource management, pod operations, deployments, and cluster administration.

## Port

`PORT` (default: `3007`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/k8s/resources` -- List resources
- `POST /api/k8s/apply` -- Apply manifest
- `POST /api/k8s/delete` -- Delete resources
- `GET /api/k8s/logs` -- Get pod logs
- `POST /api/k8s/exec` -- Execute in pod
- `POST /api/k8s/scale` -- Scale deployment
- `POST /api/k8s/rollout` -- Manage rollout
- `GET /api/k8s/cluster-info` -- Cluster info
- `GET /api/k8s/contexts` -- List contexts
- `GET /api/k8s/namespaces` -- List namespaces
- `GET /api/k8s/top/pods` -- Pod resource usage
- `GET /api/k8s/top/nodes` -- Node resource usage
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3007` |

## Running

```bash
cd services/k8s-tools-service
bun run dev
```

## Testing

```bash
bun test services/k8s-tools-service
```
