import { describe, test, expect } from 'bun:test';
import { getAzurePrice } from '../../../src/commands/cost/pricing/azure';
import type { TerraformResource } from '../../../src/commands/cost/parsers/types';

function makeResource(type: string, attributes: Record<string, any> = {}): TerraformResource {
  return { type, name: 'test', provider: 'azure', attributes };
}

describe('Azure Pricing', () => {
  test('should return price for azurerm_virtual_machine', () => {
    const result = getAzurePrice(makeResource('azurerm_virtual_machine', { vm_size: 'Standard_B1s' }));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for azurerm_kubernetes_cluster (AKS)', () => {
    const result = getAzurePrice(makeResource('azurerm_kubernetes_cluster'));
    expect(result).not.toBeNull();
  });

  test('should return price for azurerm_storage_account', () => {
    const result = getAzurePrice(makeResource('azurerm_storage_account'));
    expect(result).not.toBeNull();
  });

  test('should return price for azurerm_mssql_server', () => {
    const result = getAzurePrice(makeResource('azurerm_mssql_server'));
    expect(result).not.toBeNull();
  });

  test('should return null for unknown Azure resource type', () => {
    const result = getAzurePrice(makeResource('azurerm_totally_unknown'));
    expect(result).toBeNull();
  });

  test('should handle linux_virtual_machine type', () => {
    const result = getAzurePrice(makeResource('azurerm_linux_virtual_machine', { size: 'Standard_B1s' }));
    expect(result).not.toBeNull();
  });
});
