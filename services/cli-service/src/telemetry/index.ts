/**
 * Telemetry Module
 *
 * Opt-in anonymous usage telemetry stored locally and optionally sent to PostHog.
 */

import { randomUUID } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'os';

interface TelemetryEvent {
  timestamp: string;
  anonymousId: string;
  event: string;
  properties?: Record<string, unknown>;
}

const NIMBUS_DIR = path.join(homedir(), '.nimbus');
const TELEMETRY_FILE = path.join(NIMBUS_DIR, 'telemetry.jsonl');
const CONFIG_FILE = path.join(NIMBUS_DIR, 'config.json');

let cachedAnonymousId: string | null = null;
let posthogClient: any = null;

/**
 * Initialize PostHog client if API key is available
 */
function initializePostHog(): void {
  if (posthogClient) return;

  try {
    const apiKey = process.env.POSTHOG_API_KEY || getPostHogConfig()?.posthogApiKey;
    if (!apiKey) return;

    const host = process.env.POSTHOG_HOST || getPostHogConfig()?.posthogHost;

    // Dynamic import to avoid hard dependency
    try {
      const { PostHog } = require('posthog-node');
      posthogClient = new PostHog(apiKey, {
        ...(host ? { host } : {}),
        flushAt: 10,
        flushInterval: 30000,
      });
    } catch {
      // posthog-node not available, skip
    }
  } catch {
    // Silently fail
  }
}

/**
 * Get PostHog config from config file
 */
function getPostHogConfig(): { posthogApiKey?: string; posthogHost?: string } | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return config?.telemetry || null;
  } catch {
    return null;
  }
}

/**
 * Check if telemetry is enabled
 */
export function isEnabled(): boolean {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return false;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return config?.telemetry?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Get or create an anonymous ID
 */
function getAnonymousId(): string {
  if (cachedAnonymousId) return cachedAnonymousId;

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config?.telemetry?.anonymousId) {
        cachedAnonymousId = config.telemetry.anonymousId;
        return cachedAnonymousId!;
      }
    }
  } catch {
    // Ignore parse errors
  }

  cachedAnonymousId = randomUUID();
  return cachedAnonymousId;
}

/**
 * Track a telemetry event (written to .nimbus/telemetry.jsonl and PostHog if configured)
 */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (!isEnabled()) return;

  try {
    // Ensure directory exists
    if (!fs.existsSync(NIMBUS_DIR)) {
      fs.mkdirSync(NIMBUS_DIR, { recursive: true });
    }

    const anonymousId = getAnonymousId();

    const telemetryEvent: TelemetryEvent = {
      timestamp: new Date().toISOString(),
      anonymousId,
      event,
      properties,
    };

    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(telemetryEvent) + '\n');

    // Send to PostHog if initialized
    initializePostHog();
    posthogClient?.capture({
      distinctId: anonymousId,
      event,
      properties,
    });
  } catch {
    // Silently fail - telemetry should never break the CLI
  }
}

/**
 * Track a CLI command invocation
 */
export function trackCommand(command: string, args?: string[]): void {
  trackEvent('command_invoked', {
    command,
    argCount: args?.length ?? 0,
    isDemo: process.env.NIMBUS_DEMO_MODE === 'true',
  });
}

/**
 * Track an error occurrence
 */
export function trackError(command: string, errorType: string): void {
  trackEvent('error_occurred', {
    command,
    errorType,
  });
}

/**
 * Track infrastructure generation
 */
export function trackGeneration(type: string, components: string[]): void {
  trackEvent('generation_completed', {
    type,
    componentCount: components.length,
    components,
  });
}

/**
 * Shutdown telemetry and flush pending events
 */
export async function shutdown(): Promise<void> {
  try {
    await posthogClient?.shutdown();
  } catch {
    // Silently fail
  }
}
