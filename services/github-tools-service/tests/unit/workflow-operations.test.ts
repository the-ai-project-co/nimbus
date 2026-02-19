import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('Workflow Operations', () => {
  let server: any;
  const PORT = 3303;
  const AUTH = { Authorization: 'Bearer ghp_test_token' };

  const spies: Array<ReturnType<typeof spyOn>> = [];
  function spy<K extends keyof GitHubOperations>(method: K, impl: (...args: any[]) => any) {
    const s = spyOn(GitHubOperations.prototype, method).mockImplementation(impl as any);
    spies.push(s);
    return s;
  }

  beforeAll(async () => { server = await startServer(PORT); });
  afterAll(() => { server?.stop(); });
  afterEach(() => { for (const s of spies) s.mockRestore(); spies.length = 0; });

  describe('GET /api/github/actions/workflows - List Workflows', () => {
    test('returns list of workflows', async () => {
      spy('listWorkflows', async () => [
        { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
        { id: 2, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/actions/workflows?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('CI');
    });

    test('returns 401 without authorization', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/workflows?owner=myorg&repo=myrepo`);
      expect(res.status).toBe(401);
    });

    test('returns 400 when owner/repo missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/workflows`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/github/actions/runs - List Workflow Runs', () => {
    test('returns list of workflow runs', async () => {
      spy('listWorkflowRuns', async () => [
        { id: 100, name: 'CI', status: 'completed', conclusion: 'success', run_number: 42 },
        { id: 101, name: 'CI', status: 'in_progress', conclusion: null, run_number: 43 },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/actions/runs?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });

    test('filters runs by branch', async () => {
      spy('listWorkflowRuns', async (owner: string, repo: string, options: any) => {
        expect(options.branch).toBe('main');
        return [];
      });

      const res = await fetch(
        `http://localhost:${PORT}/api/github/actions/runs?owner=myorg&repo=myrepo&branch=main`,
        { headers: AUTH }
      );
      expect(res.status).toBe(200);
    });

    test('returns 400 when owner/repo missing for runs', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/runs`, {
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/github/actions/runs/:runId - Get Workflow Run', () => {
    test('returns specific workflow run', async () => {
      spy('getWorkflowRun', async () => ({
        id: 100,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        run_number: 42,
        html_url: 'https://github.com/myorg/myrepo/actions/runs/100',
      }));

      const res = await fetch(
        `http://localhost:${PORT}/api/github/actions/runs/100?owner=myorg&repo=myrepo`,
        { headers: AUTH }
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(100);
      expect(data.data.conclusion).toBe('success');
    });

    test('returns 400 when owner/repo missing for run', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/runs/100`, {
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/github/actions/trigger - Trigger Workflow', () => {
    test('triggers a workflow dispatch', async () => {
      spy('triggerWorkflow', async () => {});

      const res = await fetch(`http://localhost:${PORT}/api/github/actions/trigger`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          workflow_id: 'ci.yml',
          ref: 'main',
          inputs: { environment: 'staging' },
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(202);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('triggered');
    });

    test('returns 400 when required fields are missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/trigger`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          // missing workflow_id and ref
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/actions/runs/:runId/cancel - Cancel Workflow Run', () => {
    test('cancels a workflow run', async () => {
      spy('cancelWorkflowRun', async () => {});

      const res = await fetch(`http://localhost:${PORT}/api/github/actions/runs/100/cancel`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'myorg', repo: 'myrepo' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('cancelled');
    });

    test('returns 400 when owner/repo missing for cancel', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/actions/runs/100/cancel`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});
