/**
 * Team Commands
 * Team collaboration CLI commands
 */

import { ui } from '../../wizard/ui';
import { teamClient } from '../../clients/enterprise-client';
import { getAuthStore } from '../../auth';
import type {
  TeamCreateOptions,
  TeamInviteOptions,
  TeamMembersOptions,
  TeamRemoveOptions,
  TeamSwitchOptions,
  TeamRole,
} from '@nimbus/shared-types';

/**
 * Get current user ID from auth store
 */
function getCurrentUserId(): string {
  const authStore = getAuthStore();
  const auth = authStore.load();
  const userId = auth?.identity?.github?.username;
  if (!userId) {
    throw new Error('Not authenticated. Run `nimbus login` first.');
  }
  return userId;
}

/**
 * Get current team ID from config or environment
 */
function getCurrentTeamId(): string | null {
  return process.env.NIMBUS_TEAM_ID || null;
}

/**
 * Parse team create options
 */
export function parseTeamCreateOptions(args: string[]): TeamCreateOptions {
  const options: TeamCreateOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.name) {
      options.name = arg;
    }
  }

  return options;
}

/**
 * Parse team invite options
 */
export function parseTeamInviteOptions(args: string[]): TeamInviteOptions {
  const options: TeamInviteOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--role' && args[i + 1]) {
      options.role = args[++i] as TeamRole;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.email) {
      options.email = arg;
    }
  }

  return options;
}

/**
 * Parse team members options
 */
export function parseTeamMembersOptions(args: string[]): TeamMembersOptions {
  const options: TeamMembersOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Parse team remove options
 */
export function parseTeamRemoveOptions(args: string[]): TeamRemoveOptions {
  const options: TeamRemoveOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.email) {
      options.email = arg;
    }
  }

  return options;
}

/**
 * Parse team switch options
 */
export function parseTeamSwitchOptions(args: string[]): TeamSwitchOptions {
  const options: TeamSwitchOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.teamId) {
      options.teamId = arg;
    }
  }

  return options;
}

/**
 * Team create command
 */
export async function teamCreateCommand(options: TeamCreateOptions): Promise<void> {
  try {
    const name = options.name;
    if (!name) {
      ui.error('Team name is required');
      ui.info('Usage: nimbus team create <name>');
      return;
    }

    const userId = getCurrentUserId();

    ui.startSpinner({ message: 'Creating team...' });
    const team = await teamClient.createTeam({ name, ownerId: userId });
    ui.stopSpinnerSuccess(`Team "${team.name}" created`);

    ui.newLine();
    ui.info(`Team ID: ${team.id}`);
    ui.info(`To use this team, run: nimbus team switch ${team.id}`);
    ui.info(`Or set environment variable: export NIMBUS_TEAM_ID=${team.id}`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to create team');
    ui.error(error.message);
  }
}

/**
 * Team invite command
 */
export async function teamInviteCommand(options: TeamInviteOptions): Promise<void> {
  try {
    const email = options.email;
    if (!email) {
      ui.error('Email is required');
      ui.info('Usage: nimbus team invite <email> [--role member|admin|viewer]');
      return;
    }

    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: `Inviting ${email}...` });
    const member = await teamClient.inviteMember(teamId, {
      email,
      role: options.role || 'member',
    });
    ui.stopSpinnerSuccess(`Invited ${email} as ${member.role}`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to invite member');
    ui.error(error.message);
  }
}

/**
 * Team members command
 */
export async function teamMembersCommand(options: TeamMembersOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: 'Fetching members...' });
    const members = await teamClient.listMembers(teamId);
    ui.stopSpinnerSuccess(`Found ${members.length} members`);

    if (options.json) {
      console.log(JSON.stringify(members, null, 2));
      return;
    }

    ui.newLine();
    ui.table({
      columns: [
        { key: 'email', header: 'Email' },
        { key: 'role', header: 'Role' },
        { key: 'joinedAt', header: 'Joined' },
      ],
      data: members.map(m => ({
        email: m.user?.email || m.userId,
        role: m.role,
        joinedAt: new Date(m.joinedAt).toLocaleDateString(),
      })),
    });
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to list members');
    ui.error(error.message);
  }
}

/**
 * Team remove command
 */
export async function teamRemoveCommand(options: TeamRemoveOptions): Promise<void> {
  try {
    const email = options.email;
    if (!email) {
      ui.error('Email is required');
      ui.info('Usage: nimbus team remove <email>');
      return;
    }

    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    // First, find the user ID by email from members list
    const members = await teamClient.listMembers(teamId);
    const member = members.find(m => m.user?.email === email);

    if (!member) {
      ui.error(`Member with email ${email} not found`);
      return;
    }

    ui.startSpinner({ message: `Removing ${email}...` });
    await teamClient.removeMember(teamId, member.userId);
    ui.stopSpinnerSuccess(`Removed ${email} from team`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to remove member');
    ui.error(error.message);
  }
}

/**
 * Team switch command
 */
export async function teamSwitchCommand(options: TeamSwitchOptions): Promise<void> {
  try {
    const userId = getCurrentUserId();

    // If no team ID provided, list teams for selection
    if (!options.teamId) {
      ui.startSpinner({ message: 'Fetching teams...' });
      const teams = await teamClient.listTeams(userId);
      ui.stopSpinnerSuccess(`Found ${teams.length} teams`);

      if (teams.length === 0) {
        ui.info('No teams found. Create one with `nimbus team create <name>`');
        return;
      }

      ui.newLine();
      ui.info('Available teams:');
      for (const team of teams) {
        ui.print(`  ${team.id} - ${team.name} (${team.plan})`);
      }
      ui.newLine();
      ui.info('To switch: nimbus team switch <team-id>');
      ui.info('Or set: export NIMBUS_TEAM_ID=<team-id>');
      return;
    }

    // Verify team exists and user has access
    ui.startSpinner({ message: 'Switching team...' });
    const team = await teamClient.getTeam(options.teamId);
    if (!team) {
      ui.stopSpinnerFail('Team not found');
      return;
    }

    ui.stopSpinnerSuccess(`Switched to team "${team.name}"`);
    ui.newLine();
    ui.info(`Set this environment variable to persist:`);
    ui.print(`  export NIMBUS_TEAM_ID=${team.id}`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to switch team');
    ui.error(error.message);
  }
}

/**
 * Main team command dispatcher
 */
export async function teamCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'create':
      await teamCreateCommand(parseTeamCreateOptions(args));
      break;
    case 'invite':
      await teamInviteCommand(parseTeamInviteOptions(args));
      break;
    case 'members':
      await teamMembersCommand(parseTeamMembersOptions(args));
      break;
    case 'remove':
      await teamRemoveCommand(parseTeamRemoveOptions(args));
      break;
    case 'switch':
      await teamSwitchCommand(parseTeamSwitchOptions(args));
      break;
    case 'list':
      await teamSwitchCommand(parseTeamSwitchOptions([])); // List mode
      break;
    default:
      ui.error(`Unknown team command: ${subcommand}`);
      ui.newLine();
      ui.info('Available team commands:');
      ui.print('  nimbus team create <name>     - Create a new team');
      ui.print('  nimbus team invite <email>    - Invite a member');
      ui.print('  nimbus team members           - List team members');
      ui.print('  nimbus team remove <email>    - Remove a member');
      ui.print('  nimbus team switch [team-id]  - Switch to a team');
      ui.print('  nimbus team list              - List your teams');
  }
}
