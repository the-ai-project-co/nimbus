import { describe, test, expect } from 'bun:test';
import Handlebars from 'handlebars';

// Register helpers the same way the renderer does
Handlebars.registerHelper('add', (a: number, b: number) => a + b);
Handlebars.registerHelper('subtract', (a: number, b: number) => a - b);

describe('Handlebars math helpers', () => {
  test('add helper sums two numbers', () => {
    const template = Handlebars.compile('{{add a b}}');
    expect(template({ a: 3, b: 4 })).toBe('7');
  });

  test('subtract helper subtracts two numbers', () => {
    const template = Handlebars.compile('{{subtract a b}}');
    expect(template({ a: 10, b: 3 })).toBe('7');
  });

  test('add helper works in expressions', () => {
    const template = Handlebars.compile('port: {{add basePort offset}}');
    expect(template({ basePort: 3000, offset: 5 })).toBe('port: 3005');
  });

  test('subtract with zero', () => {
    const template = Handlebars.compile('{{subtract a b}}');
    expect(template({ a: 5, b: 0 })).toBe('5');
  });
});
