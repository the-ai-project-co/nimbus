import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Analytics } from '../analytics';

describe('Analytics', () => {
  let originalApiKey: string | undefined;
  let originalHost: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.POSTHOG_API_KEY;
    originalHost = process.env.POSTHOG_HOST;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.POSTHOG_API_KEY;
    } else {
      process.env.POSTHOG_API_KEY = originalApiKey;
    }
    if (originalHost === undefined) {
      delete process.env.POSTHOG_HOST;
    } else {
      process.env.POSTHOG_HOST = originalHost;
    }
  });

  // ---------- enabled ----------

  describe('enabled', () => {
    it('returns false when POSTHOG_API_KEY is not set', () => {
      delete process.env.POSTHOG_API_KEY;
      const analytics = new Analytics();
      expect(analytics.enabled).toBe(false);
    });

    it('returns false when POSTHOG_API_KEY is empty', () => {
      process.env.POSTHOG_API_KEY = '';
      const analytics = new Analytics();
      expect(analytics.enabled).toBe(false);
    });

    it('returns true when POSTHOG_API_KEY is set', () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      const analytics = new Analytics();
      expect(analytics.enabled).toBe(true);
    });
  });

  // ---------- trackEvent (no-op when disabled) ----------

  describe('trackEvent (disabled)', () => {
    it('does not call fetch when API key is not set', async () => {
      delete process.env.POSTHOG_API_KEY;
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch');
      await analytics.trackEvent('test_event', { foo: 'bar' });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ---------- trackEvent (enabled) ----------

  describe('trackEvent (enabled)', () => {
    it('sends a POST request to PostHog /capture/ when API key is set', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      process.env.POSTHOG_HOST = 'https://posthog.example.com';
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      );

      await analytics.trackEvent('command_executed', { command: 'chat', userId: 'user-42' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://posthog.example.com/capture/');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.api_key).toBe('phc_test_key_123');
      expect(body.event).toBe('command_executed');
      expect(body.distinct_id).toBe('user-42');
      expect(body.properties.command).toBe('chat');
      expect(body.properties.timestamp).toBeDefined();

      fetchSpy.mockRestore();
    });

    it('uses "anonymous" as distinct_id when userId is not provided', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      );

      await analytics.trackEvent('page_view');

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.distinct_id).toBe('anonymous');

      fetchSpy.mockRestore();
    });

    it('uses default PostHog host when POSTHOG_HOST is not set', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      delete process.env.POSTHOG_HOST;
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      );

      await analytics.trackEvent('test');

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://app.posthog.com/capture/');

      fetchSpy.mockRestore();
    });

    it('does not throw when fetch fails', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(analytics.trackEvent('test_event')).resolves.toBeUndefined();

      fetchSpy.mockRestore();
    });
  });

  // ---------- identifyUser (no-op when disabled) ----------

  describe('identifyUser (disabled)', () => {
    it('does not call fetch when API key is not set', async () => {
      delete process.env.POSTHOG_API_KEY;
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch');
      await analytics.identifyUser('user-42', { name: 'Alice' });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ---------- identifyUser (enabled) ----------

  describe('identifyUser (enabled)', () => {
    it('sends $identify event with correct distinct_id', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      process.env.POSTHOG_HOST = 'https://posthog.example.com';
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      );

      await analytics.identifyUser('user-42', { email: 'alice@example.com', plan: 'pro' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://posthog.example.com/capture/');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body as string);
      expect(body.api_key).toBe('phc_test_key_123');
      expect(body.event).toBe('$identify');
      expect(body.distinct_id).toBe('user-42');
      expect(body.properties.email).toBe('alice@example.com');
      expect(body.properties.plan).toBe('pro');

      fetchSpy.mockRestore();
    });

    it('does not throw when fetch fails during identify', async () => {
      process.env.POSTHOG_API_KEY = 'phc_test_key_123';
      const analytics = new Analytics();

      const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Timeout'));

      await expect(analytics.identifyUser('user-42')).resolves.toBeUndefined();

      fetchSpy.mockRestore();
    });
  });
});
