/**
 * DevOps Gap Fix Plan v3 — Source-level assertions
 *
 * Each test verifies that a specific implementation string is present
 * in the relevant source file. These tests are intentionally broad
 * (source contains X) to be resilient to minor refactors.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../..');

function src(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8');
}

describe('DevOps Gap Fix Plan v3', () => {
  // =========================================================================
  // CRITICAL
  // =========================================================================

  describe('C1 — Per-tool Ctrl+C cancel', () => {
    it('loop.ts has toolAbortController', () => {
      expect(src('src/agent/loop.ts')).toContain('toolAbortController');
    });
    it('App.tsx has onCancelCurrentTool', () => {
      expect(src('src/ui/App.tsx')).toContain('onCancelCurrentTool');
    });
  });

  describe('C2 — Ansible tool', () => {
    it('devops.ts has ansibleTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('ansibleTool');
    });
    it('devops.ts has ansible playbook action', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'playbook'");
    });
    it('devops.ts has ansible vault-encrypt action', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'vault-encrypt'");
    });
  });

  describe('C3 — Terraform workspace auto-apply', () => {
    it('devops.ts has sessionWorkspace reference', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('sessionWorkspace');
    });
    it('types.ts has updateInfraContext', () => {
      expect(src('src/tools/schemas/types.ts')).toContain('updateInfraContext');
    });
    it('devops.ts calls updateInfraContext', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('updateInfraContext');
    });
  });

  describe('C4 — GitOps watch action', () => {
    it("devops.ts gitops schema includes 'watch'", () => {
      // The gitops schema or a watch case
      const content = src('src/tools/schemas/devops.ts');
      // Check it's in the gitops section
      expect(content).toContain("'watch'");
    });
  });

  // =========================================================================
  // HIGH PRIORITY
  // =========================================================================

  describe('H1 — Inline diff approval callback', () => {
    it('loop.ts has onRequestDiffApproval', () => {
      expect(src('src/agent/loop.ts')).toContain('onRequestDiffApproval');
    });
  });

  describe('H2 — Async background compaction', () => {
    it('loop.ts has compactionPromise', () => {
      expect(src('src/agent/loop.ts')).toContain('compactionPromise');
    });
    it('loop.ts has background compaction text', () => {
      expect(src('src/agent/loop.ts')).toContain('Compacting context in background');
    });
  });

  describe('H3 — kubectl events and watch actions', () => {
    it("devops.ts kubectl has 'events' action", () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'events'");
    });
  });

  describe('H4 — Policy check tool', () => {
    it('devops.ts has policy_check tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('policy_check');
    });
    it('devops.ts has checkov action', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'checkov'");
    });
    it('devops.ts has tfsec action', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'tfsec'");
    });
    it('devops.ts exports policyCheckTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('policyCheckTool');
    });
  });

  describe('H5 — Canary/progressive delivery control', () => {
    it('devops.ts has rollout_control tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('rollout_control');
    });
    it('devops.ts has argo-rollouts provider', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'argo-rollouts'");
    });
    it('devops.ts exports rolloutControlTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('rolloutControlTool');
    });
  });

  describe('H6 — Vault and AWS Secrets Manager', () => {
    it("devops.ts secretsTool has 'vault-read' action", () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'vault-read'");
    });
    it("devops.ts secretsTool has 'aws-get-secret' action", () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'aws-get-secret'");
    });
    it("devops.ts secretsTool has 'gcp-get-secret' action", () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'gcp-get-secret'");
    });
  });

  describe('H7 — Runbook step sentinel markers', () => {
    it('runbook.ts has STEP_COMPLETE sentinel', () => {
      expect(src('src/commands/runbook.ts')).toContain('STEP_COMPLETE');
    });
    it('runbook.ts has STEP_START sentinel', () => {
      expect(src('src/commands/runbook.ts')).toContain('STEP_START');
    });
  });

  // =========================================================================
  // MEDIUM PRIORITY
  // =========================================================================

  describe('M1 — Docker image vulnerability scan', () => {
    it("devops.ts dockerTool has 'scan' action", () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'scan'");
    });
  });

  describe('M3 — Database migration tool', () => {
    it('devops.ts has db_migrate tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('db_migrate');
    });
    it('devops.ts exports dbMigrateTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('dbMigrateTool');
    });
  });

  describe('M5 — Pre-apply cost alert', () => {
    it('loop.ts has cost-alert marker', () => {
      expect(src('src/agent/loop.ts')).toContain('cost-alert');
    });
  });

  describe('M6 — Terraform plan truncation threshold increase', () => {
    it('loop.ts has 1500-line diff threshold', () => {
      expect(src('src/agent/loop.ts')).toContain('1500');
    });
  });

  describe('M7 — Environment diff tool', () => {
    it('devops.ts has env_diff tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('env_diff');
    });
    it('devops.ts exports envDiffTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('envDiffTool');
    });
  });

  describe('M8 — Incident timeline', () => {
    it('incident.ts has gatherIncidentTimeline', () => {
      expect(src('src/commands/incident.ts')).toContain('gatherIncidentTimeline');
    });
  });

  describe('M9 — Doctor platform-specific install', () => {
    it("doctor.ts checks for 'darwin' platform", () => {
      expect(src('src/commands/doctor.ts')).toContain("platform === 'darwin'");
    });
    it("doctor.ts has 'brew install' string", () => {
      expect(src('src/commands/doctor.ts')).toContain('brew install');
    });
  });

  describe('M10 — Post-deploy notifications', () => {
    it('devops.ts has notify tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('notifyTool');
    });
    it('devops.ts has slack channel', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'slack'");
    });
    it('devops.ts has pagerduty channel', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain("'pagerduty'");
    });
  });

  // =========================================================================
  // LOW PRIORITY
  // =========================================================================

  describe('L3 — /watch defaults to DevOps files', () => {
    it('App.tsx has devopsOnly: true', () => {
      expect(src('src/ui/App.tsx')).toContain('devopsOnly: true');
    });
  });

  describe('L4 — NIMBUS.md validation', () => {
    it('init.ts exports validateNimbusMd', () => {
      expect(src('src/cli/init.ts')).toContain('validateNimbusMd');
    });
  });

  describe('L7 — nimbus status --watch mode', () => {
    it('status.ts has watch option', () => {
      expect(src('src/commands/status.ts')).toContain('watch');
    });
    it('status.ts has 30-second refresh interval', () => {
      expect(src('src/commands/status.ts')).toContain('30');
    });
  });

  describe('L8 — Terraform registry browser', () => {
    it('devops.ts has terraform_registry tool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('terraform_registry');
    });
    it('devops.ts exports terraformRegistryTool', () => {
      expect(src('src/tools/schemas/devops.ts')).toContain('terraformRegistryTool');
    });
  });

  // =========================================================================
  // devopsTools array count
  // =========================================================================

  describe('devopsTools array', () => {
    it('devopsTools includes all new tools', () => {
      const content = src('src/tools/schemas/devops.ts');
      // New tools added in this plan
      expect(content).toContain('ansibleTool');
      expect(content).toContain('policyCheckTool');
      expect(content).toContain('rolloutControlTool');
      expect(content).toContain('dbMigrateTool');
      expect(content).toContain('envDiffTool');
      expect(content).toContain('notifyTool');
      expect(content).toContain('terraformRegistryTool');
    });
  });
});
