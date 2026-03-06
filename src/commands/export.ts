/**
 * Export Command (G19)
 *
 * Export session conversations to markdown, HTML, or JSON.
 *
 * Usage:
 *   nimbus export                        # most recent session → stdout (md)
 *   nimbus export <session-id>           # specific session
 *   nimbus export --format html          # HTML output
 *   nimbus export --format json          # JSON output
 *   nimbus export --output report.md     # save to file
 */

import { writeFileSync } from 'node:fs';

export interface ExportOptions {
  format?: 'md' | 'html' | 'json';
  output?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function messageToMarkdown(role: string, content: string): string {
  const label = role === 'user' ? '**User**' : role === 'assistant' ? '**Agent**' : `*[${role}]*`;
  return `${label}:\n${content}\n`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function exportCommand(options: ExportOptions = {}): Promise<void> {
  const format = options.format ?? 'md';

  // Load session manager + conversation
  let conversation: Array<{ role: string; content: string; timestamp?: Date }> = [];
  let sessionMeta: { id: string; name?: string; model?: string; mode?: string; createdAt?: string } = { id: 'unknown' };

  try {
    const { SessionManager } = await import('../sessions/manager');
    const sm = SessionManager.getInstance();
    const sessions = sm.list();

    // Find the target session
    let targetSession = sessions.find(s =>
      options.sessionId && (s.id === options.sessionId || s.id.startsWith(options.sessionId))
    ) ?? sessions[0];

    if (!targetSession) {
      console.error('No sessions found. Run "nimbus chat" first to create a session.');
      process.exit(1);
    }

    sessionMeta = {
      id: targetSession.id,
      name: targetSession.name,
      model: targetSession.model,
      mode: targetSession.mode,
      createdAt: targetSession.createdAt,
    };

    const messages = sm.loadConversation(targetSession.id);
    conversation = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((b: unknown) => {
              if (typeof b === 'string') return b;
              if (b && typeof b === 'object' && 'text' in b) return (b as { text: string }).text;
              return '';
            }).join('')
          : String(m.content ?? ''),
      }));
  } catch (err) {
    console.error(`Failed to load session: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Generate output
  let output = '';

  if (format === 'json') {
    output = JSON.stringify({ session: sessionMeta, messages: conversation }, null, 2);
  } else if (format === 'html') {
    output = buildHtml(sessionMeta, conversation);
  } else {
    // Default: markdown
    output = buildMarkdown(sessionMeta, conversation);
  }

  // Output to file or stdout
  if (options.output) {
    writeFileSync(options.output, output, 'utf-8');
    console.log(`Exported to: ${options.output}`);
  } else {
    process.stdout.write(output);
  }
}

function buildMarkdown(
  meta: { id: string; name?: string; model?: string; mode?: string; createdAt?: string },
  conversation: Array<{ role: string; content: string }>
): string {
  const lines: string[] = [
    `# Nimbus Session Export`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Session ID | ${meta.id} |`,
    `| Name | ${meta.name ?? 'N/A'} |`,
    `| Model | ${meta.model ?? 'N/A'} |`,
    `| Mode | ${meta.mode ?? 'N/A'} |`,
    `| Created | ${meta.createdAt ?? new Date().toISOString()} |`,
    ``,
    `---`,
    ``,
    `## Conversation`,
    ``,
  ];

  for (const msg of conversation) {
    lines.push(messageToMarkdown(msg.role, msg.content));
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function buildHtml(
  meta: { id: string; name?: string; model?: string; mode?: string; createdAt?: string },
  conversation: Array<{ role: string; content: string }>
): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const msgs = conversation.map(m => {
    const isUser = m.role === 'user';
    const bg = isUser ? '#3b82f6' : '#1e293b';
    const align = isUser ? 'flex-end' : 'flex-start';
    return `<div style="display:flex;justify-content:${align};margin:8px 0"><div style="max-width:75%;padding:12px 16px;border-radius:16px;background:${bg};color:#e2e8f0;font-size:14px;line-height:1.6;white-space:pre-wrap">${escape(m.content)}</div></div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nimbus Session Export — ${escape(meta.id)}</title></head><body style="background:#0f172a;color:#e2e8f0;font-family:monospace;padding:24px"><h2>Nimbus Session: ${escape(meta.name ?? meta.id)}</h2><p>Model: ${escape(meta.model ?? 'N/A')} | Mode: ${escape(meta.mode ?? 'N/A')} | Created: ${escape(meta.createdAt ?? '')}</p><div>${msgs}</div></body></html>`;
}
