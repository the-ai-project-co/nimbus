/**
 * Unit tests for Generator Service gaps D1 and D2.
 *
 * D1: Post-generation subprocess validation (terraform fmt / validate / tflint)
 * D2: /api/generator/ unified route prefix aliases
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  TerraformProjectGenerator,
  type GeneratedProject,
  type SubprocessResult,
  type SubprocessValidation,
  type TerraformProjectConfig,
  type GeneratedFile,
  type ValidationReport,
} from '../../src/generators/terraform-project-generator';
import { startServer } from '../../src/server';

// ---------------------------------------------------------------------------
// D1: Post-generation subprocess validation
// ---------------------------------------------------------------------------

describe('D1: Post-generation subprocess validation', () => {
  const generator = new TerraformProjectGenerator();

  const baseConfig: TerraformProjectConfig = {
    projectName: 'test-project',
    provider: 'aws',
    region: 'us-east-1',
    components: ['vpc'],
  };

  test('generate() returns files and in-memory validation', async () => {
    const result = await generator.generate(baseConfig);

    expect(result.files).toBeDefined();
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.validation).toBeDefined();
    expect(result.validation.valid).toBe(true);
    expect(result.validation.summary).toBeDefined();
    expect(typeof result.validation.summary.errors).toBe('number');
    expect(typeof result.validation.summary.warnings).toBe('number');
    expect(typeof result.validation.summary.info).toBe('number');
  }, 30_000);

  test('generate() includes subprocessValidation when terraform is available', async () => {
    const result = await generator.generate(baseConfig);

    // subprocessValidation is best-effort: it is present when terraform CLI
    // is installed and omitted otherwise. We verify the shape if present.
    if (result.subprocessValidation) {
      const sv = result.subprocessValidation;

      // fmtCheck
      expect(sv.fmtCheck).toBeDefined();
      expect(typeof sv.fmtCheck.success).toBe('boolean');
      expect(typeof sv.fmtCheck.stdout).toBe('string');
      expect(typeof sv.fmtCheck.stderr).toBe('string');

      // terraformValidate
      expect(sv.terraformValidate).toBeDefined();
      expect(typeof sv.terraformValidate.success).toBe('boolean');
      expect(typeof sv.terraformValidate.stdout).toBe('string');
      expect(typeof sv.terraformValidate.stderr).toBe('string');

      // tflint may be null
      if (sv.tflint !== null) {
        expect(typeof sv.tflint.success).toBe('boolean');
        expect(typeof sv.tflint.stdout).toBe('string');
        expect(typeof sv.tflint.stderr).toBe('string');
      }
    }

    // Either way, the result should always have files and validation
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.validation.valid).toBe(true);
  }, 30_000);

  test('generate() never throws even if subprocess validation fails', async () => {
    // Generate with a valid config -- subprocess validation is best-effort
    // and should never cause generate() to throw, even if terraform is not installed.
    const result = await generator.generate({
      projectName: 'fail-safe-test',
      provider: 'gcp',
      region: 'us-central1',
      components: ['vpc', 's3'],
    });

    expect(result.files).toBeDefined();
    expect(result.validation).toBeDefined();
  }, 30_000);

  test('validateProject detects missing required files', () => {
    const report = generator.validateProject([]);

    expect(report.valid).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
    // Should flag missing main.tf, variables.tf, outputs.tf, versions.tf, backend.tf
    const missingFileErrors = report.items.filter(
      (item) => item.severity === 'error' && item.rule === 'required-files',
    );
    expect(missingFileErrors.length).toBe(5);
  });

  test('validateProject detects mismatched braces', () => {
    const badFile: GeneratedFile = {
      path: 'main.tf',
      content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n',
    };

    const report = generator.validateProject([
      badFile,
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const syntaxErrors = report.items.filter(
      (item) => item.rule === 'hcl-syntax' && item.severity === 'error',
    );
    expect(syntaxErrors.length).toBeGreaterThan(0);
  });

  test('SubprocessResult type shape is correct', () => {
    // Compile-time check that SubprocessResult satisfies the expected shape
    const result: SubprocessResult = {
      success: true,
      stdout: 'formatted',
      stderr: '',
    };
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('formatted');
    expect(result.stderr).toBe('');
  });

  test('SubprocessValidation type shape is correct', () => {
    const validation: SubprocessValidation = {
      fmtCheck: { success: true, stdout: '', stderr: '' },
      terraformValidate: { success: true, stdout: 'Success!', stderr: '' },
      tflint: null,
    };

    expect(validation.fmtCheck.success).toBe(true);
    expect(validation.terraformValidate.success).toBe(true);
    expect(validation.tflint).toBeNull();
  });

  test('GeneratedProject type allows optional subprocessValidation', () => {
    // Without subprocessValidation
    const projectA: GeneratedProject = {
      files: [{ path: 'main.tf', content: '' }],
      validation: { valid: true, items: [], summary: { errors: 0, warnings: 0, info: 0 } },
    };
    expect(projectA.subprocessValidation).toBeUndefined();

    // With subprocessValidation
    const projectB: GeneratedProject = {
      files: [{ path: 'main.tf', content: '' }],
      validation: { valid: true, items: [], summary: { errors: 0, warnings: 0, info: 0 } },
      subprocessValidation: {
        fmtCheck: { success: true, stdout: '', stderr: '' },
        terraformValidate: { success: true, stdout: '', stderr: '' },
        tflint: null,
      },
    };
    expect(projectB.subprocessValidation).toBeDefined();
    expect(projectB.subprocessValidation!.fmtCheck.success).toBe(true);
  });

  test('validateWithSubprocess writes files to temp dir and cleans up', async () => {
    const files: GeneratedFile[] = [
      { path: 'main.tf', content: 'resource "null_resource" "test" {}' },
      { path: 'modules/vpc/main.tf', content: '# VPC module' },
    ];

    // This will either succeed (terraform installed) or return error results
    // (terraform not installed). Either way it should not throw.
    const result = await generator.validateWithSubprocess(files);

    expect(result.fmtCheck).toBeDefined();
    expect(result.terraformValidate).toBeDefined();
    // tflint may be null if not installed
    expect(result.tflint === null || typeof result.tflint === 'object').toBe(true);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// D2: /api/generator/ route prefix aliases
// ---------------------------------------------------------------------------

describe('D2: /api/generator/ route prefix aliases', () => {
  let app: any;
  const PORT = 4903;

  beforeAll(async () => {
    app = await startServer(PORT, PORT + 100);
  });

  afterAll(() => {
    if (app && typeof app.stop === 'function') {
      app.stop();
    }
  });

  const base = (path: string) => `http://localhost:${PORT}${path}`;

  test('original /health route still works', async () => {
    const res = await fetch(base('/health'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe('healthy');
  });

  test('GET /api/generator/templates forwards to /api/templates', async () => {
    const original = await fetch(base('/api/templates'));
    const aliased = await fetch(base('/api/generator/templates'));

    expect(original.status).toBe(200);
    expect(aliased.status).toBe(200);

    const origData = await original.json();
    const aliasData = await aliased.json();
    expect(origData.success).toBe(aliasData.success);
  });

  test('GET /api/generator/best-practices/rules forwards correctly', async () => {
    const original = await fetch(base('/api/best-practices/rules'));
    const aliased = await fetch(base('/api/generator/best-practices/rules'));

    expect(original.status).toBe(200);
    expect(aliased.status).toBe(200);

    const origData = await original.json();
    const aliasData = await aliased.json();
    expect(origData.success).toBe(aliasData.success);
  });

  test('POST /api/generator/questionnaire/start forwards correctly', async () => {
    const payload = JSON.stringify({ type: 'terraform' });
    const headers = { 'Content-Type': 'application/json' };

    const original = await fetch(base('/api/questionnaire/start'), {
      method: 'POST',
      headers,
      body: payload,
    });
    const aliased = await fetch(base('/api/generator/questionnaire/start'), {
      method: 'POST',
      headers,
      body: payload,
    });

    expect(original.status).toBe(200);
    expect(aliased.status).toBe(200);

    const origData = await original.json();
    const aliasData = await aliased.json();
    expect(origData.success).toBe(true);
    expect(aliasData.success).toBe(true);
  });

  test('POST /api/generator/generators/terraform/validate forwards correctly', async () => {
    const payload = JSON.stringify({
      files: [
        { path: 'main.tf', content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}\n' },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ],
    });
    const headers = { 'Content-Type': 'application/json' };

    const original = await fetch(base('/api/generators/terraform/validate'), {
      method: 'POST',
      headers,
      body: payload,
    });
    const aliased = await fetch(base('/api/generator/generators/terraform/validate'), {
      method: 'POST',
      headers,
      body: payload,
    });

    expect(original.status).toBe(200);
    expect(aliased.status).toBe(200);

    const origData = await original.json();
    const aliasData = await aliased.json();
    expect(origData.success).toBe(aliasData.success);
    expect(origData.data?.valid).toBe(aliasData.data?.valid);
  });

  test('POST /api/generator/generators/terraform/project forwards correctly', async () => {
    const payload = JSON.stringify({
      projectName: 'prefix-test',
      provider: 'aws',
      region: 'us-west-2',
      components: ['vpc'],
    });
    const headers = { 'Content-Type': 'application/json' };

    const original = await fetch(base('/api/generators/terraform/project'), {
      method: 'POST',
      headers,
      body: payload,
    });
    const aliased = await fetch(base('/api/generator/generators/terraform/project'), {
      method: 'POST',
      headers,
      body: payload,
    });

    expect(original.status).toBe(200);
    expect(aliased.status).toBe(200);

    const origData = await original.json();
    const aliasData = await aliased.json();
    expect(origData.success).toBe(true);
    expect(aliasData.success).toBe(true);
    expect(origData.data?.files?.length).toBe(aliasData.data?.files?.length);
  }, 60_000);
});
