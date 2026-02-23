/**
 * AWS Terraform Command
 *
 * Generate Terraform configurations from AWS infrastructure
 *
 * Usage: nimbus aws terraform [options]
 */

import { logger } from '../utils';
import { RestClient } from '../clients';
import {
  createWizard,
  ui,
  select,
  confirm,
  pathInput,
  type WizardStep,
  type StepResult,
} from '../wizard';
import { awsDiscoverCommand, type AwsDiscoverOptions } from './aws-discover';
import * as path from 'path';
import * as fs from 'fs';

// AWS Tools Service client
const awsToolsUrl = process.env.AWS_TOOLS_SERVICE_URL || 'http://localhost:3009';
const awsClient = new RestClient(awsToolsUrl);

/**
 * Terraform generation context
 */
export interface AwsTerraformContext {
  // Discovery input
  discoverySessionId?: string;
  resources?: DiscoveredResource[];

  // Generation options
  outputPath?: string;
  organizeByService?: boolean;
  generateImportBlocks?: boolean;
  generateImportScript?: boolean;
  terraformVersion?: string;
  awsProviderVersion?: string;

  // Starter kit options
  includeReadme?: boolean;
  includeGitignore?: boolean;
  includeMakefile?: boolean;

  // Output
  terraformSessionId?: string;
  generatedFiles?: Record<string, string>;
  summary?: GenerationSummary;
}

/**
 * Discovered resource
 */
interface DiscoveredResource {
  id: string;
  type: string;
  region: string;
  name?: string;
  tags?: Record<string, string>;
  properties: Record<string, unknown>;
}

/**
 * Generation summary
 */
interface GenerationSummary {
  totalResources: number;
  mappedResources: number;
  unmappedResources: number;
  filesGenerated: number;
  servicesIncluded: string[];
  regionsIncluded: string[];
}

/**
 * Command options from CLI arguments
 */
export interface AwsTerraformOptions {
  // Discovery options (for full flow)
  profile?: string;
  regions?: string[];
  services?: string[];

  // Direct generation options
  sessionId?: string; // Use existing discovery session
  resourcesFile?: string; // Load resources from JSON file

  // Generation options
  output?: string;
  organizeByService?: boolean;
  importBlocks?: boolean;
  importScript?: boolean;
  terraformVersion?: string;
  awsProviderVersion?: string;

  // Starter kit
  includeStarterKit?: boolean;
  includeReadme?: boolean;
  includeGitignore?: boolean;
  includeMakefile?: boolean;

  // Mode
  nonInteractive?: boolean;
  skipDiscovery?: boolean;
}

/**
 * Run the AWS terraform command
 */
export async function awsTerraformCommand(options: AwsTerraformOptions = {}): Promise<void> {
  logger.info('Starting AWS Terraform generation');

  // Non-interactive mode
  if (options.nonInteractive) {
    await runNonInteractive(options);
    return;
  }

  // Check if we have resources to generate from
  let resources: DiscoveredResource[] | undefined;
  let discoverySessionId: string | undefined;

  // Option 1: Use existing discovery session
  if (options.sessionId) {
    discoverySessionId = options.sessionId;
    ui.info(`Using existing discovery session: ${options.sessionId}`);
  }
  // Option 2: Load resources from file
  else if (options.resourcesFile) {
    ui.startSpinner({ message: 'Loading resources from file...' });
    try {
      const fileContent = await Bun.file(options.resourcesFile).text();
      const data = JSON.parse(fileContent);
      resources = data.resources || data;
      ui.stopSpinnerSuccess(`Loaded ${resources!.length} resources from file`);
    } catch (error: any) {
      ui.stopSpinnerFail(`Failed to load resources: ${error.message}`);
      return;
    }
  }
  // Option 3: Run discovery first
  else if (!options.skipDiscovery) {
    const discoveryOptions: AwsDiscoverOptions = {
      profile: options.profile,
      regions: options.regions,
      services: options.services,
      nonInteractive: false,
    };

    ui.header('nimbus aws terraform', 'Step 1: Infrastructure Discovery');
    ui.newLine();

    const inventory = await awsDiscoverCommand(discoveryOptions);
    if (!inventory) {
      ui.error('Discovery failed, cannot generate Terraform');
      return;
    }

    resources = inventory.resources;
    ui.newLine();
    ui.header('nimbus aws terraform', 'Step 2: Terraform Generation');
    ui.newLine();
  }

  // Interactive wizard for generation options
  const wizard = createWizard<AwsTerraformContext>({
    title: 'Terraform Generation',
    description: 'Configure Terraform generation options',
    initialContext: {
      discoverySessionId,
      resources,
      outputPath: options.output,
      organizeByService: options.organizeByService ?? true,
      generateImportBlocks: options.importBlocks ?? true,
      generateImportScript: options.importScript ?? true,
      terraformVersion: options.terraformVersion,
      awsProviderVersion: options.awsProviderVersion,
      includeReadme: options.includeReadme ?? options.includeStarterKit,
      includeGitignore: options.includeGitignore ?? options.includeStarterKit,
      includeMakefile: options.includeMakefile ?? options.includeStarterKit,
    },
    steps: createWizardSteps(!!discoverySessionId || !!resources),
    onEvent: (event) => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success) {
    displayCompletionMessage(result.context);
  } else {
    ui.error(`Generation failed: ${result.error?.message || 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Create wizard steps
 */
function createWizardSteps(hasResources: boolean): WizardStep<AwsTerraformContext>[] {
  const steps: WizardStep<AwsTerraformContext>[] = [];

  // Step 1: Generation Options
  steps.push({
    id: 'generation-options',
    title: 'Generation Options',
    description: 'Configure how Terraform files should be generated',
    execute: generationOptionsStep,
  });

  // Step 2: Output Location
  steps.push({
    id: 'output-location',
    title: 'Output Location',
    description: 'Where should the Terraform files be saved?',
    execute: outputLocationStep,
  });

  // Step 3: Generate
  steps.push({
    id: 'generate',
    title: 'Generate Terraform',
    description: 'Generating Terraform configurations...',
    execute: generateStep,
  });

  // Step 4: Write Files
  steps.push({
    id: 'write-files',
    title: 'Write Files',
    description: 'Writing files to disk...',
    execute: writeFilesStep,
  });

  return steps;
}

/**
 * Step 1: Generation Options
 */
async function generationOptionsStep(ctx: AwsTerraformContext): Promise<StepResult> {
  // Organization style
  const organizeChoice = await select<'service' | 'single'>({
    message: 'How should Terraform files be organized?',
    options: [
      {
        value: 'service',
        label: 'By service (Recommended)',
        description: 'Separate files for each AWS service (ec2.tf, s3.tf, etc.)',
      },
      {
        value: 'single',
        label: 'Single file',
        description: 'All resources in main.tf',
      },
    ],
    defaultValue: ctx.organizeByService !== false ? 'service' : 'single',
  });

  // Import method
  ui.newLine();
  const importMethod = await select<'both' | 'blocks' | 'script' | 'none'>({
    message: 'How should imports be generated?',
    options: [
      {
        value: 'both',
        label: 'Both import blocks and shell script (Recommended)',
        description: 'Maximum compatibility with all Terraform versions',
      },
      {
        value: 'blocks',
        label: 'Import blocks only (Terraform 1.5+)',
        description: 'Modern declarative imports in .tf files',
      },
      {
        value: 'script',
        label: 'Shell script only',
        description: 'Traditional terraform import commands',
      },
      {
        value: 'none',
        label: 'No imports',
        description: 'Generate resource definitions only',
      },
    ],
    defaultValue: 'both',
  });

  // Terraform version
  ui.newLine();
  const terraformVersion = await select({
    message: 'Target Terraform version:',
    options: [
      { value: '1.5.0', label: '1.5.0+', description: 'Supports import blocks' },
      { value: '1.4.0', label: '1.4.0', description: 'Latest stable without import blocks' },
      { value: '1.3.0', label: '1.3.0', description: 'Older version' },
    ],
    defaultValue: ctx.terraformVersion || '1.5.0',
  });

  // Starter kit
  ui.newLine();
  const includeStarterKit = await confirm({
    message: 'Include starter kit (README, .gitignore, Makefile)?',
    defaultValue: true,
  });

  return {
    success: true,
    data: {
      organizeByService: organizeChoice === 'service',
      generateImportBlocks: importMethod === 'both' || importMethod === 'blocks',
      generateImportScript: importMethod === 'both' || importMethod === 'script',
      terraformVersion,
      includeReadme: includeStarterKit,
      includeGitignore: includeStarterKit,
      includeMakefile: includeStarterKit,
    },
  };
}

/**
 * Step 2: Output Location
 */
async function outputLocationStep(ctx: AwsTerraformContext): Promise<StepResult> {
  const outputPath = await pathInput(
    'Where should the Terraform files be saved?',
    ctx.outputPath || './terraform-aws'
  );

  if (!outputPath) {
    return { success: false, error: 'Output path is required' };
  }

  // Check if directory exists
  const exists = fs.existsSync(outputPath);
  if (exists) {
    const files = fs.readdirSync(outputPath);
    if (files.length > 0) {
      ui.newLine();
      ui.warning(`Directory ${outputPath} is not empty (${files.length} files)`);

      const overwrite = await confirm({
        message: 'Overwrite existing files?',
        defaultValue: false,
      });

      if (!overwrite) {
        return { success: false, error: 'User cancelled - directory not empty' };
      }
    }
  }

  return {
    success: true,
    data: { outputPath },
  };
}

/**
 * Step 3: Generate Terraform
 */
async function generateStep(ctx: AwsTerraformContext): Promise<StepResult> {
  ui.startSpinner({ message: 'Generating Terraform configurations...' });

  try {
    let response: any;

    // Generate from discovery session or direct resources
    if (ctx.discoverySessionId) {
      response = await awsClient.post<{
        terraformSessionId: string;
        files: Record<string, string>;
        summary: GenerationSummary;
        imports: any[];
        importScript: string;
      }>('/api/aws/terraform/generate', {
        sessionId: ctx.discoverySessionId,
        options: {
          organizeByService: ctx.organizeByService,
          generateImportBlocks: ctx.generateImportBlocks,
          terraformVersion: ctx.terraformVersion,
          awsProviderVersion: ctx.awsProviderVersion,
        },
      });
    } else if (ctx.resources && ctx.resources.length > 0) {
      response = await awsClient.post<{
        terraformSessionId: string;
        files: Record<string, string>;
        summary: GenerationSummary;
        imports: any[];
        importScript: string;
      }>('/api/aws/terraform/generate-direct', {
        resources: ctx.resources,
        options: {
          organizeByService: ctx.organizeByService,
          generateImportBlocks: ctx.generateImportBlocks,
          terraformVersion: ctx.terraformVersion,
          awsProviderVersion: ctx.awsProviderVersion,
        },
      });
    } else {
      ui.stopSpinnerFail('No resources to generate from');
      return { success: false, error: 'No resources available' };
    }

    if (!response.success || !response.data) {
      ui.stopSpinnerFail(`Generation failed: ${response.error || 'Unknown error'}`);
      return { success: false, error: response.error || 'Generation failed' };
    }

    const { terraformSessionId, files, summary, importScript } = response.data;

    ui.stopSpinnerSuccess(`Generated ${Object.keys(files).length} files`);

    // Add starter kit files if requested
    const allFiles = { ...files };

    if (ctx.includeReadme) {
      allFiles['README.md'] = generateReadme(summary);
    }

    if (ctx.includeGitignore) {
      allFiles['.gitignore'] = generateGitignore();
    }

    if (ctx.includeMakefile) {
      allFiles['Makefile'] = generateMakefile();
    }

    if (ctx.generateImportScript && importScript) {
      allFiles['import.sh'] = importScript;
    }

    return {
      success: true,
      data: {
        terraformSessionId,
        generatedFiles: allFiles,
        summary,
      },
    };
  } catch (error: any) {
    ui.stopSpinnerFail(`Generation failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Step 4: Write Files
 */
async function writeFilesStep(ctx: AwsTerraformContext): Promise<StepResult> {
  if (!ctx.generatedFiles || !ctx.outputPath) {
    return { success: false, error: 'No files to write' };
  }

  ui.startSpinner({ message: 'Writing files to disk...' });

  try {
    // Create output directory
    if (!fs.existsSync(ctx.outputPath)) {
      fs.mkdirSync(ctx.outputPath, { recursive: true });
    }

    // Write each file
    const fileNames = Object.keys(ctx.generatedFiles);
    for (const fileName of fileNames) {
      const filePath = path.join(ctx.outputPath, fileName);
      const content = ctx.generatedFiles[fileName];

      // Create subdirectories if needed
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await Bun.write(filePath, content);
    }

    // Make import script executable
    if (ctx.generatedFiles['import.sh']) {
      const scriptPath = path.join(ctx.outputPath, 'import.sh');
      fs.chmodSync(scriptPath, '755');
    }

    ui.stopSpinnerSuccess(`Wrote ${fileNames.length} files to ${ctx.outputPath}`);

    return {
      success: true,
      data: { filesWritten: fileNames.length },
    };
  } catch (error: any) {
    ui.stopSpinnerFail(`Failed to write files: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Generate README.md content
 */
function generateReadme(summary: GenerationSummary): string {
  return `# Terraform AWS Infrastructure

Generated by Nimbus CLI

## Summary

- **Total Resources**: ${summary.totalResources}
- **Mapped Resources**: ${summary.mappedResources}
- **Unmapped Resources**: ${summary.unmappedResources}
- **Files Generated**: ${summary.filesGenerated}

### Services

${summary.servicesIncluded.map(s => `- ${s}`).join('\n')}

### Regions

${summary.regionsIncluded.map(r => `- ${r}`).join('\n')}

## Getting Started

1. **Initialize Terraform**:
   \`\`\`bash
   terraform init
   \`\`\`

2. **Import existing resources** (choose one):

   Using import blocks (Terraform 1.5+):
   \`\`\`bash
   terraform plan -generate-config-out=generated.tf
   \`\`\`

   Using import script:
   \`\`\`bash
   ./import.sh
   \`\`\`

3. **Review the plan**:
   \`\`\`bash
   terraform plan
   \`\`\`

4. **Apply changes** (should show no changes if imports were successful):
   \`\`\`bash
   terraform apply
   \`\`\`

## File Structure

- \`providers.tf\` - AWS provider configuration
- \`variables.tf\` - Input variables
- \`outputs.tf\` - Output values
- \`*.tf\` - Resource definitions by service
- \`import.sh\` - Import script for existing resources

## Notes

- Review all generated configurations before applying
- Some sensitive values may need to be filled in manually
- Consider using Terraform workspaces for different environments
`;
}

/**
 * Generate .gitignore content
 */
function generateGitignore(): string {
  return `# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
crash.log
crash.*.log
*.tfvars
*.tfvars.json
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Sensitive files
*.pem
*.key
.env
.env.*

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
}

/**
 * Generate Makefile content
 */
function generateMakefile(): string {
  return `# Terraform Makefile

.PHONY: init plan apply destroy fmt validate import clean

# Initialize Terraform
init:
	terraform init

# Plan changes
plan:
	terraform plan

# Apply changes
apply:
	terraform apply

# Destroy infrastructure
destroy:
	terraform destroy

# Format code
fmt:
	terraform fmt -recursive

# Validate configuration
validate:
	terraform validate

# Import existing resources
import:
	./import.sh

# Clean up
clean:
	rm -rf .terraform
	rm -f .terraform.lock.hcl

# Full workflow
all: init fmt validate plan
`;
}

/**
 * Display completion message
 */
function displayCompletionMessage(ctx: AwsTerraformContext): void {
  ui.newLine();
  ui.box({
    title: 'Terraform Generation Complete!',
    content: [
      `Output: ${ctx.outputPath}`,
      `Files: ${Object.keys(ctx.generatedFiles || {}).length}`,
      '',
      'Summary:',
      `  Resources: ${ctx.summary?.mappedResources || 0} mapped, ${ctx.summary?.unmappedResources || 0} unmapped`,
      `  Services: ${ctx.summary?.servicesIncluded?.join(', ') || 'N/A'}`,
      '',
      'Next steps:',
      `  1. cd ${ctx.outputPath}`,
      '  2. terraform init',
      '  3. ./import.sh   # Import existing resources',
      '  4. terraform plan',
    ],
    style: 'rounded',
    borderColor: 'green',
    padding: 1,
  });
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: AwsTerraformOptions): Promise<void> {
  ui.header('nimbus aws terraform', 'Non-interactive mode');

  // Must have either session ID, resources file, or profile for discovery
  if (!options.sessionId && !options.resourcesFile && !options.profile) {
    ui.error('One of --session-id, --resources-file, or --profile is required');
    process.exit(1);
  }

  let resources: DiscoveredResource[] | undefined;

  // Load from file if specified
  if (options.resourcesFile) {
    ui.startSpinner({ message: 'Loading resources from file...' });
    try {
      const fileContent = await Bun.file(options.resourcesFile).text();
      const data = JSON.parse(fileContent);
      resources = data.resources || data;
      ui.stopSpinnerSuccess(`Loaded ${resources!.length} resources`);
    } catch (error: any) {
      ui.stopSpinnerFail(`Failed to load resources: ${error.message}`);
      process.exit(1);
    }
  }
  // Run discovery if profile specified
  else if (options.profile && !options.sessionId) {
    const discoveryOptions: AwsDiscoverOptions = {
      profile: options.profile,
      regions: options.regions,
      services: options.services,
      nonInteractive: true,
    };

    const inventory = await awsDiscoverCommand(discoveryOptions);
    if (!inventory) {
      ui.error('Discovery failed');
      process.exit(1);
    }
    resources = inventory.resources;
  }

  // Generate Terraform
  ui.startSpinner({ message: 'Generating Terraform configurations...' });

  try {
    let response: any;

    if (options.sessionId) {
      response = await awsClient.post('/api/aws/terraform/generate', {
        sessionId: options.sessionId,
        options: {
          organizeByService: options.organizeByService ?? true,
          generateImportBlocks: options.importBlocks ?? true,
          terraformVersion: options.terraformVersion || '1.5.0',
        },
      });
    } else if (resources) {
      response = await awsClient.post('/api/aws/terraform/generate-direct', {
        resources,
        options: {
          organizeByService: options.organizeByService ?? true,
          generateImportBlocks: options.importBlocks ?? true,
          terraformVersion: options.terraformVersion || '1.5.0',
        },
      });
    }

    if (!response.success || !response.data) {
      ui.stopSpinnerFail('Generation failed');
      process.exit(1);
    }

    const { files, summary, importScript } = response.data;
    ui.stopSpinnerSuccess(`Generated ${Object.keys(files).length} files`);

    // Write files
    const outputPath = options.output || './terraform-aws';
    ui.startSpinner({ message: 'Writing files...' });

    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    // Add starter kit if requested
    if (options.includeStarterKit || options.includeReadme) {
      files['README.md'] = generateReadme(summary);
    }
    if (options.includeStarterKit || options.includeGitignore) {
      files['.gitignore'] = generateGitignore();
    }
    if (options.includeStarterKit || options.includeMakefile) {
      files['Makefile'] = generateMakefile();
    }
    if (importScript && (options.importScript ?? true)) {
      files['import.sh'] = importScript;
    }

    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(outputPath, fileName);
      await Bun.write(filePath, content as string);
    }

    if (files['import.sh']) {
      fs.chmodSync(path.join(outputPath, 'import.sh'), '755');
    }

    ui.stopSpinnerSuccess(`Wrote ${Object.keys(files).length} files to ${outputPath}`);

    // Show summary
    ui.newLine();
    ui.success('Generation complete!');
    ui.print(`  Output: ${outputPath}`);
    ui.print(`  Resources: ${summary.mappedResources} mapped, ${summary.unmappedResources} unmapped`);
  } catch (error: any) {
    ui.stopSpinnerFail(`Generation failed: ${error.message}`);
    process.exit(1);
  }
}

export default awsTerraformCommand;
