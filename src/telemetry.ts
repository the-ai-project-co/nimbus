/**
 * Telemetry Module
 *
 * Thin wrapper around the PostHog analytics client (src/utils/analytics.ts).
 * Reads the user's opt-in preference from ~/.nimbus/config.json and only
 * forwards events when telemetry is explicitly enabled.
 *
 * Every exported function is guaranteed to never throw -- callers do not
 * need try-catch around telemetry calls (though several already have it).
 */

import { analytics } from './utils/analytics';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

interface TelemetryConfig {
  enabled?: boolean;
  anonymousId?: string;
}

/**
 * Read the telemetry section from ~/.nimbus/config.json.
 * Returns `{ enabled: false }` on any error so the default is always off.
 */
function readTelemetryConfig(): TelemetryConfig {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('node:path');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { homedir } = require('os');
    const configPath = path.join(homedir(), '.nimbus', 'config.json');

    if (!fs.existsSync(configPath)) {
      return { enabled: false };
    }

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return raw?.telemetry ?? { enabled: false };
  } catch {
    return { enabled: false };
  }
}

// Cache the config for the lifetime of the process so we only read the
// filesystem once.  The user would need to restart nimbus after toggling
// telemetry anyway, so a stale value is acceptable.
let _cachedConfig: TelemetryConfig | null = null;

function getConfig(): TelemetryConfig {
  if (_cachedConfig === null) {
    _cachedConfig = readTelemetryConfig();
  }
  return _cachedConfig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track an IaC generation event (terraform apply, k8s apply, helm install, etc.).
 *
 * @param type  - A short identifier for the generation kind, e.g. "terraform-apply"
 * @param tags  - Freeform tags for categorisation, e.g. ["terraform"]
 */
export function trackGeneration(type: string, tags: string[]): void {
  try {
    const config = getConfig();
    if (!config.enabled) {
      return;
    }

    // Fire-and-forget -- analytics.trackEvent already swallows errors.
    analytics.trackEvent('generation', {
      type,
      tags,
      userId: config.anonymousId,
    });
  } catch {
    // Absolutely never throw from telemetry.
  }
}

/**
 * Track a generic named event with optional properties.
 *
 * @param name        - The event name, e.g. "analysis_completed"
 * @param properties  - Arbitrary key/value metadata
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  try {
    const config = getConfig();
    if (!config.enabled) {
      return;
    }

    analytics.trackEvent(name, {
      ...properties,
      userId: config.anonymousId,
    });
  } catch {
    // Absolutely never throw from telemetry.
  }
}
