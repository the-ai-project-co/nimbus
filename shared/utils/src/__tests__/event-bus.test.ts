import { describe, test, expect, beforeEach } from 'bun:test';
import { eventBus, type NimbusEvent } from '../event-bus';

function makeEvent(overrides: Partial<NimbusEvent> = {}): NimbusEvent {
  return {
    type: 'test.event',
    source: 'unit-test',
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  };
}

describe('NimbusEventBus', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  test('publish and subscribe delivers events', () => {
    const received: NimbusEvent[] = [];
    eventBus.subscribe('test.event', (event) => received.push(event));

    const event = makeEvent({ data: { key: 'value' } });
    eventBus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
    expect(received[0].data.key).toBe('value');
  });

  test('wildcard listener receives all events', () => {
    const received: NimbusEvent[] = [];
    eventBus.subscribe('*', (event) => received.push(event));

    eventBus.publish(makeEvent({ type: 'alpha' }));
    eventBus.publish(makeEvent({ type: 'beta' }));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('alpha');
    expect(received[1].type).toBe('beta');
  });

  test('once listener fires only once', () => {
    let count = 0;
    eventBus.once('one-shot', () => count++);

    eventBus.publish(makeEvent({ type: 'one-shot' }));
    eventBus.publish(makeEvent({ type: 'one-shot' }));

    expect(count).toBe(1);
  });

  test('unsubscribe stops delivery', () => {
    let count = 0;
    const unsub = eventBus.subscribe('unsub.test', () => count++);

    eventBus.publish(makeEvent({ type: 'unsub.test' }));
    expect(count).toBe(1);

    unsub();
    eventBus.publish(makeEvent({ type: 'unsub.test' }));
    expect(count).toBe(1);
  });

  test('multiple event types are independent', () => {
    const aEvents: NimbusEvent[] = [];
    const bEvents: NimbusEvent[] = [];

    eventBus.subscribe('type-a', (e) => aEvents.push(e));
    eventBus.subscribe('type-b', (e) => bEvents.push(e));

    eventBus.publish(makeEvent({ type: 'type-a' }));
    eventBus.publish(makeEvent({ type: 'type-b' }));
    eventBus.publish(makeEvent({ type: 'type-a' }));

    expect(aEvents).toHaveLength(2);
    expect(bEvents).toHaveLength(1);
  });

  test('async handlers are invoked', async () => {
    let resolved = false;
    eventBus.subscribe('async.event', async () => {
      await new Promise((r) => setTimeout(r, 10));
      resolved = true;
    });

    eventBus.publish(makeEvent({ type: 'async.event' }));
    // Give the async handler time to complete
    await new Promise((r) => setTimeout(r, 50));
    expect(resolved).toBe(true);
  });

  test('removeAllListeners clears specific event type', () => {
    let aCount = 0;
    let bCount = 0;

    eventBus.subscribe('rm-a', () => aCount++);
    eventBus.subscribe('rm-b', () => bCount++);

    eventBus.removeAllListeners('rm-a');

    eventBus.publish(makeEvent({ type: 'rm-a' }));
    eventBus.publish(makeEvent({ type: 'rm-b' }));

    expect(aCount).toBe(0);
    expect(bCount).toBe(1);
  });

  test('removeAllListeners without args clears everything', () => {
    let count = 0;
    eventBus.subscribe('all-1', () => count++);
    eventBus.subscribe('all-2', () => count++);

    eventBus.removeAllListeners();

    eventBus.publish(makeEvent({ type: 'all-1' }));
    eventBus.publish(makeEvent({ type: 'all-2' }));

    expect(count).toBe(0);
  });
});
