/**
 * Team NIMBUS.md Distribution (L6)
 *
 * Share project context files with team members.
 *
 *   nimbus team-context push     — share current NIMBUS.md via sharing service
 *   nimbus team-context pull <url> — download NIMBUS.md, show diff, prompt before overwrite
 *
 * Also supports NIMBUS_INSTRUCTIONS_URL env var: on startup, fetch that URL
 * and use as NIMBUS.md if local file not present.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ui } from '../wizard/ui';

const NIMBUS_MD_PATHS = [
  path.join(process.cwd(), 'NIMBUS.md'),
  path.join(process.cwd(), '.nimbus', 'NIMBUS.md'),
];

function findLocalNimbusMd(): string | null {
  for (const p of NIMBUS_MD_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function computeDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const old = oldLines[i];
    const newLine = newLines[i];
    if (old === undefined) {
      lines.push(`+ ${newLine}`);
    } else if (newLine === undefined) {
      lines.push(`- ${old}`);
    } else if (old !== newLine) {
      lines.push(`- ${old}`);
      lines.push(`+ ${newLine}`);
    }
  }
  return lines.join('\n');
}

/** Path to the team.md file in the current project's .nimbus/ directory */
const TEAM_MD_PATH = path.join(process.cwd(), '.nimbus', 'team.md');

/** Regex to strip lines containing sensitive info */
const SENSITIVE_PATTERN = /SENSITIVE:/i;

/** Strip lines containing "SENSITIVE:" from NIMBUS.md before sharing */
function stripSensitiveLines(content: string): string {
  return content
    .split('\n')
    .filter(line => !SENSITIVE_PATTERN.test(line))
    .join('\n');
}

/**
 * Merge non-duplicate sections from teamContent into localContent.
 * Sections are identified by Markdown headings (## ...).
 */
function mergeSections(localContent: string, teamContent: string): string {
  // Split into sections by heading
  const sectionRegex = /(?=^#{1,3} .+$)/m;
  const localSections = localContent.split(sectionRegex);
  const teamSections = teamContent.split(sectionRegex);

  const localHeadings = new Set(
    localSections
      .map(s => s.match(/^(#{1,3} .+)$/m)?.[1]?.trim())
      .filter(Boolean)
  );

  const newSections = teamSections.filter(s => {
    const heading = s.match(/^(#{1,3} .+)$/m)?.[1]?.trim();
    return heading && !localHeadings.has(heading);
  });

  if (newSections.length === 0) return localContent;

  const merged = localContent.trimEnd() + '\n\n' + newSections.join('\n').trimStart();
  return merged;
}

export async function teamContextCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'push': {
      // Git-based push: read NIMBUS.md, strip SENSITIVE lines, write to .nimbus/team.md
      const localPath = findLocalNimbusMd();
      if (!localPath) {
        ui.warning('No NIMBUS.md found in current directory. Run `nimbus init` first.');
        return;
      }

      const content = fs.readFileSync(localPath, 'utf-8');
      const sanitized = stripSensitiveLines(content);

      // Ensure .nimbus/ directory exists
      const nimbusDir = path.dirname(TEAM_MD_PATH);
      if (!fs.existsSync(nimbusDir)) {
        fs.mkdirSync(nimbusDir, { recursive: true });
      }

      fs.writeFileSync(TEAM_MD_PATH, sanitized, 'utf-8');
      ui.print(`${ui.color('✓', 'green')} Written sanitized context to ${TEAM_MD_PATH}`);
      ui.dim(`Removed all lines containing "SENSITIVE:"`);
      ui.newLine();

      // Stage the file with git
      try {
        const { execFileSync } = await import('node:child_process');
        execFileSync('git', ['add', TEAM_MD_PATH], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10_000,
        });
        ui.print(`${ui.color('✓', 'green')} Staged .nimbus/team.md with git`);
        ui.print('  Next step: git commit -m "chore: update team context" && git push');
      } catch {
        ui.dim('(git stage skipped — not a git repo or git not in PATH)');
        ui.print('  Copy .nimbus/team.md to your repository and commit/push it manually.');
      }

      ui.newLine();
      ui.info('Note: Add .nimbus/team.md to version control (do NOT add .nimbus/team.md to .gitignore).');
      ui.dim('Add NIMBUS.md to .gitignore if it contains sensitive local config.');
      break;
    }

    case 'pull': {
      // Git-based pull: read .nimbus/team.md from cwd, diff, merge
      if (!fs.existsSync(TEAM_MD_PATH)) {
        ui.error(`.nimbus/team.md not found in ${process.cwd()}`);
        ui.dim('Run `git pull` to fetch the latest team context, then re-run this command.');
        return;
      }

      const teamContent = fs.readFileSync(TEAM_MD_PATH, 'utf-8');
      const targetPath = NIMBUS_MD_PATHS[0];
      const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : null;

      if (existing) {
        const diff = computeDiff(existing, teamContent);
        if (!diff) {
          ui.info('NIMBUS.md is already up to date with team.md.');
          return;
        }

        ui.header('NIMBUS.md vs .nimbus/team.md diff');
        for (const line of diff.split('\n')) {
          if (line.startsWith('+')) {
            ui.print(ui.color(line, 'green'));
          } else if (line.startsWith('-')) {
            ui.print(ui.color(line, 'red'));
          } else {
            ui.print(line);
          }
        }
        ui.newLine();

        // Prompt for confirmation
        const { input: inputPrompt } = await import('../wizard/prompts');
        const answer = await inputPrompt({
          message: 'Merge new sections from team.md into NIMBUS.md? [y/N]',
          defaultValue: 'N',
        });
        if (answer.toLowerCase() !== 'y') {
          ui.info('Aborted — NIMBUS.md not changed.');
          return;
        }

        // Merge: append non-duplicate sections
        const merged = mergeSections(existing, teamContent);
        fs.writeFileSync(targetPath, merged, 'utf-8');
        ui.print(`${ui.color('✓', 'green')} Merged team context into ${targetPath}`);
      } else {
        // No local NIMBUS.md — use team.md as starting point
        fs.writeFileSync(targetPath, teamContent, 'utf-8');
        ui.print(`${ui.color('✓', 'green')} Created ${targetPath} from .nimbus/team.md`);
      }

      ui.newLine();
      ui.dim('Note: Add NIMBUS.md to .gitignore to keep local config private.');
      ui.dim('Add .nimbus/team.md to version control to share project context with team.');
      break;
    }

    default:
      ui.print('Usage: nimbus team-context <push|pull>');
      ui.print('');
      ui.print('  push   Strip SENSITIVE: lines from NIMBUS.md, write to .nimbus/team.md, and git add');
      ui.print('  pull   Read .nimbus/team.md, diff against NIMBUS.md, merge on confirmation');
  }
}

/**
 * Fetch NIMBUS.md from NIMBUS_INSTRUCTIONS_URL env var.
 * Called on startup when no local NIMBUS.md exists.
 */
export async function fetchRemoteNimbusMd(): Promise<string | null> {
  const url = process.env.NIMBUS_INSTRUCTIONS_URL;
  if (!url) return null;

  const localPath = findLocalNimbusMd();
  if (localPath) return null; // local file takes priority

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
