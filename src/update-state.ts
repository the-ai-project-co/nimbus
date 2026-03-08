/**
 * Shared update state — allows the background update check in nimbus.ts to
 * communicate a newer version to the TUI without coupling to stderr.
 *
 * The update check fires in nimbus.ts before the TUI starts. The TUI
 * subscribes via onUpdate() and shows a system message when a newer version
 * is available.
 */

/** The latest version string if a newer version was found, else null. */
let _latestVersion: string | null = null;

/** Callbacks registered by the TUI to be notified of updates. */
const _listeners: Array<(version: string) => void> = [];

/**
 * Called by the update checker (nimbus.ts) when a newer version is detected.
 */
export function setLatestVersion(version: string): void {
  _latestVersion = version;
  for (const cb of _listeners) {
    try { cb(version); } catch { /* ignore */ }
  }
}

/**
 * Returns the latest version if one was found, else null.
 * Call this at any time to check if an update was detected.
 */
export function getLatestVersion(): string | null {
  return _latestVersion;
}

/**
 * Register a callback that fires immediately if an update is already known,
 * or later when the update check resolves.
 */
export function onUpdate(cb: (version: string) => void): void {
  if (_latestVersion) {
    try { cb(_latestVersion); } catch { /* ignore */ }
  } else {
    _listeners.push(cb);
  }
}
