import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('Release Operations', () => {
  let server: any;
  const PORT = 3304;
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

  describe('GET /api/github/releases - List Releases', () => {
    test('returns list of releases', async () => {
      spy('listReleases', async () => [
        { id: 1, tag_name: 'v1.0.0', name: 'Version 1.0.0', draft: false, prerelease: false },
        { id: 2, tag_name: 'v1.1.0', name: 'Version 1.1.0', draft: false, prerelease: false },
        { id: 3, tag_name: 'v2.0.0-beta', name: 'Beta 2.0.0', draft: false, prerelease: true },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/releases?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].tag_name).toBe('v1.0.0');
    });

    test('returns 401 without auth', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases?owner=myorg&repo=myrepo`);
      expect(res.status).toBe(401);
    });

    test('returns 400 when owner/repo missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases`, {
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/github/releases/latest - Get Latest Release', () => {
    test('returns the latest release', async () => {
      spy('getLatestRelease', async () => ({
        id: 5,
        tag_name: 'v2.0.0',
        name: 'Version 2.0.0',
        body: 'Major release with breaking changes',
        published_at: '2025-01-15T10:00:00Z',
        draft: false,
        prerelease: false,
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/releases/latest?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tag_name).toBe('v2.0.0');
    });

    test('returns 400 when owner/repo missing for latest', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases/latest`, {
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });

    test('handles 404 when no releases exist', async () => {
      spy('getLatestRelease', async () => {
        const err: any = new Error('Not Found');
        err.status = 404;
        throw err;
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/releases/latest?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/github/releases - Create Release', () => {
    test('creates a new release', async () => {
      spy('createRelease', async () => ({
        id: 10,
        tag_name: 'v3.0.0',
        name: 'Version 3.0.0',
        html_url: 'https://github.com/myorg/myrepo/releases/tag/v3.0.0',
        draft: false,
        prerelease: false,
        assets: [],
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/releases`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          tag_name: 'v3.0.0',
          name: 'Version 3.0.0',
          body: 'Major improvements',
          draft: false,
          prerelease: false,
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.tag_name).toBe('v3.0.0');
    });

    test('creates a draft release', async () => {
      spy('createRelease', async (owner, repo, options) => {
        expect(options.draft).toBe(true);
        return { id: 11, tag_name: 'v3.1.0', draft: true };
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/releases`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          tag_name: 'v3.1.0',
          draft: true,
        }),
      });
      expect(res.status).toBe(201);
    });

    test('returns 400 when tag_name is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          // missing tag_name
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/github/releases/:releaseId - Delete Release', () => {
    test('deletes a release', async () => {
      spy('deleteRelease', async () => {});

      const res = await fetch(`http://localhost:${PORT}/api/github/releases/10?owner=myorg&repo=myrepo`, {
        method: 'DELETE',
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('deleted');
    });

    test('returns 400 when owner/repo missing for delete', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases/10`, {
        method: 'DELETE',
        headers: AUTH,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/github/releases/notes - Generate Release Notes', () => {
    test('generates release notes', async () => {
      spy('generateReleaseNotes', async () => ({
        name: 'v3.0.0',
        body: '## What\'s Changed\n* Fix login bug by @alice\n* Add dark mode by @bob',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/releases/notes`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          tag_name: 'v3.0.0',
          previous_tag_name: 'v2.0.0',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.body).toContain("What's Changed");
    });

    test('returns 400 when tag_name is missing for notes', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases/notes`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          // missing tag_name
        }),
      });
      expect(res.status).toBe(400);
    });

    test('returns 401 without auth for release notes', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/releases/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'myorg', repo: 'myrepo', tag_name: 'v1.0.0' }),
      });
      expect(res.status).toBe(401);
    });
  });
});
