/**
 * Tests for Multi-Session Manager
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SessionManager } from '../sessions/manager';
import type { SessionEvent } from '../sessions/types';

describe('SessionManager', () => {
  let db: Database;
  let manager: SessionManager;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    SessionManager.resetInstance();
    manager = new SessionManager(db);
  });

  afterEach(() => {
    db.close();
    SessionManager.resetInstance();
  });

  describe('create', () => {
    it('should create a new session with defaults', () => {
      const session = manager.create({ name: 'Test Session' });
      expect(session.id).toBeTruthy();
      expect(session.name).toBe('Test Session');
      expect(session.status).toBe('active');
      expect(session.mode).toBe('plan');
      expect(session.tokenCount).toBe(0);
      expect(session.costUSD).toBe(0);
    });

    it('should create a session with custom options', () => {
      const session = manager.create({
        name: 'Deploy Session',
        mode: 'deploy',
        model: 'claude-sonnet',
        cwd: '/tmp/project',
      });
      expect(session.mode).toBe('deploy');
      expect(session.model).toBe('claude-sonnet');
      expect(session.cwd).toBe('/tmp/project');
    });

    it('should emit a created event', () => {
      const events: SessionEvent[] = [];
      manager.onEvent(e => events.push(e));
      manager.create({ name: 'Test' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('created');
    });
  });

  describe('list', () => {
    it('should list all sessions', () => {
      manager.create({ name: 'Session 1' });
      manager.create({ name: 'Session 2' });
      const sessions = manager.list();
      expect(sessions).toHaveLength(2);
    });

    it('should filter by status', () => {
      const s1 = manager.create({ name: 'Active' });
      const s2 = manager.create({ name: 'Completed' });
      manager.complete(s2.id);

      const active = manager.list('active');
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active');

      const completed = manager.list('completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe('Completed');
    });
  });

  describe('get', () => {
    it('should return a session by ID', () => {
      const created = manager.create({ name: 'Lookup Test' });
      const fetched = manager.get(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('Lookup Test');
    });

    it('should return null for non-existent session', () => {
      expect(manager.get('nonexistent')).toBeNull();
    });
  });

  describe('switchTo', () => {
    it('should switch active session', () => {
      const s1 = manager.create({ name: 'Session 1' });
      const s2 = manager.create({ name: 'Session 2' });
      manager.switchTo(s1.id);
      expect(manager.getActiveSessionId()).toBe(s1.id);

      manager.switchTo(s2.id);
      expect(manager.getActiveSessionId()).toBe(s2.id);

      // s1 should be suspended
      const s1Updated = manager.get(s1.id);
      expect(s1Updated!.status).toBe('suspended');
    });

    it('should return null for non-existent session', () => {
      expect(manager.switchTo('nonexistent')).toBeNull();
    });
  });

  describe('suspend and resume', () => {
    it('should suspend an active session', () => {
      const session = manager.create({ name: 'Test' });
      manager.switchTo(session.id);
      manager.suspend(session.id);

      const updated = manager.get(session.id);
      expect(updated!.status).toBe('suspended');
      expect(manager.getActiveSessionId()).toBeNull();
    });

    it('should resume a suspended session', () => {
      const session = manager.create({ name: 'Test' });
      manager.suspend(session.id);
      manager.resume(session.id);

      const updated = manager.get(session.id);
      expect(updated!.status).toBe('active');
      expect(manager.getActiveSessionId()).toBe(session.id);
    });

    it('should not resume a completed session', () => {
      const session = manager.create({ name: 'Test' });
      manager.complete(session.id);
      const result = manager.resume(session.id);
      expect(result).toBeNull();
    });
  });

  describe('complete', () => {
    it('should mark session as completed', () => {
      const session = manager.create({ name: 'Test' });
      manager.switchTo(session.id);
      manager.complete(session.id);

      const updated = manager.get(session.id);
      expect(updated!.status).toBe('completed');
      expect(manager.getActiveSessionId()).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should remove session from database', () => {
      const session = manager.create({ name: 'Test' });
      manager.destroy(session.id);
      expect(manager.get(session.id)).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session fields', () => {
      const session = manager.create({ name: 'Test' });
      manager.updateSession(session.id, {
        tokenCount: 5000,
        costUSD: 0.05,
        mode: 'build',
      });

      const updated = manager.get(session.id);
      expect(updated!.tokenCount).toBe(5000);
      expect(updated!.costUSD).toBe(0.05);
      expect(updated!.mode).toBe('build');
    });
  });

  describe('file conflict detection', () => {
    it('should detect when two sessions edit the same file', () => {
      const s1 = manager.create({ name: 'Session 1' });
      const s2 = manager.create({ name: 'Session 2' });

      manager.recordFileEdit(s1.id, '/src/index.ts');
      const conflicts = manager.recordFileEdit(s2.id, '/src/index.ts');

      expect(conflicts).toContain(s1.id);
    });

    it('should not detect conflicts for the same session', () => {
      const s1 = manager.create({ name: 'Session 1' });

      manager.recordFileEdit(s1.id, '/src/index.ts');
      const conflicts = manager.recordFileEdit(s1.id, '/src/index.ts');

      expect(conflicts).toHaveLength(0);
    });

    it('should emit file_conflict event', () => {
      const events: SessionEvent[] = [];
      manager.onEvent(e => events.push(e));

      const s1 = manager.create({ name: 'S1' });
      const s2 = manager.create({ name: 'S2' });

      manager.recordFileEdit(s1.id, '/src/index.ts');
      manager.recordFileEdit(s2.id, '/src/index.ts');

      const conflictEvents = events.filter(e => e.type === 'file_conflict');
      expect(conflictEvents).toHaveLength(1);
    });
  });

  describe('event listeners', () => {
    it('should support removing listeners', () => {
      const events: SessionEvent[] = [];
      const unsub = manager.onEvent(e => events.push(e));

      manager.create({ name: 'Before' });
      expect(events).toHaveLength(1);

      unsub();
      manager.create({ name: 'After' });
      expect(events).toHaveLength(1); // No new events after unsubscribe
    });
  });
});
