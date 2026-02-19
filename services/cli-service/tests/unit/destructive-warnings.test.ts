import { describe, test, expect } from 'bun:test';

/**
 * Tests verifying that destructive operations in k8s and helm commands
 * show warnings before proceeding.
 *
 * These tests validate the source code contains the expected warning patterns
 * rather than invoking the actual commands (which require running services).
 */

describe('Destructive operation warnings', () => {
  describe('k8s delete command', () => {
    test('should contain destructive operation warning', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/k8s/index.ts', import.meta.url).pathname
      ).text();

      // Verify the k8sDeleteCommand shows a destructive warning
      expect(source).toContain('Destructive operation: deleting');
      expect(source).toContain('Resources affected:');
      expect(source).toContain('Impact:');
    });

    test('should call showDestructionCostWarning before delete', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/k8s/index.ts', import.meta.url).pathname
      ).text();

      // showDestructionCostWarning should be imported
      expect(source).toContain("import { showDestructionCostWarning }");

      // It should be called in k8sDeleteCommand
      expect(source).toContain('await showDestructionCostWarning(process.cwd())');
    });

    test('should require confirmation with resource name for delete', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/k8s/index.ts', import.meta.url).pathname
      ).text();

      // confirmWithResourceName should be imported
      expect(source).toContain("import { confirmWithResourceName }");

      // It should be called for non-forced, non-dry-run deletes
      expect(source).toContain('confirmWithResourceName(name, resource)');
    });

    test('should show resource details in warning', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/k8s/index.ts', import.meta.url).pathname
      ).text();

      // Should display resource type, name, and namespace
      expect(source).toContain("ui.color('Resource:', 'yellow')");
      expect(source).toContain("ui.color('Name:', 'yellow')");
      expect(source).toContain("ui.color('Namespace:', 'yellow')");
    });
  });

  describe('helm uninstall command', () => {
    test('should contain destructive operation warning', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/helm/index.ts', import.meta.url).pathname
      ).text();

      // Verify the helmUninstallCommand shows a destructive warning
      expect(source).toContain('Destructive operation: uninstalling helm release');
    });

    test('should show release info before uninstall', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/helm/index.ts', import.meta.url).pathname
      ).text();

      // Should display release details
      expect(source).toContain("ui.color('Release:', 'yellow')");
      expect(source).toContain("ui.color('Namespace:', 'yellow')");
      expect(source).toContain("ui.color('Keep history:', 'yellow')");
      expect(source).toContain("ui.color('Impact:', 'red')");
    });

    test('should call showDestructionCostWarning before uninstall', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/helm/index.ts', import.meta.url).pathname
      ).text();

      // showDestructionCostWarning should be imported
      expect(source).toContain("import { showDestructionCostWarning }");

      // It should be called in helmUninstallCommand
      expect(source).toContain('await showDestructionCostWarning(process.cwd())');
    });

    test('should require confirmation for non-dry-run uninstall', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/helm/index.ts', import.meta.url).pathname
      ).text();

      // confirmWithResourceName should be imported
      expect(source).toContain("import { confirmWithResourceName }");

      // It should be called for non-dry-run uninstalls
      expect(source).toContain("confirmWithResourceName(releaseName, 'helm release')");
    });

    test('should attempt to display release status info', async () => {
      const source = await Bun.file(
        new URL('../../src/commands/helm/index.ts', import.meta.url).pathname
      ).text();

      // Should try to fetch release status for display
      expect(source).toContain('helmClient.status');
      expect(source).toContain("ui.color('Chart:', 'yellow')");
      expect(source).toContain("ui.color('Revision:', 'yellow')");
    });
  });
});
