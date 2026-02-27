/**
 * Tests for src/app.ts
 *
 * Verifies initApp() / shutdownApp() lifecycle semantics:
 * - initApp() returns an AppContext with db, router, and nimbusDir
 * - Calling initApp() twice returns the exact same context object (lazy singleton)
 * - shutdownApp() resets the cached context so getAppContext() returns null
 * - shutdownApp() is idempotent (safe to call when already shut down)
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { initApp, shutdownApp, getAppContext } from '../app';

describe('app lifecycle', () => {
  afterEach(async () => {
    // Always clean up so that each test starts from a fresh state.
    await shutdownApp();
  });

  it('initApp() returns an AppContext object', async () => {
    const ctx = await initApp();
    expect(ctx).toBeDefined();
    expect(typeof ctx).toBe('object');
  });

  it('AppContext has a db property', async () => {
    const ctx = await initApp();
    expect(ctx.db).toBeDefined();
  });

  it('AppContext has a router property', async () => {
    const ctx = await initApp();
    expect(ctx.router).toBeDefined();
  });

  it('AppContext has a nimbusDir string property', async () => {
    const ctx = await initApp();
    expect(typeof ctx.nimbusDir).toBe('string');
    expect(ctx.nimbusDir.length).toBeGreaterThan(0);
  });

  it('calling initApp() twice returns the same context instance', async () => {
    const ctx1 = await initApp();
    const ctx2 = await initApp();
    expect(ctx1).toBe(ctx2);
  });

  it('getAppContext() returns null before initApp() is called', () => {
    // After afterEach has run shutdownApp(), the context is null.
    const ctx = getAppContext();
    expect(ctx).toBeNull();
  });

  it('getAppContext() returns the context after initApp()', async () => {
    await initApp();
    const ctx = getAppContext();
    expect(ctx).not.toBeNull();
  });

  it('shutdownApp() clears the context so getAppContext() returns null', async () => {
    await initApp();
    await shutdownApp();
    expect(getAppContext()).toBeNull();
  });

  it('shutdownApp() is idempotent when called without a prior initApp()', async () => {
    // Should not throw even though context is already null.
    await expect(shutdownApp()).resolves.toBeUndefined();
  });

  it('shutdownApp() called twice does not throw', async () => {
    await initApp();
    await shutdownApp();
    await expect(shutdownApp()).resolves.toBeUndefined();
  });
});
