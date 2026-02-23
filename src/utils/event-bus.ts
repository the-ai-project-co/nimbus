import { EventEmitter } from 'node:events';

export interface NimbusEvent {
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export type EventHandler = (event: NimbusEvent) => void | Promise<void>;

class NimbusEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  publish(event: NimbusEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    this.emitter.on(eventType, handler);
    return () => this.emitter.off(eventType, handler);
  }

  once(eventType: string, handler: EventHandler): void {
    this.emitter.once(eventType, handler);
  }

  removeAllListeners(eventType?: string): void {
    this.emitter.removeAllListeners(eventType);
  }
}

export const eventBus = new NimbusEventBus();
