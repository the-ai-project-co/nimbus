import { describe, it, expect, beforeEach } from 'bun:test';
import { TemplateRenderer } from '../templates/renderer';

describe('TemplateRenderer', () => {
  let renderer: TemplateRenderer;

  beforeEach(() => {
    renderer = new TemplateRenderer();
  });

  describe('render', () => {
    it('should render simple template', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'World' };

      const result = renderer.render(template, variables);

      expect(result).toBe('Hello World!');
    });

    it('should render template with multiple variables', () => {
      const template = '{{greeting}} {{name}}, welcome to {{place}}!';
      const variables = {
        greeting: 'Hello',
        name: 'Alice',
        place: 'Wonderland',
      };

      const result = renderer.render(template, variables);

      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });

    it('should throw error for invalid template', () => {
      const template = '{{#if unclosed';
      const variables = {};

      expect(() => {
        renderer.render(template, variables);
      }).toThrow();
    });
  });

  describe('helpers', () => {
    it('should use uppercase helper', () => {
      const template = '{{uppercase name}}';
      const variables = { name: 'hello' };

      const result = renderer.render(template, variables);

      expect(result).toBe('HELLO');
    });

    it('should use lowercase helper', () => {
      const template = '{{lowercase name}}';
      const variables = { name: 'HELLO' };

      const result = renderer.render(template, variables);

      expect(result).toBe('hello');
    });

    it('should use capitalize helper', () => {
      const template = '{{capitalize name}}';
      const variables = { name: 'hello' };

      const result = renderer.render(template, variables);

      expect(result).toBe('Hello');
    });

    it('should use join helper', () => {
      const template = '{{join items ", "}}';
      const variables = { items: ['a', 'b', 'c'] };

      const result = renderer.render(template, variables);

      expect(result).toBe('a, b, c');
    });

    it('should use quote helper', () => {
      const template = '{{quote name}}';
      const variables = { name: 'test' };

      const result = renderer.render(template, variables);

      expect(result).toBe('"test"');
    });

    it('should use conditional helpers', () => {
      const template = '{{#if (eq value 5)}}equal{{else}}not equal{{/if}}';
      const variables = { value: 5 };

      const result = renderer.render(template, variables);

      expect(result).toBe('equal');
    });

    it('should use tf_list helper', () => {
      const template = '{{tf_list items}}';
      const variables = { items: ['a', 'b', 'c'] };

      const result = renderer.render(template, variables);

      expect(result).toBe('["a", "b", "c"]');
    });

    it('should use tf_map helper', () => {
      const template = '{{tf_map tags}}';
      const variables = { tags: { Name: 'test', Env: 'dev' } };

      const result = renderer.render(template, variables);

      expect(result).toContain('Name = "test"');
      expect(result).toContain('Env = "dev"');
    });
  });

  describe('registerHelper', () => {
    it('should register custom helper', () => {
      renderer.registerHelper('double', (num: number) => num * 2);

      const template = '{{double value}}';
      const variables = { value: 5 };

      const result = renderer.render(template, variables);

      expect(result).toBe('10');
    });

    it('should register multiple helpers', () => {
      renderer.registerHelpers({
        add: (a: number, b: number) => a + b,
        multiply: (a: number, b: number) => a * b,
      });

      const template = '{{add 2 3}} and {{multiply 2 3}}';
      const variables = {};

      const result = renderer.render(template, variables);

      expect(result).toBe('5 and 6');
    });
  });

  describe('validateTemplate', () => {
    it('should validate correct template', () => {
      const template = 'Hello {{name}}!';

      const result = renderer.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate templates', () => {
      const validTemplate = 'Hello {{name}}!';
      const validResult = renderer.validateTemplate(validTemplate);

      expect(validResult.valid).toBe(true);
      expect(validResult.error).toBeUndefined();
    });
  });

  describe('extractVariables', () => {
    it('should extract variables from template', () => {
      const template = 'Hello {{name}}, your age is {{age}}!';

      const variables = renderer.extractVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('age');
      expect(variables).toHaveLength(2);
    });

    it('should not extract helpers', () => {
      const template = '{{name}} {{value}} {{#each items}}{{this}}{{/each}}';

      const variables = renderer.extractVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('value');
      expect(variables).not.toContain('each');
      expect(variables).not.toContain('this');
      expect(variables.length).toBe(2);
    });

    it('should return sorted unique variables', () => {
      const template = '{{b}} {{a}} {{b}} {{c}}';

      const variables = renderer.extractVariables(template);

      expect(variables).toEqual(['a', 'b', 'c']);
    });
  });
});
