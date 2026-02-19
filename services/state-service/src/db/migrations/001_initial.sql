-- Migration 001: Initial schema
-- Contains all tables and indexes from the original schema.sql

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

-- Conversations (chat history)
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    messages TEXT NOT NULL,       -- JSON array of messages
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT                 -- JSON blob for additional data
);

-- Artifacts (generated files/code)
CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'terraform', 'kubernetes', 'code', 'config'
    content TEXT NOT NULL,
    language TEXT,                -- Programming language or format
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT                 -- JSON blob for additional data
);

-- Project configurations
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    config TEXT NOT NULL,           -- JSON: project.yaml content
    last_scanned DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    action TEXT NOT NULL,           -- 'apply', 'destroy', 'generate', etc.
    resource_type TEXT,             -- 'terraform', 'kubernetes', 'helm'
    resource_id TEXT,
    input TEXT,                     -- JSON: command parameters
    output TEXT,                    -- JSON: command output
    status TEXT NOT NULL,           -- 'success', 'failure', 'cancelled'
    duration_ms INTEGER,
    metadata TEXT                   -- JSON: additional context
);

-- Safety check results
CREATE TABLE IF NOT EXISTS safety_checks (
    id TEXT PRIMARY KEY,
    operation_id TEXT REFERENCES operations(id),
    check_type TEXT NOT NULL,       -- 'pre', 'during', 'post'
    check_name TEXT NOT NULL,
    passed INTEGER NOT NULL,        -- 0 or 1
    severity TEXT,                  -- 'critical', 'high', 'medium', 'low'
    message TEXT,
    requires_approval INTEGER,      -- 0 or 1
    approved_by TEXT,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Credentials storage (encrypted via OS keychain or file fallback)
CREATE TABLE IF NOT EXISTS credentials (
    provider TEXT PRIMARY KEY,
    encrypted_data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_operation ON checkpoints(operation_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_conversation ON artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);

-- New indexes for added tables
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_safety_operation ON safety_checks(operation_id);
CREATE INDEX IF NOT EXISTS idx_safety_check_type ON safety_checks(check_type);
