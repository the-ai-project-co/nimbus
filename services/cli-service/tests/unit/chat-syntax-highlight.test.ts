import { describe, test, expect } from 'bun:test';
import { highlightCodeBlocks } from '../../src/ui/ink/Message';

describe('Chat Syntax Highlighting', () => {
  test('highlights HCL code blocks', () => {
    const input = 'Here is some HCL:\n```hcl\nresource "aws_instance" "example" {\n  ami = "ami-12345"\n}\n```\nDone.';
    const result = highlightCodeBlocks(input);
    // The highlighted output should differ from the input (ANSI codes added)
    expect(result).not.toBe(input);
    // Original code should be transformed
    expect(result).toContain('aws_instance');
  });

  test('handles JavaScript code blocks', () => {
    const input = '```javascript\nconst x = 42;\nconsole.log(x);\n```';
    const result = highlightCodeBlocks(input);
    expect(result).not.toBe(input);
    expect(result).toContain('42');
  });

  test('passes through non-code content unchanged', () => {
    const input = 'This is just plain text with no code blocks.';
    const result = highlightCodeBlocks(input);
    expect(result).toBe(input);
  });

  test('handles missing language tag (auto-detect)', () => {
    const input = '```\nconst x = 42;\n```';
    const result = highlightCodeBlocks(input);
    // Should still attempt highlighting
    expect(result).toContain('42');
  });

  test('handles unknown language gracefully', () => {
    const input = '```nonexistentlang\nsome code here\n```';
    const result = highlightCodeBlocks(input);
    // Should not throw, should contain the code
    expect(result).toContain('some code here');
  });

  test('handles multiple code blocks in one message', () => {
    const input = 'Block 1:\n```python\nprint("hello")\n```\nBlock 2:\n```typescript\nconst x: number = 1;\n```';
    const result = highlightCodeBlocks(input);
    expect(result).toContain('hello');
    expect(result).toContain('number');
  });
});
