# GCP Tools Service

Google Cloud Platform infrastructure operations, discovery, and Terraform generation service. Supports Compute Engine, Cloud Storage, GKE, IAM, Cloud Functions, and VPC.

## Port

`PORT` (default: `3016`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/gcp/compute/instances` -- List Compute Engine instances
- `POST /api/gcp/compute/instances/start` -- Start instance
- `POST /api/gcp/compute/instances/stop` -- Stop instance
- `GET /api/gcp/storage/buckets` -- List Cloud Storage buckets
- `GET /api/gcp/gke/clusters` -- List GKE clusters
- `GET /api/gcp/iam/service-accounts` -- List service accounts
- `GET /api/gcp/iam/roles` -- List IAM roles
- `GET /api/gcp/functions/functions` -- List Cloud Functions
- `GET /api/gcp/vpc/networks` -- List VPC networks
- `POST /api/gcp/discover` -- Start infrastructure discovery
- `GET /api/gcp/discover/:sessionId` -- Get discovery status
- `POST /api/gcp/terraform/generate` -- Generate Terraform from discovery

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3016` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account key | -- |

## Running

```bash
cd services/gcp-tools-service
bun run dev
```

## Testing

```bash
bun test services/gcp-tools-service
```
