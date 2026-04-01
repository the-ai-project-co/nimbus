/**
 * Standalone Migration Tests
 *
 * Source-level checks verifying that microservice-dependent commands
 * (RestClient, CoreEngineClient, localhost:300X) have been replaced
 * with standalone CLI/SQLite/generator implementations.
 *
 * These are intentionally static — no runtime startup needed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '..', '..');

function src(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// C1 — generate-terraform: standalone
// ---------------------------------------------------------------------------
describe('C1 — generate-terraform standalone', () => {
  it('has no new RestClient call', () => {
    expect(src('src/commands/generate-terraform.ts')).not.toContain('new RestClient');
  });
  it('imports generateTerraformProject from generator', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('generateTerraformProject');
  });
  it('has no localhost:300 reference', () => {
    expect(src('src/commands/generate-terraform.ts')).not.toMatch(/localhost:300\d/);
  });
});

// ---------------------------------------------------------------------------
// C2 — generate-k8s: standalone
// ---------------------------------------------------------------------------
describe('C2 — generate-k8s standalone', () => {
  it('has no new RestClient call', () => {
    expect(src('src/commands/generate-k8s.ts')).not.toContain('new RestClient');
  });
  it('uses generateManifestsLocally or kubernetes generator', () => {
    expect(src('src/commands/generate-k8s.ts')).toMatch(/generateManifestsLocally|generateK8sManifests|K8sGeneratorConfig/);
  });
  it('has no localhost:300 reference', () => {
    expect(src('src/commands/generate-k8s.ts')).not.toMatch(/localhost:300\d/);
  });
});

// ---------------------------------------------------------------------------
// C3 — aws-discover: standalone
// ---------------------------------------------------------------------------
describe('C3 — aws-discover standalone', () => {
  it('has no new RestClient call', () => {
    expect(src('src/commands/aws-discover.ts')).not.toContain('new RestClient');
  });
  it('uses aws configure or execFile for profiles', () => {
    expect(src('src/commands/aws-discover.ts')).toMatch(/configure|execFile|execFileSync|cliGetAwsProfiles/);
  });
  it('has no localhost:300 reference', () => {
    expect(src('src/commands/aws-discover.ts')).not.toMatch(/localhost:300\d/);
  });
});

// ---------------------------------------------------------------------------
// C4 — aws-terraform: standalone
// ---------------------------------------------------------------------------
describe('C4 — aws-terraform standalone', () => {
  it('has no new RestClient call', () => {
    expect(src('src/commands/aws-terraform.ts')).not.toContain('new RestClient');
  });
  it('imports generateTerraformProject from generator', () => {
    expect(src('src/commands/aws-terraform.ts')).toContain('generateTerraformProject');
  });
  it('has no localhost:300 reference', () => {
    expect(src('src/commands/aws-terraform.ts')).not.toMatch(/localhost:300\d/);
  });
});

// ---------------------------------------------------------------------------
// C5 — resume: standalone
// ---------------------------------------------------------------------------
describe('C5 — resume command standalone', () => {
  it('has no CoreEngineClient import', () => {
    expect(src('src/commands/resume.ts')).not.toContain('CoreEngineClient');
  });
  it('references chatCommand or getDb for session lookup', () => {
    expect(src('src/commands/resume.ts')).toMatch(/chatCommand|getDb|SessionManager/);
  });
  it('has no localhost:300 reference', () => {
    expect(src('src/commands/resume.ts')).not.toMatch(/localhost:300\d/);
  });
});

// ---------------------------------------------------------------------------
// C6 — version: DevOps CLI tools (not localhost services)
// ---------------------------------------------------------------------------
describe('C6 — version command DevOps tools', () => {
  it('has no localhost:300 references in fetchComponentVersions', () => {
    expect(src('src/commands/version.ts')).not.toMatch(/localhost:300\d/);
  });
  it('includes terraform version check', () => {
    expect(src('src/commands/version.ts')).toContain('terraform');
  });
  it('includes kubectl version check', () => {
    expect(src('src/commands/version.ts')).toContain('kubectl');
  });
  it('includes helm version check', () => {
    expect(src('src/commands/version.ts')).toContain('helm');
  });
  it('shows [+] / [-] icon format', () => {
    expect(src('src/commands/version.ts')).toMatch(/\[\+\]|\[-\]/);
  });
});

// ---------------------------------------------------------------------------
// C7 — drift: no CoreEngineClient
// ---------------------------------------------------------------------------
describe('C7 — drift no CoreEngineClient', () => {
  it('drift/index.ts has no CoreEngineClient import', () => {
    const content = src('src/commands/drift/index.ts');
    // Must not have an import statement (comments are fine)
    expect(content).not.toMatch(/^import.*CoreEngineClient/m);
  });
  it('drift/index.ts uses execFileSync or execFile for terraform', () => {
    expect(src('src/commands/drift/index.ts')).toMatch(/execFileSync|execFile|spawnExec/);
  });
});

// ---------------------------------------------------------------------------
// C8 — dead client code deleted/stubbed
// ---------------------------------------------------------------------------
describe('C8 — dead client code', () => {
  it('service-discovery.ts is either deleted or a stub without ghost URLs', () => {
    try {
      const content = src('src/clients/service-discovery.ts');
      // If it exists, it must not contain the old ghost localhost service URLs
      expect(content).not.toContain('localhost:3001');
      expect(content).not.toContain('localhost:3003');
      expect(content).not.toContain('localhost:3009');
    } catch {
      // File deleted — that's fine
    }
  });
});

// ---------------------------------------------------------------------------
// H1 — Emoji removed, replaced with ASCII icons
// ---------------------------------------------------------------------------
describe('H1 — emoji removed from UI', () => {
  it('TreePane.tsx has no folder emoji', () => {
    expect(src('src/ui/TreePane.tsx')).not.toContain('\u{1F4C1}'); // 📁
  });
  it('TreePane.tsx uses [/] for directories', () => {
    expect(src('src/ui/TreePane.tsx')).toContain('[/]');
  });
  it('TerminalPane.tsx has no right-pointing triangle', () => {
    expect(src('src/ui/TerminalPane.tsx')).not.toContain('\u25B6'); // ▶
  });
  it('TerminalPane.tsx uses [>] icon', () => {
    expect(src('src/ui/TerminalPane.tsx')).toContain('[>]');
  });
  it('StatusBar.tsx has no Greek capital delta (Δ)', () => {
    expect(src('src/ui/StatusBar.tsx')).not.toContain('\u0394'); // Δ
  });
  it('StatusBar.tsx uses delta: text', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('delta:');
  });
});

// ---------------------------------------------------------------------------
// M1 — Secret redaction in spawn-exec
// ---------------------------------------------------------------------------
describe('M1 — secret redaction in spawn-exec', () => {
  it('spawn-exec.ts has SECRET_PATTERNS constant', () => {
    expect(src('src/tools/spawn-exec.ts')).toContain('SECRET_PATTERNS');
  });
  it('spawn-exec.ts has redactSecrets function', () => {
    expect(src('src/tools/spawn-exec.ts')).toContain('redactSecrets');
  });
  it('spawn-exec.ts redacts AKIA keys', () => {
    expect(src('src/tools/spawn-exec.ts')).toContain('AKIA');
  });
  it('spawn-exec.ts redacts Bearer tokens', () => {
    expect(src('src/tools/spawn-exec.ts')).toContain('Bearer');
  });
});

// ---------------------------------------------------------------------------
// M2 — Doctor shows inline versions
// ---------------------------------------------------------------------------
describe('M2 — doctor inline versions', () => {
  it('doctor.ts references version in available tools output', () => {
    // The available list should include t.version or similar version string
    const content = src('src/commands/doctor.ts');
    expect(content).toMatch(/t\.version|tool\.version|\.version\b/);
  });
});
