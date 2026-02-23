/**
 * AWS CLI Commands
 *
 * Wrapper for AWS CLI operations with enhanced output and safety checks
 *
 * Usage:
 *   nimbus aws ec2 list
 *   nimbus aws s3 ls
 *   nimbus aws rds list
 *   nimbus aws lambda list
 *   nimbus aws iam users
 *   nimbus aws vpc list
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import { ec2Command } from './ec2';
import { s3Command } from './s3';
import { rdsCommand } from './rds';
import { lambdaCommand } from './lambda';
import { iamCommand } from './iam';
import { vpcCommand } from './vpc';

export interface AwsCommandOptions {
  profile?: string;
  region?: string;
  output?: 'json' | 'table' | 'text';
}

/**
 * Parse common AWS options from args
 */
export function parseAwsOptions(args: string[]): AwsCommandOptions {
  const options: AwsCommandOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === '--profile' || arg === '-p') && args[i + 1]) {
      options.profile = args[++i];
    } else if ((arg === '--region' || arg === '-r') && args[i + 1]) {
      options.region = args[++i];
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.output = args[++i] as 'json' | 'table' | 'text';
    }
  }

  return options;
}

/**
 * Main AWS command router
 */
export async function awsCommand(subcommand: string, args: string[]): Promise<void> {
  logger.info('Running AWS command', { subcommand, args });

  const options = parseAwsOptions(args);
  const positionalArgs = args.filter(arg => !arg.startsWith('-') && !arg.startsWith('--'));

  switch (subcommand) {
    case 'ec2':
      await ec2Command(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 's3':
      await s3Command(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'rds':
      await rdsCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'lambda':
      await lambdaCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'iam':
      await iamCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'vpc':
      await vpcCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    default:
      showAwsHelp();
      break;
  }
}

/**
 * Show AWS command help
 */
function showAwsHelp(): void {
  ui.header('Nimbus AWS Commands');
  ui.newLine();

  ui.print('Usage: nimbus aws <service> <action> [options]');
  ui.newLine();

  ui.print(ui.bold('Services:'));
  ui.print('  ec2      EC2 instance operations');
  ui.print('  s3       S3 bucket and object operations');
  ui.print('  rds      RDS database operations');
  ui.print('  lambda   Lambda function operations');
  ui.print('  iam      IAM user, role, and policy operations');
  ui.print('  vpc      VPC and networking operations');
  ui.newLine();

  ui.print(ui.bold('Common Options:'));
  ui.print('  --profile, -p   AWS profile to use');
  ui.print('  --region, -r    AWS region');
  ui.print('  --output, -o    Output format (json, table, text)');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws ec2 list                    List all EC2 instances');
  ui.print('  nimbus aws ec2 describe i-1234567890   Describe specific instance');
  ui.print('  nimbus aws s3 ls                       List all S3 buckets');
  ui.print('  nimbus aws s3 ls my-bucket             List objects in bucket');
  ui.print('  nimbus aws rds list                    List all RDS instances');
  ui.print('  nimbus aws lambda list                 List all Lambda functions');
}

// Re-export subcommands
export { ec2Command } from './ec2';
export { s3Command } from './s3';
export { rdsCommand } from './rds';
export { lambdaCommand } from './lambda';
export { iamCommand } from './iam';
export { vpcCommand } from './vpc';

export default awsCommand;
