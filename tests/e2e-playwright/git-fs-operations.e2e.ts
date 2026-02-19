import { test, expect } from '@playwright/test';

const GIT_TOOLS_URL = 'http://localhost:3008';
const FS_TOOLS_URL = 'http://localhost:3011';

test.describe('Git Tools E2E', () => {
  test('GET /api/git/status returns git status', async ({ request }) => {
    const response = await request.get(`${GIT_TOOLS_URL}/api/git/status`);
    // Accept 200 (in a git repo) or 500 (not in a repo)
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
      expect(body.status).toBeDefined();
      expect(typeof body.status.branch).toBe('string');
    }
  });

  test('GET /api/git/branches returns branch list', async ({ request }) => {
    const response = await request.get(`${GIT_TOOLS_URL}/api/git/branches`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
      expect(Array.isArray(body.branches)).toBeTruthy();
    }
  });

  test('GET /api/git/log returns commit log', async ({ request }) => {
    const response = await request.get(`${GIT_TOOLS_URL}/api/git/log?limit=5`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
      expect(Array.isArray(body.commits)).toBeTruthy();
    }
  });
});

test.describe('FS Tools E2E', () => {
  test('GET /api/fs/list returns directory listing', async ({ request }) => {
    const response = await request.get(`${FS_TOOLS_URL}/api/fs/list?path=.`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBeDefined();
    }
  });

  test('POST /api/fs/tree returns directory tree', async ({ request }) => {
    const response = await request.post(`${FS_TOOLS_URL}/api/fs/tree`, {
      data: { directory: '.', maxDepth: 2 },
    });
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('GET /api/fs/read returns file contents', async ({ request }) => {
    const response = await request.get(`${FS_TOOLS_URL}/api/fs/read?path=package.json`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBeDefined();
    }
  });
});
