import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const TERRAFORM_APPLY_PATH = path.resolve(
  __dirname,
  '../../src/commands/apply/terraform.ts'
);

describe('Terraform Apply Cost Estimation', () => {
  const source = fs.readFileSync(TERRAFORM_APPLY_PATH, 'utf-8');

  test('imports CostEstimator', () => {
    expect(source).toContain("import { CostEstimator } from '../cost/estimator'");
  });

  test('defines displayCostEstimate function', () => {
    expect(source).toContain('async function displayCostEstimate(directory: string)');
  });

  test('calls CostEstimator.estimateDirectory', () => {
    expect(source).toContain('CostEstimator.estimateDirectory(directory)');
  });

  test('old displayCostHint function is removed', () => {
    expect(source).not.toContain('function displayCostHint()');
    expect(source).not.toContain('displayCostHint()');
  });
});
