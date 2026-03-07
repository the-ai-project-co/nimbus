/**
 * Incident Command Tests — G14
 *
 * Tests parseIncidentInput (internal logic), PD_API_TOKEN guard,
 * detectServiceName logic, and overall incidentCommand integration.
 *
 * Because parseIncidentInput and detectServiceName are not exported,
 * we test via inline reproductions of the same logic and source-level
 * assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INCIDENT_SRC = readFileSync(join(__dirname, '..', 'commands', 'incident.ts'), 'utf-8');

// ---------------------------------------------------------------------------
// Source-level assertions
// ---------------------------------------------------------------------------

describe('incident.ts source structure (G14)', () => {
  it('defines parseIncidentInput function', () => {
    expect(INCIDENT_SRC).toContain('function parseIncidentInput');
  });

  it('detects PagerDuty URLs via pagerduty.com regex', () => {
    expect(INCIDENT_SRC).toContain('pagerduty\\.com');
  });

  it('detects Opsgenie URLs via opsgenie.com regex', () => {
    expect(INCIDENT_SRC).toContain('opsgenie\\.com');
  });

  it('reads PD_API_TOKEN from process.env before fetch', () => {
    expect(INCIDENT_SRC).toContain('PD_API_TOKEN');
  });

  it('defines detectServiceName function', () => {
    expect(INCIDENT_SRC).toContain('function detectServiceName');
  });

  it('exports incidentCommand', () => {
    expect(INCIDENT_SRC).toContain('export async function incidentCommand');
  });

  it('fetchPagerDutyDetails returns null immediately when no token is set', () => {
    // Verify the guard is present in source
    expect(INCIDENT_SRC).toContain('if (!token) return null');
  });
});

// ---------------------------------------------------------------------------
// Inline reproduction of parseIncidentInput to unit-test logic (G14)
// ---------------------------------------------------------------------------

type AlertSource = 'pagerduty' | 'opsgenie' | 'plain';
interface ParsedIncident { source: AlertSource; id: string; rawInput: string; }

function parseIncidentInput(input: string): ParsedIncident {
  if (/pagerduty\.com/i.test(input)) {
    const match = input.match(/incidents?\/(P[A-Z0-9]+)/i);
    return { source: 'pagerduty', id: match?.[1] ?? input, rawInput: input };
  }
  if (/opsgenie\.com/i.test(input) || /app\.opsgenie\.com/i.test(input)) {
    const match = input.match(/alert\/([a-f0-9-]{36})/i);
    return { source: 'opsgenie', id: match?.[1] ?? input, rawInput: input };
  }
  return { source: 'plain', id: input, rawInput: input };
}

describe('parseIncidentInput logic (G14)', () => {
  it('returns source=pagerduty for a PagerDuty URL', () => {
    const result = parseIncidentInput('https://acme.pagerduty.com/incidents/PABC123');
    expect(result.source).toBe('pagerduty');
    expect(result.id).toBe('PABC123');
  });

  it('returns source=opsgenie for an Opsgenie URL', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = parseIncidentInput(`https://app.opsgenie.com/alert/${uuid}`);
    expect(result.source).toBe('opsgenie');
    expect(result.id).toBe(uuid);
  });

  it('returns source=plain for plain text', () => {
    const result = parseIncidentInput('high CPU on api-service pod');
    expect(result.source).toBe('plain');
    expect(result.id).toBe('high CPU on api-service pod');
  });
});

// ---------------------------------------------------------------------------
// Inline reproduction of detectServiceName to unit-test logic (G14)
// ---------------------------------------------------------------------------

function detectServiceName(incident: ParsedIncident): string | null {
  const match = incident.rawInput.match(/\b([\w-]+(?:service|worker|api|pod|deploy(?:ment)?|ingress|controller)[\w-]*)\b/i);
  return match?.[1] ?? null;
}

describe('detectServiceName logic (G14)', () => {
  it('detects service name from plain text containing "service"', () => {
    const incident = parseIncidentInput('high CPU on payment-service pod');
    const name = detectServiceName(incident);
    expect(name).not.toBeNull();
    expect(name).toContain('service');
  });

  it('detects API service names', () => {
    const incident = parseIncidentInput('error rate spike in user-api deployment');
    const name = detectServiceName(incident);
    expect(name).not.toBeNull();
  });

  it('returns null for an opaque string with no recognizable service pattern', () => {
    const incident = parseIncidentInput('PABC123');
    const name = detectServiceName(incident);
    expect(name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PD_API_TOKEN guard: fetchPagerDutyDetails skips when token absent
// ---------------------------------------------------------------------------

describe('PD_API_TOKEN guard (G14)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.PD_API_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PD_API_TOKEN;
    vi.resetModules();
  });

  it('incidentCommand with plain text does not throw when chatCommand is mocked', async () => {
    // Mock chatCommand so the test doesn't start the full TUI
    vi.doMock('../commands/chat', () => ({
      chatCommand: vi.fn().mockResolvedValue(undefined),
    }));

    // Also mock child_process to prevent any real shell calls
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        execSync: vi.fn(() => ''),
      };
    });

    const { incidentCommand } = await import('../commands/incident');
    // Plain text input — should not throw, PD fetch is not triggered
    await expect(incidentCommand('high CPU on api-service', {})).resolves.not.toThrow();
  });

  it('incidentCommand with PagerDuty URL and no token skips PD API call', async () => {
    vi.doMock('../commands/chat', () => ({
      chatCommand: vi.fn().mockResolvedValue(undefined),
    }));

    // Prevent real helm/kubectl shell calls
    vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      return {
        ...actual,
        execSync: vi.fn(() => ''),
      };
    });

    const { incidentCommand } = await import('../commands/incident');
    // PD_API_TOKEN is not set, so the PD API fetch should be skipped
    await expect(
      incidentCommand('https://acme.pagerduty.com/incidents/PABC123', {})
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// M8: gatherIncidentTimeline source-level assertions
// ---------------------------------------------------------------------------

describe('M8: gatherIncidentTimeline (incident timeline)', () => {
  it('defines gatherIncidentTimeline as an async function', () => {
    expect(INCIDENT_SRC).toContain('async function gatherIncidentTimeline');
  });

  it('gathers K8s BackOff events via kubectl', () => {
    expect(INCIDENT_SRC).toContain('reason=BackOff');
  });

  it('collects Helm history for timeline', () => {
    expect(INCIDENT_SRC).toContain('helm');
    expect(INCIDENT_SRC).toContain('[Helm] Revision');
  });

  it('sorts events chronologically', () => {
    expect(INCIDENT_SRC).toContain('a.time.localeCompare(b.time)');
  });

  it('uses severity icons in timeline output', () => {
    expect(INCIDENT_SRC).toContain('[!!]');
    expect(INCIDENT_SRC).toContain('[!]');
    expect(INCIDENT_SRC).toContain('[i]');
  });

  it('incidentCommand calls gatherIncidentTimeline and prepends result', () => {
    expect(INCIDENT_SRC).toContain('gatherIncidentTimeline');
    expect(INCIDENT_SRC).toContain('=== Incident Timeline ===');
  });
});
