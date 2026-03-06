/**
 * OS Keychain Abstraction
 *
 * Wraps the optional `keytar` package (native Node addon) to provide
 * secure OS-level secret storage. If keytar is unavailable the module
 * silently falls back to the existing machine-fingerprint key derivation.
 *
 * On macOS: credentials are stored in the macOS Keychain.
 * On Linux:  credentials are stored via libsecret (GNOME Keyring / KDE Wallet).
 * On Windows: credentials are stored in Windows Credential Manager.
 */

const SERVICE = 'nimbus-ai';

/** Lazy-loaded keytar module. null = checked and unavailable. */
let keytarModule: {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
} | null | undefined = undefined; // undefined = not yet checked

async function loadKeytar() {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // Dynamic import — keytar is an optional peer dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keytarModule = require('keytar') as typeof keytarModule;
  } catch {
    keytarModule = null;
  }
  return keytarModule;
}

/**
 * Check whether OS keychain integration is available.
 */
export async function isKeychainAvailable(): Promise<boolean> {
  const kt = await loadKeytar();
  return kt !== null;
}

/**
 * Retrieve a secret from the OS keychain.
 * Returns null if not found or keychain unavailable.
 */
export async function keychainGet(account: string): Promise<string | null> {
  const kt = await loadKeytar();
  if (!kt) return null;
  try {
    return await kt.getPassword(SERVICE, account);
  } catch {
    return null;
  }
}

/**
 * Store a secret in the OS keychain.
 * No-op if keychain unavailable.
 */
export async function keychainSet(account: string, secret: string): Promise<void> {
  const kt = await loadKeytar();
  if (!kt) return;
  try {
    await kt.setPassword(SERVICE, account, secret);
  } catch {
    // Silently ignore keychain errors — caller falls back to file-based storage
  }
}

/**
 * Delete a secret from the OS keychain.
 * No-op if keychain unavailable.
 */
export async function keychainDelete(account: string): Promise<void> {
  const kt = await loadKeytar();
  if (!kt) return;
  try {
    await kt.deletePassword(SERVICE, account);
  } catch {
    /* ignore */
  }
}
