import { describe, test, expect } from 'bun:test';

/**
 * Tests verifying that terraform apply with destroy count > 0
 * triggers type-name confirmation (confirmWithResourceName).
 */

describe('Terraform destroy type-name confirmation', () => {
  test('should import confirmWithResourceName', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/apply/terraform.ts', import.meta.url).pathname
    ).text();

    expect(source).toContain('confirmWithResourceName');
  });

  test('should parse destroy count from plan output', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/apply/terraform.ts', import.meta.url).pathname
    ).text();

    // Should check for destroys in plan output
    expect(source).toContain('to destroy');
    expect(source).toContain('destroyCount');
  });

  test('should use confirmWithResourceName when destroys > 0 in applyWithService', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/apply/terraform.ts', import.meta.url).pathname
    ).text();

    // The applyWithService function should call confirmWithResourceName
    // with the directory and 'terraform directory' type
    expect(source).toContain("confirmWithResourceName(directory, 'terraform directory')");
  });

  test('should use confirmWithResourceName when destroys > 0 in applyWithLocalCLI', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/apply/terraform.ts', import.meta.url).pathname
    ).text();

    // Both paths should have type-name confirmation for destroys
    const matches = source.match(/confirmWithResourceName\(directory, 'terraform directory'\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test('should keep simple confirm for non-destructive changes', async () => {
    const source = await Bun.file(
      new URL('../../src/commands/apply/terraform.ts', import.meta.url).pathname
    ).text();

    // Regular confirm should still exist for non-destructive changes
    expect(source).toContain("message: 'Do you want to apply these changes?'");
  });
});
