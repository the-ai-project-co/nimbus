/**
 * Tests for src/version.ts
 *
 * Verifies that the module exports a valid semver VERSION string and a
 * non-empty BUILD_DATE string.
 */

import { describe, it, expect } from 'bun:test';
import { VERSION, BUILD_DATE } from '../version';

describe('version', () => {
  it('exports VERSION as a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('VERSION matches semver format (MAJOR.MINOR.PATCH)', () => {
    // A loose semver pattern: digits separated by dots, with optional pre-release
    const semverLoose = /^\d+\.\d+\.\d+/;
    expect(semverLoose.test(VERSION)).toBe(true);
  });

  it('VERSION major version is a non-negative integer', () => {
    const major = parseInt(VERSION.split('.')[0], 10);
    expect(Number.isInteger(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(0);
  });

  it('VERSION minor and patch are non-negative integers', () => {
    const parts = VERSION.split('.');
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);
    expect(minor).toBeGreaterThanOrEqual(0);
    expect(patch).toBeGreaterThanOrEqual(0);
  });

  it('exports BUILD_DATE as a non-empty string', () => {
    expect(typeof BUILD_DATE).toBe('string');
    expect(BUILD_DATE.length).toBeGreaterThan(0);
  });

  it('BUILD_DATE is "dev" in development or ISO-like date in builds', () => {
    // In dev mode the placeholder is detected and replaced with 'dev'.
    // After a compiled build it is an ISO 8601 date string (YYYY-MM-DD).
    const isDev = BUILD_DATE === 'dev';
    const isISODate = /^\d{4}-\d{2}-\d{2}/.test(BUILD_DATE);
    expect(isDev || isISODate).toBe(true);
  });
});
