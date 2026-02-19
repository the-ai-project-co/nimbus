# File System Tools Service

Provides safe file system operations via HTTP endpoints, including reading, writing, searching, directory traversal, and file diffing with sensitive file protection.

## Port

`PORT` (default: `3005`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/fs/read` -- Read file content
- `POST /api/fs/write` -- Write file content
- `POST /api/fs/append` -- Append to file
- `POST /api/fs/list` -- List directory
- `POST /api/fs/search` -- Search files by pattern
- `POST /api/fs/tree` -- Directory tree view
- `POST /api/fs/diff` -- File diff
- `POST /api/fs/copy` -- Copy file or directory
- `POST /api/fs/move` -- Move file or directory
- `DELETE /api/fs/delete` -- Delete file or directory
- `POST /api/fs/mkdir` -- Create directory
- `POST /api/fs/exists` -- Check file existence
- `POST /api/fs/stat` -- Get file stats
- `GET /swagger` -- Swagger UI

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `3005` |

## Running

```bash
cd services/fs-tools-service
bun run dev
```

## Testing

```bash
bun test services/fs-tools-service
```
