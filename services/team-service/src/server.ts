/**
 * Team Service Server
 * HTTP server for team management endpoints
 */

import { logger } from '@nimbus/shared-utils';
import {
  createTeam,
  getTeam,
  listUserTeams,
  deleteTeam,
} from './routes/teams';
import {
  inviteMember,
  listMembers,
  removeMember,
  updateMemberRole,
} from './routes/members';
import { initDatabase } from './db/adapter';

export async function startServer(port: number) {
  // Initialize database
  await initDatabase();

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Extract requester ID from headers (in production, validate auth token)
      // This should come from a validated JWT/session token
      const requesterId = req.headers.get('x-user-id') || undefined;

      // Health check endpoint
      if (path === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'team-service',
          timestamp: new Date().toISOString(),
        });
      }

      // Create team
      if (path === '/api/team/teams' && method === 'POST') {
        try {
          const body = await req.json() as { name: string; ownerId: string };
          const result = await createTeam(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Create team error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // List teams for user
      if (path === '/api/team/teams' && method === 'GET') {
        try {
          const userId = url.searchParams.get('userId');
          if (!userId) {
            return Response.json(
              { success: false, error: 'userId query param required' },
              { status: 400 }
            );
          }
          const result = await listUserTeams(userId);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('List teams error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Team-specific routes
      const teamMatch = path.match(/^\/api\/team\/teams\/([^/]+)$/);
      if (teamMatch) {
        const teamId = teamMatch[1];

        if (method === 'GET') {
          try {
            const result = await getTeam(teamId);
            if (!result) {
              return Response.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
              );
            }
            return Response.json({ success: true, data: result });
          } catch (error: any) {
            logger.error('Get team error:', error);
            return Response.json(
              { success: false, error: error.message },
              { status: 500 }
            );
          }
        }

        if (method === 'DELETE') {
          try {
            await deleteTeam(teamId, requesterId);
            return Response.json({ success: true, data: { deleted: true } });
          } catch (error: any) {
            logger.error('Delete team error:', error);
            const status = error.message.includes('Only') || error.message.includes('owner') ? 403 : 500;
            return Response.json(
              { success: false, error: error.message },
              { status }
            );
          }
        }
      }

      // Team members routes
      const membersMatch = path.match(/^\/api\/team\/teams\/([^/]+)\/members$/);
      if (membersMatch) {
        const teamId = membersMatch[1];

        if (method === 'POST') {
          try {
            const body = await req.json() as { email: string; role?: string };
            const result = await inviteMember(teamId, body, requesterId);
            return Response.json({ success: true, data: result });
          } catch (error: any) {
            logger.error('Invite member error:', error);
            const status = error.message.includes('Only') || error.message.includes('Invalid role') ? 403 : 500;
            return Response.json(
              { success: false, error: error.message },
              { status }
            );
          }
        }

        if (method === 'GET') {
          try {
            const result = await listMembers(teamId);
            return Response.json({ success: true, data: result });
          } catch (error: any) {
            logger.error('List members error:', error);
            return Response.json(
              { success: false, error: error.message },
              { status: 500 }
            );
          }
        }
      }

      // Individual member routes
      const memberMatch = path.match(/^\/api\/team\/teams\/([^/]+)\/members\/([^/]+)$/);
      if (memberMatch) {
        const teamId = memberMatch[1];
        const userId = memberMatch[2];

        if (method === 'PUT') {
          try {
            const body = await req.json() as { role: string };
            const result = await updateMemberRole(teamId, userId, body, requesterId);
            return Response.json({ success: true, data: result });
          } catch (error: any) {
            logger.error('Update member error:', error);
            const status = error.message.includes('Only') || error.message.includes('Invalid role') ? 403 : 500;
            return Response.json(
              { success: false, error: error.message },
              { status }
            );
          }
        }

        if (method === 'DELETE') {
          try {
            await removeMember(teamId, userId, requesterId);
            return Response.json({ success: true, data: { removed: true } });
          } catch (error: any) {
            logger.error('Remove member error:', error);
            const status = error.message.includes('Only') ? 403 : 500;
            return Response.json(
              { success: false, error: error.message },
              { status }
            );
          }
        }
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`Team Service listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - GET  /health');
  logger.info('  - POST /api/team/teams');
  logger.info('  - GET  /api/team/teams?userId=...');
  logger.info('  - GET  /api/team/teams/:id');
  logger.info('  - DELETE /api/team/teams/:id');
  logger.info('  - POST /api/team/teams/:id/members');
  logger.info('  - GET  /api/team/teams/:id/members');
  logger.info('  - PUT  /api/team/teams/:id/members/:userId');
  logger.info('  - DELETE /api/team/teams/:id/members/:userId');

  return server;
}
