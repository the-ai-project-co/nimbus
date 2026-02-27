/**
 * Runtime Compatibility Layer
 *
 * Detects whether we're running under Bun or Node.js and provides
 * compatibility shims for Bun-specific APIs when running under Node.
 */

/** Whether the current runtime is Bun. */
export const isBun = typeof globalThis.Bun !== 'undefined';

/** Whether the current runtime is Node.js (without Bun). */
export const isNode = !isBun && typeof process !== 'undefined' && !!process.versions?.node;
