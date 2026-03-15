/**
 * Connect GitHub Command
 *
 * Runs the GitHub Device Flow OAuth independently of the main login wizard.
 * This allows users to link their GitHub identity at any time without
 * reconfiguring their LLM provider.
 *
 * Usage: nimbus connect github
 */

import { ui } from '../wizard';
import {
  authStore,
  GitHubDeviceFlow,
  completeGitHubAuth,
} from '../auth';

/**
 * Run the GitHub Device Flow and save the identity to authStore on success.
 * Exits cleanly on failure without asking the user to continue — callers can
 * retry by running `nimbus connect github` again.
 */
export async function connectGitHubCommand(): Promise<boolean> {
  ui.newLine();
  ui.section('Connect GitHub Identity');

  // Check if already authenticated
  const existing = authStore.getIdentity();
  if (existing) {
    ui.info(`Already connected as: ${existing.username}`);
    const { confirm } = await import('../wizard');
    const reauth = await confirm({
      message: 'Reconnect with a different GitHub account?',
      defaultValue: false,
    });
    if (!reauth) {
      return true;
    }
  }

  ui.newLine();
  ui.info('Starting GitHub Device Flow authentication...');
  ui.newLine();

  try {
    const deviceFlow = new GitHubDeviceFlow();

    // Request device code
    ui.startSpinner({ message: 'Requesting authorization code...' });
    const deviceCode = await deviceFlow.requestDeviceCode();
    ui.stopSpinnerSuccess('Authorization code received');

    // Display the code for the user to enter in their browser
    ui.newLine();
    ui.box({
      title: 'GitHub Authorization',
      content: [
        `Open ${deviceCode.verification_uri} in your browser`,
        'and enter this code:',
        '',
        `    ${deviceCode.user_code}`,
        '',
        'Waiting for authorization...',
      ],
      style: 'rounded',
      borderColor: 'yellow',
      padding: 1,
    });
    ui.newLine();

    // Poll for the access token
    ui.startSpinner({ message: 'Waiting for authorization...' });
    const accessToken = await deviceFlow.waitForAuthorization(() => {
      // Called on each poll — no-op here
    });
    ui.stopSpinnerSuccess('Authorization successful');

    // Fetch the user profile
    ui.startSpinner({ message: 'Fetching user profile...' });
    const identity = await completeGitHubAuth(accessToken);
    ui.stopSpinnerSuccess(
      `Connected as ${identity.username}${identity.name ? ` (${identity.name})` : ''}`
    );

    // Persist the identity
    authStore.setIdentity(identity);

    ui.newLine();
    ui.success('GitHub identity linked successfully.');
    ui.newLine();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.stopSpinnerFail(`GitHub authentication failed: ${message}`);
    ui.newLine();
    ui.error(`Could not complete GitHub Device Flow: ${message}`);
    ui.print('');
    ui.print('Possible causes:');
    ui.print('  • The OAuth app may not have Device Flow enabled.');
    ui.print('    Visit github.com/settings/developers to check your OAuth App settings.');
    ui.print('  • The authorization timed out (codes expire after ~15 minutes).');
    ui.print('');
    ui.print('Run `nimbus connect github` again to retry.');
    ui.newLine();
    return false;
  }
}

export default connectGitHubCommand;
