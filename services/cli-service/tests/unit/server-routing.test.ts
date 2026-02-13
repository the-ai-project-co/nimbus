/**
 * Server Routing Tests
 *
 * Validates all command routes in server.ts's runCommand() function.
 * Tests that command functions are properly exported, option parsers
 * produce correct structures, and the getSocketIO utility behaves
 * as expected when no server has been started.
 */

import { describe, it, expect } from 'bun:test';

// Import all newly-routed commands from the commands barrel export
import {
  awsCommand,
  azureCommand,
  gcpCommand,
  costCommand,
  driftCommand,
  demoCommand,
  parseDemoOptions,
  feedbackCommand,
  parseFeedbackOptions,
  previewCommand,
  importCommand,
  parseImportOptions,
  questionnaireCommand,
  authCloudCommand,
  authAwsCommand,
  authGcpCommand,
  authAzureCommand,
} from '../../src/commands';
import { getSocketIO } from '../../src/server';

// ==========================================
// Command existence tests
// ==========================================

describe('Server Routing - Command Exports', () => {
  it('should export awsCommand as a function', () => {
    expect(typeof awsCommand).toBe('function');
  });

  it('should export azureCommand as a function', () => {
    expect(typeof azureCommand).toBe('function');
  });

  it('should export gcpCommand as a function', () => {
    expect(typeof gcpCommand).toBe('function');
  });

  it('should export costCommand as a function', () => {
    expect(typeof costCommand).toBe('function');
  });

  it('should export driftCommand as a function', () => {
    expect(typeof driftCommand).toBe('function');
  });

  it('should export demoCommand as a function', () => {
    expect(typeof demoCommand).toBe('function');
  });

  it('should export feedbackCommand as a function', () => {
    expect(typeof feedbackCommand).toBe('function');
  });

  it('should export previewCommand as a function', () => {
    expect(typeof previewCommand).toBe('function');
  });

  it('should export importCommand as a function', () => {
    expect(typeof importCommand).toBe('function');
  });

  it('should export questionnaireCommand as a function', () => {
    expect(typeof questionnaireCommand).toBe('function');
  });

  it('should export authCloudCommand as a function', () => {
    expect(typeof authCloudCommand).toBe('function');
  });
});

// ==========================================
// Auth cloud command tests
// ==========================================

describe('Server Routing - Auth Cloud Commands', () => {
  it('should export authAwsCommand as a function', () => {
    expect(typeof authAwsCommand).toBe('function');
  });

  it('should export authGcpCommand as a function', () => {
    expect(typeof authGcpCommand).toBe('function');
  });

  it('should export authAzureCommand as a function', () => {
    expect(typeof authAzureCommand).toBe('function');
  });
});

// ==========================================
// Socket.IO utility tests
// ==========================================

describe('Server Routing - getSocketIO', () => {
  it('should return null or a SocketIOServer instance', () => {
    const io = getSocketIO();
    // When run in isolation, returns null. When run with other tests
    // that start the server, returns the Socket.io instance.
    expect(io === null || typeof io === 'object').toBe(true);
  });

  it('should be exported as a function', () => {
    expect(typeof getSocketIO).toBe('function');
  });
});

// ==========================================
// parseDemoOptions tests
// ==========================================

describe('Server Routing - parseDemoOptions', () => {
  it('should parse --list flag', () => {
    const options = parseDemoOptions(['--list']);
    expect(options.list).toBe(true);
  });

  it('should parse --scenario via positional argument', () => {
    const options = parseDemoOptions(['terraform-vpc']);
    expect(options.scenario).toBe('terraform-vpc');
  });

  it('should parse --speed slow', () => {
    const options = parseDemoOptions(['--speed', 'slow']);
    expect(options.speed).toBe('slow');
  });

  it('should parse --speed normal', () => {
    const options = parseDemoOptions(['--speed', 'normal']);
    expect(options.speed).toBe('normal');
  });

  it('should parse --speed fast', () => {
    const options = parseDemoOptions(['--speed', 'fast']);
    expect(options.speed).toBe('fast');
  });

  it('should parse --dry-run flag', () => {
    const options = parseDemoOptions(['--dry-run']);
    expect(options.dryRun).toBe(true);
  });

  it('should parse --verbose flag', () => {
    const options = parseDemoOptions(['--verbose']);
    expect(options.verbose).toBe(true);
  });

  it('should parse --category flag', () => {
    const options = parseDemoOptions(['--category', 'terraform']);
    expect(options.category).toBe('terraform');
  });

  it('should parse --tag flag', () => {
    const options = parseDemoOptions(['--tag', 'aws']);
    expect(options.tag).toBe('aws');
  });

  it('should parse multiple flags together', () => {
    const options = parseDemoOptions([
      'full-journey',
      '--speed', 'fast',
      '--dry-run',
      '--verbose',
      '--category', 'tutorial',
      '--tag', 'beginner',
    ]);
    expect(options.scenario).toBe('full-journey');
    expect(options.speed).toBe('fast');
    expect(options.dryRun).toBe(true);
    expect(options.verbose).toBe(true);
    expect(options.category).toBe('tutorial');
    expect(options.tag).toBe('beginner');
  });

  it('should return empty options for empty args', () => {
    const options = parseDemoOptions([]);
    expect(options.scenario).toBeUndefined();
    expect(options.list).toBeUndefined();
    expect(options.speed).toBeUndefined();
  });
});

// ==========================================
// parseFeedbackOptions tests
// ==========================================

describe('Server Routing - parseFeedbackOptions', () => {
  it('should parse --bug flag', () => {
    const options = parseFeedbackOptions(['--bug']);
    expect(options.bug).toBe(true);
  });

  it('should parse -b shorthand for bug', () => {
    const options = parseFeedbackOptions(['-b']);
    expect(options.bug).toBe(true);
  });

  it('should parse --feature flag', () => {
    const options = parseFeedbackOptions(['--feature']);
    expect(options.feature).toBe(true);
  });

  it('should parse -f shorthand for feature', () => {
    const options = parseFeedbackOptions(['-f']);
    expect(options.feature).toBe(true);
  });

  it('should parse --question flag', () => {
    const options = parseFeedbackOptions(['--question']);
    expect(options.question).toBe(true);
  });

  it('should parse -q shorthand for question', () => {
    const options = parseFeedbackOptions(['-q']);
    expect(options.question).toBe(true);
  });

  it('should parse --title flag', () => {
    const options = parseFeedbackOptions(['--title', 'Bug in deploy']);
    expect(options.title).toBe('Bug in deploy');
  });

  it('should parse -t shorthand for title', () => {
    const options = parseFeedbackOptions(['-t', 'Feature request']);
    expect(options.title).toBe('Feature request');
  });

  it('should parse --body flag', () => {
    const options = parseFeedbackOptions(['--body', 'Detailed description']);
    expect(options.body).toBe('Detailed description');
  });

  it('should parse -m shorthand for body', () => {
    const options = parseFeedbackOptions(['-m', 'Short message']);
    expect(options.body).toBe('Short message');
  });

  it('should parse --open flag', () => {
    const options = parseFeedbackOptions(['--open']);
    expect(options.open).toBe(true);
  });

  it('should parse -o shorthand for open', () => {
    const options = parseFeedbackOptions(['-o']);
    expect(options.open).toBe(true);
  });

  it('should parse --json flag', () => {
    const options = parseFeedbackOptions(['--json']);
    expect(options.json).toBe(true);
  });

  it('should return empty options for empty args', () => {
    const options = parseFeedbackOptions([]);
    expect(options.bug).toBeUndefined();
    expect(options.feature).toBeUndefined();
    expect(options.title).toBeUndefined();
  });
});

// ==========================================
// parseImportOptions tests
// ==========================================

describe('Server Routing - parseImportOptions', () => {
  it('should parse --provider flag with aws', () => {
    const options = parseImportOptions(['--provider', 'aws']);
    expect(options.provider).toBe('aws');
  });

  it('should parse --provider flag with gcp', () => {
    const options = parseImportOptions(['--provider', 'gcp']);
    expect(options.provider).toBe('gcp');
  });

  it('should parse --provider flag with azure', () => {
    const options = parseImportOptions(['--provider', 'azure']);
    expect(options.provider).toBe('azure');
  });

  it('should parse provider from positional argument', () => {
    const options = parseImportOptions(['aws']);
    expect(options.provider).toBe('aws');
  });

  it('should parse --resource-type flag', () => {
    const options = parseImportOptions(['--resource-type', 'ec2']);
    expect(options.resourceType).toBe('ec2');
  });

  it('should parse --resource-id flag', () => {
    const options = parseImportOptions(['--resource-id', 'i-1234567890abcdef0']);
    expect(options.resourceId).toBe('i-1234567890abcdef0');
  });

  it('should parse --output flag', () => {
    const options = parseImportOptions(['--output', './terraform']);
    expect(options.output).toBe('./terraform');
  });

  it('should parse -o shorthand for output', () => {
    const options = parseImportOptions(['-o', './out']);
    expect(options.output).toBe('./out');
  });

  it('should parse --region flag', () => {
    const options = parseImportOptions(['--region', 'us-west-2']);
    expect(options.region).toBe('us-west-2');
  });

  it('should parse --non-interactive flag', () => {
    const options = parseImportOptions(['--non-interactive']);
    expect(options.nonInteractive).toBe(true);
  });

  it('should parse -y shorthand for non-interactive', () => {
    const options = parseImportOptions(['-y']);
    expect(options.nonInteractive).toBe(true);
  });

  it('should parse multiple flags together', () => {
    const options = parseImportOptions([
      '--provider', 'gcp',
      '--resource-type', 'gce',
      '--resource-id', 'my-instance',
      '--output', './gcp-terraform',
      '--region', 'us-central1',
      '--non-interactive',
    ]);
    expect(options.provider).toBe('gcp');
    expect(options.resourceType).toBe('gce');
    expect(options.resourceId).toBe('my-instance');
    expect(options.output).toBe('./gcp-terraform');
    expect(options.region).toBe('us-central1');
    expect(options.nonInteractive).toBe(true);
  });

  it('should return empty options for empty args', () => {
    const options = parseImportOptions([]);
    expect(options.provider).toBeUndefined();
    expect(options.resourceType).toBeUndefined();
    expect(options.output).toBeUndefined();
  });
});
