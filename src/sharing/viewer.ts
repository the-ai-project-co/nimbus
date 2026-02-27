/**
 * Minimal HTML viewer for shared sessions.
 *
 * Generates a standalone HTML page that can be served by nimbus serve
 * for viewing shared sessions when the Web UI is not available.
 */

import type { SharedSession } from './sync';

/**
 * Generate a standalone HTML page for viewing a shared session.
 */
export function generateShareViewer(shared: SharedSession): string {
  const messagesHtml = shared.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      const isUser = m.role === 'user';
      const bgColor = isUser ? '#3b82f6' : '#1e293b';
      const align = isUser ? 'flex-end' : 'flex-start';
      const content =
        typeof m.content === 'string'
          ? escapeHtml(m.content)
          : escapeHtml(JSON.stringify(m.content));

      return `
        <div style="display:flex;justify-content:${align};margin:8px 0">
          <div style="max-width:75%;padding:12px 16px;border-radius:16px;background:${bgColor};color:#e2e8f0;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word">
            ${content}
          </div>
        </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nimbus Session: ${escapeHtml(shared.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0e1a;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
    }
    .header {
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo { color: #22d3ee; font-weight: bold; font-size: 18px; }
    .title { color: #94a3b8; font-size: 14px; }
    .meta { color: #64748b; font-size: 12px; margin-left: auto; }
    .messages { max-width: 800px; margin: 0 auto; padding: 24px; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 9999px;
      font-size: 11px; font-weight: 500; background: rgba(34,211,238,0.1);
      color: #22d3ee; border: 1px solid rgba(34,211,238,0.2);
    }
    .footer {
      border-top: 1px solid rgba(255,255,255,0.1);
      padding: 16px 24px; text-align: center;
      color: #64748b; font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="logo">Nimbus</span>
    <span class="title">${escapeHtml(shared.name)}</span>
    <span class="badge">${escapeHtml(shared.mode)}</span>
    ${shared.isLive ? '<span class="badge" style="background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.2)">LIVE</span>' : ''}
    <span class="meta">${shared.model} &bull; $${shared.costUSD.toFixed(4)} &bull; ${shared.tokenCount.toLocaleString()} tokens</span>
  </div>
  <div class="messages">
    ${messagesHtml}
  </div>
  <div class="footer">
    Shared via Nimbus &bull; Created ${new Date(shared.createdAt).toLocaleString()} &bull; Expires ${new Date(shared.expiresAt).toLocaleString()}
  </div>
</body>
</html>`;
}

/** Escape HTML special characters. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
