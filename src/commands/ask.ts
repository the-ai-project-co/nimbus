/**
 * Ask Command
 *
 * Quick question and answer with AI
 *
 * Usage: nimbus ask "<question>" [options]
 */

import { logger } from '../utils';
import { ui } from '../wizard';
import { llmClient } from '../clients';

/**
 * Command options
 */
export interface AskOptions {
  context?: string;
  contextFile?: string;
  model?: string;
  json?: boolean;
}

/**
 * Run the ask command
 */
export async function askCommand(question: string, options: AskOptions = {}): Promise<void> {
  logger.info('Running ask command', { question, options });

  // Validate question
  if (!question || question.trim() === '') {
    ui.error('Please provide a question');
    ui.newLine();
    ui.print('Usage: nimbus ask "your question here"');
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus ask "How do I create an S3 bucket with Terraform?"');
    ui.print('  nimbus ask "What is the best practice for IAM roles?"');
    ui.print('  nimbus ask "Explain kubernetes deployments" --context ./k8s/');
    process.exit(1);
  }

  // Build context
  let context = '';

  // Add file context if provided
  if (options.contextFile) {
    try {
      const fs = await import('fs/promises');
      const fileContent = await fs.readFile(options.contextFile, 'utf-8');
      context += `File: ${options.contextFile}\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
      ui.info(`Including context from: ${options.contextFile}`);
    } catch (error: any) {
      ui.warning(`Could not read context file: ${error.message}`);
    }
  }

  // Add directory context if provided
  if (options.context) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const stat = await fs.stat(options.context);

      if (stat.isDirectory()) {
        // Read relevant files from directory
        const files = await fs.readdir(options.context);
        const relevantExtensions = ['.tf', '.yaml', '.yml', '.json', '.ts', '.js', '.py', '.go'];
        const relevantFiles = files
          .filter(f => relevantExtensions.some(ext => f.endsWith(ext)))
          .slice(0, 5); // Limit to 5 files

        for (const file of relevantFiles) {
          try {
            const filePath = path.join(options.context, file);
            const content = await fs.readFile(filePath, 'utf-8');
            // Limit content size
            const truncated =
              content.length > 2000 ? `${content.slice(0, 2000)}\n... (truncated)` : content;
            context += `File: ${file}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
          } catch {
            // Skip unreadable files
          }
        }

        if (relevantFiles.length > 0) {
          ui.info(`Including context from ${relevantFiles.length} file(s) in: ${options.context}`);
        }
      } else {
        // Single file
        const fileContent = await fs.readFile(options.context, 'utf-8');
        context += `File: ${options.context}\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
        ui.info(`Including context from: ${options.context}`);
      }
    } catch (error: any) {
      ui.warning(`Could not read context: ${error.message}`);
    }
  }

  // Build the full question with context
  let fullQuestion = question;
  if (context) {
    fullQuestion = `Context:\n${context}\n\nQuestion: ${question}`;
  }

  // Check if LLM is available
  const llmAvailable = await llmClient.isAvailable();

  if (!llmAvailable) {
    ui.error('LLM service is not available');
    ui.info('Make sure you have configured an LLM provider with "nimbus login"');
    ui.info('Or set the ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  ui.newLine();
  ui.startSpinner({ message: 'Thinking...' });

  try {
    // Stream the response
    let response = '';
    let firstChunk = true;

    for await (const chunk of llmClient.chat(fullQuestion, [], { model: options.model })) {
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
      console.log(
        JSON.stringify(
          {
            question,
            answer: response,
            context: context ? true : false,
          },
          null,
          2
        )
      );
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Failed');
    ui.error(error.message);
    process.exit(1);
  }
}

// Export as default
export default askCommand;
