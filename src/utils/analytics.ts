/**
 * PostHog Analytics Integration
 *
 * Lightweight analytics wrapper that sends events to PostHog.
 * Operates as a complete no-op when POSTHOG_API_KEY is not set.
 */

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
}

export class Analytics {
  private apiKey: string | undefined;
  private host: string;

  constructor() {
    this.apiKey = process.env.POSTHOG_API_KEY;
    this.host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async trackEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await fetch(`${this.host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          event,
          properties: {
            ...properties,
            timestamp: new Date().toISOString(),
          },
          distinct_id: properties?.userId || 'anonymous',
        }),
      });
    } catch {
      // Fire-and-forget -- never throw from analytics
    }
  }

  async identifyUser(userId: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await fetch(`${this.host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          event: '$identify',
          distinct_id: userId,
          properties,
        }),
      });
    } catch {
      // Fire-and-forget
    }
  }
}

export const analytics = new Analytics();
