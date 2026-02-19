# Audit Service

Provides audit logging and compliance reporting, tracking all operations across the Nimbus platform with filterable queries and CSV/JSON export.

## Port

`AUDIT_SERVICE_PORT` (default: `3015`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/audit/logs` -- Create audit log entry
- `GET /api/audit/logs` -- Query audit logs (filterable by team, user, action, date range)
- `GET /api/audit/export` -- Export logs as CSV or JSON

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUDIT_SERVICE_PORT` | Service port | `3015` |

## Running

```bash
cd services/audit-service
bun run dev
```

## Testing

```bash
bun test services/audit-service
```
