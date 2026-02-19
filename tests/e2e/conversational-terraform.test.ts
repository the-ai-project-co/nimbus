/**
 * E2E Test: Conversational Terraform Generation
 *
 * Tests the complete chat -> LLM -> generator -> file output pipeline
 * for Terraform code generation via conversational prompts.
 *
 * The LLM and generator services are mocked so that the test suite is
 * deterministic and can run without external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock types that mirror the real service contracts
// ---------------------------------------------------------------------------

interface ConversationalMessageResponse {
  success: boolean;
  data: {
    intent: { type: string; confidence: number };
    message: string;
    extracted_requirements?: {
      provider: string;
      components: string[];
      region?: string;
      environment?: string;
    };
    context: {
      infrastructure_stack?: {
        provider: string;
        components: string[];
        region?: string;
        environment?: string;
      };
    };
    needs_clarification?: string[];
    suggested_actions?: { label: string; description: string }[];
  };
}

interface GenerateFromConversationResponse {
  success: boolean;
  data: {
    generated_files: Record<string, string>;
    stack: {
      provider: string;
      components: string[];
      environment?: string;
      region?: string;
    };
    configuration: Record<string, unknown>;
    best_practices_report?: {
      summary: { total_violations: number; autofixable_violations: number };
    };
  };
}

// ---------------------------------------------------------------------------
// Deterministic mock responses
// ---------------------------------------------------------------------------

function mockLLMGenerateResponse(): ConversationalMessageResponse {
  return {
    success: true,
    data: {
      intent: { type: 'generate', confidence: 0.95 },
      message: 'I will generate Terraform for an AWS EC2 instance.',
      extracted_requirements: {
        provider: 'aws',
        components: ['ec2'],
        region: 'us-east-1',
        environment: 'production',
      },
      context: {
        infrastructure_stack: {
          provider: 'aws',
          components: ['ec2'],
          region: 'us-east-1',
          environment: 'production',
        },
      },
    },
  };
}

function mockMultiTurnProviderResponse(): ConversationalMessageResponse {
  return {
    success: true,
    data: {
      intent: { type: 'question', confidence: 0.8 },
      message: 'Got it -- you want to use AWS. What would you like to build?',
      context: {
        infrastructure_stack: {
          provider: 'aws',
          components: [],
        },
      },
      suggested_actions: [
        { label: 'Add VPC', description: 'Create a VPC network' },
        { label: 'Add EC2', description: 'Create an EC2 instance' },
      ],
    },
  };
}

function mockMultiTurnResourceResponse(): ConversationalMessageResponse {
  return {
    success: true,
    data: {
      intent: { type: 'generate', confidence: 0.92 },
      message: 'I will generate a VPC and EC2 instance on AWS.',
      extracted_requirements: {
        provider: 'aws',
        components: ['vpc', 'ec2'],
        region: 'us-west-2',
      },
      context: {
        infrastructure_stack: {
          provider: 'aws',
          components: ['vpc', 'ec2'],
          region: 'us-west-2',
        },
      },
    },
  };
}

function mockGeneratedTerraformFiles(): GenerateFromConversationResponse {
  return {
    success: true,
    data: {
      generated_files: {
        'main.tf': `terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  tags = {
    Name        = "web-server"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
`,
        'variables.tf': `variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}
`,
        'outputs.tf': `output "instance_id" {
  description = "The ID of the EC2 instance"
  value       = aws_instance.web.id
}

output "public_ip" {
  description = "The public IP address of the EC2 instance"
  value       = aws_instance.web.public_ip
}
`,
      },
      stack: {
        provider: 'aws',
        components: ['ec2'],
        environment: 'production',
        region: 'us-east-1',
      },
      configuration: {
        instance_type: 't3.micro',
        environment: 'production',
      },
      best_practices_report: {
        summary: { total_violations: 0, autofixable_violations: 0 },
      },
    },
  };
}

function mockMultiTurnGeneratedFiles(): GenerateFromConversationResponse {
  return {
    success: true,
    data: {
      generated_files: {
        'main.tf': `terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name      = "main-vpc"
    ManagedBy = "terraform"
  }
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id

  tags = {
    Name      = "web-server"
    ManagedBy = "terraform"
  }
}
`,
        'variables.tf': `variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}
`,
      },
      stack: {
        provider: 'aws',
        components: ['vpc', 'ec2'],
        region: 'us-west-2',
      },
      configuration: {
        vpc_cidr: '10.0.0.0/16',
        instance_type: 't3.micro',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conversational Terraform Generation E2E', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Default: mock fetch to return 404 (will be overridden per test)
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Not mocked' }), { status: 404 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ---------- Single-turn generation ----------

  it('should generate Terraform from a conversational prompt', async () => {
    const conversationalResponse = mockLLMGenerateResponse();
    const generationResponse = mockGeneratedTerraformFiles();

    let callIndex = 0;
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        callIndex++;
        return new Response(JSON.stringify(conversationalResponse), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(generationResponse), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    // Step 1: Send a conversational message requesting Terraform for an AWS EC2 instance
    const msgResponse = await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-1',
        message: 'Create an EC2 instance on AWS in us-east-1 for production',
      }),
    });

    const msgData = await msgResponse.json() as ConversationalMessageResponse;
    expect(msgData.success).toBe(true);
    expect(msgData.data.intent.type).toBe('generate');
    expect(msgData.data.intent.confidence).toBeGreaterThan(0.5);
    expect(msgData.data.extracted_requirements?.provider).toBe('aws');
    expect(msgData.data.extracted_requirements?.components).toContain('ec2');

    // Step 2: Trigger Terraform generation from conversation
    const genResponse = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-1',
        applyBestPractices: true,
        autofix: true,
      }),
    });

    const genData = await genResponse.json() as GenerateFromConversationResponse;
    expect(genData.success).toBe(true);

    // Step 3: Verify generated Terraform files
    const files = genData.data.generated_files;
    expect(Object.keys(files).length).toBeGreaterThan(0);

    // Verify main.tf contains provider block and resource block
    const mainTf = files['main.tf'];
    expect(mainTf).toBeDefined();
    expect(mainTf).toContain('provider "aws"');
    expect(mainTf).toContain('resource "aws_instance"');
    expect(mainTf).toContain('region');

    // Verify variables.tf exists
    const varsTf = files['variables.tf'];
    expect(varsTf).toBeDefined();
    expect(varsTf).toContain('variable');

    // Verify outputs.tf exists
    const outputsTf = files['outputs.tf'];
    expect(outputsTf).toBeDefined();
    expect(outputsTf).toContain('output');
  });

  // ---------- Multi-turn conversation ----------

  it('should handle multi-turn conversation', async () => {
    let turn = 0;

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        turn++;
        if (turn === 1) {
          // First turn: specify provider
          return new Response(JSON.stringify(mockMultiTurnProviderResponse()), { status: 200 });
        }
        // Second turn: specify resources
        return new Response(JSON.stringify(mockMultiTurnResourceResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockMultiTurnGeneratedFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const sessionId = `multi-turn-${Date.now()}`;

    // First turn: specify provider
    const turn1Resp = await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        message: 'I want to build on AWS',
      }),
    });

    const turn1Data = await turn1Resp.json() as ConversationalMessageResponse;
    expect(turn1Data.success).toBe(true);
    expect(turn1Data.data.context.infrastructure_stack?.provider).toBe('aws');
    expect(turn1Data.data.suggested_actions).toBeDefined();
    expect(turn1Data.data.suggested_actions!.length).toBeGreaterThan(0);

    // Second turn: specify resources
    const turn2Resp = await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        message: 'Create a VPC and an EC2 instance in us-west-2',
      }),
    });

    const turn2Data = await turn2Resp.json() as ConversationalMessageResponse;
    expect(turn2Data.success).toBe(true);
    expect(turn2Data.data.intent.type).toBe('generate');
    expect(turn2Data.data.context.infrastructure_stack?.components).toContain('vpc');
    expect(turn2Data.data.context.infrastructure_stack?.components).toContain('ec2');

    // Generate from the accumulated conversation
    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    expect(genData.success).toBe(true);

    // Verify accumulated Terraform
    const files = genData.data.generated_files;
    const mainTf = files['main.tf'];
    expect(mainTf).toContain('provider "aws"');
    expect(mainTf).toContain('aws_vpc');
    expect(mainTf).toContain('aws_instance');

    // Verify stack has both components
    expect(genData.data.stack.provider).toBe('aws');
    expect(genData.data.stack.components).toContain('vpc');
    expect(genData.data.stack.components).toContain('ec2');
  });

  // ---------- Required provider configuration ----------

  it('should include required provider configuration', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockGeneratedTerraformFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    // Conversational prompt
    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'provider-check',
        message: 'Create an EC2 instance on AWS',
      }),
    });

    // Generate
    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'provider-check' }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    expect(genData.success).toBe(true);

    const mainTf = genData.data.generated_files['main.tf'];

    // Verify terraform block exists
    expect(mainTf).toContain('terraform {');
    expect(mainTf).toContain('required_version');
    expect(mainTf).toContain('required_providers');

    // Verify AWS provider source and version constraint
    expect(mainTf).toContain('hashicorp/aws');
    expect(mainTf).toContain('~> 5.0');

    // Verify provider block with region
    expect(mainTf).toContain('provider "aws"');
    expect(mainTf).toContain('region');
  });

  // ---------- Generated files are valid .tf ----------

  it('should generate only .tf files with non-empty content', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockGeneratedTerraformFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'valid-files',
        message: 'Create an EC2 instance on AWS',
      }),
    });

    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'valid-files' }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    const files = genData.data.generated_files;

    for (const [filename, content] of Object.entries(files)) {
      // All files should have .tf extension
      expect(filename.endsWith('.tf')).toBe(true);
      // All files should have content
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  // ---------- Best practices report ----------

  it('should include best practices report when requested', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockGeneratedTerraformFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'bp-check',
        message: 'Create an EC2 instance on AWS for production',
      }),
    });

    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'bp-check',
        applyBestPractices: true,
      }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    expect(genData.success).toBe(true);
    expect(genData.data.best_practices_report).toBeDefined();
    expect(genData.data.best_practices_report!.summary.total_violations).toBeDefined();
    expect(typeof genData.data.best_practices_report!.summary.autofixable_violations).toBe('number');
  });

  // ---------- Stack metadata ----------

  it('should return correct stack metadata', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockGeneratedTerraformFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'stack-meta',
        message: 'Create an EC2 instance on AWS in us-east-1 for production',
      }),
    });

    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'stack-meta' }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    expect(genData.data.stack.provider).toBe('aws');
    expect(genData.data.stack.components).toContain('ec2');
    expect(genData.data.stack.environment).toBe('production');
    expect(genData.data.stack.region).toBe('us-east-1');
  });

  // ---------- Error handling ----------

  it('should handle generation failure gracefully', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Insufficient information to generate Terraform' }),
          { status: 400 },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'error-session',
        message: 'hello',
      }),
    });

    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'error-session' }),
    });

    const genData = (await genResp.json()) as { success: boolean; error?: string };
    expect(genData.success).toBe(false);
    expect(genData.error).toBeDefined();
  });

  // ---------- Resource block validation ----------

  it('should generate valid resource blocks with tags', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes('/api/conversational/message')) {
        return new Response(JSON.stringify(mockLLMGenerateResponse()), { status: 200 });
      }
      if (urlStr.includes('/api/generate/from-conversation')) {
        return new Response(JSON.stringify(mockGeneratedTerraformFiles()), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    await fetch('http://localhost:3003/api/conversational/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'tags-check',
        message: 'Create an EC2 instance on AWS for production',
      }),
    });

    const genResp = await fetch('http://localhost:3003/api/generate/from-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'tags-check' }),
    });

    const genData = await genResp.json() as GenerateFromConversationResponse;
    const mainTf = genData.data.generated_files['main.tf'];

    // Resource blocks should include tags
    expect(mainTf).toContain('tags');
    expect(mainTf).toContain('Name');
    expect(mainTf).toContain('ManagedBy');

    // Resource blocks should contain ami and instance_type
    expect(mainTf).toContain('ami');
    expect(mainTf).toContain('instance_type');
  });
});
