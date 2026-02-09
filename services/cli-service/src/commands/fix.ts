/**
 * Fix Command
 *
 * AI-assisted error fixing
 *
 * Usage: nimbus fix <error-or-file> [options]
 */

import { logger } from '@nimbus/shared-utils';
import { ui, confirm } from '../wizard';
import { llmClient } from '../clients';

/**
 * Command options
 */
export interface FixOptions {
  file?: string;
  autoApply?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

/**
 * Fix suggestion from AI
 */
interface FixSuggestion {
  problem: string;
  explanation: string;
  fix: string;
  originalCode?: string;
  fixedCode?: string;
  filePath?: string;
  lineNumber?: number;
}

/**
 * Parse fix response from AI
 */
function parseFixResponse(response: string): FixSuggestion {
  // Try to extract structured sections from the response
  const problemMatch = response.match(/(?:problem|issue|error):\s*(.+?)(?=\n(?:explanation|fix|solution)|$)/is);
  const explanationMatch = response.match(/(?:explanation|cause|reason):\s*(.+?)(?=\n(?:fix|solution)|$)/is);
  const fixMatch = response.match(/(?:fix|solution|resolution):\s*(.+?)(?=\n(?:original|fixed)|$)/is);
  const originalMatch = response.match(/(?:original|before)[^:]*:\s*```[\w]*\n([\s\S]*?)```/i);
  const fixedMatch = response.match(/(?:fixed|after|corrected)[^:]*:\s*```[\w]*\n([\s\S]*?)```/i);

  return {
    problem: problemMatch?.[1]?.trim() || 'Unable to parse problem description',
    explanation: explanationMatch?.[1]?.trim() || response.split('\n').slice(0, 3).join('\n'),
    fix: fixMatch?.[1]?.trim() || 'See suggested code below',
    originalCode: originalMatch?.[1]?.trim(),
    fixedCode: fixedMatch?.[1]?.trim(),
  };
}

/**
 * Build the fix prompt
 */
function buildFixPrompt(errorContent: string, fileContent?: string, filePath?: string): string {
  let prompt = `Please help fix this error. Analyze the problem and provide a solution.

Error:
\`\`\`
${errorContent}
\`\`\`
`;

  if (fileContent && filePath) {
    prompt += `
Source file (${filePath}):
\`\`\`
${fileContent}
\`\`\`
`;
  }

  prompt += `
Please provide:
1. **Problem**: A brief description of what's wrong
2. **Explanation**: Why this error occurs
3. **Fix**: How to fix it

If you can provide code changes, please show:
- **Original**: The problematic code
- **Fixed**: The corrected code

Format your response with clear section headers.`;

  return prompt;
}

/**
 * Display fix suggestion
 */
function displayFixSuggestion(suggestion: FixSuggestion): void {
  ui.newLine();

  // Problem
  ui.print(ui.color('Problem:', 'yellow'));
  ui.print(`  ${suggestion.problem}`);
  ui.newLine();

  // Explanation
  ui.print(ui.color('Explanation:', 'blue'));
  for (const line of suggestion.explanation.split('\n')) {
    ui.print(`  ${line}`);
  }
  ui.newLine();

  // Fix
  ui.print(ui.color('Suggested Fix:', 'green'));
  for (const line of suggestion.fix.split('\n')) {
    ui.print(`  ${line}`);
  }

  // Show diff if we have original and fixed code
  if (suggestion.originalCode && suggestion.fixedCode) {
    ui.newLine();
    ui.print(ui.color('Code Changes:', 'cyan'));
    ui.newLine();

    // Show original
    ui.print(ui.color('Before:', 'red'));
    ui.print('```');
    for (const line of suggestion.originalCode.split('\n')) {
      ui.print(ui.color(`- ${line}`, 'red'));
    }
    ui.print('```');

    ui.newLine();

    // Show fixed
    ui.print(ui.color('After:', 'green'));
    ui.print('```');
    for (const line of suggestion.fixedCode.split('\n')) {
      ui.print(ui.color(`+ ${line}`, 'green'));
    }
    ui.print('```');
  }
}

/**
 * Apply the fix to a file
 */
async function applyFix(suggestion: FixSuggestion, filePath: string): Promise<boolean> {
  if (!suggestion.originalCode || !suggestion.fixedCode) {
    ui.warning('Cannot auto-apply: No code diff provided');
    return false;
  }

  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');

    // Try to find and replace the original code
    if (content.includes(suggestion.originalCode)) {
      const newContent = content.replace(suggestion.originalCode, suggestion.fixedCode);
      await fs.writeFile(filePath, newContent, 'utf-8');
      return true;
    } else {
      ui.warning('Could not find the original code in the file');
      ui.info('The file may have been modified since the analysis');
      return false;
    }
  } catch (error: any) {
    ui.error(`Failed to apply fix: ${error.message}`);
    return false;
  }
}

/**
 * Run the fix command
 */
export async function fixCommand(errorOrFile: string, options: FixOptions = {}): Promise<void> {
  logger.info('Running fix command', { errorOrFile, options });

  let errorContent: string;
  let fileContent: string | undefined;
  let filePath: string | undefined;

  // Determine what we're fixing
  if (options.file) {
    // Error content with explicit file
    errorContent = errorOrFile;
    filePath = options.file;

    try {
      const fs = await import('fs/promises');
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      ui.warning(`Could not read file ${filePath}: ${error.message}`);
    }
  } else if (errorOrFile) {
    // Check if it's a file path
    try {
      const fs = await import('fs/promises');
      const stat = await fs.stat(errorOrFile);

      if (stat.isFile()) {
        filePath = errorOrFile;
        fileContent = await fs.readFile(errorOrFile, 'utf-8');

        // For a file without explicit error, we'll analyze the whole file
        errorContent = `Please analyze this file for potential issues and errors:\n${errorOrFile}`;
      } else {
        errorContent = errorOrFile;
      }
    } catch {
      // Not a file, treat as error message
      errorContent = errorOrFile;
    }
  } else {
    ui.error('Please provide an error message or file to fix');
    ui.newLine();
    ui.print('Usage: nimbus fix <error-or-file> [options]');
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus fix "Error: undefined variable"');
    ui.print('  nimbus fix ./broken.tf');
    ui.print('  nimbus fix "Error: invalid syntax" --file ./app.py');
    ui.print('  nimbus fix ./config.yaml --auto-apply');
    process.exit(1);
  }

  // Display header
  ui.header('Nimbus Fix');
  if (filePath) {
    ui.info(`File: ${filePath}`);
  }
  ui.info(`Error: ${errorContent.slice(0, 100)}${errorContent.length > 100 ? '...' : ''}`);
  ui.newLine();

  // Check if LLM is available
  const llmAvailable = await llmClient.isAvailable();

  if (!llmAvailable) {
    ui.error('LLM service is not available');
    ui.info('Make sure you have configured an LLM provider with "nimbus login"');
    process.exit(1);
  }

  // Build prompt
  const prompt = buildFixPrompt(errorContent, fileContent, filePath);

  ui.startSpinner({ message: 'Analyzing error...' });

  try {
    let response = '';

    for await (const chunk of llmClient.chat(prompt, [])) {
      if (chunk.type === 'content' && chunk.content) {
        response += chunk.content;
      } else if (chunk.type === 'error') {
        ui.stopSpinnerFail('Error');
        ui.error(chunk.message || chunk.error || 'Unknown error');
        process.exit(1);
      }
    }

    ui.stopSpinnerSuccess('Analysis complete');

    // Parse and display the suggestion
    const suggestion = parseFixResponse(response);
    suggestion.filePath = filePath;

    displayFixSuggestion(suggestion);

    // JSON output mode
    if (options.json) {
      console.log(JSON.stringify(suggestion, null, 2));
      return;
    }

    // Dry run - don't apply
    if (options.dryRun) {
      ui.newLine();
      ui.info('Dry run mode - no changes applied');
      return;
    }

    // Apply the fix if requested and possible
    if (filePath && suggestion.originalCode && suggestion.fixedCode) {
      ui.newLine();

      const shouldApply = options.autoApply || await confirm({
        message: 'Apply this fix?',
        defaultValue: false,
      });

      if (shouldApply) {
        ui.startSpinner({ message: 'Applying fix...' });

        const applied = await applyFix(suggestion, filePath);

        if (applied) {
          ui.stopSpinnerSuccess('Fix applied successfully!');
          ui.newLine();
          ui.info(`File updated: ${filePath}`);
          ui.info('Please review the changes and test your code');
        } else {
          ui.stopSpinnerFail('Could not apply fix automatically');
          ui.info('Please apply the suggested changes manually');
        }
      } else {
        ui.info('Fix not applied');
      }
    }

  } catch (error: any) {
    ui.stopSpinnerFail('Failed');
    ui.error(error.message);
    process.exit(1);
  }
}

// Export as default
export default fixCommand;
