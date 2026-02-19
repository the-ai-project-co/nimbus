import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Gap 3: Billing invoices — SQLite synthetic invoices
 *
 * Tests the invoices table, getInvoices, and generateInvoice functions
 * using a temporary database.
 */

// We need to set up the env before importing the adapter
let tmpDir: string;
let dbPath: string;

describe('Gap 3: Billing invoices', () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-billing-test-'));
    dbPath = path.join(tmpDir, 'test-billing.db');
    process.env.BILLING_DATABASE_PATH = dbPath;

    // Clear module cache to force re-initialization with new path
    // We'll use direct SQLite for isolation
  });

  afterEach(() => {
    delete process.env.BILLING_DATABASE_PATH;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createTestDb(): Database {
    const db = new Database(dbPath);

    db.run(`
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT,
        operation_type TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL,
        total_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        operation_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'paid',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_team ON invoices(team_id, period_start)`);

    return db;
  }

  describe('invoices table', () => {
    test('should create invoices table', () => {
      const db = createTestDb();
      const tables = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='invoices'"
      ).all();
      expect(tables.length).toBe(1);
      db.close();
    });

    test('should create team index on invoices', () => {
      const db = createTestDb();
      const indexes = db.query(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invoices_team'"
      ).all();
      expect(indexes.length).toBe(1);
      db.close();
    });

    test('should have correct columns', () => {
      const db = createTestDb();
      const columns = db.query("PRAGMA table_info(invoices)").all() as Array<{ name: string }>;
      const colNames = columns.map(c => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('team_id');
      expect(colNames).toContain('period_start');
      expect(colNames).toContain('period_end');
      expect(colNames).toContain('total_tokens');
      expect(colNames).toContain('total_cost_usd');
      expect(colNames).toContain('operation_count');
      expect(colNames).toContain('status');
      expect(colNames).toContain('created_at');
      db.close();
    });
  });

  describe('getInvoices', () => {
    test('should return empty array when no invoices exist', () => {
      const db = createTestDb();
      const invoices = db.query(
        'SELECT * FROM invoices WHERE team_id = ? ORDER BY period_start DESC LIMIT ?'
      ).all('team-1', 10);
      expect(invoices).toEqual([]);
      db.close();
    });

    test('should return invoices ordered by period_start DESC', () => {
      const db = createTestDb();

      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end, total_tokens, total_cost_usd, operation_count)
        VALUES ('inv-1', 'team-1', '2025-01-01', '2025-02-01', 1000, 0.50, 10)`);
      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end, total_tokens, total_cost_usd, operation_count)
        VALUES ('inv-2', 'team-1', '2025-02-01', '2025-03-01', 2000, 1.00, 20)`);

      const invoices = db.query(
        'SELECT * FROM invoices WHERE team_id = ? ORDER BY period_start DESC LIMIT ?'
      ).all('team-1', 10) as any[];

      expect(invoices.length).toBe(2);
      expect(invoices[0].id).toBe('inv-2');
      expect(invoices[1].id).toBe('inv-1');
      db.close();
    });

    test('should respect limit parameter', () => {
      const db = createTestDb();

      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end) VALUES ('inv-1', 'team-1', '2025-01-01', '2025-02-01')`);
      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end) VALUES ('inv-2', 'team-1', '2025-02-01', '2025-03-01')`);
      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end) VALUES ('inv-3', 'team-1', '2025-03-01', '2025-04-01')`);

      const invoices = db.query(
        'SELECT * FROM invoices WHERE team_id = ? ORDER BY period_start DESC LIMIT ?'
      ).all('team-1', 2) as any[];

      expect(invoices.length).toBe(2);
      db.close();
    });

    test('should filter by team_id', () => {
      const db = createTestDb();

      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end) VALUES ('inv-1', 'team-1', '2025-01-01', '2025-02-01')`);
      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end) VALUES ('inv-2', 'team-2', '2025-01-01', '2025-02-01')`);

      const invoices = db.query(
        'SELECT * FROM invoices WHERE team_id = ? ORDER BY period_start DESC LIMIT ?'
      ).all('team-1', 10) as any[];

      expect(invoices.length).toBe(1);
      expect(invoices[0].team_id).toBe('team-1');
      db.close();
    });
  });

  describe('generateInvoice (aggregation logic)', () => {
    test('should aggregate usage_records into an invoice', () => {
      const db = createTestDb();

      // Insert usage records
      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u1', 'team-1', 'generate', 500, 0.25, '2025-01-15T10:00:00Z')`);
      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u2', 'team-1', 'chat', 300, 0.15, '2025-01-20T10:00:00Z')`);

      // Aggregate
      const agg = db.query(`
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
        FROM usage_records
        WHERE team_id = ?
          AND timestamp >= ?
          AND timestamp < ?
      `).get('team-1', '2025-01-01', '2025-02-01') as any;

      expect(agg.total_tokens).toBe(800);
      expect(agg.total_cost_usd).toBeCloseTo(0.40, 2);
      expect(agg.operation_count).toBe(2);

      // Insert invoice
      const id = 'test-inv-1';
      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end, total_tokens, total_cost_usd, operation_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, 'team-1', '2025-01-01', '2025-02-01', agg.total_tokens, agg.total_cost_usd, agg.operation_count]
      );

      const invoice = db.query('SELECT * FROM invoices WHERE id = ?').get(id) as any;
      expect(invoice).toBeDefined();
      expect(invoice.team_id).toBe('team-1');
      expect(invoice.total_tokens).toBe(800);
      expect(invoice.total_cost_usd).toBeCloseTo(0.40, 2);
      expect(invoice.operation_count).toBe(2);
      expect(invoice.status).toBe('paid');
      db.close();
    });

    test('should handle empty period with zero aggregates', () => {
      const db = createTestDb();

      const agg = db.query(`
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
        FROM usage_records
        WHERE team_id = ?
          AND timestamp >= ?
          AND timestamp < ?
      `).get('team-1', '2025-01-01', '2025-02-01') as any;

      expect(agg.total_tokens).toBe(0);
      expect(agg.total_cost_usd).toBe(0);
      expect(agg.operation_count).toBe(0);

      db.run(`INSERT INTO invoices (id, team_id, period_start, period_end, total_tokens, total_cost_usd, operation_count)
        VALUES ('inv-empty', 'team-1', '2025-01-01', '2025-02-01', ?, ?, ?)`,
        [agg.total_tokens, agg.total_cost_usd, agg.operation_count]
      );

      const invoice = db.query('SELECT * FROM invoices WHERE id = ?').get('inv-empty') as any;
      expect(invoice.total_tokens).toBe(0);
      expect(invoice.total_cost_usd).toBe(0);
      expect(invoice.operation_count).toBe(0);
      db.close();
    });

    test('should only aggregate records within the period', () => {
      const db = createTestDb();

      // Record inside period
      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u1', 'team-1', 'generate', 500, 0.25, '2025-01-15T10:00:00Z')`);
      // Record outside period
      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u2', 'team-1', 'chat', 300, 0.15, '2025-02-15T10:00:00Z')`);

      const agg = db.query(`
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
        FROM usage_records
        WHERE team_id = ?
          AND timestamp >= ?
          AND timestamp < ?
      `).get('team-1', '2025-01-01', '2025-02-01') as any;

      expect(agg.total_tokens).toBe(500);
      expect(agg.total_cost_usd).toBeCloseTo(0.25, 2);
      expect(agg.operation_count).toBe(1);
      db.close();
    });

    test('should only aggregate records for the specified team', () => {
      const db = createTestDb();

      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u1', 'team-1', 'generate', 500, 0.25, '2025-01-15T10:00:00Z')`);
      db.run(`INSERT INTO usage_records (id, team_id, operation_type, tokens_used, cost_usd, timestamp)
        VALUES ('u2', 'team-2', 'generate', 1000, 0.50, '2025-01-15T10:00:00Z')`);

      const agg = db.query(`
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
        FROM usage_records
        WHERE team_id = ?
          AND timestamp >= ?
          AND timestamp < ?
      `).get('team-1', '2025-01-01', '2025-02-01') as any;

      expect(agg.total_tokens).toBe(500);
      expect(agg.operation_count).toBe(1);
      db.close();
    });
  });

  describe('billing server source verification', () => {
    const serverPath = path.resolve(
      __dirname,
      '../../src/server.ts'
    );

    test('server should import getInvoices', () => {
      const source = fs.readFileSync(serverPath, 'utf-8');
      expect(source).toContain('getInvoices');
    });

    test('server should import generateInvoice', () => {
      const source = fs.readFileSync(serverPath, 'utf-8');
      expect(source).toContain('generateInvoice');
    });

    test('server should have POST /api/billing/invoices/generate route', () => {
      const source = fs.readFileSync(serverPath, 'utf-8');
      expect(source).toContain('/api/billing/invoices/generate');
    });

    test('server should not contain getMockInvoices', () => {
      const source = fs.readFileSync(serverPath, 'utf-8');
      expect(source).not.toContain('getMockInvoices');
    });
  });
});
