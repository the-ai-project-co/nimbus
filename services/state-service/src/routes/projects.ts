import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getAdapter } from '../storage';
import { logger } from '@nimbus/shared-utils';

const projects = new Hono();

// List all projects
projects.get('/', (c) => {
  try {
    const adapter = getAdapter();
    const projectList = adapter.listProjects();
    return c.json({ success: true, projects: projectList });
  } catch (error: any) {
    logger.error('Failed to list projects', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get a project by ID
projects.get('/:id', (c) => {
  try {
    const adapter = getAdapter();
    const project = adapter.getProject(c.req.param('id'));

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }

    return c.json({ success: true, project });
  } catch (error: any) {
    logger.error('Failed to get project', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get a project by path
projects.get('/by-path/:path', (c) => {
  try {
    const adapter = getAdapter();
    const path = decodeURIComponent(c.req.param('path'));
    const project = adapter.getProjectByPath(path);

    if (!project) {
      return c.json({ success: false, error: 'Project not found' }, 404);
    }

    return c.json({ success: true, project });
  } catch (error: any) {
    logger.error('Failed to get project by path', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create or update a project
projects.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { id = uuidv4(), name, path, config } = body;

    if (!name || !path || !config) {
      return c.json({ success: false, error: 'name, path, and config are required' }, 400);
    }

    const adapter = getAdapter();
    adapter.saveProject(id, name, path, config);

    return c.json({ success: true, id });
  } catch (error: any) {
    logger.error('Failed to save project', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update a project
projects.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, path, config } = body;

    if (!name || !path || !config) {
      return c.json({ success: false, error: 'name, path, and config are required' }, 400);
    }

    const adapter = getAdapter();
    adapter.saveProject(id, name, path, config);

    return c.json({ success: true, id });
  } catch (error: any) {
    logger.error('Failed to update project', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete a project
projects.delete('/:id', (c) => {
  try {
    const adapter = getAdapter();
    adapter.deleteProject(c.req.param('id'));
    return c.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete project', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default projects;
