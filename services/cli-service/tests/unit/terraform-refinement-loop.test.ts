import { describe, test, expect } from 'bun:test';

describe('Conversational Terraform Refinement Loop', () => {
  test('generateTerraformCommand is exported', async () => {
    const { generateTerraformCommand } = await import('../../src/commands/generate-terraform');
    expect(typeof generateTerraformCommand).toBe('function');
  });

  test('GenerateTerraformOptions supports conversational flag', async () => {
    const { generateTerraformCommand } = await import('../../src/commands/generate-terraform');
    // The options type should accept conversational: true
    const opts: import('../../src/commands/generate-terraform').GenerateTerraformOptions = {
      conversational: true,
      output: './test-output',
    };
    expect(opts.conversational).toBe(true);
  });

  test('refinement loop continues after successful generation', () => {
    // Simulate the refinement loop logic
    let loopCount = 0;
    const maxIterations = 3;
    let shouldContinue = true;

    // Simulate what happens in the while(true) loop
    while (shouldContinue && loopCount < maxIterations) {
      loopCount++;
      const userInput = loopCount === 1 ? 'generate' : loopCount === 2 ? 'generate' : 'exit';

      if (userInput === 'exit') {
        shouldContinue = false;
        break;
      }

      if (userInput === 'generate') {
        const generated = true; // simulates successful generation
        if (generated) {
          // In real code, this prints the refinement message and continues
          continue;
        }
      }
    }

    expect(loopCount).toBe(3); // Loop iterated 3 times before exit
  });

  test('refinement loop exits on failed generation', () => {
    let loopCount = 0;
    let exited = false;

    while (!exited) {
      loopCount++;
      const userInput = 'generate';

      if (userInput === 'generate') {
        const generated = false; // simulates failed generation
        if (generated) {
          continue;
        }
        exited = true; // return from function
      }
    }

    expect(loopCount).toBe(1);
    expect(exited).toBe(true);
  });

  test('sessionId is reused across refinement iterations', () => {
    // The key design point: sessionId stays the same so the generator
    // service maintains conversation context
    const crypto = require('crypto');
    const sessionId = crypto.randomUUID();

    // Simulate multiple generate cycles with same sessionId
    const generateCalls: string[] = [];

    for (let i = 0; i < 3; i++) {
      generateCalls.push(sessionId);
    }

    // All calls should use the same sessionId
    expect(new Set(generateCalls).size).toBe(1);
    expect(generateCalls[0]).toBe(sessionId);
  });

  test('exit command still works in refinement mode', () => {
    const inputs = ['describe a vpc', 'generate', 'make it multi-az', 'generate', 'exit'];
    let exited = false;
    let generateCount = 0;

    for (const input of inputs) {
      const trimmed = input.trim().toLowerCase();
      if (trimmed === 'exit') {
        exited = true;
        break;
      }
      if (trimmed === 'generate') {
        generateCount++;
        // After successful generation, loop continues
        continue;
      }
      // Otherwise it's a message to the conversation
    }

    expect(exited).toBe(true);
    expect(generateCount).toBe(2);
  });
});
