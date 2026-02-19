# Team Service

Manages team collaboration features including team CRUD operations, member invitations, role management, and shared resource access.

## Port

`TEAM_SERVICE_PORT` (default: `3013`)

## Key Endpoints

- `GET /health` -- Health check
- `POST /api/team/teams` -- Create team
- `GET /api/team/teams?userId=...` -- List user's teams
- `GET /api/team/teams/:id` -- Get team details
- `DELETE /api/team/teams/:id` -- Delete team
- `POST /api/team/teams/:id/members` -- Invite member
- `GET /api/team/teams/:id/members` -- List members
- `PUT /api/team/teams/:id/members/:userId` -- Update member role
- `DELETE /api/team/teams/:id/members/:userId` -- Remove member

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEAM_SERVICE_PORT` | Service port | `3013` |

## Running

```bash
cd services/team-service
bun run dev
```

## Testing

```bash
bun test services/team-service
```
