import { describe, test, expect, beforeEach } from 'bun:test';
import { TerraformParser } from '../../src/commands/cost/parsers/terraform';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('TerraformParser', () => {
  let parser: TerraformParser;

  beforeEach(() => {
    parser = new TerraformParser();
  });

  describe('parseHCL', () => {
    test('should parse a simple AWS resource block', () => {
      const hcl = `
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t3.micro"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('aws_instance');
      expect(resources[0].name).toBe('web');
      expect(resources[0].provider).toBe('aws');
      expect(resources[0].attributes.ami).toBe('ami-12345');
      expect(resources[0].attributes.instance_type).toBe('t3.micro');
    });

    test('should parse multiple resource blocks', () => {
      const hcl = `
resource "aws_instance" "web" {
  instance_type = "t3.micro"
}

resource "aws_s3_bucket" "data" {
  bucket = "my-bucket"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(2);
      expect(resources[0].type).toBe('aws_instance');
      expect(resources[1].type).toBe('aws_s3_bucket');
    });

    test('should parse GCP resource types', () => {
      const hcl = `
resource "google_compute_instance" "vm" {
  name         = "my-vm"
  machine_type = "e2-medium"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(1);
      expect(resources[0].provider).toBe('gcp');
    });

    test('should parse Azure resource types', () => {
      const hcl = `
resource "azurerm_virtual_machine" "vm" {
  name     = "my-vm"
  location = "eastus"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(1);
      expect(resources[0].provider).toBe('azure');
    });

    test('should handle empty input', () => {
      const resources = parser.parseHCL('');
      expect(resources).toHaveLength(0);
    });

    test('should handle input with no resources', () => {
      const hcl = `
variable "region" {
  default = "us-east-1"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(0);
    });

    test('should handle single-line comments', () => {
      const hcl = `
# This is a comment
resource "aws_instance" "web" {
  # ami = "old-ami"
  ami = "new-ami"
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources).toHaveLength(1);
      expect(resources[0].attributes.ami).toBe('new-ami');
    });

    test('should parse numeric attributes', () => {
      const hcl = `
resource "aws_instance" "web" {
  count = 3
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources[0].attributes.count).toBe(3);
    });

    test('should parse boolean attributes', () => {
      const hcl = `
resource "aws_instance" "web" {
  monitoring = true
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources[0].attributes.monitoring).toBe(true);
    });

    test('should parse nested blocks', () => {
      const hcl = `
resource "aws_instance" "web" {
  root_block_device {
    volume_size = 50
  }
}`;
      const resources = parser.parseHCL(hcl);
      expect(resources[0].attributes['root_block_device.volume_size']).toBe(50);
    });
  });

  describe('parseAttributes', () => {
    test('should parse string attributes', () => {
      const attrs = parser.parseAttributes('  key = "value"');
      expect(attrs.key).toBe('value');
    });

    test('should parse numeric attributes', () => {
      const attrs = parser.parseAttributes('  count = 42');
      expect(attrs.count).toBe(42);
    });

    test('should parse boolean attributes', () => {
      const attrs = parser.parseAttributes('  enabled = true\n  disabled = false');
      expect(attrs.enabled).toBe(true);
      expect(attrs.disabled).toBe(false);
    });
  });

  describe('parseDirectory', () => {
    test('should parse .tf files in a directory', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
      fs.writeFileSync(
        path.join(tmpDir, 'main.tf'),
        'resource "aws_instance" "web" {\n  instance_type = "t3.micro"\n}\n'
      );
      try {
        const resources = await parser.parseDirectory(tmpDir);
        expect(resources).toHaveLength(1);
        expect(resources[0].type).toBe('aws_instance');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('should skip non-.tf files', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# hello');
      fs.writeFileSync(
        path.join(tmpDir, 'main.tf'),
        'resource "aws_s3_bucket" "b" {\n  bucket = "my-bucket"\n}\n'
      );
      try {
        const resources = await parser.parseDirectory(tmpDir);
        expect(resources).toHaveLength(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    test('should return empty for directory with no .tf files', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
      fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# hello');
      try {
        const resources = await parser.parseDirectory(tmpDir);
        expect(resources).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });
});
