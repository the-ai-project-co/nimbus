# Auth Service

Handles authentication for the Nimbus platform, supporting device code flow for CLI login and token validation.

## Port

`AUTH_SERVICE_PORT` (default: `3012`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/auth/device/initiate` -- Start device code flow
- `GET /api/auth/device/poll/:code` -- Poll device code status
- `POST /api/auth/device/verify` -- Verify device code
- `POST /api/auth/token/validate` -- Validate access token

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_SERVICE_PORT` | Service port | `3012` |
| `JWT_SECRET` | Secret for JWT signing | -- |

## Running

```bash
cd services/auth-service
bun run dev
```

## Testing

```bash
bun test services/auth-service
```
