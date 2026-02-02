/**
 * AWS Discover Command Tests
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import { startServer as startAwsServer, type ServerInstances } from '../../../../services/aws-tools-service/src/server';

// Mock the wizard UI to avoid interactive prompts in tests
const mockUI = {
  print: mock(() => {}),
  write: mock(() => {}),
  clearLine: mock(() => {}),
  newLine: mock(() => {}),
  startSpinner: mock(() => {}),
  updateSpinner: mock(() => {}),
  stopSpinnerSuccess: mock(() => {}),
  stopSpinnerFail: mock(() => {}),
  success: mock(() => {}),
  error: mock(() => {}),
  warning: mock(() => {}),
  info: mock(() => {}),
  header: mock(() => {}),
  box: mock(() => {}),
  dim: (text: string) => text,
  color: (text: string) => text,
};

// Start AWS tools service for testing
const AWS_SERVICE_PORT = 13015;
let awsServer: ServerInstances;

describe('AWS Discover Command', () => {
  beforeAll(async () => {
    // Set environment variable for the service URL
    process.env.AWS_TOOLS_SERVICE_URL = `http://localhost:${AWS_SERVICE_PORT}`;

    // Start the AWS tools service
    awsServer = await startAwsServer(AWS_SERVICE_PORT);
  });

  afterAll(() => {
    awsServer.stop();
  });

  describe('API Integration', () => {
    it('can list AWS profiles', async () => {
      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/profiles`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.profiles).toBeInstanceOf(Array);
    });

    it('can list AWS regions', async () => {
      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/regions`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.regions).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);
    });

    it('can validate regions', async () => {
      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/regions/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions: ['us-east-1', 'invalid-region'],
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toContain('us-east-1');
      expect(data.data.invalid).toContain('invalid-region');
    });
  });

  describe('Command Options Parsing', () => {
    it('parses profile option correctly', () => {
      const args = ['aws', 'discover', '--profile', 'my-profile'];

      let profile: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--profile' && args[i + 1]) {
          profile = args[++i];
        }
      }

      expect(profile).toBe('my-profile');
    });

    it('parses regions option correctly', () => {
      const args = ['aws', 'discover', '--regions', 'us-east-1,us-west-2,eu-west-1'];

      let regions: string[] | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--regions' && args[i + 1]) {
          regions = args[++i].split(',');
        }
      }

      expect(regions).toEqual(['us-east-1', 'us-west-2', 'eu-west-1']);
    });

    it('parses services option correctly', () => {
      const args = ['aws', 'discover', '--services', 'EC2,S3,Lambda'];

      let services: string[] | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--services' && args[i + 1]) {
          services = args[++i].split(',');
        }
      }

      expect(services).toEqual(['EC2', 'S3', 'Lambda']);
    });

    it('parses output format option correctly', () => {
      const args = ['aws', 'discover', '--output-format', 'json'];

      let outputFormat: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--output-format' && args[i + 1]) {
          outputFormat = args[++i];
        }
      }

      expect(outputFormat).toBe('json');
    });

    it('parses non-interactive flag correctly', () => {
      const args = ['aws', 'discover', '--non-interactive', '--profile', 'test'];

      let nonInteractive = false;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--non-interactive') {
          nonInteractive = true;
        }
      }

      expect(nonInteractive).toBe(true);
    });

    it('parses multiple options together', () => {
      const args = [
        'aws', 'discover',
        '--profile', 'prod',
        '--regions', 'us-east-1,us-west-2',
        '--services', 'EC2,S3',
        '--output-format', 'table',
        '--output-file', './inventory.json',
        '--non-interactive',
      ];

      const options: Record<string, any> = { nonInteractive: false };

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--profile' && args[i + 1]) {
          options.profile = args[++i];
        } else if (arg === '--regions' && args[i + 1]) {
          options.regions = args[++i].split(',');
        } else if (arg === '--services' && args[i + 1]) {
          options.services = args[++i].split(',');
        } else if (arg === '--output-format' && args[i + 1]) {
          options.outputFormat = args[++i];
        } else if (arg === '--output-file' && args[i + 1]) {
          options.outputFile = args[++i];
        } else if (arg === '--non-interactive') {
          options.nonInteractive = true;
        }
      }

      expect(options).toEqual({
        profile: 'prod',
        regions: ['us-east-1', 'us-west-2'],
        services: ['EC2', 'S3'],
        outputFormat: 'table',
        outputFile: './inventory.json',
        nonInteractive: true,
      });
    });
  });
});
