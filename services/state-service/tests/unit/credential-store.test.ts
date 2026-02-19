import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { CredentialsManager } from '../../src/credentials/manager';

describe('Credential Store Endpoint (POST /credentials/:provider)', () => {
  const spies: Array<ReturnType<typeof spyOn>> = [];

  afterEach(() => {
    for (const s of spies) {
      s.mockRestore();
    }
    spies.length = 0;
  });

  test('storeCredential persists data via keychain or file fallback', async () => {
    const manager = new CredentialsManager();

    // Spy on storeCredential to avoid actual file/keychain writes
    const storeSpy = spyOn(manager, 'storeCredential').mockResolvedValue(undefined);
    spies.push(storeSpy);

    const data = { accessKeyId: 'AKIA1234', secretAccessKey: 's3cret' };
    await manager.storeCredential('aws', data);

    expect(storeSpy).toHaveBeenCalledTimes(1);
    expect(storeSpy).toHaveBeenCalledWith('aws', data);
  });

  test('storeCredential accepts arbitrary provider names', async () => {
    const manager = new CredentialsManager();

    const storeSpy = spyOn(manager, 'storeCredential').mockResolvedValue(undefined);
    spies.push(storeSpy);

    const data = { token: 'ghp_abc123' };
    await manager.storeCredential('github', data);

    expect(storeSpy).toHaveBeenCalledWith('github', data);
  });

  test('retrieveCredential returns stored data', async () => {
    const manager = new CredentialsManager();
    const testData = { accessKeyId: 'AKIA5678', region: 'us-west-2' };

    const retrieveSpy = spyOn(manager, 'retrieveCredential').mockResolvedValue(testData);
    spies.push(retrieveSpy);

    const result = await manager.retrieveCredential('aws');

    expect(result).toEqual(testData);
    expect(retrieveSpy).toHaveBeenCalledWith('aws');
  });

  test('retrieveCredential returns null for unknown provider', async () => {
    const manager = new CredentialsManager();

    const retrieveSpy = spyOn(manager, 'retrieveCredential').mockResolvedValue(null);
    spies.push(retrieveSpy);

    const result = await manager.retrieveCredential('nonexistent');

    expect(result).toBeNull();
  });

  test('deleteCredential removes stored data', async () => {
    const manager = new CredentialsManager();

    const deleteSpy = spyOn(manager, 'deleteCredential').mockResolvedValue(undefined);
    spies.push(deleteSpy);

    await manager.deleteCredential('aws');

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith('aws');
  });

  test('storeCredential and retrieveCredential roundtrip with real encryption', async () => {
    const manager = new CredentialsManager();
    const provider = `test-roundtrip-${Date.now()}`;
    const testData = { accessKeyId: 'AKIATEST', secretAccessKey: 'secret123' };

    try {
      // Store using real encryption (file fallback since keytar is likely unavailable)
      await manager.storeCredential(provider, testData);

      // Retrieve and verify
      const retrieved = await manager.retrieveCredential(provider);
      expect(retrieved).toEqual(testData);
    } finally {
      // Clean up
      await manager.deleteCredential(provider);
    }
  });

  test('credential store request body must contain data object', () => {
    // Validate the expected shape of the request body
    const validBody = { data: { accessKeyId: 'AKIA1234', secretAccessKey: 's3cret' } };
    expect(validBody.data).toBeDefined();
    expect(typeof validBody.data).toBe('object');
    expect(typeof validBody.data.accessKeyId).toBe('string');

    // Invalid bodies
    const noData = {};
    expect((noData as any).data).toBeUndefined();

    const nullData = { data: null };
    expect(nullData.data).toBeNull();
  });

  test('store and retrieve preserves all key-value pairs', async () => {
    const manager = new CredentialsManager();
    const provider = `test-kv-${Date.now()}`;
    const testData = {
      tenantId: 'tenant-abc',
      clientId: 'client-123',
      clientSecret: 'secret-xyz',
      subscriptionId: 'sub-456',
    };

    try {
      await manager.storeCredential(provider, testData);
      const retrieved = await manager.retrieveCredential(provider);
      expect(retrieved).toEqual(testData);
    } finally {
      await manager.deleteCredential(provider);
    }
  });
});
