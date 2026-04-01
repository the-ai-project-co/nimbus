/**
 * Session Lifecycle End-to-End Tests
 *
 * Tests the full session lifecycle with real in-memory SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/sessions/manager';
import { getTestDb } from '../../src/state/db';

let db: any;

beforeEach(() => {
  db = getTestDb();
  SessionManager.resetInstance();
});

afterEach(() => {
  SessionManager.resetInstance();
  db?.close();
});

describe('Session lifecycle — full E2E', () => {
  it('create -> use -> suspend -> resume -> complete', () => {
    const sm = SessionManager.getInstance(db);
    const session = sm.create({ name: 'test-session', mode: 'build' });
    expect(session.id).toBeTruthy();
    expect(session.status).toBe('active');

    sm.suspend(session.id);
    const suspended = sm.get(session.id);
    expect(suspended?.status).toBe('suspended');

    sm.resume(session.id);
    const resumed = sm.get(session.id);
    expect(resumed?.status).toBe('active');

    sm.complete(session.id);
    const completed = sm.get(session.id);
    expect(completed?.status).toBe('completed');
  });

  it('creates session with custom mode and model', () => {
    const sm = SessionManager.getInstance(db);
    const session = sm.create({ name: 'plan-session', mode: 'plan', model: 'gpt-4o' });
    expect(session.mode).toBe('plan');
    expect(session.model).toBe('gpt-4o');
  });

  it('switches between multiple active sessions', () => {
    const sm = SessionManager.getInstance(db);
    const s1 = sm.create({ name: 'session-1', mode: 'build' });
    const s2 = sm.create({ name: 'session-2', mode: 'plan' });

    const switched = sm.switchTo(s1.id);
    expect(switched?.id).toBe(s1.id);

    const switched2 = sm.switchTo(s2.id);
    expect(switched2?.id).toBe(s2.id);
  });

  it('saves and retrieves infra context', () => {
    const sm = SessionManager.getInstance(db);
    const session = sm.create({ name: 'infra-session', mode: 'build' });

    sm.setInfraContext(session.id, {
      terraformWorkspace: 'staging',
      kubectlContext: 'prod-cluster',
      awsRegion: 'us-west-2',
    });

    const ctx = sm.getInfraContext(session.id);
    expect(ctx?.terraformWorkspace).toBe('staging');
    expect(ctx?.kubectlContext).toBe('prod-cluster');
  });

  it('destroy removes session', () => {
    const sm = SessionManager.getInstance(db);
    const session = sm.create({ name: 'to-destroy', mode: 'build' });
    sm.destroy(session.id);
    expect(sm.get(session.id)).toBeNull();
  });

  it('list filters by status', () => {
    const sm = SessionManager.getInstance(db);
    sm.create({ name: 'active-session', mode: 'build' });
    const s2 = sm.create({ name: 'completed-session', mode: 'plan' });
    sm.complete(s2.id);

    const active = sm.list('active');
    const completed = sm.list('completed');
    expect(active.length).toBe(1);
    expect(completed.length).toBe(1);
  });

  it('rename updates session name', () => {
    const sm = SessionManager.getInstance(db);
    const session = sm.create({ name: 'original', mode: 'build' });
    sm.rename(session.id, 'My Session');
    const renamed = sm.get(session.id);
    expect(renamed?.name).toBe('My Session');
  });

  it('file conflict detection triggers for same file across sessions', () => {
    const sm = SessionManager.getInstance(db);
    const s1 = sm.create({ name: 'editor-1', mode: 'build' });
    const s2 = sm.create({ name: 'editor-2', mode: 'build' });

    // First session edits a file
    sm.recordFileEdit(s1.id, '/tmp/test.ts');
    // Second session edits the same file - should return conflicts
    const conflicts = sm.recordFileEdit(s2.id, '/tmp/test.ts');
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('no conflict for same session editing same file', () => {
    const sm = SessionManager.getInstance(db);
    const s1 = sm.create({ name: 'solo-editor', mode: 'build' });

    sm.recordFileEdit(s1.id, '/tmp/test.ts');
    const conflicts = sm.recordFileEdit(s1.id, '/tmp/test.ts');
    expect(conflicts.length).toBe(0);
  });

  it('events fire during lifecycle', () => {
    const sm = SessionManager.getInstance(db);
    const events: string[] = [];
    sm.onEvent((event) => events.push(event.type));

    const session = sm.create({ name: 'event-test', mode: 'build' });
    sm.complete(session.id);

    expect(events).toContain('created');
    expect(events).toContain('completed');
  });

  it('multiple sessions coexist independently', () => {
    const sm = SessionManager.getInstance(db);
    const s1 = sm.create({ name: 'claude-session', mode: 'build', model: 'claude' });
    const s2 = sm.create({ name: 'gpt-session', mode: 'plan', model: 'gpt-4' });

    expect(sm.get(s1.id)?.model).toBe('claude');
    expect(sm.get(s2.id)?.model).toBe('gpt-4');
    expect(sm.list().length).toBe(2);
  });
});
