-- Nimbus State Service Database Schema
-- Based on releases/mvp/docs/01-mvp-spec.md

-- Operation History
CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,           -- 'chat', 'generate', 'apply', 'k8s', etc.
    command TEXT NOT NULL,        -- Full command executed
    input TEXT,                   -- User input/prompt
    output TEXT,                  -- Result/output
    status TEXT DEFAULT 'success', -- 'success', 'error', 'cancelled'
    duration_ms INTEGER,
    model TEXT,                   -- LLM model used
    tokens_used INTEGER,
    cost_usd REAL,
    metadata TEXT                 -- JSON blob for additional data
);

-- Checkpoints (for resumable operations)
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    operation_id TEXT REFERENCES operations(id),
    step INTEGER,
    state TEXT,                   -- JSON state blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates (user-saved)
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'terraform', 'k8s', 'helm'
    content TEXT NOT NULL,
    variables TEXT,               -- JSON variables
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Configuration (key-value store)
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,          -- JSON value
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_operation ON checkpoints(operation_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
