-- Nimbus Enterprise Database Schema
-- Sprint 17-18: Enterprise Features

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    github_username TEXT,
    stripe_customer_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT REFERENCES users(id),
    plan TEXT DEFAULT 'free',
    stripe_subscription_id TEXT,
    sso_config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, user_id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    team_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    status TEXT NOT NULL,
    details TEXT,
    ip_address TEXT
);

-- Usage Records
CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    team_id TEXT,
    user_id TEXT,
    operation_type TEXT NOT NULL,
    tokens_used INTEGER,
    cost_usd REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Device Codes (SSO)
CREATE TABLE IF NOT EXISTS device_codes (
    device_code TEXT PRIMARY KEY,
    user_code TEXT UNIQUE NOT NULL,
    user_id TEXT,
    verified INTEGER DEFAULT 0,
    expires_at DATETIME NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_username);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_usage_team ON usage_records(team_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_device_codes_user ON device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_device_codes_expires ON device_codes(expires_at);
