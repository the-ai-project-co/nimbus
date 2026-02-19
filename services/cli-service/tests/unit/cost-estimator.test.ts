import { describe, test, expect } from 'bun:test';
import { CostEstimator } from '../../src/commands/cost/estimator';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('CostEstimator', () => {
  test('should estimate costs for a directory with AWS resources', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.tf'),
      `resource "aws_instance" "web" {
  instance_type = "t3.micro"
  ami           = "ami-123"
}

resource "aws_s3_bucket" "data" {
  bucket = "my-bucket"
}
`
    );
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result).toBeDefined();
      expect(result.currency).toBe('USD');
      expect(result.version).toBe('0.2');
      expect(result.projects).toHaveLength(1);
      expect(result.summary.totalDetectedResources).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should return zero costs for unsupported resource types', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.tf'),
      `resource "unknown_provider_thing" "foo" {
  name = "bar"
}
`
    );
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.totalMonthlyCost).toBe(0);
      expect(result.summary.totalSupportedResources).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should return empty estimate for directory with no .tf files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# hello');
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.totalMonthlyCost).toBe(0);
      expect(result.projects[0].resources).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should estimate GCP resources', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.tf'),
      `resource "google_compute_instance" "vm" {
  machine_type = "e2-medium"
  name         = "my-vm"
}
`
    );
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.summary.totalDetectedResources).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should estimate Azure resources', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.tf'),
      `resource "azurerm_virtual_machine" "vm" {
  vm_size  = "Standard_B1s"
  name     = "my-vm"
  location = "eastus"
}
`
    );
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.summary.totalDetectedResources).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should include timeGenerated in result', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), '');
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.timeGenerated).toBeDefined();
      expect(typeof result.timeGenerated).toBe('string');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should set project name from directory name', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-'));
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), '');
    try {
      const result = await CostEstimator.estimateDirectory(tmpDir);
      expect(result.projects[0].name).toBeDefined();
      expect(result.projects[0].metadata.source).toBe('nimbus-builtin');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
