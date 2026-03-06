/**
 * Shell Completion Auto-Installer (L7)
 *
 * Installs shell completions for bash, zsh, and fish.
 * Completion scripts are generated dynamically from the CLI command list.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ui } from '../wizard/ui';

const COMMANDS = [
  'chat', 'run', 'init', 'login', 'logout', 'doctor', 'cost',
  'sessions', 'audit', 'share', 'upgrade', 'serve', 'web',
  'auth-refresh', 'plugin', 'completions', 'team-context',
  'logs', 'pipeline', 'alias',
];

/**
 * L4: Get available kubectl contexts for shell completion.
 */
function getKubeContexts(): string[] {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    return execFileSync(
      'kubectl',
      ['config', 'get-contexts', '--no-headers', '-o', 'name'],
      { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * L2: Get terraform workspaces for dynamic shell completion.
 */
function getTerraformWorkspaces(): string[] {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    return execFileSync('terraform', ['workspace', 'list'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .split('\n')
      .map((l: string) => l.replace(/^\*?\s*/, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * L2: Get helm releases for dynamic shell completion.
 */
function getHelmReleases(): string[] {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    return execFileSync('helm', ['list', '--short'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * L2: Dynamic completion dispatcher.
 * Called from shell with: nimbus __complete <prev_word> <curr_word>
 */
export function dynamicComplete(prevWord: string, _currWord: string): void {
  let suggestions: string[] = [];

  if (prevWord === 'workspace' || prevWord === 'ws') {
    suggestions = getTerraformWorkspaces();
  } else if (prevWord === 'switch' || prevWord === 'context') {
    suggestions = getKubeContexts();
  } else if (prevWord === 'upgrade' || prevWord === 'rollback') {
    suggestions = getHelmReleases();
  }

  if (suggestions.length > 0) {
    process.stdout.write(suggestions.join('\n') + '\n');
  }
}

const FLAGS = [
  '--help', '--version', '--model', '--mode', '--auto-approve',
  '--format', '--verbose', '--json', '--fix',
];

function generateBashCompletion(): string {
  return `# Nimbus bash completion
_nimbus_completions() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local commands="${COMMANDS.join(' ')}"
  local flags="${FLAGS.join(' ')}"

  if [ \$COMP_CWORD -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "\$commands" -- "\$cur") )
  else
    COMPREPLY=( \$(compgen -W "\$flags" -- "\$cur") )
  fi
}

complete -F _nimbus_completions nimbus
`;
}

function generateZshCompletion(): string {
  const commandDefs = COMMANDS.map(c => `    '${c}:${c} command'`).join('\n');
  const kubeContexts = getKubeContexts();
  const contextCompletion = kubeContexts.length > 0
    ? `\n        '--context[kubectl context]:context:(${kubeContexts.join(' ')})' \\`
    : '';
  return `#compdef nimbus
# Nimbus zsh completion

_nimbus() {
  local state

  _arguments \\
    '1: :->command' \\${contextCompletion}
    '*: :->args'

  case \$state in
    command)
      _describe 'nimbus commands' \\
        (
${commandDefs}
        )
      ;;
    args)
      _arguments \\
        '--help[Show help]' \\
        '--version[Show version]' \\
        '--model[Specify LLM model]:model:' \\
        '--mode[Agent mode (plan/build/deploy)]:mode:(plan build deploy)' \\
        '--auto-approve[Auto-approve all actions]' \\
        '--format[Output format]:format:(json text)'
      ;;
  esac
}

_nimbus
`;
}

function generateFishCompletion(): string {
  const cmdCompletions = COMMANDS.map(
    c => `complete -c nimbus -f -n '__fish_use_subcommand' -a '${c}'`
  ).join('\n');

  return `# Nimbus fish completion

${cmdCompletions}

complete -c nimbus -l help -d 'Show help'
complete -c nimbus -l version -d 'Show version'
complete -c nimbus -l model -d 'Specify LLM model' -r
complete -c nimbus -l mode -d 'Agent mode' -r -a 'plan build deploy'
complete -c nimbus -l auto-approve -d 'Auto-approve all actions'
complete -c nimbus -l format -d 'Output format' -r -a 'json text'
`;
}

export async function completionsCommand(subcommand: string): Promise<void> {
  switch (subcommand) {
    case 'install': {
      const shell = path.basename(process.env.SHELL ?? '/bin/bash');
      ui.info(`Detected shell: ${shell}`);

      if (shell === 'bash') {
        const dir = path.join(os.homedir(), '.bash_completion.d');
        const file = path.join(dir, 'nimbus.bash');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, generateBashCompletion(), 'utf-8');

        // Add source to .bashrc if not already there
        const bashrc = path.join(os.homedir(), '.bashrc');
        const sourceLine = `\n# Nimbus completions\n[ -f "${file}" ] && source "${file}"\n`;
        let alreadyConfigured = false;
        try {
          const existing = fs.readFileSync(bashrc, 'utf-8');
          if (!existing.includes('nimbus.bash')) {
            fs.appendFileSync(bashrc, sourceLine);
          } else {
            alreadyConfigured = true;
          }
        } catch {
          fs.appendFileSync(bashrc, sourceLine);
        }
        ui.print(`${ui.color('✓', 'green')} Installed bash completions to ${file}`);
        if (alreadyConfigured) {
          ui.print('  Already configured, skipping.');
        } else {
          ui.print('  Restart your shell or run: source ~/.bashrc');
        }
      } else if (shell === 'zsh') {
        const dir = path.join(os.homedir(), '.zsh', 'completions');
        const file = path.join(dir, '_nimbus');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, generateZshCompletion(), 'utf-8');
        ui.print(`${ui.color('✓', 'green')} Installed zsh completions to ${file}`);
        ui.print('  Add to .zshrc: fpath=(~/.zsh/completions $fpath) && autoload -U compinit && compinit');
        ui.print('  Restart your shell or run: source ~/.zshrc');
      } else if (shell === 'fish') {
        const dir = path.join(os.homedir(), '.config', 'fish', 'completions');
        const file = path.join(dir, 'nimbus.fish');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, generateFishCompletion(), 'utf-8');
        ui.print(`${ui.color('✓', 'green')} Installed fish completions to ${file}`);
        ui.print('  Fish completions are active immediately. Restart your shell to confirm.');
      } else {
        ui.warning(`Shell "${shell}" not supported. Supported: bash, zsh, fish`);
      }
      break;
    }

    case 'uninstall': {
      const shell = path.basename(process.env.SHELL ?? '/bin/bash');
      const files: string[] = [
        path.join(os.homedir(), '.bash_completion.d', 'nimbus.bash'),
        path.join(os.homedir(), '.zsh', 'completions', '_nimbus'),
        path.join(os.homedir(), '.config', 'fish', 'completions', 'nimbus.fish'),
      ];
      let removed = 0;
      for (const f of files) {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
          ui.print(`${ui.color('✓', 'green')} Removed ${f}`);
          removed++;
        }
      }
      if (removed === 0) {
        ui.info('No completion files found to remove.');
      } else {
        ui.info(`Removed ${removed} completion file(s). Reload your shell.`);
      }
      void shell; // suppress unused warning
      break;
    }

    case '__complete': {
      // L2: Dynamic completion dispatcher — called from shell completion scripts
      // Usage: nimbus completions __complete <prev_word> <curr_word>
      // (args passed as positional args by the shell)
      break;
    }

    default:
      ui.print('Usage: nimbus completions <install|uninstall>');
  }
}
