/**
 * Feedback Command
 *
 * Collect and submit user feedback via GitHub issues or browser
 *
 * Usage: nimbus feedback [options]
 */

import { logger } from '../utils';
import { ui } from '../wizard';
import { input, select } from '../wizard/prompts';

/**
 * Command options
 */
export interface FeedbackOptions {
  bug?: boolean;
  feature?: boolean;
  question?: boolean;
  title?: string;
  body?: string;
  open?: boolean;
  json?: boolean;
}

/**
 * Feedback type configuration
 */
interface FeedbackType {
  label: string;
  emoji: string;
  template: string;
  labels: string[];
}

const FEEDBACK_TYPES: Record<string, FeedbackType> = {
  bug: {
    label: 'Bug Report',
    emoji: 'bug',
    template: `## Bug Description
<!-- A clear and concise description of what the bug is -->

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
<!-- What you expected to happen -->

## Actual Behavior
<!-- What actually happened -->

## Environment
- Nimbus Version:
- OS:
- Node Version:

## Additional Context
<!-- Any other relevant information -->
`,
    labels: ['bug', 'triage'],
  },
  feature: {
    label: 'Feature Request',
    emoji: 'sparkles',
    template: `## Feature Description
<!-- A clear and concise description of the feature -->

## Use Case
<!-- Why do you need this feature? What problem does it solve? -->

## Proposed Solution
<!-- How do you think this should work? -->

## Alternatives Considered
<!-- Any alternative solutions or features you've considered -->

## Additional Context
<!-- Any other relevant information -->
`,
    labels: ['enhancement', 'feature-request'],
  },
  question: {
    label: 'Question',
    emoji: 'question',
    template: `## Question
<!-- What would you like to know? -->

## Context
<!-- What are you trying to accomplish? -->

## What I've Tried
<!-- What documentation or approaches have you already tried? -->
`,
    labels: ['question', 'help-wanted'],
  },
};

const GITHUB_REPO = 'the-ai-project-co/nimbus';
const GITHUB_ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`;

/**
 * Get system information for bug reports
 */
async function getSystemInfo(): Promise<Record<string, string>> {
  const os = await import('os');
  const { execFileSync } = await import('child_process');

  const info: Record<string, string> = {
    'OS': `${os.platform()} ${os.release()}`,
    'Architecture': os.arch(),
    'Node Version': process.version,
  };

  // Try to get Nimbus version
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
    info['Nimbus Version'] = packageJson.version;
  } catch {
    info['Nimbus Version'] = 'unknown';
  }

  // Try to get Bun version
  try {
    const bunVersion = execFileSync('bun', ['--version'], { encoding: 'utf-8' }).trim();
    info['Bun Version'] = bunVersion;
  } catch {
    // Bun not installed
  }

  return info;
}

/**
 * Open URL in browser
 */
async function openInBrowser(url: string): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    await execAsync(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build GitHub issue URL with pre-filled content
 */
function buildIssueUrl(
  type: string,
  title: string,
  body: string,
  labels: string[]
): string {
  const params = new URLSearchParams({
    title,
    body,
    labels: labels.join(','),
  });

  return `${GITHUB_ISSUES_URL}/new?${params.toString()}`;
}

/**
 * Interactive feedback collection
 */
async function collectFeedbackInteractively(
  options: FeedbackOptions
): Promise<{ type: string; title: string; body: string } | null> {
  // Determine feedback type
  let feedbackType: string | undefined;

  if (options.bug) {
    feedbackType = 'bug';
  } else if (options.feature) {
    feedbackType = 'feature';
  } else if (options.question) {
    feedbackType = 'question';
  } else {
    // Ask user to select type
    feedbackType = await select({
      message: 'What type of feedback would you like to provide?',
      options: [
        { label: 'Bug Report', value: 'bug' },
        { label: 'Feature Request', value: 'feature' },
        { label: 'Question', value: 'question' },
      ],
    });

    if (!feedbackType) {
      return null;
    }
  }

  const typeConfig = FEEDBACK_TYPES[feedbackType];

  ui.newLine();
  ui.print(ui.bold(`${typeConfig.label}`));
  ui.newLine();

  // Get title
  let title = options.title;
  if (!title) {
    title = await input({
      message: 'Brief summary (title):',
      placeholder: `Enter a short description of your ${feedbackType === 'bug' ? 'issue' : feedbackType === 'feature' ? 'request' : 'question'}`,
    });

    if (!title || title.trim() === '') {
      ui.warning('Feedback cancelled - no title provided');
      return null;
    }
  }

  // Get body/description
  let body = options.body;
  if (!body) {
    ui.newLine();
    ui.info('Please provide details (press Enter twice to finish):');
    ui.dim('Tip: You can also edit the full template on GitHub');
    ui.newLine();

    body = await input({
      message: 'Details (optional):',
      placeholder: 'Describe the issue, feature, or question in detail...',
    });
  }

  // Build full body with template
  let fullBody = typeConfig.template;

  if (body && body.trim()) {
    // Replace first section placeholder with user's input
    fullBody = fullBody.replace(
      /<!-- .+? -->/,
      body.trim()
    );
  }

  // Add system info for bug reports
  if (feedbackType === 'bug') {
    const systemInfo = await getSystemInfo();
    const envSection = Object.entries(systemInfo)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    fullBody = fullBody.replace(
      '## Environment\n- Nimbus Version: \n- OS: \n- Node Version:',
      `## Environment\n${envSection}`
    );
  }

  return {
    type: feedbackType,
    title: title.trim(),
    body: fullBody,
  };
}

/**
 * Run the feedback command
 */
export async function feedbackCommand(options: FeedbackOptions = {}): Promise<void> {
  logger.debug('Running feedback command', { options });

  ui.header('Nimbus Feedback');
  ui.info('Help us improve Nimbus by sharing your feedback!');
  ui.newLine();

  // Quick open mode - just open GitHub issues
  if (options.open) {
    ui.info('Opening GitHub issues page...');
    const opened = await openInBrowser(GITHUB_ISSUES_URL);

    if (opened) {
      ui.success('Opened in browser');
    } else {
      ui.print(`Visit: ${GITHUB_ISSUES_URL}`);
    }
    return;
  }

  // Collect feedback interactively
  const feedback = await collectFeedbackInteractively(options);

  if (!feedback) {
    return;
  }

  const typeConfig = FEEDBACK_TYPES[feedback.type];
  const issueUrl = buildIssueUrl(
    feedback.type,
    feedback.title,
    feedback.body,
    typeConfig.labels
  );

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({
      type: feedback.type,
      title: feedback.title,
      url: issueUrl,
      labels: typeConfig.labels,
    }, null, 2));
    return;
  }

  ui.newLine();
  ui.print(ui.bold('Feedback Summary'));
  ui.print(`  Type:  ${typeConfig.label}`);
  ui.print(`  Title: ${feedback.title}`);
  ui.newLine();

  // Open in browser
  ui.info('Opening GitHub to submit your feedback...');

  const opened = await openInBrowser(issueUrl);

  if (opened) {
    ui.success('Opened in browser - please review and submit the issue');
  } else {
    ui.warning('Could not open browser automatically');
    ui.newLine();
    ui.print('Please copy and paste this URL to submit your feedback:');
    ui.print(issueUrl);
  }

  ui.newLine();
  ui.info('Thank you for your feedback!');
}

/**
 * Parse feedback command options from CLI args
 */
export function parseFeedbackOptions(args: string[]): FeedbackOptions {
  const options: FeedbackOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--bug':
      case '-b':
        options.bug = true;
        break;
      case '--feature':
      case '-f':
        options.feature = true;
        break;
      case '--question':
      case '-q':
        options.question = true;
        break;
      case '--title':
      case '-t':
        options.title = args[++i];
        break;
      case '--body':
      case '-m':
        options.body = args[++i];
        break;
      case '--open':
      case '-o':
        options.open = true;
        break;
      case '--json':
        options.json = true;
        break;
    }
  }

  return options;
}

// Export as default command
export default feedbackCommand;
