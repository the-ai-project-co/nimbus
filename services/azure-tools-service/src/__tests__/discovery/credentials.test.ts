import { describe, test, expect, mock } from 'bun:test';

// Mock Azure SDK
mock.module('@azure/identity', () => ({
  DefaultAzureCredential: class {
    getToken() { return Promise.resolve({ token: 'mock-token', expiresOnTimestamp: Date.now() + 3600000 }); }
  },
}));

mock.module('@azure/arm-subscriptions', () => ({
  SubscriptionClient: class {
    subscriptions = {
      list: () => ({
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true }) };
        },
      }),
    };
  },
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { AzureCredentialManager } from '../../discovery/credentials';

describe('Azure CredentialManager', () => {
  test('should be instantiable without config', () => {
    const manager = new AzureCredentialManager();
    expect(manager).toBeDefined();
  });

  test('should be instantiable with subscription ID', () => {
    const manager = new AzureCredentialManager({
      defaultSubscriptionId: 'test-sub-123',
    });
    expect(manager).toBeDefined();
  });

  test('should return credential instance', () => {
    const manager = new AzureCredentialManager();
    const cred = manager.getCredential();
    expect(cred).toBeDefined();
  });

  test('should return default subscription ID', () => {
    const manager = new AzureCredentialManager({ defaultSubscriptionId: 'test-sub-id' });
    expect(manager.getDefaultSubscriptionId()).toBe('test-sub-id');
  });

  test('should return empty string for subscription when not set', () => {
    const orig = process.env.AZURE_SUBSCRIPTION_ID;
    delete process.env.AZURE_SUBSCRIPTION_ID;
    const manager = new AzureCredentialManager();
    expect(manager.getDefaultSubscriptionId()).toBe('');
    if (orig) process.env.AZURE_SUBSCRIPTION_ID = orig;
  });
});
