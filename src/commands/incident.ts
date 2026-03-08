/**
 * Incident Command (G14)
 *
 * Pre-loads incident context (PagerDuty/Opsgenie alert, recent deployments,
 * pod logs) and launches a focused TUI agent session.
 *
 * Usage:
 *   nimbus incident <pagerduty-url-or-id> [--notes "observed behavior"]
 *   nimbus incident "high CPU on api-service pod"
 */

import { execSync } from 'node:child_process';

export interface IncidentOptions {
  notes?: string;
  autoApprove?: boolean;
}

type AlertSource = 'pagerduty' | 'opsgenie' | 'plain';

interface ParsedIncident {
  source: AlertSource;
  id: string;
  rawInput: string;
}

/**
 * Detect incident source from URL or plain text.
 */
function parseIncidentInput(input: string): ParsedIncident {
  if (/pagerduty\.com/i.test(input)) {
    const match = input.match(/incidents?\/(P[A-Z0-9]+)/i);
    return { source: 'pagerduty', id: match?.[1] ?? input, rawInput: input };
  }
  if (/opsgenie\.com/i.test(input) || /app\.opsgenie\.com/i.test(input)) {
    const match = input.match(/alert\/([a-f0-9-]{36})/i);
    return { source: 'opsgenie', id: match?.[1] ?? input, rawInput: input };
  }
  // Plain text description — use as-is
  return { source: 'plain', id: input, rawInput: input };
}

/**
 * Attempt to fetch PagerDuty incident details via API (if PD_API_TOKEN is set).
 */
async function fetchPagerDutyDetails(incidentId: string): Promise<string | null> {
  const token = process.env.PD_API_TOKEN;
  if (!token) return null;
  try {
    const curlCmd = `curl -sf -H "Authorization: Token token=${token}" -H "Accept: application/vnd.pagerduty+json;version=2" "https://api.pagerduty.com/incidents/${incidentId}"`;
    const output = execSync(curlCmd, { encoding: 'utf-8', timeout: 10_000 });
    const data = JSON.parse(output) as { incident?: { title?: string; service?: { summary?: string }; urgency?: string; status?: string; created_at?: string } };
    if (data.incident) {
      const inc = data.incident;
      return [
        `Title: ${inc.title ?? 'N/A'}`,
        `Service: ${inc.service?.summary ?? 'N/A'}`,
        `Urgency: ${inc.urgency ?? 'N/A'}`,
        `Status: ${inc.status ?? 'N/A'}`,
        `Created: ${inc.created_at ?? 'N/A'}`,
      ].join('\n');
    }
  } catch {
    // Non-critical — API fetch failure should not block the incident session
  }
  return null;
}

/**
 * Try to detect the service name from the incident description.
 */
function detectServiceName(incident: ParsedIncident): string | null {
  // Common patterns: "api-service", "payment-worker", "nginx deployment"
  const match = incident.rawInput.match(/\b([\w-]+(?:service|worker|api|pod|deploy(?:ment)?|ingress|controller)[\w-]*)\b/i);
  return match?.[1] ?? null;
}

/**
 * Get last 3 Helm releases for a service (best-effort).
 */
function getRecentHelmHistory(serviceName: string): string {
  try {
    const out = execSync(`helm history ${serviceName} --max 3 --output json 2>/dev/null`, {
      encoding: 'utf-8', timeout: 10_000,
    });
    const history = JSON.parse(out) as Array<{ revision: number; updated: string; status: string; chart: string; description: string }>;
    if (history.length === 0) return '';
    const lines = history.map(h => `  Rev ${h.revision}: ${h.chart} [${h.status}] ${h.updated} — ${h.description}`);
    return `\nRecent Helm releases for ${serviceName}:\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}

/**
 * Get recent pod logs for a service (best-effort).
 */
function getRecentPodLogs(serviceName: string): string {
  try {
    const out = execSync(
      `kubectl logs -l app=${serviceName} --tail=50 --since=30m --all-containers 2>/dev/null | head -c 4096`,
      { encoding: 'utf-8', timeout: 15_000 }
    );
    if (!out.trim()) return '';
    return `\nRecent pod logs (last 30m, ${serviceName}):\n${out.trim()}`;
  } catch {
    return '';
  }
}

/** M8: Gather incident timeline from multiple sources. */
async function gatherIncidentTimeline(options: {
  namespace?: string;
  since?: string;
}): Promise<string> {
  const { execFileSync } = await import('node:child_process');
  const events: Array<{ time: string; event: string; severity: 'info' | 'warning' | 'critical' }> = [];

  const run = (cmd: string, args: string[]): string => {
    try {
      return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch { return ''; }
  };

  // K8s pod restart events
  const ns = options.namespace ? ['-n', options.namespace] : ['-A'];
  const k8sEvents = run('kubectl', ['get', 'events', ...ns, '--field-selector=reason=BackOff', '--sort-by=.lastTimestamp', '--no-headers']);
  if (k8sEvents) {
    for (const line of k8sEvents.split('\n').slice(0, 10)) {
      if (line.trim()) events.push({ time: new Date().toISOString(), event: `[K8s] ${line.trim()}`, severity: 'warning' });
    }
  }

  // Helm history
  const helmHistory = run('helm', ['history', '--max=5', '--output=json', options.namespace ?? 'default']);
  if (helmHistory) {
    try {
      const hist = JSON.parse(helmHistory) as Array<{ updated: string; status: string; description: string; revision: number }>;
      for (const h of hist) {
        events.push({ time: h.updated, event: `[Helm] Revision ${h.revision}: ${h.status} — ${h.description}`, severity: h.status.includes('FAIL') ? 'critical' : 'info' });
      }
    } catch { /* ignore */ }
  }

  if (events.length === 0) return '';

  events.sort((a, b) => a.time.localeCompare(b.time));
  const timeline = events.map(e => {
    const icon = e.severity === 'critical' ? '[!!]' : e.severity === 'warning' ? '[!]' : '[i]';
    return `${icon} ${e.time.slice(0, 19).replace('T', ' ')} ${e.event}`;
  }).join('\n');

  return `\n=== Incident Timeline ===\n${timeline}\n=========================\n`;
}

/**
 * Run the incident command — builds incident context and launches the agent.
 */
export async function incidentCommand(
  incidentInput: string,
  options: IncidentOptions = {}
): Promise<void> {
  if (!incidentInput) {
    console.error('Usage: nimbus incident <pagerduty-url-or-id|description> [--notes "observed behavior"]');
    process.exit(1);
  }

  const incident = parseIncidentInput(incidentInput);
  const contextParts: string[] = ['# Incident Response Session'];

  // PD API details
  if (incident.source === 'pagerduty') {
    console.log(`Fetching PagerDuty incident ${incident.id}...`);
    const pdDetails = await fetchPagerDutyDetails(incident.id);
    if (pdDetails) {
      contextParts.push(`\n## PagerDuty Alert (${incident.id})\n${pdDetails}`);
    } else {
      contextParts.push(`\n## Alert\nPagerDuty incident: ${incident.id}`);
      if (!process.env.PD_API_TOKEN) {
        contextParts.push('(Set PD_API_TOKEN env var to fetch full alert details)');
      }
    }
  } else if (incident.source === 'opsgenie') {
    contextParts.push(`\n## Alert\nOpsgenie incident: ${incident.id}`);
  } else {
    contextParts.push(`\n## Alert\n${incident.rawInput}`);
  }

  // Notes
  if (options.notes) {
    contextParts.push(`\n## Observed Behavior\n${options.notes}`);
  }

  // Service auto-detection + recent history
  const serviceName = detectServiceName(incident);
  if (serviceName) {
    contextParts.push(`\n## Detected Service: ${serviceName}`);
    const helmHistory = getRecentHelmHistory(serviceName);
    if (helmHistory) contextParts.push(helmHistory);
    const podLogs = getRecentPodLogs(serviceName);
    if (podLogs) contextParts.push(podLogs);
  }

  contextParts.push('\n## Your Task\nHelp resolve this incident. Start by diagnosing root cause from the context above, then suggest and (with permission) execute remediation steps.');

  // M8: Gather incident timeline from K8s events and Helm history
  const timeline = await gatherIncidentTimeline({ namespace: undefined, since: undefined });
  if (timeline) {
    contextParts.push(timeline);
  }

  const initialPrompt = contextParts.join('\n');

  // Launch the TUI chat session with the pre-loaded incident prompt
  const { chatCommand } = await import('./chat');
  await chatCommand({ initialPrompt, mode: 'deploy' });
}
