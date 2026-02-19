/**
 * PostHog Analytics Integration
 *
 * Lightweight analytics wrapper that sends events to PostHog.
 * Operates as a complete no-op when POSTHOG_API_KEY is not set,
 * ensuring zero overhead in development and self-hosted deployments.
 *
 * All calls are fire-and-forget: errors are silently swallowed so that
 * analytics never interfere with the primary application flow.
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

  /** Whether analytics collection is active (API key is configured). */
  get enabled(): boolean {
    return !!this.apiKey;
  }

  /**
   * Track a named event with optional properties.
   *
   * If `properties.userId` is provided it is used as the distinct_id;
   * otherwise the event is attributed to "anonymous".
   */
  async trackEvent(event: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;

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

  /**
   * Identify a user so that subsequent events can be correlated.
   */
  async identifyUser(userId: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;

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

/** Singleton analytics instance for the entire application. */
export const analytics = new Analytics();
