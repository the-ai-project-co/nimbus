import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('TF subcommands (fmt, workspace, import, output)', () => {
  let tfCommandSource: string;
  let terraformClientSource: string;

  const tfFilePath = path.resolve(__dirname, '../../src/commands/tf/index.ts');
  const clientFilePath = path.resolve(__dirname, '../../src/clients/terraform-client.ts');

  test('should load tf commands source', async () => {
    tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
    expect(tfCommandSource).toBeTruthy();
  });

  // ==========================================
  // tfFmtCommand tests
  // ==========================================

  describe('tfFmtCommand', () => {
    test('tfFmtCommand function should exist', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('async function tfFmtCommand');
    });

    test('tfFmtCommand should display "Terraform Fmt" header', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Terraform Fmt'");
    });

    test('tfFmtCommand should call terraformClient.fmt()', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('terraformClient.fmt(');
    });

    test('tfFmtCommand should support check option', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('options.check');
    });

    test('tfFmtCommand should support recursive option', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('options.recursive');
    });

    test('tfFmtCommand should support diff option', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('options.diff');
    });
  });

  // ==========================================
  // tfWorkspaceCommand tests
  // ==========================================

  describe('tfWorkspaceCommand', () => {
    test('tfWorkspaceCommand function should exist', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('async function tfWorkspaceCommand');
    });

    test('tfWorkspaceCommand should display "Terraform Workspace" header', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Terraform Workspace'");
    });

    test('tfWorkspaceCommand should support list subcommand', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'list':");
      expect(tfCommandSource).toContain('terraformClient.workspace.list(');
    });

    test('tfWorkspaceCommand should support select subcommand', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'select':");
      expect(tfCommandSource).toContain('terraformClient.workspace.select(');
    });

    test('tfWorkspaceCommand should support new subcommand', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'new':");
      expect(tfCommandSource).toContain('terraformClient.workspace.new(');
    });

    test('tfWorkspaceCommand should support delete subcommand', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'delete':");
      expect(tfCommandSource).toContain('terraformClient.workspace.delete(');
    });

    test('tfWorkspaceCommand should require name for select, new, and delete', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Usage: nimbus tf workspace select <name>'");
      expect(tfCommandSource).toContain("'Usage: nimbus tf workspace new <name>'");
      expect(tfCommandSource).toContain("'Usage: nimbus tf workspace delete <name>'");
    });
  });

  // ==========================================
  // tfImportCommand tests
  // ==========================================

  describe('tfImportCommand', () => {
    test('tfImportCommand function should exist', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('async function tfImportCommand');
    });

    test('tfImportCommand should display "Terraform Import" header', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Terraform Import'");
    });

    test('tfImportCommand should call terraformClient.import()', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('terraformClient.import(');
    });

    test('tfImportCommand should accept address and id parameters', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('address: string');
      expect(tfCommandSource).toContain('id: string');
    });

    test('tfImportCommand should display address and ID in info', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('`Address: ${address}`');
      expect(tfCommandSource).toContain('`ID: ${id}`');
    });
  });

  // ==========================================
  // tfOutputCommand tests
  // ==========================================

  describe('tfOutputCommand', () => {
    test('tfOutputCommand function should exist', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('async function tfOutputCommand');
    });

    test('tfOutputCommand should display "Terraform Output" header', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Terraform Output'");
    });

    test('tfOutputCommand should call terraformClient.output()', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('terraformClient.output(');
    });

    test('tfOutputCommand should accept optional name parameter', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('name?: string');
    });
  });

  // ==========================================
  // Router switch cases
  // ==========================================

  describe('tfCommand router', () => {
    test('should have fmt case in switch', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'fmt':");
      // Verify it calls tfFmtCommand
      const fmtCase = tfCommandSource.indexOf("case 'fmt':");
      const nextCase = tfCommandSource.indexOf('case ', fmtCase + 1);
      const fmtSection = tfCommandSource.slice(fmtCase, nextCase);
      expect(fmtSection).toContain('tfFmtCommand');
    });

    test('should have workspace case in switch', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'workspace':");
      const wsCase = tfCommandSource.indexOf("case 'workspace':");
      const nextCase = tfCommandSource.indexOf('case ', wsCase + 1);
      const wsSection = tfCommandSource.slice(wsCase, nextCase);
      expect(wsSection).toContain('tfWorkspaceCommand');
    });

    test('should have import case in switch', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'import':");
      const importCase = tfCommandSource.indexOf("case 'import':");
      const nextCase = tfCommandSource.indexOf('case ', importCase + 1);
      const importSection = tfCommandSource.slice(importCase, nextCase);
      expect(importSection).toContain('tfImportCommand');
    });

    test('should have output case in switch', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("case 'output':");
      const outputCase = tfCommandSource.indexOf("case 'output':");
      const nextCase = tfCommandSource.indexOf('default:', outputCase + 1);
      const outputSection = tfCommandSource.slice(outputCase, nextCase);
      expect(outputSection).toContain('tfOutputCommand');
    });

    test('should require address and id args for import', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'Usage: nimbus tf import <address> <id>'");
    });

    test('default case should list all available commands including new ones', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('fmt');
      expect(tfCommandSource).toContain('workspace');
      expect(tfCommandSource).toContain('import');
      expect(tfCommandSource).toContain('output');
    });
  });

  // ==========================================
  // Arg parsing tests
  // ==========================================

  describe('Arg parsing', () => {
    test('should parse --check flag', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'--check'");
      expect(tfCommandSource).toContain('options.check = true');
    });

    test('should parse --recursive / -r flag', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'-r'");
      expect(tfCommandSource).toContain("'--recursive'");
    });

    test('should parse --diff flag', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain("'--diff'");
      expect(tfCommandSource).toContain('options.diff = true');
    });

    test('should collect positional args for workspace subcommands', async () => {
      tfCommandSource = await fs.readFile(tfFilePath, 'utf-8');
      expect(tfCommandSource).toContain('positionalArgs');
    });
  });

  // ==========================================
  // TerraformClient method tests
  // ==========================================

  describe('TerraformClient methods', () => {
    test('should have fmt method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('async fmt(');
      expect(terraformClientSource).toContain('/api/terraform/fmt');
    });

    test('should have workspace.list method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('/api/terraform/workspace/list');
    });

    test('should have workspace.select method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('/api/terraform/workspace/select');
    });

    test('should have workspace.new method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('/api/terraform/workspace/new');
    });

    test('should have workspace.delete method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('/api/terraform/workspace/delete');
    });

    test('should have import method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('async import(');
      expect(terraformClientSource).toContain('/api/terraform/import');
    });

    test('should have output method', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('async output(');
      expect(terraformClientSource).toContain('/api/terraform/output');
    });

    test('should export TerraformFmtResult type', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('export interface TerraformFmtResult');
    });

    test('should export TerraformOutputResult type', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('export interface TerraformOutputResult');
    });

    test('should export TerraformWorkspaceResult type', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('export interface TerraformWorkspaceResult');
    });

    test('should export TerraformImportResult type', async () => {
      terraformClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(terraformClientSource).toContain('export interface TerraformImportResult');
    });
  });

  // ==========================================
  // Command export tests
  // ==========================================

  describe('Command exports', () => {
    test('should export tfFmtCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.tfFmtCommand).toBe('function');
    });

    test('should export tfWorkspaceCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.tfWorkspaceCommand).toBe('function');
    });

    test('should export tfImportCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.tfImportCommand).toBe('function');
    });

    test('should export tfOutputCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.tfOutputCommand).toBe('function');
    });
  });
});
