/**
 * E2E tests for the Session Manager lifecycle.
 *
 * Covers create, suspend, resume, complete, destroy, rename, conflict
 * detection, conversation persistence, infra context, debounced flush,
 * event system, filtering, metadata accumulation, recovery, and ID
 * uniqueness.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../src/compat/sqlite';
import { SessionManager } from '../../src/sessions/manager';
import type { SessionEvent, SessionStatus } from '../../src/sessions/types';
import type { LLMMessage } from '../../src/llm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}

function makeMessages(count: number): LLMMessage[] {
  const msgs: LLMMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    });
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session Lifecycle E2E', () => {
  let db: Database;
  let manager: SessionManager;

  beforeEach(() => {
    db = createTestDb();
    SessionManager.resetInstance();
    manager = new SessionManager(db, { flushDebounceMs: 0 });
  });

  afterEach(() => {
    db.close();
    SessionManager.resetInstance();
  });

  // -------------------------------------------------------------------------
  // 1. Full lifecycle: create -> use -> suspend -> resume -> complete
  // -------------------------------------------------------------------------
  it('should support the full session lifecycle', () => {
    const session = manager.create({ name: 'Lifecycle Test' });
    expect(session.status).toBe('active');
    expect(session.name).toBe('Lifecycle Test');

    // Use the session: save conversation
    const messages = makeMessages(4);
    manager.saveConversation(session.id, messages);
    const loaded = manager.loadConversation(session.id);
    expect(loaded).toHaveLength(4);

    // Suspend
    manager.suspend(session.id);
    const suspended = manager.get(session.id);
    expect(suspended?.status).toBe('suspended');
    expect(manager.getActiveSessionId()).toBeNull();

    // Resume
    const resumed = manager.resume(session.id);
    expect(resumed?.status).toBe('active');
    expect(manager.getActiveSessionId()).toBe(session.id);

    // Complete
    manager.complete(session.id);
    const completed = manager.get(session.id);
    expect(completed?.status).toBe('completed');
    expect(manager.getActiveSessionId()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. Multiple concurrent sessions with switching
  // -------------------------------------------------------------------------
  it('should support multiple concurrent sessions with switching', () => {
    const s1 = manager.create({ name: 'Session A' });
    const s2 = manager.create({ name: 'Session B' });
    const s3 = manager.create({ name: 'Session C' });

    // Switch to s1
    manager.switchTo(s1.id);
    expect(manager.getActiveSessionId()).toBe(s1.id);

    // Switch to s2 -- s1 should become suspended
    manager.switchTo(s2.id);
    expect(manager.getActiveSessionId()).toBe(s2.id);
    expect(manager.get(s1.id)?.status).toBe('suspended');
    expect(manager.get(s2.id)?.status).toBe('active');

    // Switch to s3 -- s2 should become suspended
    manager.switchTo(s3.id);
    expect(manager.getActiveSessionId()).toBe(s3.id);
    expect(manager.get(s2.id)?.status).toBe('suspended');

    // All three sessions are listed
    const all = manager.list();
    expect(all).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 3. Session persists conversation history
  // -------------------------------------------------------------------------
  it('should persist and reload conversation history', () => {
    const session = manager.create({ name: 'Conversation Test' });

    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'What is Terraform?' },
      { role: 'assistant', content: 'Terraform is an IaC tool.' },
    ];

    manager.saveConversation(session.id, messages);

    const loaded = manager.loadConversation(session.id);
    expect(loaded).toHaveLength(4);
    expect(loaded[0].role).toBe('user');
    expect(loaded[0].content).toBe('Hello');
    expect(loaded[3].content).toBe('Terraform is an IaC tool.');

    // Overwrite with updated conversation
    messages.push({ role: 'user', content: 'Tell me more' });
    manager.saveConversation(session.id, messages);
    const reloaded = manager.loadConversation(session.id);
    expect(reloaded).toHaveLength(5);
  });

  // -------------------------------------------------------------------------
  // 4. Session saves and restores infra context
  // -------------------------------------------------------------------------
  it('should save and restore infra context', () => {
    const session = manager.create({ name: 'Infra Context Test' });

    // Initially null
    expect(manager.getInfraContext(session.id)).toBeNull();

    // Set context
    manager.setInfraContext(session.id, {
      terraformWorkspace: 'production',
      kubectlContext: 'eks-prod-cluster',
      awsProfile: 'prod',
      awsRegion: 'us-east-1',
      gcpProject: 'my-gcp-project',
      azureSubscription: 'sub-12345',
    });

    const ctx = manager.getInfraContext(session.id);
    expect(ctx).not.toBeNull();
    expect(ctx?.terraformWorkspace).toBe('production');
    expect(ctx?.kubectlContext).toBe('eks-prod-cluster');
    expect(ctx?.awsProfile).toBe('prod');
    expect(ctx?.awsRegion).toBe('us-east-1');
    expect(ctx?.gcpProject).toBe('my-gcp-project');
    expect(ctx?.azureSubscription).toBe('sub-12345');

    // Update partial context
    manager.setInfraContext(session.id, {
      terraformWorkspace: 'staging',
    });

    const updated = manager.getInfraContext(session.id);
    expect(updated?.terraformWorkspace).toBe('staging');
  });

  // -------------------------------------------------------------------------
  // 5. File conflict detection warns when two sessions edit same file
  // -------------------------------------------------------------------------
  it('should detect file conflicts between sessions', () => {
    const s1 = manager.create({ name: 'Session 1' });
    const s2 = manager.create({ name: 'Session 2' });

    const events: SessionEvent[] = [];
    manager.onEvent(e => events.push(e));

    // s1 edits a file
    const conflicts1 = manager.recordFileEdit(s1.id, '/project/main.tf');
    expect(conflicts1).toHaveLength(0);

    // s2 edits the same file -- should detect conflict
    const conflicts2 = manager.recordFileEdit(s2.id, '/project/main.tf');
    expect(conflicts2).toHaveLength(1);
    expect(conflicts2[0]).toBe(s1.id);

    // A file_conflict event should have been emitted
    const conflictEvents = events.filter(e => e.type === 'file_conflict');
    expect(conflictEvents).toHaveLength(1);
    expect(conflictEvents[0].details).toContain('main.tf');
    expect(conflictEvents[0].details).toContain(s1.id);
  });

  // -------------------------------------------------------------------------
  // 6. Session destroy removes all associated data
  // -------------------------------------------------------------------------
  it('should destroy a session and remove all associated data', () => {
    const session = manager.create({ name: 'Destroy Test' });
    manager.saveConversation(session.id, makeMessages(2));
    manager.recordFileEdit(session.id, '/project/file.ts');
    manager.switchTo(session.id);

    expect(manager.getActiveSessionId()).toBe(session.id);

    manager.destroy(session.id);

    expect(manager.get(session.id)).toBeNull();
    expect(manager.getActiveSessionId()).toBeNull();
    expect(manager.list()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 7. Session rename updates name in DB
  // -------------------------------------------------------------------------
  it('should rename a session', () => {
    const session = manager.create({ name: 'Original Name' });
    expect(manager.get(session.id)?.name).toBe('Original Name');

    manager.rename(session.id, 'Updated Name');
    expect(manager.get(session.id)?.name).toBe('Updated Name');
  });

  // -------------------------------------------------------------------------
  // 8. Debounced flush merges stats before writing
  // -------------------------------------------------------------------------
  it('should merge stats across debounced writes', () => {
    const session = manager.create({ name: 'Debounce Test' });

    // First write: partial stats
    manager.saveConversationAndStats(
      session.id,
      makeMessages(2),
      { tokenCount: 100, costUSD: 0.01 }
    );

    // Second write before flush: additional stats
    manager.saveConversationAndStats(
      session.id,
      makeMessages(4),
      { tokenCount: 250, snapshotCount: 1 }
    );

    // With flushDebounceMs=0, writes are flushed immediately.
    // The last messages win; stats are merged.
    const loaded = manager.loadConversation(session.id);
    expect(loaded).toHaveLength(4);

    const updated = manager.get(session.id);
    // The merged stats should have the latest tokenCount (250) and snapshotCount (1)
    expect(updated?.tokenCount).toBe(250);
    expect(updated?.snapshotCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 9. flushAll() persists all pending writes
  // -------------------------------------------------------------------------
  it('should persist all pending writes on flushAll', () => {
    // Use a non-zero debounce so writes are actually pending
    const debouncedManager = new SessionManager(db, { flushDebounceMs: 60000 });
    const session = debouncedManager.create({ name: 'FlushAll Test' });

    debouncedManager.saveConversationAndStats(
      session.id,
      makeMessages(3),
      { tokenCount: 500, costUSD: 0.05 }
    );

    // Before flush, conversation should not be persisted yet
    const before = debouncedManager.loadConversation(session.id);
    expect(before).toHaveLength(0);

    // Flush all pending writes
    debouncedManager.flushAll();

    const after = debouncedManager.loadConversation(session.id);
    expect(after).toHaveLength(3);

    const updated = debouncedManager.get(session.id);
    expect(updated?.tokenCount).toBe(500);
    expect(updated?.costUSD).toBe(0.05);
  });

  // -------------------------------------------------------------------------
  // 10. Session events fire correctly
  // -------------------------------------------------------------------------
  it('should fire all lifecycle events in correct order', () => {
    const events: SessionEvent[] = [];
    manager.onEvent(e => events.push(e));

    const session = manager.create({ name: 'Events Test' });
    // created event
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('created');
    expect(events[0].sessionId).toBe(session.id);
    expect(events[0].timestamp).toBeInstanceOf(Date);

    // switchTo fires 'switched'
    manager.switchTo(session.id);
    const switchedEvents = events.filter(e => e.type === 'switched');
    expect(switchedEvents).toHaveLength(1);

    // suspend
    manager.suspend(session.id);
    const suspendedEvents = events.filter(e => e.type === 'suspended');
    expect(suspendedEvents.length).toBeGreaterThanOrEqual(1);

    // resume
    manager.resume(session.id);
    const resumedEvents = events.filter(e => e.type === 'resumed');
    expect(resumedEvents).toHaveLength(1);

    // complete
    manager.complete(session.id);
    const completedEvents = events.filter(e => e.type === 'completed');
    expect(completedEvents).toHaveLength(1);

    // Create another session and destroy it
    const s2 = manager.create({ name: 'To Destroy' });
    manager.destroy(s2.id);
    const destroyedEvents = events.filter(e => e.type === 'destroyed');
    expect(destroyedEvents).toHaveLength(1);
    expect(destroyedEvents[0].sessionId).toBe(s2.id);
  });

  // -------------------------------------------------------------------------
  // 11. Event listener removal works
  // -------------------------------------------------------------------------
  it('should support removing event listeners', () => {
    const events: SessionEvent[] = [];
    const unsubscribe = manager.onEvent(e => events.push(e));

    manager.create({ name: 'Before Unsubscribe' });
    expect(events).toHaveLength(1);

    unsubscribe();

    manager.create({ name: 'After Unsubscribe' });
    // Should still be 1 since listener was removed
    expect(events).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 12. Session list filters by status
  // -------------------------------------------------------------------------
  it('should filter sessions by status', () => {
    const s1 = manager.create({ name: 'Active 1' });
    const s2 = manager.create({ name: 'Active 2' });
    const s3 = manager.create({ name: 'To Suspend' });
    const s4 = manager.create({ name: 'To Complete' });

    manager.suspend(s3.id);
    manager.complete(s4.id);

    const active = manager.list('active');
    expect(active).toHaveLength(2);
    expect(active.map(s => s.id).sort()).toEqual([s1.id, s2.id].sort());

    const suspended = manager.list('suspended');
    expect(suspended).toHaveLength(1);
    expect(suspended[0].id).toBe(s3.id);

    const completed = manager.list('completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe(s4.id);

    // listActive convenience method
    const activeList = manager.listActive();
    expect(activeList).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 13. Session metadata (tokens, cost, snapshots) accumulates correctly
  // -------------------------------------------------------------------------
  it('should accumulate session metadata through updateSession', () => {
    const session = manager.create({ name: 'Metadata Test' });
    expect(session.tokenCount).toBe(0);
    expect(session.costUSD).toBe(0);
    expect(session.snapshotCount).toBe(0);

    manager.updateSession(session.id, { tokenCount: 1000 });
    let updated = manager.get(session.id)!;
    expect(updated.tokenCount).toBe(1000);

    manager.updateSession(session.id, { costUSD: 0.15, snapshotCount: 3 });
    updated = manager.get(session.id)!;
    expect(updated.costUSD).toBe(0.15);
    expect(updated.snapshotCount).toBe(3);
    expect(updated.tokenCount).toBe(1000); // unchanged

    manager.updateSession(session.id, { mode: 'deploy', model: 'claude-opus' });
    updated = manager.get(session.id)!;
    expect(updated.mode).toBe('deploy');
    expect(updated.model).toBe('claude-opus');
  });

  // -------------------------------------------------------------------------
  // 14. Recovery from corrupted session data
  // -------------------------------------------------------------------------
  it('should recover gracefully from corrupted conversation data', () => {
    const session = manager.create({ name: 'Corrupt Test' });

    // Manually insert corrupted JSON into conversations table
    db.prepare(
      "INSERT INTO conversations (id, title, messages, model, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).run(session.id, 'Corrupt', '{not valid json[[[', 'default');

    // loadConversation should return empty array rather than throwing
    const loaded = manager.loadConversation(session.id);
    expect(loaded).toEqual([]);
  });

  it('should recover gracefully from corrupted infra context metadata', () => {
    const session = manager.create({ name: 'Corrupt Infra Test' });

    // Manually set corrupted metadata
    db.prepare('UPDATE sessions SET metadata = ? WHERE id = ?').run(
      '{broken json!!!',
      session.id
    );

    const ctx = manager.getInfraContext(session.id);
    expect(ctx).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 15. Session ID generation is unique
  // -------------------------------------------------------------------------
  it('should generate unique session IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const session = manager.create({ name: `Session ${i}` });
      expect(ids.has(session.id)).toBe(false);
      ids.add(session.id);
    }
    expect(ids.size).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------
  it('should return null when switching to a non-existent session', () => {
    const result = manager.switchTo('non-existent-id');
    expect(result).toBeNull();
  });

  it('should return null when resuming a completed session', () => {
    const session = manager.create({ name: 'Completed' });
    manager.complete(session.id);
    const result = manager.resume(session.id);
    expect(result).toBeNull();
  });

  it('should return empty array when loading conversation for unknown session', () => {
    const loaded = manager.loadConversation('unknown-session-id');
    expect(loaded).toEqual([]);
  });

  it('should handle updateSession with no updates gracefully', () => {
    const session = manager.create({ name: 'No Updates' });
    // Should not throw
    manager.updateSession(session.id, {});
    const unchanged = manager.get(session.id)!;
    expect(unchanged.tokenCount).toBe(0);
  });

  it('should handle destroying file edits for the destroyed session only', () => {
    const s1 = manager.create({ name: 'Keeper' });
    const s2 = manager.create({ name: 'Doomed' });

    manager.recordFileEdit(s1.id, '/shared/file.ts');
    manager.recordFileEdit(s2.id, '/shared/file.ts');

    manager.destroy(s2.id);

    // s1's file edit should still trigger no conflict when re-recorded
    const conflicts = manager.recordFileEdit(s1.id, '/shared/file.ts');
    expect(conflicts).toHaveLength(0);
  });
});
