import { describe, test, expect } from 'bun:test';
import { showDestructionCostWarning } from '../../src/utils/cost-warning';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('showDestructionCostWarning', () => {
  test('should not throw on empty directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-warning-'));
    try {
      await expect(showDestructionCostWarning(tmpDir)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should not throw on non-existent path', async () => {
    const fakePath = path.join(os.tmpdir(), 'nimbus-nonexistent-' + Date.now());
    await expect(showDestructionCostWarning(fakePath)).resolves.toBeUndefined();
  });

  test('should not throw when estimator encounters invalid files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-warning-'));
    fs.writeFileSync(path.join(tmpDir, 'bad.tf'), 'this is not valid terraform {{{');
    try {
      await expect(showDestructionCostWarning(tmpDir)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should complete successfully with valid terraform files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-warning-'));
    fs.writeFileSync(
      path.join(tmpDir, 'main.tf'),
      `resource "aws_instance" "web" {
  instance_type = "t3.micro"
  ami           = "ami-123"
}
`
    );
    try {
      await expect(showDestructionCostWarning(tmpDir)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('should silently skip on directory with no .tf files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-warning-'));
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# hello');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log("hi")');
    try {
      await expect(showDestructionCostWarning(tmpDir)).resolves.toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
