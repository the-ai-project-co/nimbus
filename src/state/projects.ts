/**
 * Project CRUD helpers.
 *
 * Refactored from SQLiteAdapter.saveProject, getProject, getProjectByPath,
 * listProjects, and deleteProject.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape returned by project query helpers. */
export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  config: any;
  lastScanned: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist or update a project.  Uses INSERT ... ON CONFLICT to upsert.
 */
export function saveProject(
  id: string,
  name: string,
  projectPath: string,
  config: any,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO projects (id, name, path, config, last_scanned, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      config = excluded.config,
      last_scanned = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(id, name, projectPath, JSON.stringify(config));
}

/**
 * Retrieve a project by id.
 */
export function getProject(id: string, db?: Database): ProjectRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM projects WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    config: JSON.parse(row.config),
    lastScanned: row.last_scanned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Retrieve a project by its filesystem path.
 */
export function getProjectByPath(projectPath: string, db?: Database): ProjectRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM projects WHERE path = ?');
  const row: any = stmt.get(projectPath);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    config: JSON.parse(row.config),
    lastScanned: row.last_scanned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List all projects ordered by most-recently updated first.
 */
export function listProjects(db?: Database): ProjectRecord[] {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
  const rows: any[] = stmt.all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    path: row.path,
    config: JSON.parse(row.config),
    lastScanned: row.last_scanned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Delete a project by id.
 */
export function deleteProject(id: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM projects WHERE id = ?');
  stmt.run(id);
}
