/**
 * Explain Command
 *
 * Get AI explanations for code, infrastructure, or errors
 *
 * Usage: nimbus explain <target> [options]
 */

import { logger } from '../utils';
import { ui } from '../wizard';
import { llmClient } from '../clients';

/**
 * Content type for explanation
 */
export type ExplainType = 'code' | 'infra' | 'error' | 'auto';

/**
 * Command options
 */
export interface ExplainOptions {
  type?: ExplainType;
  file?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * Detect content type from target
 */
function detectExplainType(target: string, content?: string): ExplainType {
  // Check for error patterns
  const errorPatterns = [
    /^error:/i,
    /^exception:/i,
    /failed/i,
    /traceback/i,
    /stack trace/i,
    /undefined variable/i,
    /cannot find/i,
    /not found/i,
    /invalid/i,
    /permission denied/i,
  ];

  const targetLower = target.toLowerCase();

  if (errorPatterns.some(p => p.test(target) || (content && p.test(content)))) {
    return 'error';
  }

  // Check for infrastructure file extensions
  const infraExtensions = ['.tf', '.yaml', '.yml', '.json', '.hcl', '.toml'];
  if (infraExtensions.some(ext => targetLower.endsWith(ext))) {
    return 'infra';
  }

  // Check content for infrastructure patterns
  if (content) {
    if (content.includes('apiVersion:') && content.includes('kind:')) {
      return 'infra'; // Kubernetes
    }
    if (content.includes('resource ') && content.includes('provider ')) {
      return 'infra'; // Terraform
    }
    if (content.includes('AWSTemplateFormatVersion')) {
      return 'infra'; // CloudFormation
    }
  }

  // Check for code file extensions
  const codeExtensions = ['.ts', '.js', '.py', '.go', '.java', '.rs', '.rb', '.php', '.c', '.cpp', '.cs'];
  if (codeExtensions.some(ext => targetLower.endsWith(ext))) {
    return 'code';
  }

  // Default to code for unknown content
  return 'code';
}

/**
 * Build the explanation prompt based on type
 */
function buildPrompt(type: ExplainType, content: string, verbose: boolean): string {
  const detailLevel = verbose ? 'detailed' : 'concise';

  switch (type) {
    case 'error':
      return `Please explain this error and suggest how to fix it. Provide a ${detailLevel} explanation.

Error:
\`\`\`
${content}
\`\`\`

Include:
1. What the error means
2. Why it might have occurred
3. How to fix it
4. How to prevent it in the future`;

    case 'infra':
      return `Please explain this infrastructure configuration. Provide a ${detailLevel} explanation.

Configuration:
\`\`\`
${content}
\`\`\`

Include:
1. What this configuration does
2. Key components and their purpose
3. Any potential issues or improvements
${verbose ? '4. Security considerations\n5. Best practices recommendations' : ''}`;

    case 'code':
    default:
      return `Please explain this code. Provide a ${detailLevel} explanation.

Code:
\`\`\`
${content}
\`\`\`

Include:
1. What the code does
2. How it works
3. Any potential issues
${verbose ? '4. Suggestions for improvement\n5. Related best practices' : ''}`;
  }
}

/**
 * Run the explain command
 */
export async function explainCommand(target: string, options: ExplainOptions = {}): Promise<void> {
  logger.info('Running explain command', { target, options });

  let content: string;
  let filePath: string | undefined;

  // Get content to explain
  if (options.file) {
    // Read from specified file
    filePath = options.file;
    try {
      const fs = await import('fs/promises');
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      ui.error(`Could not read file: ${error.message}`);
      process.exit(1);
    }
  } else if (target) {
    // Check if target is a file path
    try {
      const fs = await import('fs/promises');
      const stat = await fs.stat(target);
      if (stat.isFile()) {
        filePath = target;
        content = await fs.readFile(target, 'utf-8');
      } else if (stat.isDirectory()) {
        ui.error('Please specify a file, not a directory');
        ui.info('Usage: nimbus explain <file> or nimbus explain "error message"');
        process.exit(1);
      } else {
        content = target;
      }
    } catch {
      // Not a file, use as content directly
      content = target;
    }
  } else {
    ui.error('Please provide something to explain');
    ui.newLine();
    ui.print('Usage: nimbus explain <target> [options]');
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus explain ./main.tf');
    ui.print('  nimbus explain "Error: resource not found" --type error');
    ui.print('  nimbus explain --file ./deployment.yaml');
    process.exit(1);
  }

  // Limit content size
  const maxLength = 10000;
  if (content.length > maxLength) {
    ui.warning(`Content truncated to ${maxLength} characters`);
    content = content.slice(0, maxLength) + '\n... (content truncated)';
  }

  // Detect or use specified type
  const type = options.type === 'auto' || !options.type
    ? detectExplainType(target, content)
    : options.type;

  // Display header
  ui.header('Nimbus Explain');
  if (filePath) {
    ui.info(`File: ${filePath}`);
  }
  ui.info(`Type: ${type}`);
  ui.newLine();

  // Check if LLM is available
  const llmAvailable = await llmClient.isAvailable();

  if (!llmAvailable) {
    ui.error('LLM service is not available');
    ui.info('Make sure you have configured an LLM provider with "nimbus login"');
    process.exit(1);
  }

  // Build prompt
  const prompt = buildPrompt(type, content, options.verbose ?? false);

  ui.startSpinner({ message: 'Analyzing...' });

  try {
    let response = '';
    let firstChunk = true;

    for await (const chunk of llmClient.chat(prompt, [])) {
      if (chunk.type === 'content' && chunk.content) {
        if (firstChunk) {
          ui.stopSpinnerSuccess('');
          ui.newLine();
          firstChunk = false;
        }

        response += chunk.content;
        process.stdout.write(chunk.content);
      } else if (chunk.type === 'error') {
        ui.stopSpinnerFail('Error');
        ui.error(chunk.message || chunk.error || 'Unknown error');
        process.exit(1);
      }
    }

    // Ensure newline at end
    if (!response.endsWith('\n')) {
      ui.newLine();
    }

    // JSON output mode
    if (options.json) {
      console.log(JSON.stringify({
        type,
        file: filePath,
        explanation: response,
      }, null, 2));
    }

  } catch (error: any) {
    ui.stopSpinnerFail('Failed');
    ui.error(error.message);
    process.exit(1);
  }
}

// Export as default
export default explainCommand;
