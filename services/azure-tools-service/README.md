# Azure Tools Service

Microsoft Azure infrastructure operations, discovery, and Terraform generation service. Supports VMs, Storage, AKS, IAM, Functions, and Virtual Networks.

## Port

`PORT` (default: `3017`)

## Key Endpoints

- `GET /health` -- Health check
- `GET /api/azure/compute/vms` -- List Azure VMs
- `POST /api/azure/compute/vms/start` -- Start VM
- `POST /api/azure/compute/vms/stop` -- Stop VM
- `GET /api/azure/storage/accounts` -- List storage accounts
- `GET /api/azure/aks/clusters` -- List AKS clusters
- `GET /api/azure/iam/role-assignments` -- List role assignments
- `GET /api/azure/functions/apps` -- List Function Apps
- `GET /api/azure/network/vnets` -- List virtual networks
- `GET /api/azure/network/subnets` -- List subnets
- `POST /api/azure/discover` -- Start infrastructure discovery
- `GET /api/azure/discover/:sessionId` -- Get discovery status
- `POST /api/azure/terraform/generate` -- Generate Terraform from discovery

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3017` |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | -- |
| `AZURE_TENANT_ID` | Azure tenant ID | -- |
| `AZURE_CLIENT_ID` | Azure client ID | -- |
| `AZURE_CLIENT_SECRET` | Azure client secret | -- |

## Running

```bash
cd services/azure-tools-service
bun run dev
```

## Testing

```bash
bun test services/azure-tools-service
```
